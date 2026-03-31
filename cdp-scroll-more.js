/**
 * Scroll down and get more conversations
 */

const net = require('net');
const crypto = require('crypto');
const url_module = require('url');
const http = require('http');
const path = require('path');

const dotenv = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join('C:\\etsy\\הודעות', '.env') });
const { Pool } = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'pg'));

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

    function parseFrame(buf) {
      if (buf.length < 2) return null;
      const opcode = buf[0] & 0x0f;
      let payloadLen = buf[1] & 0x7f, offset = 2;
      if (payloadLen === 126) { if (buf.length < 4) return null; payloadLen = buf.readUInt16BE(2); offset = 4; }
      else if (payloadLen === 127) { if (buf.length < 10) return null; payloadLen = Number(buf.readBigUInt64BE(2)); offset = 10; }
      if ((buf[1] & 0x80) !== 0) offset += 4;
      if (buf.length < offset + payloadLen) return null;
      return { opcode, payload: buf.slice(offset, offset + payloadLen), consumed: offset + payloadLen };
    }

    function sendFrame(data) {
      const payload = Buffer.from(JSON.stringify(data), 'utf8');
      const len = payload.length;
      let h;
      if (len < 126) { h = Buffer.alloc(2); h[0]=0x81; h[1]=len; }
      else if (len < 65536) { h = Buffer.alloc(4); h[0]=0x81; h[1]=126; h.writeUInt16BE(len,2); }
      else { h = Buffer.alloc(10); h[0]=0x81; h[1]=127; h.writeBigUInt64BE(BigInt(len),2); }
      const mask = crypto.randomBytes(4);
      const nh = Buffer.alloc(h.length+4); h.copy(nh); nh[1]|=0x80; mask.copy(nh,h.length);
      const mp = Buffer.alloc(payload.length);
      for (let i=0; i<payload.length; i++) mp[i]=payload[i]^mask[i%4];
      client.write(Buffer.concat([nh, mp]));
    }

    const ws = {
      call(method, params, timeout=20000) {
        return new Promise((res, rej) => {
          const id = msgId++;
          callbacks.set(id, {res,rej});
          sendFrame({id,method,params:params||{}});
          setTimeout(()=>{ if(callbacks.has(id)){callbacks.delete(id);rej(new Error(`Timeout:${method}`));} }, timeout);
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
        if (f.opcode === 1) {
          try { const m=JSON.parse(f.payload.toString('utf8')); if(m.id&&callbacks.has(m.id)){const{res,rej}=callbacks.get(m.id);callbacks.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);} } catch(e){}
        }
      }
    });
    client.on('error', reject);
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(min,max) { return Math.floor(Math.random()*(max-min+1))+min; }

async function humanClick(ws, x, y) {
  await ws.call('Input.dispatchMouseEvent', { type:'mouseMoved', x: x+rand(-20,20), y: y+rand(-10,10), button:'none' });
  await delay(rand(200, 400));
  await ws.call('Input.dispatchMouseEvent', { type:'mouseMoved', x, y, button:'none' });
  await delay(rand(100, 200));
  await ws.call('Input.dispatchMouseEvent', { type:'mousePressed', x, y, button:'left', clickCount:1 });
  await delay(rand(60, 120));
  await ws.call('Input.dispatchMouseEvent', { type:'mouseReleased', x, y, button:'left', clickCount:1 });
}

