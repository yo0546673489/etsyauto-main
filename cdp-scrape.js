/**
 * Direct CDP scraper - connects directly to page target, bypassing blob workers
 * Uses only Node.js built-in modules
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Load env
const dotenv = require(path.join(__dirname, 'הודעות', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join(__dirname, 'הודעות', '.env') });
const { Pool } = require(path.join(__dirname, 'הודעות', 'node_modules', 'pg'));

const PAGE_WS = 'ws://127.0.0.1:52134/devtools/page/15991962E099CCA42690BAC33014C45C';

// Simple WebSocket client using Node.js built-in crypto + net
const net = require('net');
const crypto = require('crypto');
const url = require('url');

function wsConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(wsUrl);
    const key = crypto.randomBytes(16).toString('base64');

    const client = net.createConnection({ host: parsed.hostname, port: parseInt(parsed.port) }, () => {
      const req = `GET ${parsed.path} HTTP/1.1\r\nHost: ${parsed.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`;
      client.write(req);
    });

    let buf = Buffer.alloc(0);
    let upgraded = false;
    const callbacks = new Map();
    let msgId = 1;

    function parseFrame(buf) {
      if (buf.length < 2) return null;
      const first = buf[0];
      const second = buf[1];
      // const fin = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let payloadLen = second & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buf.length < 4) return null;
        payloadLen = buf.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buf.length < 10) return null;
        payloadLen = Number(buf.readBigUInt64BE(2));
        offset = 10;
      }

      if (masked) offset += 4;
      if (buf.length < offset + payloadLen) return null;

      const payload = buf.slice(offset, offset + payloadLen);
      return { opcode, payload, consumed: offset + payloadLen };
    }

    function sendFrame(data) {
      const str = JSON.stringify(data);
      const payload = Buffer.from(str, 'utf8');
      const len = payload.length;
      let header;
      if (len < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x81; // FIN + text
        header[1] = len; // no mask from client... actually should mask
      } else if (len < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
      }
      // Add masking (required for client->server)
      const mask = crypto.randomBytes(4);
      const newHeader = Buffer.alloc(header.length + 4);
      header.copy(newHeader);
      newHeader[1] |= 0x80; // set mask bit
      mask.copy(newHeader, header.length);
      const masked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
      client.write(Buffer.concat([newHeader, masked]));
    }

    const ws = {
      send: sendFrame,
      call(method, params) {
        return new Promise((res, rej) => {
          const id = msgId++;
          callbacks.set(id, { res, rej });
          sendFrame({ id, method, params: params || {} });
          setTimeout(() => {
            if (callbacks.has(id)) {
              callbacks.delete(id);
              rej(new Error(`Timeout calling ${method}`));
            }
          }, 30000);
        });
      },
      close() { client.destroy(); }
    };

    client.on('data', (chunk) => {
      if (!upgraded) {
        buf = Buffer.concat([buf, chunk]);
        const headerEnd = buf.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          upgraded = true;
          buf = buf.slice(headerEnd + 4);
          resolve(ws);
        }
        return;
      }

      buf = Buffer.concat([buf, chunk]);
      while (buf.length > 0) {
        const frame = parseFrame(buf);
        if (!frame) break;
        buf = buf.slice(frame.consumed);
        if (frame.opcode === 1) { // text
          try {
            const msg = JSON.parse(frame.payload.toString('utf8'));
            if (msg.id && callbacks.has(msg.id)) {
              const { res, rej } = callbacks.get(msg.id);
              callbacks.delete(msg.id);
              if (msg.error) rej(new Error(msg.error.message));
              else res(msg.result);
            }
          } catch(e) {}
        }
      }
    });

    client.on('error', reject);
    client.on('close', () => {
      for (const [id, { rej }] of callbacks) {
        rej(new Error('Connection closed'));
        callbacks.delete(id);
      }
    });
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('Connecting to CDP page target...');
  const ws = await wsConnect(PAGE_WS);
  console.log('Connected!');

  // Get page info
  const evalResult = await ws.call('Runtime.evaluate', {
    expression: 'document.title + " | " + window.location.href',
    returnByValue: true
  });
  console.log('Page:', evalResult.result?.value);

  // Navigate to messages if not there
  const urlResult = await ws.call('Runtime.evaluate', {
    expression: 'window.location.href',
    returnByValue: true
  });
  const currentUrl = urlResult.result?.value || '';
  console.log('Current URL:', currentUrl);

  if (!currentUrl.includes('/messages/')) {
    console.log('Navigating to messages/all...');
    await ws.call('Page.navigate', { url: 'https://www.etsy.com/messages/all' });
    await delay(5000);
  }

  // Take screenshot
  const shot = await ws.call('Page.captureScreenshot', { format: 'png', quality: 80 });
  fs.writeFileSync('C:\\etsy\\cdp-initial.png', Buffer.from(shot.data, 'base64'));
  console.log('Screenshot: C:\\etsy\\cdp-initial.png');

  // Find conversation rows
  const findConvos = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      // Look for cursor:pointer elements in the conversation list area
      const all = Array.from(document.querySelectorAll('div, li, tr'));
      const convos = all.filter(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const text = el.textContent?.trim() || '';
        return style.cursor === 'pointer' &&
               rect.top > 100 && rect.top < 800 &&
               rect.left > 150 && rect.width > 200 &&
               rect.height > 40 && rect.height < 130 &&
               text.length > 10;
      });

      return JSON.stringify(convos.slice(0, 20).map((el, i) => {
        const rect = el.getBoundingClientRect();
        return {
          i: i,
          tag: el.tagName,
          cls: el.className?.toString().substring(0, 80),
          text: el.textContent?.trim().substring(0, 80),
          rect: { t: Math.round(rect.top), l: Math.round(rect.left), w: Math.round(rect.width), h: Math.round(rect.height) }
        };
      }));
    })()`,
    returnByValue: true
  });

  const convos = JSON.parse(findConvos.result?.value || '[]');
  console.log(`\nFound ${convos.length} candidates:`);
  convos.forEach(c => console.log(`  [${c.i}] ${c.tag} "${c.text?.substring(0,50)}" rect=${JSON.stringify(c.rect)}`));

  fs.writeFileSync('C:\\etsy\\cdp-convos.json', JSON.stringify(convos, null, 2));

  if (convos.length === 0) {
    console.log('No conversations found!');
    ws.close();
    await pool.end();
    return;
  }

  // Try clicking the first one
  const first = convos[0];
  const clickX = first.rect.l + first.rect.w / 2;
  const clickY = first.rect.t + first.rect.h / 2;
  console.log(`\nClicking at (${Math.round(clickX)}, ${Math.round(clickY)}) - "${first.text?.substring(0,40)}"`);

  // Mouse move then click
  await ws.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: clickX - 20, y: clickY - 5, button: 'none' });
  await delay(rand(200, 400));
  await ws.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: clickX, y: clickY, button: 'none' });
  await delay(rand(100, 200));
  await ws.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: clickX, y: clickY, button: 'left', clickCount: 1 });
  await delay(80);
  await ws.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clickX, y: clickY, button: 'left', clickCount: 1 });

  await delay(3000);

  // Check if messages loaded
  const msgResult = await ws.call('Runtime.evaluate', {
    expression: `(function() {
      const container = document.querySelector('div.scrolling-message-list');
      if (!container) {
        const url = window.location.href;
        return JSON.stringify({ found: false, url });
      }
      const bubbles = container.querySelectorAll('div.wt-rounded.wt-text-body-01');
      return JSON.stringify({ found: true, bubbles: bubbles.length, url: window.location.href });
    })()`,
    returnByValue: true
  });
  const msgInfo = JSON.parse(msgResult.result?.value || '{}');
  console.log('After click:', JSON.stringify(msgInfo));

  // Screenshot after click
  const shot2 = await ws.call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:\\etsy\\cdp-after-click.png', Buffer.from(shot2.data, 'base64'));
  console.log('Screenshot: C:\\etsy\\cdp-after-click.png');

  ws.close();
  await pool.end();
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
