/**
 * Debug completo del form di creazione sale con screenshot step-by-step
 */
const net = require('net');
const crypto = require('crypto');
const url_module = require('url');
const http = require('http');
const fs = require('fs');
const path = require('path');

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

let stepNum = 0;
async function screenshot(ws, label) {
  stepNum++;
  const filename = `C:\\etsy\\step-${String(stepNum).padStart(2,'0')}-${label}.png`;
  const res = await ws.call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(filename, Buffer.from(res.data, 'base64'));
  console.log(`📸 ${filename}`);
}

async function countDateInputs(ws) {
  const res = await ws.call('Runtime.evaluate', {
    expression: `document.querySelectorAll('input[data-datepicker-input]').length`,
    returnByValue: true
  });
  return res.result?.value || 0;
}

async function sendKey(ws, key) {
  await ws.call('Input.dispatchKeyEvent', { type: 'keyDown', key });
  await ws.call('Input.dispatchKeyEvent', { type: 'keyUp', key });
}

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

  // Navigate
  console.log('\n[1] Navigating...');
  await ws.call('Page.navigate', { url: 'https://www.etsy.com/your/shops/me/sales-discounts/step/createSale' });
  await delay(5000);
  await screenshot(ws, 'initial');

  // Select percent type
  console.log('\n[2] Selecting percentage type...');
  await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const sel = document.querySelector('select[name="reward_type"]');
      sel.value = 'percent';
      sel.dispatchEvent(new Event('change', {bubbles:true}));
    })()`,
    returnByValue: true
  });
  await delay(1500);
  await screenshot(ws, 'after-type-select');

  // Select Custom (1) for 10%
  console.log('\n[3] Selecting Custom percent...');
  await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const sel = document.querySelector('select[name="reward_type_percent_dropdown"]');
      sel.value = '1';
      sel.dispatchEvent(new Event('change', {bubbles:true}));
    })()`,
    returnByValue: true
  });
  await delay(1500);
  await screenshot(ws, 'after-custom-select');

  // Find custom input
  const customInputs = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const all = document.querySelectorAll('input[type="text"], input[type="number"]');
      return JSON.stringify(Array.from(all).filter(el => el.offsetParent !== null).map(el => ({
        name: el.name, id: el.id, placeholder: el.placeholder,
        dataAttrs: Object.keys(el.dataset).join(','), value: el.value
      })));
    })()`,
    returnByValue: true
  });
  console.log('Visible inputs after custom:', customInputs.result?.value);

  // Focus start date directly to see what happens
  console.log('\n[4] Count date inputs before click:', await countDateInputs(ws));
  console.log('Clicking start date input...');
  await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const inputs = document.querySelectorAll('input[data-datepicker-input]');
      console.log('date inputs count:', inputs.length);
      if (inputs[0]) {
        inputs[0].focus();
        inputs[0].click();
      }
    })()`,
    returnByValue: true
  });
  await delay(1000);
  await screenshot(ws, 'after-startdate-click');

  console.log('Count date inputs after click:', await countDateInputs(ws));

  // Type date
  console.log('\n[5] Typing start date...');
  const startDate = '30/03/2026';
  for (const ch of startDate) {
    await ws.call('Input.dispatchKeyEvent', { type: 'keyDown', key: ch === '/' ? '/' : ch, text: ch });
    await ws.call('Input.dispatchKeyEvent', { type: 'keyUp', key: ch === '/' ? '/' : ch });
    await delay(80);
  }
  await delay(500);
  await screenshot(ws, 'after-startdate-typed');

  // Press Enter
  console.log('\n[6] Pressing Enter to confirm date...');
  await sendKey(ws, 'Enter');
  await delay(800);
  await screenshot(ws, 'after-enter');
  console.log('Count date inputs after Enter:', await countDateInputs(ws));

  // Press Escape
  console.log('\n[7] Pressing Escape...');
  await sendKey(ws, 'Escape');
  await delay(500);
  await screenshot(ws, 'after-escape');
  console.log('Count date inputs after Escape:', await countDateInputs(ws));

  // Now click end date
  console.log('\n[8] Clicking end date...');
  await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const inputs = document.querySelectorAll('input[data-datepicker-input]');
      console.log('date inputs:', inputs.length);
      if (inputs[1]) { inputs[1].focus(); inputs[1].click(); return 'clicked nth(1)'; }
      if (inputs[0]) { return 'only nth(0) available'; }
      return 'no inputs found';
    })()`,
    returnByValue: true
  });
  await delay(1000);
  await screenshot(ws, 'after-enddate-click');
  console.log('Count date inputs after end-click:', await countDateInputs(ws));

  // Type end date
  const endDate = '29/04/2026';
  for (const ch of endDate) {
    await ws.call('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch });
    await ws.call('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    await delay(80);
  }
  await delay(500);
  await screenshot(ws, 'after-enddate-typed');

  await sendKey(ws, 'Enter');
  await delay(500);
  await sendKey(ws, 'Escape');
  await delay(800);
  await screenshot(ws, 'after-enddate-escape');

  // Check Continue button
  console.log('\n[9] Checking Continue button...');
  const continueInfo = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const btns = document.querySelectorAll('button');
      const cont = Array.from(btns).find(b => b.textContent.trim() === 'Continue');
      if (!cont) return 'Continue button NOT found';
      const rect = cont.getBoundingClientRect();
      return JSON.stringify({
        text: cont.textContent.trim(),
        visible: cont.offsetParent !== null,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        disabled: cont.disabled,
        classes: cont.className
      });
    })()`,
    returnByValue: true
  });
  console.log('Continue button:', continueInfo.result?.value);

  // Try clicking Continue
  console.log('\n[10] Clicking Continue...');
  await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const btns = document.querySelectorAll('button');
      const cont = Array.from(btns).find(b => b.textContent.trim() === 'Continue');
      if (cont) { cont.click(); return 'clicked'; }
      return 'not found';
    })()`,
    returnByValue: true
  });
  await delay(3000);
  await screenshot(ws, 'after-continue');

  const finalUrl = await ws.call('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
  console.log('Final URL:', finalUrl.result?.value);

  ws.close();
  console.log('\nDone! Screenshots saved in C:\\etsy\\');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
