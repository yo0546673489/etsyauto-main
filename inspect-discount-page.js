/**
 * פותח AdsPower לחנות 4 ומנווט לדף יצירת הנחה
 * מדפיס את כל ה-inputs, buttons, selects בדף
 */

const net = require('net');
const crypto = require('crypto');
const url_module = require('url');
const http = require('http');
const path = require('path');

const dotenv = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join('C:\\etsy\\הודעות', '.env') });

const PROFILE_ID = 'k16kmin5'; // Store 4

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

const INSPECT_FORM = `(function() {
  const result = {};

  // כל ה-inputs
  result.inputs = Array.from(document.querySelectorAll('input')).map(el => ({
    tag: 'input',
    type: el.type,
    name: el.name,
    id: el.id,
    placeholder: el.placeholder,
    value: el.value,
    'data-attrs': Object.keys(el.dataset).map(k => 'data-'+k+'='+el.dataset[k]).join(' '),
    classes: el.className.substring(0,80),
    'aria-label': el.getAttribute('aria-label'),
    checked: el.checked,
    rect: { t: Math.round(el.getBoundingClientRect().top), l: Math.round(el.getBoundingClientRect().left) }
  }));

  // כל ה-textareas
  result.textareas = Array.from(document.querySelectorAll('textarea')).map(el => ({
    tag: 'textarea',
    name: el.name,
    id: el.id,
    placeholder: el.placeholder,
    'data-attrs': Object.keys(el.dataset).map(k => 'data-'+k+'='+el.dataset[k]).join(' '),
    classes: el.className.substring(0,80)
  }));

  // כל ה-selects
  result.selects = Array.from(document.querySelectorAll('select')).map(el => ({
    tag: 'select',
    name: el.name,
    id: el.id,
    'data-attrs': Object.keys(el.dataset).map(k => 'data-'+k+'='+el.dataset[k]).join(' '),
    classes: el.className.substring(0,80),
    options: Array.from(el.options).slice(0,5).map(o => o.text)
  }));

  // כל ה-buttons
  result.buttons = Array.from(document.querySelectorAll('button')).map(el => ({
    tag: 'button',
    type: el.type,
    text: el.textContent.trim().substring(0,50),
    id: el.id,
    'data-attrs': Object.keys(el.dataset).map(k => 'data-'+k+'='+el.dataset[k]).join(' '),
    classes: el.className.substring(0,80),
    rect: { t: Math.round(el.getBoundingClientRect().top) }
  }));

  // כותרות h1/h2/h3 להבנת מבנה
  result.headings = Array.from(document.querySelectorAll('h1,h2,h3')).map(el => ({
    tag: el.tagName,
    text: el.textContent.trim().substring(0,80)
  }));

  // labels
  result.labels = Array.from(document.querySelectorAll('label')).map(el => ({
    text: el.textContent.trim().substring(0,60),
    for: el.htmlFor
  }));

  result.url = window.location.href;
  result.title = document.title;

  return JSON.stringify(result);
})()`;

