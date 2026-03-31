// Test fetching Etsy listing data via the already-open browser on port 52134
const net = require('net');
const crypto = require('crypto');
const url_module = require('url');
const http = require('http');

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
      call(method, params, timeout=15000) {
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
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  // Use store 1 browser (port 52134) - find a non-Etsy page target to use
  const targets = await new Promise((res, rej) => {
    http.get('http://127.0.0.1:52134/json', r => {
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d)));
    }).on('error', rej);
  });

  // Find a page target - prefer one NOT on messages
  const pageTarget = targets.find(t => t.type==='page' && !t.url.includes('messages'));
  console.log('Using target:', pageTarget?.url?.substring(0,60));

  const ws = await wsConnect(pageTarget.webSocketDebuggerUrl);
  await ws.call('Page.enable');
  await ws.call('Runtime.enable');

  // Use Target.createTarget to open a new tab in background
  const newTarget = await ws.call('Target.createTarget', {
    url: 'about:blank',
    background: true
  });
  console.log('New tab target ID:', newTarget.targetId);

  // Connect to the new tab
  const newTargets = await new Promise((res, rej) => {
    http.get('http://127.0.0.1:52134/json', r => {
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d)));
    }).on('error', rej);
  });

  const newTab = newTargets.find(t => t.id === newTarget.targetId);
  console.log('New tab WS:', newTab?.webSocketDebuggerUrl);

  if (!newTab) { console.error('Could not find new tab'); ws.close(); return; }

  const ws2 = await wsConnect(newTab.webSocketDebuggerUrl);
  await ws2.call('Page.enable');
  await ws2.call('Runtime.enable');

  // Navigate to Etsy listing
  console.log('Navigating to Etsy listing...');
  await ws2.call('Page.navigate', { url: 'https://www.etsy.com/listing/4477164374/antique-white-farmhouse-shoe-bench' });
  await delay(4000);

  // Extract product data
  const EXTRACT = `(function() {
    const title = document.querySelector('h1[data-buy-box-listing-title]')?.textContent?.trim() ||
                  document.querySelector('h1.wt-text-body-01')?.textContent?.trim() ||
                  document.querySelector('[data-listing-id] h1')?.textContent?.trim() ||
                  document.querySelector('h1')?.textContent?.trim() || '';
    const img = document.querySelector('img[data-wt-imgzoom-src]')?.src ||
                document.querySelector('.wt-max-width-full img')?.src ||
                document.querySelector('img[src*="etsystatic"]')?.src || '';
    const price = document.querySelector('[data-buy-box-price] .currency-value')?.textContent?.trim() ||
                  document.querySelector('.wt-text-title-larger.wt-mr-xs-2')?.textContent?.trim() ||
                  document.querySelector('[class*="price"] .currency-value')?.textContent?.trim() || '';
    const ogImg = document.querySelector('meta[property="og:image"]')?.content || '';
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
    return JSON.stringify({ title: title || ogTitle, img: img || ogImg, price });
  })()`;

  const r = await ws2.call('Runtime.evaluate', { expression: EXTRACT, returnByValue: true });
  const data = JSON.parse(r.result?.value || '{}');
  console.log('\nProduct data:', JSON.stringify(data, null, 2));

  // Close the tab
  await ws.call('Target.closeTarget', { targetId: newTarget.targetId });
  console.log('Tab closed');

  ws.close();
  ws2.close();
}

main().catch(e => console.error('Error:', e.message));