async function getTargets(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

const FIND_CONVOS = `(function() {
  const all = Array.from(document.querySelectorAll('div, li'));
  const candidates = all.filter(el => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const text = el.textContent?.trim() || '';
    return style.cursor === 'pointer' &&
           rect.top > 100 && rect.top < 900 &&
           rect.left > 300 && rect.width > 400 &&
           rect.height > 40 && rect.height < 130 &&
           text.length > 10;
  });
  const seen = new Set();
  const unique = [];
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    const key = Math.round(rect.top / 5) * 5;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({
        text: el.textContent?.trim().substring(0, 100),
        rect: { t: Math.round(rect.top), l: Math.round(rect.left), w: Math.round(rect.width), h: Math.round(rect.height) }
      });
    }
  }
  return JSON.stringify(unique);
})()`;

const SCRAPE_MSGS = `(function(storeName) {
  const container = document.querySelector('div.scrolling-message-list');
  if (!container) return JSON.stringify({ messages: [], customerName: '', error: 'no container' });

  let customerName = '';
  const nameEls = document.querySelectorAll('[class*="buyer-name"], [class*="customer-name"]');
  nameEls.forEach(el => { if (!customerName) customerName = el.textContent?.trim(); });

  const bubbles = container.querySelectorAll('div.wt-rounded.wt-text-body-01');
  const messages = [];
  const seen = new Set();

  bubbles.forEach(el => {
    const text = el.textContent?.trim() || '';
    if (text.length < 1) return;
    const clean = text.replace(/^Message:\\s*/i, '').trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    const isStore = el.classList.contains('wt-sem-bg-surface-informational-subtle');
    messages.push({ senderType: isStore ? 'store' : 'customer', messageText: clean, sentAt: new Date().toISOString() });
  });

  return JSON.stringify({ messages, customerName });
})()`;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const storeRes = await pool.query('SELECT * FROM stores WHERE store_number = 1');
  const store = storeRes.rows[0];
  console.log('Store:', store.store_name);

  // Get AdsPower debug port
  const apData = await new Promise((res, rej) => {
    http.get(`http://local.adspower.net:50325/api/v1/browser/active?user_id=${store.adspower_profile_id}`, r => {
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>{const j=JSON.parse(d); j.code===0?res(j.data):rej(new Error(j.msg));});
    }).on('error',rej);
  });

  const targets = await getTargets(apData.debug_port);
  const etsyTarget = targets.find(t => t.type==='page' && t.url.includes('etsy.com'));
  console.log('Etsy page:', etsyTarget?.url);

  const ws = await wsConnect(etsyTarget.webSocketDebuggerUrl);
  await ws.call('Page.enable');
  await ws.call('Runtime.enable');

  // Navigate to /messages/all
  await ws.call('Page.navigate', { url: 'https://www.etsy.com/messages/all' });
  await delay(4000);
  console.log('Navigated to messages/all');

  // Find existing URLs to skip
  const existingRes = await pool.query('SELECT etsy_conversation_url FROM conversations WHERE store_id = $1', [store.id]);
  const existingUrls = new Set(existingRes.rows.map(r => r.etsy_conversation_url));
  console.log(`Already have ${existingUrls.size} conversations in DB`);

  let totalSaved = 0, totalFailed = 0;
  let scrollAttempts = 0;
  const maxScrollAttempts = 5;
  const processedUrls = new Set();

  while (scrollAttempts < maxScrollAttempts) {
    // Find conversation rows
    const convoRes = await ws.call('Runtime.evaluate', { expression: FIND_CONVOS, returnByValue: true });
    const convRows = JSON.parse(convoRes.result?.value || '[]');
    console.log(`\nScroll attempt ${scrollAttempts+1}: Found ${convRows.length} rows`);

    let newRowsFound = false;

    for (let i = 0; i < convRows.length; i++) {
      const row = convRows[i];
      const cx = row.rect.l + row.rect.w / 2;
      const cy = row.rect.t + row.rect.h / 2;

      console.log(`  [${i+1}/${convRows.length}] "${row.text?.substring(0,40)}" y=${row.rect.t}`);

      try {
        await delay(rand(500, 1000));
        await humanClick(ws, cx, cy);
        await delay(rand(2000, 3500));

        const urlRes = await ws.call('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
        const convUrl = urlRes.result?.value || '';

        if (processedUrls.has(convUrl) || existingUrls.has(convUrl)) {
          console.log(`    Skip (already processed): ${convUrl}`);
          await ws.call('Page.navigate', { url: 'https://www.etsy.com/messages/all' });
          await delay(rand(2500, 3500));
          continue;
        }

        if (!convUrl.match(/\/messages\/\d+/)) {
          console.log(`    No conversation opened (url: ${convUrl})`);
          continue;
        }

        processedUrls.add(convUrl);
        newRowsFound = true;

        // Scrape messages
        const scrapeRes = await ws.call('Runtime.evaluate', { expression: SCRAPE_MSGS, returnByValue: true });
        const scraped = JSON.parse(scrapeRes.result?.value || '{"messages":[],"customerName":""}');

        if (scraped.messages.length === 0) {
          console.log('    No messages - skip');
          totalFailed++;
          await ws.call('Page.navigate', { url: 'https://www.etsy.com/messages/all' });
          await delay(rand(2500, 3500));
          continue;
        }

        const customerName = scraped.customerName || `Customer${i+1}`;
        console.log(`    Customer: "${customerName}" | ${scraped.messages.length} msgs`);
        scraped.messages.slice(0,2).forEach(m => console.log(`      [${m.senderType}] "${m.messageText.substring(0,55)}"`));

        // Save to DB
        const lastMsg = scraped.messages[scraped.messages.length-1];
        const existing = await pool.query('SELECT id FROM conversations WHERE store_id=$1 AND etsy_conversation_url=$2', [store.id, convUrl]);
        let convId;
        if (existing.rows.length > 0) {
          convId = existing.rows[0].id;
          await pool.query('UPDATE conversations SET customer_name=$1, last_message_text=$2, last_message_at=NOW(), updated_at=NOW() WHERE id=$3',
            [customerName, lastMsg?.messageText?.substring(0,200)||'', convId]);
        } else {
          const ins = await pool.query('INSERT INTO conversations (store_id, etsy_conversation_url, customer_name, last_message_text, last_message_at, status, created_at, updated_at) VALUES ($1,$2,$3,$4,NOW(),\'active\',NOW(),NOW()) RETURNING id',
            [store.id, convUrl, customerName, lastMsg?.messageText?.substring(0,200)||'']);
          convId = ins.rows[0].id;
        }

        let newMsgs = 0;
        for (const msg of scraped.messages) {
          const hash = crypto.createHash('md5').update(`${convId}:${msg.senderType}:${msg.messageText}`).digest('hex');
          const r = await pool.query('INSERT INTO messages (conversation_id, sender_type, sender_name, message_text, sent_at, message_hash, created_at) VALUES ($1,$2,$3,$4,NOW(),$5,NOW()) ON CONFLICT (message_hash) DO NOTHING RETURNING id',
            [convId, msg.senderType, msg.senderType==='store'?store.store_name:customerName, msg.messageText, hash]);
          if (r.rows.length>0) newMsgs++;
        }
        console.log(`    ✓ conv_id=${convId}, ${newMsgs} new msgs`);
        totalSaved++;

        await ws.call('Page.navigate', { url: 'https://www.etsy.com/messages/all' });
        await delay(rand(2500, 4000));

      } catch(err) {
        console.error(`    Error: ${err.message}`);
        totalFailed++;
        try { await ws.call('Page.navigate', { url: 'https://www.etsy.com/messages/all' }); await delay(2500); } catch(e2){}
      }
    }

    if (!newRowsFound) {
      console.log('No new rows found. Trying to scroll down...');
      // Scroll down to load more
      await ws.call('Runtime.evaluate', {
        expression: `(function() {
          const list = document.querySelector('[class*="inbox"], .conversations-subapp, [class*="conversation"]');
          if (list) list.scrollTop += 400;
          else window.scrollBy(0, 400);
          return 'scrolled';
        })()`,
        returnByValue: true
      });
      await delay(2000);
    }
    scrollAttempts++;
  }

  console.log(`\n=== Total: ${totalSaved} new conversations, ${totalFailed} failed ===`);

  const finalCount = await pool.query('SELECT COUNT(*) as cnt FROM conversations WHERE store_id=1');
  const msgCount = await pool.query('SELECT COUNT(*) as cnt FROM messages m JOIN conversations c ON m.conversation_id=c.id WHERE c.store_id=1');
  console.log(`DB: ${finalCount.rows[0].cnt} conversations, ${msgCount.rows[0].cnt} messages`);

  ws.close();
  await pool.end();
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
