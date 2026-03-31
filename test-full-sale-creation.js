/**
 * Full sale creation test — verifies the complete flow
 * Uses correct selectors confirmed by debug-calendar-classes.js
 */
const net = require('net');
const crypto = require('crypto');
const url_module = require('url');
const http = require('http');
const fs = require('fs');

const PROFILE_ID = 'k16kmi55';
const SALE_CONFIG = {
  saleName: 'VCRHC',
  discountPercent: 10,
  startDate: (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })(),
  endDate: (() => {
    const d = new Date();
    d.setDate(d.getDate() + 31);
    return d.toISOString().split('T')[0];
  })(),
};

function toEtsyDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

console.log('Sale config:', SALE_CONFIG);
console.log('Start date (DD/MM/YYYY):', toEtsyDate(SALE_CONFIG.startDate));
console.log('End date (DD/MM/YYYY):', toEtsyDate(SALE_CONFIG.endDate));

function wsConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const parsed = url_module.parse(wsUrl);
    const key = crypto.randomBytes(16).toString('base64');
    const client = net.createConnection({ host: parsed.hostname, port: parseInt(parsed.port) }, () => {
      client.write(`GET ${parsed.path} HTTP/1.1\r\nHost: ${parsed.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let buf = Buffer.alloc(0), upgraded = false;
    const callbacks = new Map();
    let msgId = 1;
    function parseFrame(b) {
      if (b.length < 2) return null;
      const op = b[0] & 0x0f;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return null; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if ((b[1] & 0x80) !== 0) off += 4;
      if (b.length < off + len) return null;
      return { op, payload: b.slice(off, off + len), consumed: off + len };
    }
    function send(data) {
      const p = Buffer.from(JSON.stringify(data), 'utf8');
      const len = p.length;
      let h;
      if (len < 126) { h = Buffer.alloc(2); h[0]=0x81; h[1]=len; }
      else if (len < 65536) { h = Buffer.alloc(4); h[0]=0x81; h[1]=126; h.writeUInt16BE(len,2); }
      else { h = Buffer.alloc(10); h[0]=0x81; h[1]=127; h.writeBigUInt64BE(BigInt(len),2); }
      const mask = crypto.randomBytes(4);
      const nh = Buffer.alloc(h.length+4); h.copy(nh); nh[1]|=0x80; mask.copy(nh, h.length);
      const mp = Buffer.alloc(p.length);
      for (let i=0; i<p.length; i++) mp[i]=p[i]^mask[i%4];
      client.write(Buffer.concat([nh, mp]));
    }
    const ws = {
      call(method, params, timeout=30000) {
        return new Promise((res, rej) => {
          const id = msgId++;
          callbacks.set(id, {res, rej});
          send({id, method, params: params||{}});
          setTimeout(() => { if(callbacks.has(id)){callbacks.delete(id); rej(new Error(`Timeout:${method}`));} }, timeout);
        });
      },
      close() { client.destroy(); }
    };
    client.on('data', chunk => {
      if (!upgraded) {
        buf = Buffer.concat([buf, chunk]);
        if (buf.indexOf('\r\n\r\n') !== -1) { upgraded=true; buf=buf.slice(buf.indexOf('\r\n\r\n')+4); resolve(ws); }
        return;
      }
      buf = Buffer.concat([buf, chunk]);
      while (buf.length > 0) {
        const f = parseFrame(buf); if (!f) break;
        buf = buf.slice(f.consumed);
        if (f.op === 1) {
          try { const m=JSON.parse(f.payload.toString('utf8')); if(m.id&&callbacks.has(m.id)){const{res,rej}=callbacks.get(m.id);callbacks.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);} } catch(e){}
        }
      }
    });
    client.on('error', reject);
    setTimeout(() => reject(new Error('WS connect timeout')), 15000);
  });
}

function apiGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Same logic as selectDateInCalendar in etsyDiscountManager.ts
async function selectDateInCalendar(ws, dateStr) {
  const [dd, mm, yyyy] = dateStr.split('/');
  const targetDay = parseInt(dd, 10);
  const targetMonth = parseInt(mm, 10);
  const targetYear = parseInt(yyyy, 10);
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const targetMonthName = monthNames[targetMonth - 1];

  await delay(800);

  // Check calendar visible
  const calVis = await ws.call('Runtime.evaluate', {
    expression: `!!document.querySelector('.react-datepicker')`,
    returnByValue: true
  });
  if (!calVis.result?.value) {
    console.log('Calendar NOT visible!');
    return false;
  }
  console.log('Calendar visible ✓');

  // Navigate to correct month
  for (let i = 0; i < 6; i++) {
    const header = await ws.call('Runtime.evaluate', {
      expression: `document.querySelector('.react-datepicker__current-month')?.textContent`,
      returnByValue: true
    });
    const headerText = header.result?.value || '';
    console.log(`Calendar header: "${headerText}"`);

    const currentMonthIdx = monthNames.findIndex(m => headerText.includes(m)) + 1;
    const yearMatch = headerText.match(/\d{4}/);
    const currentYear = yearMatch ? parseInt(yearMatch[0]) : targetYear;

    if (currentMonthIdx === targetMonth && currentYear === targetYear) {
      console.log(`✓ On correct month: ${targetMonthName} ${targetYear}`);
      break;
    }

    const diff = (targetYear - currentYear) * 12 + (targetMonth - currentMonthIdx);
    console.log(`Navigating ${diff > 0 ? 'forward' : 'backward'}...`);
    await ws.call('Runtime.evaluate', {
      expression: diff > 0
        ? `document.querySelector('.react-datepicker__navigation--next').click(); 'next'`
        : `document.querySelector('.react-datepicker__navigation--previous').click(); 'prev'`,
      returnByValue: true
    });
    await delay(500);
  }

  // Click the target day via JS
  const result = await ws.call('Runtime.evaluate', {
    expression: `(function(tDay) {
      const days = Array.from(document.querySelectorAll('.react-datepicker__day'));
      const candidates = days.filter(d => {
        const text = d.innerText?.trim();
        const cls = d.getAttribute('class') || '';
        return text === String(tDay) && !cls.includes('outside-month');
      });
      if (candidates.length > 0) {
        candidates[0].click();
        return { success: true, count: candidates.length, classes: candidates[0].getAttribute('class') };
      }
      return { success: false, count: 0, allDays: days.map(d => d.innerText?.trim() + '[' + d.getAttribute('class') + ']').join(', ') };
    })(${targetDay})`,
    returnByValue: true
  });
  const r = result.result?.value;
  if (typeof r === 'string') {
    const parsed = JSON.parse(r);
    if (parsed.success) {
      console.log(`✓ Clicked day ${targetDay} (${parsed.count} candidates, class: "${parsed.classes}")`);
      return true;
    }
    console.log(`✗ Could not find day ${targetDay}. Days: ${parsed.allDays?.substring(0, 200)}`);
  } else if (r?.success) {
    console.log(`✓ Clicked day ${targetDay} (${r.count} candidates, class: "${r.classes}")`);
    return true;
  } else {
    console.log(`✗ Failed:`, r);
  }
  return false;
}

async function main() {
  console.log('\n=== FULL SALE CREATION TEST ===\n');

  let apData;
  try {
    const activeRes = await apiGet(`http://127.0.0.1:50325/api/v1/browser/active?user_id=${PROFILE_ID}`);
    if (activeRes.code===0 && activeRes.data?.status==='Active') apData = activeRes.data;
  } catch(e) {}

  if (!apData) {
    const openRes = await apiGet(`http://127.0.0.1:50325/api/v1/browser/start?user_id=${PROFILE_ID}`);
    if (openRes.code !== 0) throw new Error(`Open failed: ${openRes.msg}`);
    apData = openRes.data;
    await delay(4000);
  }

  const targets = await apiGet(`http://127.0.0.1:${apData.debug_port}/json`);
  const target = targets.find(t => t.type==='page' && t.url && !t.url.startsWith('chrome')) || targets[0];
  const ws = await wsConnect(target.webSocketDebuggerUrl);
  await ws.call('Page.enable');
  await ws.call('Runtime.enable');

  // Navigate
  console.log('[1] Navigating to createSale...');
  await ws.call('Page.navigate', { url: 'https://www.etsy.com/your/shops/me/sales-discounts/step/createSale' });
  await delay(5000);
  const url = await ws.call('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
  console.log('URL:', url.result?.value);

  // Set type
  console.log('\n[2] Setting discount type...');
  const typeResult = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const sel = document.querySelector('select[name="reward_type"]');
      if (!sel) return 'ERROR: no select[name="reward_type"]';
      sel.value = 'percent';
      sel.dispatchEvent(new Event('change', {bubbles:true}));
      return 'OK';
    })()`,
    returnByValue: true
  });
  console.log('Type:', typeResult.result?.value);
  await delay(1200);

  // Set percent dropdown
  console.log('\n[3] Setting percent dropdown to Custom...');
  const pctResult = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const sel = document.querySelector('select[name="reward_type_percent_dropdown"]');
      if (!sel) return 'ERROR: no dropdown';
      sel.value = '1';
      sel.dispatchEvent(new Event('change', {bubbles:true}));
      return 'OK';
    })()`,
    returnByValue: true
  });
  console.log('Percent dropdown:', pctResult.result?.value);
  await delay(1500);

  // Fill custom percent
  console.log('\n[4] Filling custom percent (10)...');
  const customResult = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const inp = document.querySelector('input[name="reward_type_percent_input"]');
      if (!inp) return 'ERROR: no custom input';
      const nativeInput = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      nativeInput.set.call(inp, '10');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      return 'OK: ' + inp.value;
    })()`,
    returnByValue: true
  });
  console.log('Custom percent:', customResult.result?.value);
  await delay(800);

  // Click start date
  const startDateStr = toEtsyDate(SALE_CONFIG.startDate);
  console.log(`\n[5] Clicking start date input (target: ${startDateStr})...`);
  await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const inputs = document.querySelectorAll('input[data-datepicker-input]');
      if (inputs[0]) { inputs[0].click(); return 'clicked, count=' + inputs.length; }
      return 'no date inputs';
    })()`,
    returnByValue: true
  }).then(r => console.log('Click result:', r.result?.value));

  const startOk = await selectDateInCalendar(ws, startDateStr);
  console.log('Start date selected:', startOk);
  await delay(1200);

  // Screenshot after start date
  const ss1 = await ws.call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:\\etsy\\test-after-startdate.png', Buffer.from(ss1.data, 'base64'));
  console.log('Screenshot: test-after-startdate.png');

  // Check start date value
  const startVal = await ws.call('Runtime.evaluate', {
    expression: `document.querySelectorAll('input[data-datepicker-input]')[0]?.value`,
    returnByValue: true
  });
  console.log('Start date input value:', startVal.result?.value);

  // Click end date
  const endDateStr = toEtsyDate(SALE_CONFIG.endDate);
  console.log(`\n[6] Clicking end date input (target: ${endDateStr})...`);
  await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const inputs = document.querySelectorAll('input[data-datepicker-input]');
      if (inputs[1]) { inputs[1].click(); return 'clicked'; }
      if (inputs[0]) { inputs[0].click(); return 'clicked first'; }
      return 'no date inputs';
    })()`,
    returnByValue: true
  }).then(r => console.log('End click:', r.result?.value));
  await delay(800);

  const endCalVis = await ws.call('Runtime.evaluate', {
    expression: `!!document.querySelector('.react-datepicker')`,
    returnByValue: true
  });
  console.log('End calendar visible:', endCalVis.result?.value);

  const endOk = await selectDateInCalendar(ws, endDateStr);
  console.log('End date selected:', endOk);
  await delay(1200);

  // Screenshot after end date
  const ss2 = await ws.call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:\\etsy\\test-after-enddate.png', Buffer.from(ss2.data, 'base64'));
  console.log('Screenshot: test-after-enddate.png');

  // Check date values
  const dateVals = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const inputs = document.querySelectorAll('input[data-datepicker-input]');
      return { start: inputs[0]?.value, end: inputs[1]?.value };
    })()`,
    returnByValue: true
  });
  console.log('\n=== DATE VALUES ===');
  console.log('Start:', dateVals.result?.value?.start);
  console.log('End:', dateVals.result?.value?.end);
  console.log('Expected start:', startDateStr);
  console.log('Expected end:', endDateStr);

  // Set sale name
  console.log('\n[7] Setting sale name...');
  await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const inp = document.querySelector('input[name="promo_name"]');
      if (!inp) return 'ERROR: no promo_name input';
      const nativeInput = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      nativeInput.set.call(inp, 'VCRHC');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      return 'OK: ' + inp.value;
    })()`,
    returnByValue: true
  }).then(r => console.log('Sale name:', r.result?.value));

  // Scroll to bottom, screenshot before Continue
  await ws.call('Runtime.evaluate', { expression: 'window.scrollTo(0, document.body.scrollHeight)' });
  await delay(500);
  const ss3 = await ws.call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:\\etsy\\test-before-continue.png', Buffer.from(ss3.data, 'base64'));
  console.log('Screenshot: test-before-continue.png');

  // Check for errors
  const errors = await ws.call('Runtime.evaluate', {
    expression: `Array.from(document.querySelectorAll('.wt-text-red, [role="alert"]')).map(e => e.innerText?.trim()).filter(Boolean).join(' | ')`,
    returnByValue: true
  });
  console.log('Errors on form:', errors.result?.value || 'none');

  // Click Continue
  console.log('\n[8] Clicking Continue...');
  const contResult = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const btns = Array.from(document.querySelectorAll('button'));
      const cont = btns.find(b => b.textContent?.trim() === 'Continue');
      if (cont) { cont.click(); return 'clicked Continue'; }
      const filled = document.querySelector('.wt-btn--filled');
      if (filled) { filled.click(); return 'clicked .wt-btn--filled'; }
      return 'NO CONTINUE FOUND';
    })()`,
    returnByValue: true
  });
  console.log('Continue:', contResult.result?.value);
  await delay(6000);

  // Final URL
  const finalUrl = await ws.call('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
  console.log('\nFinal URL:', finalUrl.result?.value);
  const success = finalUrl.result?.value?.includes('sales-discounts') && !finalUrl.result?.value?.includes('createSale');
  console.log('SUCCESS:', success);

  const ss4 = await ws.call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:\\etsy\\test-final.png', Buffer.from(ss4.data, 'base64'));
  console.log('Screenshot: test-final.png');

  ws.close();
  await apiGet(`http://127.0.0.1:50325/api/v1/browser/stop?user_id=${PROFILE_ID}`).catch(()=>{});
  console.log('\n=== TEST COMPLETE ===');
  console.log('Result:', success ? '✅ SUCCESS!' : '❌ FAILED');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
