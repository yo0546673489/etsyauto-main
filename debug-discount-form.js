/**
 * בודק את מבנה הדף של יצירת מבצע ב-Etsy
 * אחרי בחירת סוג הנחה ואחוז
 */

const net = require('net');
const crypto = require('crypto');
const url_module = require('url');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PROFILE_ID = 'k16kmi55'; // Store 1

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

const DUMP_ALL = `(function() {
  const result = {};
  result.url = window.location.href;
  result.title = document.title;

  // כל ה-inputs גם hidden
  result.inputs = Array.from(document.querySelectorAll('input')).map(el => ({
    type: el.type,
    name: el.name,
    id: el.id,
    placeholder: el.placeholder,
    value: el.value.substring(0,50),
    dataAttrs: Object.keys(el.dataset).join(','),
    ariaLabel: el.getAttribute('aria-label'),
    ariaDescribedby: el.getAttribute('aria-describedby'),
    classes: el.className.substring(0,100),
    visible: el.offsetParent !== null,
    rect_y: Math.round(el.getBoundingClientRect().top)
  }));

  result.selects = Array.from(document.querySelectorAll('select')).map(el => ({
    name: el.name,
    id: el.id,
    value: el.value,
    classes: el.className.substring(0,80),
    visible: el.offsetParent !== null,
    options: Array.from(el.options).map(o => ({value: o.value, text: o.text.trim()}))
  }));

  result.buttons = Array.from(document.querySelectorAll('button')).map(el => ({
    type: el.type,
    text: el.textContent.trim().substring(0,60),
    id: el.id,
    classes: el.className.substring(0,80),
    visible: el.offsetParent !== null,
    rect_y: Math.round(el.getBoundingClientRect().top)
  }));

  result.labels = Array.from(document.querySelectorAll('label')).map(el => ({
    text: el.textContent.trim().substring(0,60),
    for: el.htmlFor
  }));

  // h1-h4
  result.headings = Array.from(document.querySelectorAll('h1,h2,h3,h4')).map(el => ({
    tag: el.tagName,
    text: el.textContent.trim().substring(0,80)
  }));

  // כל divs עם data attributes
  result.divDataAttrs = Array.from(document.querySelectorAll('[data-datepicker],[data-date],[data-picker]')).map(el => ({
    tag: el.tagName,
    id: el.id,
    classes: el.className.substring(0,80),
    dataAttrs: Object.keys(el.dataset).join(',')
  }));

  return JSON.stringify(result);
})()`;

async function takeScreenshot(ws, filename) {
  const res = await ws.call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`C:\\etsy\\${filename}`, Buffer.from(res.data, 'base64'));
  console.log(`Screenshot saved: C:\\etsy\\${filename}`);
}

