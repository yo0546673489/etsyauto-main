/**
 * Check if VCRHC sale exists on Etsy
 */
const net = require('net');
const crypto = require('crypto');
const url_module = require('url');
const http = require('http');
const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');

const PROFILE_ID = 'k16kmi55';
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };

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

function exec(conn, cmd, t=15000) {
  return new Promise(r => {
    let o=''; conn.exec(cmd,(e,s)=>{
      if(e){r('ERR:'+e.message);return;}
      s.on('data',d=>o+=d); s.stderr.on('data',d=>o+=d); s.on('close',()=>r(o));
    });
    setTimeout(()=>r('TIMEOUT'),t);
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  // 1. Check DB status
  console.log('[1] Checking DB task status...');
  const conn = new Client();
  await new Promise((r,j) => conn.on('ready',r).on('error',j).connect(SSH));
  const dbStatus = await exec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "SELECT id, status, error_message, completed_at FROM discount_tasks ORDER BY id DESC LIMIT 3;" 2>&1`);
  console.log(dbStatus);

  const rulesStatus = await exec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "SELECT id, name, discount_value, is_active, etsy_sale_name FROM discount_rules WHERE status != 'deleted';" 2>&1`);
  console.log(rulesStatus);
  conn.end();

  // 2. Check Etsy sales page
  console.log('[2] Checking Etsy sales page...');
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

  // Navigate to sales-discounts
  await ws.call('Page.navigate', { url: 'https://www.etsy.com/your/shops/me/sales-discounts' });
  await delay(5000);

  const urlRes = await ws.call('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
  console.log('Current URL:', urlRes.result?.value);

  // Get page text to see sales
  const pageText = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      // Look for VCRHC sale
      const text = document.body.innerText;
      const lines = text.split('\\n').filter(l => l.trim().length > 0);
      // Find lines around "VCRHC" or "sale"
      const results = [];
      lines.forEach((line, i) => {
        if (line.includes('VCRHC') || line.toLowerCase().includes('10%') || line.includes('Run a sale')) {
          results.push(line.trim());
        }
      });
      return JSON.stringify({
        hasVCRHC: text.includes('VCRHC'),
        matchingLines: results.slice(0, 10)
      });
    })()`,
    returnByValue: true
  });
  const pageData = JSON.parse(pageText.result?.value || '{}');
  console.log('\n=== PAGE ANALYSIS ===');
  console.log('Has VCRHC:', pageData.hasVCRHC);
  console.log('Matching lines:', pageData.matchingLines);

  // Screenshot
  const screenshotRes = await ws.call('Page.captureScreenshot', { format: 'png' });
  const fs = require('fs');
  fs.writeFileSync('C:\\etsy\\etsy-sales-page.png', Buffer.from(screenshotRes.data, 'base64'));
  console.log('\nScreenshot saved: C:\\etsy\\etsy-sales-page.png');

  ws.close();
  await apiGet(`http://127.0.0.1:50325/api/v1/browser/stop?user_id=${PROFILE_ID}`).catch(()=>{});
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
