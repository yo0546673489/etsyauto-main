import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

(async () => {
  const c = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: process.env.IMAP_USER!, pass: process.env.IMAP_PASSWORD! }, logger: false });
  await c.connect();
  const lock = await c.getMailboxLock('INBOX');
  const msg = await c.fetchOne(1193, { source: true });
  lock.release();
  await c.logout();

  const p = await simpleParser(msg.source as Buffer);
  const html = p.html || '';
  const text = p.text || '';

  const idx = html.toLowerCase().indexOf('view message');
  if (idx >= 0) {
    console.log('=== HTML around "View message" ===');
    console.log(html.substring(Math.max(0, idx - 400), idx + 300));
  } else {
    console.log('"view message" not found in HTML');
    const tIdx = text.toLowerCase().indexOf('view message');
    if (tIdx >= 0) {
      console.log('=== TEXT around "View message" ===');
      console.log(text.substring(Math.max(0, tIdx - 200), tIdx + 200));
    }
    // Print first 2000 chars of html
    console.log('\n=== HTML first 2000 ===');
    console.log(html.substring(0, 2000));
  }
})().catch(console.error);