async function main() {
  console.log(`\n[1] Opening profile ${PROFILE_ID}...`);

  let apData;
  try {
    const activeRes = await apiGet(`http://127.0.0.1:50325/api/v1/browser/active?user_id=${PROFILE_ID}`);
    if (activeRes.code===0 && activeRes.data?.status==='Active') {
      apData = activeRes.data;
      console.log('Profile already active');
    }
  } catch(e) {}

  if (!apData) {
    const openRes = await apiGet(`http://127.0.0.1:50325/api/v1/browser/start?user_id=${PROFILE_ID}`);
    if (openRes.code !== 0) throw new Error(`Failed to open: ${openRes.msg}`);
    apData = openRes.data;
    console.log('Profile opened');
    await delay(4000);
  }

  const debugPort = apData.debug_port;
  console.log(`Debug port: ${debugPort}`);

  const targets = await apiGet(`http://127.0.0.1:${debugPort}/json`);
  let target = targets.find(t => t.type==='page' && t.url && !t.url.startsWith('chrome'));
  if (!target) target = targets[0];
  if (!target) throw new Error('No page target');
  console.log(`Connecting to: ${target.url}`);

  const ws = await wsConnect(target.webSocketDebuggerUrl);
  await ws.call('Page.enable');
  await ws.call('Runtime.enable');

  // [2] Navigate to create sale page
  console.log('\n[2] Navigating to create sale page...');
  await ws.call('Page.navigate', { url: 'https://www.etsy.com/your/shops/me/sales-discounts/step/createSale' });
  await delay(5000);

  const urlRes = await ws.call('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
  const currentUrl = urlRes.result?.value || '';
  console.log('Current URL:', currentUrl);

  if (currentUrl.includes('sign_in') || currentUrl.includes('login')) {
    console.log('ERROR: Not logged in!');
    ws.close();
    return;
  }

  // [3] Screenshot of initial state
  await takeScreenshot(ws, 'debug-sale-1-initial.png');

  // [4] Dump initial form
  console.log('\n[3] Dumping form at initial state...');
  const dump1 = await ws.call('Runtime.evaluate', { expression: DUMP_ALL, returnByValue: true });
  const data1 = JSON.parse(dump1.result?.value || '{}');
  console.log('\n=== HEADINGS ===');
  (data1.headings||[]).forEach(h => console.log(`  ${h.tag}: "${h.text}"`));
  console.log('\n=== SELECTS ===');
  (data1.selects||[]).forEach(s => {
    console.log(`  SELECT name="${s.name}" id="${s.id}" value="${s.value}"`);
    s.options?.forEach(o => console.log(`    option value="${o.value}" text="${o.text}"`));
  });
  console.log('\n=== VISIBLE INPUTS ===');
  (data1.inputs||[]).filter(i => i.visible && i.type !== 'hidden').forEach(inp => {
    console.log(`  INPUT type=${inp.type} name="${inp.name}" id="${inp.id}" placeholder="${inp.placeholder}" data="${inp.dataAttrs}" aria="${inp.ariaLabel}" y=${inp.rect_y}`);
  });
  console.log('\n=== BUTTONS ===');
  (data1.buttons||[]).filter(b => b.visible).forEach(btn => {
    console.log(`  BUTTON text="${btn.text}" id="${btn.id}"`);
  });

  // [5] Try to select "percent" discount type
  console.log('\n[4] Trying to select percentage discount type...');
  const selectResult = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const sel = document.querySelector('select[name="reward_type"]') || document.querySelector('#what-discount') || document.querySelector('select');
      if (!sel) return 'no select found';
      sel.value = 'percent';
      sel.dispatchEvent(new Event('change', {bubbles: true}));
      return 'selected: ' + sel.value + ' from select: ' + (sel.name || sel.id);
    })()`,
    returnByValue: true
  });
  console.log('Select result:', selectResult.result?.value);
  await delay(2000);

  await takeScreenshot(ws, 'debug-sale-2-after-type.png');

  // [6] Dump after type selection
  const dump2 = await ws.call('Runtime.evaluate', { expression: DUMP_ALL, returnByValue: true });
  const data2 = JSON.parse(dump2.result?.value || '{}');
  console.log('\n=== VISIBLE INPUTS AFTER TYPE SELECTION ===');
  (data2.inputs||[]).filter(i => i.visible && i.type !== 'hidden').forEach(inp => {
    console.log(`  INPUT type=${inp.type} name="${inp.name}" id="${inp.id}" placeholder="${inp.placeholder}" data="${inp.dataAttrs}" aria="${inp.ariaLabel}" y=${inp.rect_y}`);
  });
  console.log('\n=== DATA-DATEPICKER ELEMENTS ===');
  (data2.divDataAttrs||[]).forEach(el => console.log(`  ${el.tag} id="${el.id}" data="${el.dataAttrs}"`));

  // [7] Save full HTML for analysis
  const htmlRes = await ws.call('Runtime.evaluate', {
    expression: 'document.body.innerHTML.substring(0, 50000)',
    returnByValue: true
  });
  fs.writeFileSync('C:\\etsy\\debug-sale-html.txt', htmlRes.result?.value || '');
  console.log('\nHTML saved to C:\\etsy\\debug-sale-html.txt');

  ws.close();
  console.log('\nDone! Profile left open for manual inspection.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
