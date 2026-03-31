/**
 * Scrape ALL stores sequentially.
 * After each store: closes the AdsPower profile.
 * If blocked/login page: skips store and closes profile.
 * Usage: node scrape-all-stores.js [startStore] [endStore]
 *   e.g. node scrape-all-stores.js 4 24
 */

const net = require('net');
const crypto = require('crypto');
const url_module = require('url');
const http = require('http');
const path = require('path');

const dotenv = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join('C:\\etsy\\הודעות', '.env') });
const { Pool } = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'pg'));

const START_STORE = parseInt(process.argv[2] || '1');
const END_STORE   = parseInt(process.argv[3] || '24');

// ─── WebSocket CDP client ────────────────────────────────────────────────────
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
      call(method, params, timeout=20000) {
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

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(min,max) { return Math.floor(Math.random()*(max-min+1))+min; }

async function humanClick(ws, x, y) {
  for (let i=0; i<rand(2,4); i++) {
    await ws.call('Input.dispatchMouseEvent', { type:'mouseMoved', x: x+rand(-10,10), y: y+rand(-6,6), button:'none' });
    await delay(rand(20,50));
  }
  await ws.call('Input.dispatchMouseEvent', { type:'mouseMoved', x, y, button:'none' });
  await delay(rand(60,150));
  await ws.call('Input.dispatchMouseEvent', { type:'mousePressed', x, y, button:'left', clickCount:1 });
  await delay(rand(50,100));
  await ws.call('Input.dispatchMouseEvent', { type:'mouseReleased', x, y, button:'left', clickCount:1 });
}

function apiGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>{
        try { resolve(JSON.parse(d)); } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function getActiveProfile(profileId) {
  return apiGet(`http://local.adspower.net:50325/api/v1/browser/active?user_id=${profileId}`)
    .then(j => {
      if (j.code===0 && j.data?.status==='Active' && j.data?.debug_port) return j.data;
      throw new Error('not active');
    });
}
function openProfile(profileId) {
  return apiGet(`http://local.adspower.net:50325/api/v1/browser/start?user_id=${profileId}`)
    .then(j => { if(j.code===0) return j.data; throw new Error(j.msg||'open failed'); });
}
function closeProfile(profileId) {
  return apiGet(`http://local.adspower.net:50325/api/v1/browser/stop?user_id=${profileId}`)
    .then(j => console.log(`  Profile ${profileId} closed: code=${j.code}`))
    .catch(e => console.log(`  Profile close error: ${e.message}`));
}
function getTargets(port) {
  return apiGet(`http://127.0.0.1:${port}/json`);
}

function injectRedDot(ws) {
  return ws.call('Runtime.evaluate', {
    expression: `(function(){const old=document.getElementById('__red_cursor__');if(old)old.remove();const d=document.createElement('div');d.id='__red_cursor__';d.style.cssText='position:fixed;width:18px;height:18px;background:red;border-radius:50%;pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%);box-shadow:0 0 8px 3px rgba(255,0,0,0.6);left:50%;top:50%';document.body.appendChild(d);document.addEventListener('mousemove',function(e){d.style.left=e.clientX+'px';d.style.top=e.clientY+'px';});return 'ok';})()`,
    returnByValue: true
  }).catch(() => {});
}

const FIND_CONVOS = `(function() {
  const all = Array.from(document.querySelectorAll('div, li'));
  const candidates = all.filter(el => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const text = el.textContent?.trim() || '';
    return style.cursor === 'pointer' && rect.top > 100 && rect.top < 900 &&
           rect.left > 300 && rect.width > 400 && rect.height > 40 && rect.height < 130 && text.length > 10;
  });
  const seen = new Set();
  const unique = [];
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    const key = Math.round(rect.top / 5) * 5;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({ text: el.textContent?.trim().substring(0,100), rect: { t: Math.round(rect.top), l: Math.round(rect.left), w: Math.round(rect.width), h: Math.round(rect.height) } });
    }
  }
  return JSON.stringify(unique);
})()`;

const SCRAPE_MSGS = `(function() {
  const container = document.querySelector('div.scrolling-message-list');
  if (!container) return JSON.stringify({ messages: [], customerName: '', error: 'no container' });
  let customerName = '';
  const nameEls = document.querySelectorAll('[class*="buyer-name"], [class*="customer-name"]');
  nameEls.forEach(el => { if (!customerName) customerName = el.textContent?.trim(); });
  const bubbles = container.querySelectorAll('div.wt-rounded.wt-text-body-01');
  const messages = []; const seen = new Set();
  bubbles.forEach(el => {
    const text = el.textContent?.trim() || '';
    if (text.length < 1) return;
    const clean = text.replace(/^Message:\\s*/i, '').trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    const isStore = el.classList.contains('wt-sem-bg-surface-informational-subtle');
    const imgs = Array.from(el.querySelectorAll('img')).map(img => img.src).filter(src => src && src.startsWith('http') && !src.startsWith('data:'));
    const links = Array.from(el.querySelectorAll('a[href]')).map(a => a.href).filter(href => href && href.startsWith('http'));
    const allUrls = [...new Set([...imgs, ...links])];
    messages.push({ senderType: isStore ? 'store' : 'customer', messageText: clean, sentAt: new Date().toISOString(), imageUrls: allUrls });
  });
  return JSON.stringify({ messages, customerName });
})()`;

async function scrapeStore(store, pool) {
  const profileId = store.adspower_profile_id;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== Store ${store.store_number}: ${store.store_name} (${profileId}) ===`);
  console.log('='.repeat(60));

  let apData;
  let wasAlreadyActive = false;

  try {
    apData = await getActiveProfile(profileId);
    console.log('Profile already active');
    wasAlreadyActive = true;
  } catch(e) {
    console.log('Opening profile...');
    try {
      apData = await openProfile(profileId);
      await delay(5000);
    } catch(openErr) {
      console.log(`BLOCKED/ERROR opening profile: ${openErr.message}`);
      return { status: 'blocked', saved: 0, failed: 0 };
    }
  }

  let ws;
  try {
    const targets = await getTargets(apData.debug_port);
    console.log(`Debug port: ${apData.debug_port}, ${targets.length} targets`);

    // Find Etsy page target
    let etsyTarget = targets.find(t => t.type==='page' && t.url.includes('etsy.com'));
    if (!etsyTarget) etsyTarget = targets.find(t => t.type==='page');
    if (!etsyTarget) throw new Error('No page target found');

    ws = await wsConnect(etsyTarget.webSocketDebuggerUrl);
    await ws.call('Page.enable');
    await ws.call('Runtime.enable');

    // Navigate to messages
    console.log('Navigating to messages/all...');
    await ws.call('Page.navigate', { url: 'https://www.etsy.com/messages/all' });
    await delay(5000);

    // Check if we're blocked (login page, captcha, etc.)
    const pageUrlRes = await ws.call('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
    const pageUrl = pageUrlRes.result?.value || '';
    const pageTitleRes = await ws.call('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
    const pageTitle = pageTitleRes.result?.value || '';

    console.log(`Page URL: ${pageUrl.substring(0,70)}`);
    console.log(`Page Title: ${pageTitle.substring(0,60)}`);

    const isBlocked = !pageUrl.includes('etsy.com/messages') ||
                      pageTitle.toLowerCase().includes('sign in') ||
                      pageTitle.toLowerCase().includes('login') ||
                      pageTitle.toLowerCase().includes('captcha') ||
                      pageTitle.toLowerCase().includes('suspended');

    if (isBlocked) {
      console.log('BLOCKED - login/captcha page detected. Skipping store.');
      ws.close();
      await closeProfile(profileId);
      return { status: 'blocked', saved: 0, failed: 0 };
    }

    // Inject red dot
    await injectRedDot(ws);

    // Move mouse around
    await ws.call('Input.dispatchMouseEvent', { type:'mouseMoved', x: rand(300,600), y: rand(200,400), button:'none' });
    await delay(rand(600,1000));

    const existingRes = await pool.query('SELECT etsy_conversation_url FROM conversations WHERE store_id = $1', [store.id]);
    const existingUrls = new Set(existingRes.rows.map(r => r.etsy_conversation_url));
    console.log(`Already have ${existingUrls.size} conversations`);

    let saved = 0, failed = 0, skipped = 0;
    const processedUrls = new Set();
    let scrollRound = 0;
    let consecutiveEmptyRounds = 0;

    while (scrollRound < 12) {
      const convoRes = await ws.call('Runtime.evaluate', { expression: FIND_CONVOS, returnByValue: true });
      const convRows = JSON.parse(convoRes.result?.value || '[]');
      console.log(`\nRound ${scrollRound+1}: ${convRows.length} rows`);

      if (convRows.length === 0) { console.log('No rows found, stopping'); break; }

      let anyNew = false;

      for (let i=0; i<convRows.length; i++) {
        const row = convRows[i];
        const cx = row.rect.l + row.rect.w/2;
        const cy = row.rect.t + row.rect.h/2;
        console.log(`  [${i+1}] "${row.text?.substring(0,40)}" y=${row.rect.t}`);

        try {
          await delay(rand(400,800));
          await humanClick(ws, cx, cy);
          await delay(rand(2500,4000));

          const urlRes = await ws.call('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
          const convUrl = urlRes.result?.value || '';

          if (processedUrls.has(convUrl) || existingUrls.has(convUrl)) {
            skipped++;
            // Navigate back quickly without extra delay
            await ws.call('Page.navigate', { url: 'https://www.etsy.com/messages/all' });
            await delay(1500);
            continue;
          }

          if (!convUrl.match(/\/messages\/\d+/)) {
            console.log(`    No conv URL: ${convUrl.substring(0,50)}`);
            // Check if we got blocked mid-scrape
            if (convUrl.includes('sign_in') || convUrl.includes('login') || convUrl.includes('captcha')) {
              console.log('    BLOCKED mid-scrape! Stopping store.');
              ws.close();
              await closeProfile(profileId);
              return { status: 'blocked_mid', saved, failed };
            }
            continue;
          }

          processedUrls.add(convUrl);
          anyNew = true;

          const scrapeRes = await ws.call('Runtime.evaluate', { expression: SCRAPE_MSGS, returnByValue: true });
          const scraped = JSON.parse(scrapeRes.result?.value || '{"messages":[],"customerName":""}');

          if (scraped.messages.length === 0) {
            console.log('    No messages, skip');
            failed++;
            await ws.call('Page.navigate', { url: 'https://www.etsy.com/messages/all' });
            await delay(rand(2000,3000));
            continue;
          }

          const customerName = scraped.customerName || `Customer${i+1}`;
          console.log(`    "${customerName}" | ${scraped.messages.length} msgs`);

          const lastMsg = scraped.messages[scraped.messages.length-1];
          const existing = await pool.query('SELECT id FROM conversations WHERE store_id=$1 AND etsy_conversation_url=$2', [store.id, convUrl]);
          let convId;
          if (existing.rows.length > 0) {
            convId = existing.rows[0].id;
            await pool.query('UPDATE conversations SET customer_name=$1, last_message_text=$2, last_message_at=NOW(), updated_at=NOW() WHERE id=$3',
              [customerName, lastMsg?.messageText?.substring(0,200)||'', convId]);
          } else {
            const ins = await pool.query("INSERT INTO conversations (store_id, etsy_conversation_url, customer_name, last_message_text, last_message_at, status, created_at, updated_at) VALUES ($1,$2,$3,$4,NOW(),'active',NOW(),NOW()) RETURNING id",
              [store.id, convUrl, customerName, lastMsg?.messageText?.substring(0,200)||'']);
            convId = ins.rows[0].id;
          }

          let newMsgs = 0;
          for (const msg of scraped.messages) {
            const hash = crypto.createHash('md5').update(`${convId}:${msg.senderType}:${msg.messageText}`).digest('hex');
            const imgArr = (msg.imageUrls && msg.imageUrls.length > 0) ? msg.imageUrls : [];

            // Fetch Etsy product card data for listing URLs
            let cardData = {};
            const listingUrls = imgArr.filter(u => u.includes('etsy.com/listing/'));
            if (listingUrls.length > 0) {
              try {
                const listingUrl = listingUrls[0];
                console.log(`    Fetching card: ${listingUrl.substring(0,55)}`);
                await ws.call('Page.navigate', { url: listingUrl });
                await delay(3500);
                const CARD_EXTRACT = `(function() {
                  const ogImg = document.querySelector('meta[property="og:image"]')?.content || '';
                  const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
                  const h1 = document.querySelector('h1')?.textContent?.trim() || '';
                  const saleSel = ['[data-testid="price-only"] .currency-value','.wt-text-title-larger.wt-mr-xs-2','.currency-value'];
                  let salePrice = '';
                  for (const sel of saleSel) {
                    const el = document.querySelector(sel);
                    if (el && el.textContent.trim()) { salePrice = el.textContent.trim(); break; }
                  }
                  const origSel = ['[data-testid="StrikeThroughPrice"] .currency-value','.wt-text-strikethrough .currency-value'];
                  let origPrice = '';
                  for (const sel of origSel) {
                    const el = document.querySelector(sel);
                    if (el && el.textContent.trim()) { origPrice = el.textContent.trim(); break; }
                  }
                  return JSON.stringify({ image: ogImg, title: ogTitle || h1, salePrice, origPrice });
                })()`;
                const cardRes = await ws.call('Runtime.evaluate', { expression: CARD_EXTRACT, returnByValue: true });
                const parsed = JSON.parse(cardRes.result?.value || '{}');
                if (parsed.image || parsed.title) {
                  cardData = { ...parsed, url: listingUrl };
                  console.log(`    Card: "${(parsed.title||'').substring(0,35)}" img=${!!parsed.image} price=${parsed.salePrice}`);
                }
                await ws.call('Page.navigate', { url: 'https://www.etsy.com/messages/all' });
                await delay(rand(1500,2500));
              } catch(cardErr) {
                console.log(`    Card error: ${cardErr.message}`);
                try { await ws.call('Page.navigate', { url: 'https://www.etsy.com/messages/all' }); await delay(1500); } catch(e2){}
              }
            }

            const r = await pool.query(
              "INSERT INTO messages (conversation_id, sender_type, sender_name, message_text, sent_at, message_hash, image_urls, card_data, created_at) VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,NOW()) ON CONFLICT (message_hash) DO UPDATE SET image_urls=EXCLUDED.image_urls, card_data=EXCLUDED.card_data RETURNING id",
              [convId, msg.senderType, msg.senderType==='store'?store.store_name:customerName, msg.messageText, hash, imgArr, JSON.stringify(cardData)]
            );
            if (r.rows.length>0) newMsgs++;
          }
          console.log(`    ✓ conv_id=${convId}, ${newMsgs} new msgs`);
          saved++;

          await ws.call('Page.navigate', { url: 'https://www.etsy.com/messages/all' });
          await delay(rand(2000,3500));
          await injectRedDot(ws);

        } catch(err) {
          console.error(`    Error: ${err.message}`);
          failed++;
          try { await ws.call('Page.navigate', { url: 'https://www.etsy.com/messages/all' }); await delay(2000); } catch(e2){}
        }
      }

      if (!anyNew) {
        consecutiveEmptyRounds++;
        // Stop if we've done 2+ rounds with no new conversations
        if (consecutiveEmptyRounds >= 2) {
          console.log('No new conversations for 2 rounds, stopping early.');
          break;
        }
        console.log('No new conversations, scrolling...');
        await ws.call('Runtime.evaluate', {
          expression: "(function(){ const l=document.querySelector('[class*=\"inbox\"]'); if(l)l.scrollTop+=400; else window.scrollBy(0,400); return 'ok'; })()",
          returnByValue: true
        });
        await delay(2000);
      } else {
        consecutiveEmptyRounds = 0; // reset on finding new conversations
      }
      scrollRound++;
    }

    ws.close();
    console.log(`\nStore ${store.store_number} done: ${saved} new, ${failed} failed, ${skipped} skipped`);
    return { status: 'ok', saved, failed, skipped };

  } catch(err) {
    console.error(`Store ${store.store_number} error: ${err.message}`);
    try { if(ws) ws.close(); } catch(e){}
    return { status: 'error', error: err.message, saved: 0, failed: 0 };
  } finally {
    // Always close the profile after scraping
    console.log(`Closing profile ${profileId}...`);
    await closeProfile(profileId);
    await delay(2000); // small pause between stores
  }
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const storesRes = await pool.query(
    'SELECT * FROM stores WHERE store_number >= $1 AND store_number <= $2 ORDER BY store_number',
    [START_STORE, END_STORE]
  );
  const stores = storesRes.rows;
  console.log(`\nWill scrape ${stores.length} stores (${START_STORE} to ${END_STORE})`);

  const results = [];
  for (const store of stores) {
    const result = await scrapeStore(store, pool);
    results.push({ store: store.store_number, name: store.store_name, ...result });

    // Print running summary
    console.log(`\n--- Progress: ${results.length}/${stores.length} stores done ---`);
    results.forEach(r => {
      const status = r.status === 'ok' ? `✓ ${r.saved} new` : r.status === 'blocked' || r.status === 'blocked_mid' ? '✗ BLOCKED' : `⚠ ${r.error||r.status}`;
      console.log(`  Store ${r.store} (${r.name}): ${status}`);
    });
  }

  // Final totals
  const total = await pool.query('SELECT COUNT(*) as cnt FROM conversations');
  const msgs = await pool.query('SELECT COUNT(*) as cnt FROM messages');
  console.log(`\n${'='.repeat(60)}`);
  console.log('ALL DONE');
  console.log(`Total DB: ${total.rows[0].cnt} conversations, ${msgs.rows[0].cnt} messages`);
  console.log('='.repeat(60));

  await pool.end();
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
