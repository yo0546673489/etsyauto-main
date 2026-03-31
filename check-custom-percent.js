/**
 * בודק את שדה custom percent אחרי בחירת Custom בתפריט
 */
const net = require('net');
const crypto = require('crypto');
const url_module = require('url');
const http = require('http');

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
          setTimeout(() => { if(callbacks.has(id)){callbacks.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);} } catch(e){}
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
  const activeRes = await apiGet(`http://127.0.0.1:50325/api/v1/browser/active?user_id=${PROFILE_ID}`);
  if (activeRes.code !== 0) throw new Error('Profile not active');
  const debugPort = activeRes.data.debug_port;

  const targets = await apiGet(`http://127.0.0.1:${debugPort}/json`);
  let target = targets.find(t => t.type==='page' && t.url && t.url.includes('etsy.com'));
  if (!target) target = targets.find(t => t.type==='page');
  if (!target) throw new Error('No page target');

  const ws = await wsConnect(target.webSocketDebuggerUrl);
  await ws.call('Runtime.enable');

  // בחר Custom (value=1) מהתפריט
  console.log('Selecting Custom (value=1) from percent dropdown...');
  await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const sel = document.querySelector('select[name="reward_type_percent_dropdown"]');
      if (!sel) return 'no select found';
      sel.value = '1';
      sel.dispatchEvent(new Event('change', {bubbles: true}));
      return 'selected custom: ' + sel.value;
    })()`,
    returnByValue: true
  });

  await delay(2000);

  // בדוק מה inputs נוספו
  const result = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const inputs = document.querySelectorAll('input[type="text"], input[type="number"]');
      return JSON.stringify(Array.from(inputs).map(el => {
        const attrs = {};
        for (const attr of el.attributes) {
          attrs[attr.name] = attr.value;
        }
        return {
          name: el.name,
          id: el.id,
          placeholder: el.placeholder,
          attrs,
          outerHTML: el.outerHTML.substring(0, 200),
          visible: el.offsetParent !== null
        };
      }));
    })()`,
    returnByValue: true
  });

  const inputs = JSON.parse(result.result?.value || '[]');
  console.log('\n=== ALL TEXT/NUMBER INPUTS AFTER CUSTOM SELECTION ===');
  inputs.filter(i => i.visible).forEach((inp, i) => {
    console.log(`\n[${i}] name="${inp.name}" id="${inp.id}" placeholder="${inp.placeholder}"`);
    console.log('  attrs:', JSON.stringify(inp.attrs));
  });

  ws.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