async function main() {
  console.log(`Opening profile ${PROFILE_ID}...`);

  // נסה קודם אם פעיל
  let apData;
  try {
    const activeRes = await apiGet(`http://local.adspower.net:50325/api/v1/browser/active?user_id=${PROFILE_ID}`);
    if (activeRes.code===0 && activeRes.data?.status==='Active' && activeRes.data?.debug_port) {
      apData = activeRes.data;
      console.log('Profile already active');
    }
  } catch(e) {}

  if (!apData) {
    const openRes = await apiGet(`http://local.adspower.net:50325/api/v1/browser/start?user_id=${PROFILE_ID}`);
    if (openRes.code !== 0) throw new Error(`Failed to open: ${openRes.msg}`);
    apData = openRes.data;
    console.log('Profile opened');
    await delay(5000);
  }

  console.log(`Debug port: ${apData.debug_port}`);
  const targets = await apiGet(`http://127.0.0.1:${apData.debug_port}/json`);
  console.log(`${targets.length} targets`);

  let target = targets.find(t => t.type==='page' && t.url.includes('etsy.com'));
  if (!target) target = targets.find(t => t.type==='page');
  if (!target) throw new Error('No page target');

  const ws = await wsConnect(target.webSocketDebuggerUrl);
  await ws.call('Page.enable');
  await ws.call('Runtime.enable');

  // נווט לדף יצירת הנחה
  console.log('\nNavigating to Etsy discount creation page...');
  await ws.call('Page.navigate', { url: 'https://www.etsy.com/your/shops/me/sales-discounts/step/createSale' });
  await delay(6000);

  const urlRes = await ws.call('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
  const titleRes = await ws.call('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
  console.log('URL:', urlRes.result?.value);
  console.log('Title:', titleRes.result?.value);

  // בדוק אם הגענו לדף נכון
  const currentUrl = urlRes.result?.value || '';
  if (currentUrl.includes('sign_in') || currentUrl.includes('login')) {
    console.log('ERROR: Not logged in!');
    ws.close();
    return;
  }

  // רחף מעט
  await delay(2000);

  console.log('\nInspecting form elements...');
  const inspectRes = await ws.call('Runtime.evaluate', { expression: INSPECT_FORM, returnByValue: true });
  const data = JSON.parse(inspectRes.result?.value || '{}');

  console.log('\n=== HEADINGS ===');
  (data.headings||[]).forEach(h => console.log(`  ${h.tag}: "${h.text}"`));

  console.log('\n=== INPUTS ===');
  (data.inputs||[]).forEach(inp => {
    const desc = [
      inp.type !== 'hidden' ? `type=${inp.type}` : null,
      inp.name ? `name="${inp.name}"` : null,
      inp.id ? `id="${inp.id}"` : null,
      inp.placeholder ? `placeholder="${inp.placeholder}"` : null,
      inp['aria-label'] ? `aria-label="${inp['aria-label']}"` : null,
      inp['data-attrs'] ? inp['data-attrs'] : null,
      `y=${inp.rect?.t}`
    ].filter(Boolean).join(' | ');
    console.log(`  INPUT: ${desc}`);
  });

  console.log('\n=== TEXTAREAS ===');
  (data.textareas||[]).forEach(ta => {
    console.log(`  TEXTAREA: name="${ta.name}" id="${ta.id}" placeholder="${ta.placeholder}" data="${ta['data-attrs']}"`);
  });

  console.log('\n=== SELECTS ===');
  (data.selects||[]).forEach(sel => {
    console.log(`  SELECT: name="${sel.name}" id="${sel.id}" data="${sel['data-attrs']}" options: ${sel.options?.join(', ')}`);
  });

  console.log('\n=== LABELS ===');
  (data.labels||[]).forEach(l => console.log(`  LABEL for="${l.for}": "${l.text}"`));

  console.log('\n=== BUTTONS ===');
  (data.buttons||[]).forEach(btn => {
    console.log(`  BUTTON type=${btn.type} text="${btn.text}" id="${btn.id}" data="${btn['data-attrs']}" y=${btn.rect?.t}`);
  });

  // צילום מסך לראות מה על המסך
  console.log('\nTaking screenshot...');
  const screenshotRes = await ws.call('Page.captureScreenshot', { format: 'png', quality: 80 });
  const fs = require('fs');
  const screenshotData = screenshotRes.data;
  const screenshotPath = 'C:\\etsy\\discount-page-screenshot.png';
  fs.writeFileSync(screenshotPath, Buffer.from(screenshotData, 'base64'));
  console.log(`Screenshot saved: ${screenshotPath}`);

  ws.close();

  // סגור פרופיל
  await apiGet(`http://local.adspower.net:50325/api/v1/browser/stop?user_id=${PROFILE_ID}`);
  console.log('\nProfile closed.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
