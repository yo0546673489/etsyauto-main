/**
 * Debug: print all headers + all links from latest Etsy email
 */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.IMAP_PORT || '993'),
    secure: true,
    auth: { user: process.env.IMAP_USER!, pass: process.env.IMAP_PASSWORD! },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');

  try {
    const uids = await client.search({ from: 'no-reply@account.etsy.com' }) as number[];
    const uid = uids[uids.length - 1];
    console.log(`Using UID: ${uid}\n`);

    const msg = await client.fetchOne(uid, { source: true });
    const raw = msg.source as Buffer;
    const parsed = await simpleParser(raw);

    // All headers
    console.log('=== ALL HEADERS ===');
    parsed.headers.forEach((value, key) => {
      const val = typeof value === 'string' ? value : JSON.stringify(value);
      console.log(`${key}: ${val.substring(0, 200)}`);
    });

    // From / To / Subject
    console.log('\n=== KEY FIELDS ===');
    console.log('From:', parsed.from?.text);
    console.log('To:', parsed.to ? JSON.stringify(parsed.to) : 'N/A');
    console.log('Subject:', parsed.subject);
    console.log('Date:', parsed.date);

    // All hrefs in HTML
    console.log('\n=== ALL HREF LINKS IN EMAIL ===');
    const html = parsed.html || '';
    const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1]);
    hrefs.forEach((h, i) => console.log(`  [${i}] ${h.substring(0, 150)}`));

    // Text body
    console.log('\n=== TEXT BODY (first 500 chars) ===');
    console.log((parsed.text || '').substring(0, 500));

  } finally {
    lock.release();
    await client.logout();
  }
}

main().catch(console.error);
