/**
 * בודק את כל options ב-select האחוזים ומנסה לנווט לשלב הבא
 */
const net = require('net');
const crypto = require('crypto');
const url_module = require('url');
const http = require('http');

const PROFILE_ID = 'k16kmin5';

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
  // מצא פרופיל פעיל
  let apData;
  const activeRes = await apiGet(`http://local.adspower.net:50325/api/v1/browser/active?user_id=${PROFILE_ID}`);
  if (activeRes.code===0 && activeRes.data?.status==='Active' && activeRes.data?.debug_port) {
    apData = activeRes.data;
    console.log('Profile already active, port:', apData.debug_port);
  } else {
    const openRes = await apiGet(`http://local.adspower.net:50325/api/v1/browser/start?user_id=${PROFILE_ID}`);
    if (openRes.code !== 0) throw new Error(`Failed: ${openRes.msg}`);
    apData = openRes.data;
    console.log('Profile opened, port:', apData.debug_port);
    await delay(5000);
  }

  const targets = await apiGet(`http://127.0.0.1:${apData.debug_port}/json`);
  let target = targets.find(t => t.type==='page' && t.url.includes('etsy.com'));
  if (!target) target = targets.find(t => t.type==='page');

  const ws = await wsConnect(target.webSocketDebuggerUrl);
  await ws.call('Page.enable');
  await ws.call('Runtime.enable');

  // נווט לדף יצירת מבצע
  await ws.call('Page.navigate', { url: 'https://www.etsy.com/your/shops/me/sales-discounts/step/createSale' });
  await delay(5000);

  // קבל את כל options של ה-select האחוזים
  const allPercentOptions = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const sel = document.querySelector('select[name="reward_type_percent_dropdown"]') || document.querySelector('#reward-percentage');
      if (!sel) return 'SELECT NOT FOUND';
      const opts = Array.from(sel.options).map(o => ({ value: o.value, text: o.text }));
      return JSON.stringify(opts);
    })()`,
    returnByValue: true
  });
  console.log('\n=== ALL PERCENTAGE OPTIONS ===');
  try {
    const opts = JSON.parse(allPercentOptions.result?.value || '[]');
    opts.forEach(o => console.log(`  value="${o.value}" text="${o.text}"`));
  } catch(e) {
    console.log(allPercentOptions.result?.value);
  }

  // קבל את כל options של reward_type
  const rewardTypeOpts = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const sel = document.querySelector('select[name="reward_type"]') || document.querySelector('#what-discount');
      if (!sel) return 'NOT FOUND';
      return JSON.stringify(Array.from(sel.options).map(o => ({ value: o.value, text: o.text })));
    })()`,
    returnByValue: true
  });
  console.log('\n=== REWARD TYPE OPTIONS ===');
  try {
    const opts = JSON.parse(rewardTypeOpts.result?.value || '[]');
    opts.forEach(o => console.log(`  value="${o.value}" text="${o.text}"`));
  } catch(e) {
    console.log(rewardTypeOpts.result?.value);
  }

  // בדוק אם יש scope selector (כל החנות / מוצרים ספציפיים) בדף הנוכחי
  const scopeCheck = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      // חפש radio buttons או selects הקשורים ל-scope
      const radios = Array.from(document.querySelectorAll('input[type="radio"]')).map(r => ({
        name: r.name, value: r.value, id: r.id,
        labelText: document.querySelector('label[for="'+r.id+'"]')?.textContent?.trim() || ''
      }));
      return JSON.stringify(radios);
    })()`,
    returnByValue: true
  });
  console.log('\n=== RADIO BUTTONS (scope?) ===');
  try {
    const radios = JSON.parse(scopeCheck.result?.value || '[]');
    radios.forEach(r => console.log(`  name="${r.name}" value="${r.value}" id="${r.id}" label="${r.labelText}"`));
  } catch(e) {
    console.log(scopeCheck.result?.value);
  }

  // בדוק URL של כל הלינקים לשלבים
  const stepsCheck = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const links = Array.from(document.querySelectorAll('a[href*="sales-discounts"]')).map(a => ({
        text: a.textContent?.trim()?.substring(0,40),
        href: a.href
      }));
      return JSON.stringify(links);
    })()`,
    returnByValue: true
  });
  console.log('\n=== SALES DISCOUNT LINKS ===');
  try {
    const links = JSON.parse(stepsCheck.result?.value || '[]');
    links.forEach(l => console.log(`  "${l.text}" → ${l.href}`));
  } catch(e) {}

  // גלול לתחתית לראות אם יש עוד שדות
  await ws.call('Runtime.evaluate', { expression: 'window.scrollTo(0, document.body.scrollHeight)', returnByValue: true });
  await delay(1500);

  // קבל full HTML של הטופס
  const formHtml = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const form = document.querySelector('form') || document.querySelector('[data-component="SaleCreate"]') || document.querySelector('main');
      return form ? form.innerHTML.substring(0, 3000) : 'no form found';
    })()`,
    returnByValue: true
  });
  console.log('\n=== FORM HTML (first 3000 chars) ===');
  console.log(formHtml.result?.value?.substring(0,2000));

  ws.close();
  await apiGet(`http://local.adspower.net:50325/api/v1/browser/stop?user_id=${PROFILE_ID}`);
  console.log('\nDone. Profile closed.');
}

main().catch(e => { console.error('Error:', e.message); });
