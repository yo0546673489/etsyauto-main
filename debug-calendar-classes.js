/**
 * Debug calendar day classes to find the right CSS selector
 */
const net = require('net');
const crypto = require('crypto');
const url_module = require('url');
const http = require('http');
const fs = require('fs');

const PROFILE_ID = 'k16kmi55';

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

async function main() {
  console.log('Opening profile...');
  let apData;
  try {
    const activeRes = await apiGet(`http://127.0.0.1:50325/api/v1/browser/active?user_id=${PROFILE_ID}`);
    if (activeRes.code===0 && activeRes.data?.status==='Active') {
      apData = activeRes.data;
      console.log('Already active');
    }
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

  // Navigate to createSale
  console.log('\n[1] Navigating to createSale...');
  await ws.call('Page.navigate', { url: 'https://www.etsy.com/your/shops/me/sales-discounts/step/createSale' });
  await delay(6000);

  // Screenshot initial
  const ss1 = await ws.call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:\\etsy\\cal-debug-01-initial.png', Buffer.from(ss1.data, 'base64'));

  // Select percent type
  await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const sel = document.querySelector('select[name="reward_type"]');
      if (!sel) return 'NO SELECT FOUND';
      sel.value = 'percent';
      sel.dispatchEvent(new Event('change', {bubbles:true}));
      return 'OK: ' + sel.value;
    })()`,
    returnByValue: true
  }).then(r => console.log('Type select:', r.result?.value));
  await delay(1500);

  // Select custom
  await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const sel = document.querySelector('select[name="reward_type_percent_dropdown"]');
      if (!sel) return 'NO DROPDOWN';
      sel.value = '1';
      sel.dispatchEvent(new Event('change', {bubbles:true}));
      return 'OK: ' + sel.value;
    })()`,
    returnByValue: true
  }).then(r => console.log('Percent dropdown:', r.result?.value));
  await delay(1000);

  // Fill custom input
  await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const inp = document.querySelector('input[name="reward_type_percent_input"]');
      if (!inp) return 'NO INPUT';
      const nativeInput = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      nativeInput.set.call(inp, '10');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      return 'OK: ' + inp.value;
    })()`,
    returnByValue: true
  }).then(r => console.log('Custom input:', r.result?.value));
  await delay(500);

  // Click start date input
  console.log('\n[2] Clicking start date input...');
  await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const inputs = document.querySelectorAll('input[data-datepicker-input]');
      console.log('date inputs:', inputs.length);
      if (inputs[0]) { inputs[0].focus(); inputs[0].click(); return 'clicked'; }
      return 'no inputs';
    })()`,
    returnByValue: true
  }).then(r => console.log('Start click:', r.result?.value));
  await delay(1000);

  // Screenshot with calendar open
  const ss2 = await ws.call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:\\etsy\\cal-debug-02-start-calendar-open.png', Buffer.from(ss2.data, 'base64'));
  console.log('Screenshot: cal-debug-02-start-calendar-open.png');

  // Check calendar header
  const header = await ws.call('Runtime.evaluate', {
    expression: `document.querySelector('.react-datepicker__current-month')?.textContent`,
    returnByValue: true
  });
  console.log('Calendar header:', header.result?.value);

  // Inspect all day cells — get text and full class list
  const dayCells = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const days = document.querySelectorAll('.react-datepicker__day');
      const result = Array.from(days).map(d => ({
        text: d.innerText.trim(),
        classes: d.getAttribute('class'),
        ariaLabel: d.getAttribute('aria-label')
      }));
      return JSON.stringify(result);
    })()`,
    returnByValue: true
  });
  const cells = JSON.parse(dayCells.result?.value || '[]');
  console.log('\n=== ALL DAY CELLS ===');
  cells.forEach((c, i) => console.log(`[${i}] text="${c.text}" classes="${c.classes}" aria="${c.ariaLabel}"`));

  // Check specific selectors
  const selectorTests = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const tests = {
        'day--031': document.querySelectorAll('.react-datepicker__day--031').length,
        'day--031_not_outside': document.querySelectorAll('.react-datepicker__day--031:not(.react-datepicker__day--outside-month)').length,
        'aria_march_31': document.querySelectorAll('[aria-label*="March 31"]').length,
        'aria_april_30': document.querySelectorAll('[aria-label*="April 30"]').length,
        'outside_month': document.querySelectorAll('.react-datepicker__day--outside-month').length,
      };
      return JSON.stringify(tests);
    })()`,
    returnByValue: true
  });
  console.log('\n=== SELECTOR TESTS ===');
  console.log(selectorTests.result?.value);

  // Navigate to April by clicking Next
  console.log('\n[3] Navigating to April...');
  await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const next = document.querySelector('.react-datepicker__navigation--next');
      if (next) { next.click(); return 'clicked next'; }
      return 'no next button';
    })()`,
    returnByValue: true
  }).then(r => console.log('Nav next:', r.result?.value));
  await delay(700);

  const header2 = await ws.call('Runtime.evaluate', {
    expression: `document.querySelector('.react-datepicker__current-month')?.textContent`,
    returnByValue: true
  });
  console.log('Calendar header after next:', header2.result?.value);

  // Screenshot April calendar
  const ss3 = await ws.call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:\\etsy\\cal-debug-03-april-calendar.png', Buffer.from(ss3.data, 'base64'));
  console.log('Screenshot: cal-debug-03-april-calendar.png');

  // Inspect April day cells
  const aprilCells = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const days = document.querySelectorAll('.react-datepicker__day');
      const result = Array.from(days).map(d => ({
        text: d.innerText.trim(),
        classes: d.getAttribute('class'),
        ariaLabel: d.getAttribute('aria-label')
      }));
      return JSON.stringify(result);
    })()`,
    returnByValue: true
  });
  const aprilDays = JSON.parse(aprilCells.result?.value || '[]');
  console.log('\n=== APRIL DAY CELLS ===');
  aprilDays.forEach((c, i) => console.log(`[${i}] text="${c.text}" classes="${c.classes}" aria="${c.ariaLabel}"`));

  // Test selectors in April
  const aprilSelectorTests = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const days = document.querySelectorAll('.react-datepicker__day');
      // Find all cells with text "30"
      const day30s = Array.from(days).filter(d => d.innerText.trim() === '30');
      return JSON.stringify({
        total_days: days.length,
        day30_count: day30s.length,
        day30_cells: day30s.map(d => ({ classes: d.getAttribute('class'), aria: d.getAttribute('aria-label') })),
        css_030: document.querySelectorAll('.react-datepicker__day--030').length,
        css_030_not_outside: document.querySelectorAll('.react-datepicker__day--030:not(.react-datepicker__day--outside-month)').length,
        aria_april_30: document.querySelectorAll('[aria-label*="April 30"]').length,
        outside_month_class: document.querySelectorAll('.react-datepicker__day--outside-month').length,
      });
    })()`,
    returnByValue: true
  });
  console.log('\n=== APRIL SELECTOR TESTS FOR DAY 30 ===');
  console.log(JSON.stringify(JSON.parse(aprilSelectorTests.result?.value || '{}'), null, 2));

  ws.close();
  await apiGet(`http://127.0.0.1:50325/api/v1/browser/stop?user_id=${PROFILE_ID}`).catch(()=>{});
  console.log('\nDone! Check C:\\etsy\\cal-debug-*.png for screenshots');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
