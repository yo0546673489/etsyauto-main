/**
 * Full scraper using direct CDP - scrapes ALL conversations from store 1
 * Uses raw WebSocket CDP to avoid Playwright blob-worker timeout
 */

const net = require('net');
const crypto = require('crypto');
const url_module = require('url');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Load deps from project
const dotenv = require(path.join(__dirname, 'הודעות', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join(__dirname, 'הודעות', '.env') });
const { Pool } = require(path.join(__dirname, 'הודעות', 'node_modules', 'pg'));

const ADSPOWER_PORT = 50325;
const STORE_NUMBER = 1;

// ─── Minimal WebSocket CDP client ───────────────────────────────────────────

function wsConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const parsed = url_module.parse(wsUrl);
    const key = crypto.randomBytes(16).toString('base64');
    const client = net.createConnection({ host: parsed.hostname, port: parseInt(parsed.port) }, () => {
      const req = `GET ${parsed.path} HTTP/1.1\r\nHost: ${parsed.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`;
      client.write(req);
    });

    let buf = Buffer.alloc(0);
    let upgraded = false;
    const callbacks = new Map();
    const eventListeners = new Map();
    let msgId = 1;

    function parseFrame(buf) {
      if (buf.length < 2) return null;
      const first = buf[0], second = buf[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let payloadLen = second & 0x7f;
      let offset = 2;
      if (payloadLen === 126) { if (buf.length < 4) return null; payloadLen = buf.readUInt16BE(2); offset = 4; }
      else if (payloadLen === 127) { if (buf.length < 10) return null; payloadLen = Number(buf.readBigUInt64BE(2)); offset = 10; }
      if (masked) offset += 4;
      if (buf.length < offset + payloadLen) return null;
      return { opcode, payload: buf.slice(offset, offset + payloadLen), consumed: offset + payloadLen };
    }

    function sendFrame(data) {
      const payload = Buffer.from(JSON.stringify(data), 'utf8');
      const len = payload.length;
      let headerBuf;
      if (len < 126) { headerBuf = Buffer.alloc(2); headerBuf[0]=0x81; headerBuf[1]=len; }
      else if (len < 65536) { headerBuf = Buffer.alloc(4); headerBuf[0]=0x81; headerBuf[1]=126; headerBuf.writeUInt16BE(len,2); }
      else { headerBuf = Buffer.alloc(10); headerBuf[0]=0x81; headerBuf[1]=127; headerBuf.writeBigUInt64BE(BigInt(len),2); }
      const mask = crypto.randomBytes(4);
      const newHeader = Buffer.alloc(headerBuf.length+4);
      headerBuf.copy(newHeader);
      newHeader[1] |= 0x80;
      mask.copy(newHeader, headerBuf.length);
      const maskedPayload = Buffer.alloc(payload.length);
      for (let i=0; i<payload.length; i++) maskedPayload[i] = payload[i]^mask[i%4];
      client.write(Buffer.concat([newHeader, maskedPayload]));
    }

    const ws = {
      call(method, params, timeoutMs=20000) {
        return new Promise((res, rej) => {
          const id = msgId++;
          callbacks.set(id, { res, rej });
          sendFrame({ id, method, params: params||{} });
          setTimeout(() => { if(callbacks.has(id)){ callbacks.delete(id); rej(new Error(`Timeout: ${method}`)); } }, timeoutMs);
        });
      },
      on(event, cb) {
        if (!eventListeners.has(event)) eventListeners.set(event, []);
        eventListeners.get(event).push(cb);
      },
      close() { client.destroy(); }
    };

    client.on('data', chunk => {
      if (!upgraded) {
        buf = Buffer.concat([buf, chunk]);
        if (buf.indexOf('\r\n\r\n') !== -1) { upgraded = true; buf = buf.slice(buf.indexOf('\r\n\r\n')+4); resolve(ws); }
        return;
      }
      buf = Buffer.concat([buf, chunk]);
      while (buf.length > 0) {
        const frame = parseFrame(buf);
        if (!frame) break;
        buf = buf.slice(frame.consumed);
        if (frame.opcode === 1) {
          try {
            const msg = JSON.parse(frame.payload.toString('utf8'));
            if (msg.id && callbacks.has(msg.id)) {
              const {res,rej} = callbacks.get(msg.id); callbacks.delete(msg.id);
              if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
            } else if (msg.method) {
              const listeners = eventListeners.get(msg.method)||[];
              listeners.forEach(cb => cb(msg.params));
            }
          } catch(e) {}
        }
      }
    });
    client.on('error', reject);
    client.on('close', () => { for(const [,[,rej]] of callbacks) rej(new Error('WS closed')); });
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(min,max) { return Math.floor(Math.random()*(max-min+1))+min; }

// Human-like mouse movement
async function humanClick(ws, x, y) {
  const steps = rand(3, 6);
  const startX = x + rand(-30, 30), startY = y + rand(-20, 20);
  for (let i=0; i<=steps; i++) {
    const cx = startX + (x-startX)*i/steps + rand(-2,2);
    const cy = startY + (y-startY)*i/steps + rand(-1,1);
    await ws.call('Input.dispatchMouseEvent', { type:'mouseMoved', x:cx, y:cy, button:'none' });
    await delay(rand(20, 60));
  }
  await delay(rand(50, 150));
  await ws.call('Input.dispatchMouseEvent', { type:'mousePressed', x, y, button:'left', clickCount:1 });
  await delay(rand(60, 120));
  await ws.call('Input.dispatchMouseEvent', { type:'mouseReleased', x, y, button:'left', clickCount:1 });
}

async function getAdsPowerProfile(profileId) {
  return new Promise((resolve, reject) => {
    http.get(`http://local.adspower.net:${ADSPOWER_PORT}/api/v1/browser/active?user_id=${profileId}`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const json = JSON.parse(data);
        if (json.code === 0) resolve(json.data);
        else reject(new Error(`AdsPower: ${json.msg}`));
      });
    }).on('error', reject);
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // 1. Get store
  const storeRes = await pool.query('SELECT * FROM stores WHERE store_number = $1', [STORE_NUMBER]);
  if (storeRes.rows.length === 0) { console.error('Store not found'); process.exit(1); }
  const store = storeRes.rows[0];
  console.log(`\n=== Scraping Store ${STORE_NUMBER}: ${store.store_name} ===`);

  // 2. Get CDP URL via /json endpoint
  const cdpTargets = await new Promise((resolve, reject) => {
    const adsPowerData = getAdsPowerProfile(store.adspower_profile_id);
    adsPowerData.then(data => {
      const port = data.debug_port;
      http.get(`http://127.0.0.1:${port}/json`, res => {
        let d = ''; res.on('data', c => d+=c); res.on('end', () => resolve({ port, targets: JSON.parse(d) }));
      }).on('error', reject);
    }).catch(reject);
  });

  console.log(`Debug port: ${cdpTargets.port}`);
  console.log(`Found ${cdpTargets.targets.length} CDP targets`);

  // Find the Etsy messages page target
  const etsy = cdpTargets.targets.find(t => t.type==='page' && t.url.includes('etsy.com'));
  if (!etsy) { console.error('Etsy page not found in CDP targets'); process.exit(1); }
  console.log(`Etsy page: ${etsy.title} | ${etsy.url}`);
  console.log(`WS: ${etsy.webSocketDebuggerUrl}`);

  // 3. Connect to the Etsy page directly
  console.log('\nConnecting to Etsy page CDP...');
  const ws = await wsConnect(etsy.webSocketDebuggerUrl);
  console.log('Connected!');

  // Enable required domains
  await ws.call('Page.enable');
  await ws.call('Runtime.enable');

  // 4. Navigate to /messages/all if not there
  const urlRes = await ws.call('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
  const currentUrl = urlRes.result?.value || '';
  console.log('Current URL:', currentUrl);

  if (!currentUrl.includes('/messages/')) {
    console.log('Navigating to messages...');
    await ws.call('Page.navigate', { url: 'https://www.etsy.com/messages/all' });
    await delay(5000);
  } else {
    // Make sure we're on the "all" tab
    if (!currentUrl.includes('/all') && !currentUrl.includes('/unread')) {
      await ws.call('Page.navigate', { url: 'https://www.etsy.com/messages/all' });
      await delay(4000);
    } else {
      await delay(1000);
    }
  }

  // Random mouse movement (human-like)
  await ws.call('Input.dispatchMouseEvent', { type:'mouseMoved', x: rand(300,600), y: rand(200,400), button:'none' });
  await delay(rand(500,1000));

  // 5. Find all unique conversation rows
  console.log('\nFinding conversation rows...');
  const convoScript = `(function() {
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
    // Deduplicate by top position (within 5px)
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

  const convoRes = await ws.call('Runtime.evaluate', { expression: convoScript, returnByValue: true });
  let convRows = JSON.parse(convoRes.result?.value || '[]');
  console.log(`Found ${convRows.length} unique conversation rows`);
  convRows.forEach((c, i) => console.log(`  [${i}] "${c.text?.substring(0,60)}" @ y=${c.rect.t}`));

  if (convRows.length === 0) {
    console.log('No conversations found!');
    ws.close(); await pool.end(); return;
  }

  // 6. Scrape each conversation
  let saved = 0, failed = 0;

  for (let i = 0; i < convRows.length; i++) {
    const row = convRows[i];
    const cx = row.rect.l + row.rect.w / 2;
    const cy = row.rect.t + row.rect.h / 2;

    console.log(`\n[${i+1}/${convRows.length}] Clicking: "${row.text?.substring(0,40)}" at (${Math.round(cx)},${Math.round(cy)})`);

    try {
      await delay(rand(600, 1200));
      await humanClick(ws, cx, cy);
      await delay(rand(2500, 4000));

      // Get URL after click
      const afterUrlRes = await ws.call('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
      const convUrl = afterUrlRes.result?.value || '';
      console.log(`  URL: ${convUrl}`);

      // Small human mouse movement
      await ws.call('Input.dispatchMouseEvent', { type:'mouseMoved', x: rand(500,700), y: rand(300,500), button:'none' });

      // Scrape messages from the conversation
      const scrapeScript = `(function() {
        const container = document.querySelector('div.scrolling-message-list');
        if (!container) return JSON.stringify({ messages: [], customerName: '', error: 'no container' });

        // Get customer name
        let customerName = '';
        const nameEls = document.querySelectorAll('[class*="buyer-name"], [class*="customer-name"]');
        nameEls.forEach(el => { if (!customerName) customerName = el.textContent?.trim(); });

        // Try to get name from the thread header
        if (!customerName) {
          const header = document.querySelector('.thread-header, [class*="thread-title"], [class*="convo-header"]');
          customerName = header?.textContent?.trim() || '';
        }

        // Try to get name from the conversation list item that's active
        if (!customerName) {
          const active = document.querySelector('[class*="selected"], [class*="active"], [aria-selected="true"]');
          if (active) customerName = active.textContent?.trim().split('\\n')[0] || '';
        }

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
          messages.push({
            senderType: isStore ? 'store' : 'customer',
            messageText: clean,
            sentAt: new Date().toISOString()
          });
        });

        // Extract timestamps
        const timestamps = Array.from(container.querySelectorAll('time, [datetime], [class*="timestamp"], [class*="time"]'));
        // Try to match timestamps to messages (approximate)

        return JSON.stringify({ messages, customerName });
      })()`;

      const scrapeRes = await ws.call('Runtime.evaluate', { expression: scrapeScript, returnByValue: true });
      const scraped = JSON.parse(scrapeRes.result?.value || '{"messages":[],"customerName":""}');

      if (scraped.error) console.log(`  Warning: ${scraped.error}`);
      if (scraped.messages.length === 0) {
        console.log('  No messages found - skipping');
        failed++;
        continue;
      }

      // Determine customer name
      const customerName = scraped.customerName ||
        `Customer ${i+1}`;

      console.log(`  Customer: "${customerName}" | Messages: ${scraped.messages.length}`);
      scraped.messages.slice(0, 2).forEach(m =>
        console.log(`    [${m.senderType}] "${m.messageText.substring(0,60)}"`)
      );

      // Save to DB using correct schema
      const convUrlFinal = convUrl.includes('etsy.com') ? convUrl : `https://www.etsy.com/messages/all`;
      const lastMsg = scraped.messages[scraped.messages.length - 1];

      // Check if conversation already exists
      const existingConv = await pool.query(
        'SELECT id FROM conversations WHERE store_id = $1 AND etsy_conversation_url = $2',
        [store.id, convUrlFinal]
      );

      let conversationId;
      if (existingConv.rows.length > 0) {
        conversationId = existingConv.rows[0].id;
        await pool.query(`
          UPDATE conversations
          SET customer_name=$1, last_message_text=$2, last_message_at=NOW(), updated_at=NOW()
          WHERE id=$3
        `, [customerName, lastMsg?.messageText?.substring(0,200)||'', conversationId]);
      } else {
        const convInsert = await pool.query(`
          INSERT INTO conversations (store_id, etsy_conversation_url, customer_name, last_message_text, last_message_at, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, NOW(), 'active', NOW(), NOW())
          RETURNING id
        `, [store.id, convUrlFinal, customerName, lastMsg?.messageText?.substring(0,200)||'']);
        conversationId = convInsert.rows[0].id;
      }

      // Insert messages with hash-based dedup
      const crypto = require('crypto');
      let newMessages = 0;
      for (const msg of scraped.messages) {
        const hash = crypto.createHash('md5')
          .update(`${conversationId}:${msg.senderType}:${msg.messageText}`)
          .digest('hex');
        const msgInsert = await pool.query(`
          INSERT INTO messages (conversation_id, sender_type, sender_name, message_text, sent_at, message_hash, created_at)
          VALUES ($1, $2, $3, $4, NOW(), $5, NOW())
          ON CONFLICT (message_hash) DO NOTHING
          RETURNING id
        `, [conversationId, msg.senderType, msg.senderType === 'store' ? store.store_name : customerName, msg.messageText, hash]);
        if (msgInsert.rows.length > 0) newMessages++;
      }

      console.log(`  ✓ DB conv_id=${conversationId}, ${newMessages} new messages saved`);
      saved++;

      // Reading delay - scroll through the messages (visible human behavior)
      await ws.call('Input.dispatchMouseEvent', { type:'mouseMoved', x: rand(600,800), y: rand(400,600), button:'none' });
      await delay(rand(800, 1500));

      // Navigate back to the list
      await ws.call('Page.navigate', { url: 'https://www.etsy.com/messages/all' });
      await delay(rand(3000, 4500));

      // Refind conversation rows (page reloaded)
      const refindRes = await ws.call('Runtime.evaluate', { expression: convoScript, returnByValue: true });
      const newRows = JSON.parse(refindRes.result?.value || '[]');
      if (newRows.length > 0) {
        // Update remaining rows
        convRows = newRows;
        console.log(`  Refreshed: ${convRows.length} rows visible`);
      }

    } catch (err) {
      console.error(`  Error: ${err.message}`);
      failed++;
      // Try to navigate back
      try {
        await ws.call('Page.navigate', { url: 'https://www.etsy.com/messages/all' });
        await delay(3000);
      } catch(e2) {}
    }
  }

  console.log(`\n=== Done: ${saved} saved, ${failed} failed ===`);

  ws.close();
  await pool.end();
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
