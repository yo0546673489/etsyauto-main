/**
 * Inject red cursor dot into ALL active AdsPower browsers
 */
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
      else { h = Buffer.alloc(4); h[0]=0x81; h[1]=126; h.writeUInt16BE(len,2); }
      const mask = crypto.randomBytes(4);
      const nh = Buffer.alloc(h.length+4); h.copy(nh); nh[1]|=0x80; mask.copy(nh, h.length);
      const mp = Buffer.alloc(p.length);
      for (let i=0; i<p.length; i++) mp[i]=p[i]^mask[i%4];
      client.write(Buffer.concat([nh, mp]));
    }
    const ws = {
      call(method, params, timeout=10000) {
        return new Promise((res, rej) => {
          const id = msgId++;
          callbacks.set(id, {res,rej});
          send({id, method, params: params||{}});
          setTimeout(() => { if(callbacks.has(id)){callbacks.delete(id); rej(new Error(`Timeout`));} }, timeout);
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

const RED_DOT_JS = `(function() {
  const old = document.getElementById('__red_cursor__');
  if (old) old.remove();
  const dot = document.createElement('div');
  dot.id = '__red_cursor__';
  dot.style.cssText = 'position:fixed;width:18px;height:18px;background:red;border-radius:50%;pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%);box-shadow:0 0 10px 4px rgba(255,0,0,0.7);left:50%;top:50%';
  document.body.appendChild(dot);
  document.addEventListener('mousemove', function(e) {
    dot.style.left = e.clientX + 'px';
    dot.style.top = e.clientY + 'px';
  });
  return 'red dot ready';
})()`;

async function injectToPort(port) {
  try {
    const targets = await new Promise((res, rej) => {
      http.get(`http://127.0.0.1:${port}/json`, r => {
        let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d)));
      }).on('error', rej);
    });
    const pages = targets.filter(t => t.type==='page' && !t.url.startsWith('chrome-'));
    for (const page of pages) {
      try {
        const ws = await wsConnect(page.webSocketDebuggerUrl);
        const r = await ws.call('Runtime.evaluate', { expression: RED_DOT_JS, returnByValue: true });
        console.log(`Port ${port}: "${page.title?.substring(0,30)}" → ${r.result?.value}`);
        ws.close();
      } catch(e) {
        console.log(`  Page error: ${e.message}`);
      }
    }
  } catch(e) {
    console.log(`Port ${port}: not accessible`);
  }
}

async function main() {
  // Check all known active profiles
  const profiles = ['k16kmi55', 'k16kmia3', 'k16kmigb'];
  const ports = new Set();

  for (const pid of profiles) {
    try {
      const data = await new Promise((res, rej) => {
        http.get(`http://local.adspower.net:50325/api/v1/browser/active?user_id=${pid}`, r => {
          let d=''; r.on('data',c=>d+=c); r.on('end',()=>{const j=JSON.parse(d); j.code===0?res(j.data):rej(new Error('inactive'));});
        }).on('error', rej);
      });
      console.log(`Profile ${pid}: active on port ${data.debug_port}`);
      ports.add(data.debug_port);
    } catch(e) {
      console.log(`Profile ${pid}: inactive`);
    }
  }

  console.log(`\nInjecting red dot to ${ports.size} browser(s)...`);
  for (const port of ports) {
    await injectToPort(port);
  }
}

main().catch(e => console.error('Fatal:', e.message));
