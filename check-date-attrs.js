/**
 * בודק את ה-attributes המדויקים של date inputs
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
  // Use active profile
  const activeRes = await apiGet(`http://127.0.0.1:50325/api/v1/browser/active?user_id=${PROFILE_ID}`);
  if (activeRes.code !== 0) {
    console.log('Profile not active, please run debug-discount-form.js first');
    return;
  }
  const debugPort = activeRes.data.debug_port;
  console.log(`Debug port: ${debugPort}`);

  const targets = await apiGet(`http://127.0.0.1:${debugPort}/json`);
  let target = targets.find(t => t.type==='page' && t.url && t.url.includes('etsy.com'));
  if (!target) target = targets.find(t => t.type==='page');
  if (!target) throw new Error('No page target');
  console.log('Page URL:', target.url);

  const ws = await wsConnect(target.webSocketDebuggerUrl);
  await ws.call('Runtime.enable');

  // קבל את כל ה-attributes של date inputs
  const result = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const inputs = document.querySelectorAll('input[placeholder*="MM"], input[placeholder*="DD"], input[type="date"]');
      return JSON.stringify(Array.from(inputs).map(el => {
        const attrs = {};
        for (const attr of el.attributes) {
          attrs[attr.name] = attr.value;
        }
        return {
          tag: el.tagName,
          attrs,
          placeholder: el.placeholder,
          outerHTML: el.outerHTML.substring(0, 300)
        };
      }));
    })()`,
    returnByValue: true
  });

  const data = JSON.parse(result.result?.value || '[]');
  console.log('\n=== DATE INPUTS FULL ATTRIBUTES ===');
  data.forEach((el, i) => {
    console.log(`\n[${i}] ${el.tag} placeholder="${el.placeholder}"`);
    console.log('  Attributes:', JSON.stringify(el.attrs, null, 2));
    console.log('  outerHTML:', el.outerHTML);
  });

  // גם בדוק document.querySelectorAll tests
  const selectorTests = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const tests = [
        'input[data-datepickerInput]',
        'input[data-datepicker-input]',
        'input[data-datepickerinput]',
        'input[placeholder*="DD"]',
        'input[placeholder*="MM/YYYY"]',
        'input[aria-label*="DD"]'
      ];
      const results = {};
      tests.forEach(sel => {
        try {
          results[sel] = document.querySelectorAll(sel).length;
        } catch(e) {
          results[sel] = 'ERROR: ' + e.message;
        }
      });
      return JSON.stringify(results);
    })()`,
    returnByValue: true
  });
  console.log('\n=== SELECTOR TESTS ===');
  console.log(JSON.parse(selectorTests.result?.value || '{}'));

  ws.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
