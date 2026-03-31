/**
 * End-to-end test: Gmail IMAP → AdsPower → Etsy scrape → DB → Profitly
 * Usage: npx tsx scripts/test-e2e.ts
 */
import { ImapFlow } from 'imapflow';
import { chromium } from 'playwright';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

import { EmailParser } from '../src/email/parser';
import { AdsPowerController } from '../src/adspower/controller';
import { EtsyScraper } from '../src/browser/etsyScraper';
import { ListingScraper, extractListingUrls } from '../src/browser/listingScraper';
import { SyncEngine } from '../src/sync/engine';
import { ProfitlyNotifier } from '../src/integrations/profitly';
import { HumanBehavior } from '../src/browser/humanBehavior';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── STEP 1: Read latest Etsy email from IMAP ──────────────────────────────
async function getLatestEtsyEmail() {
  console.log('\n[1] Connecting to IMAP...');
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.IMAP_PORT || '993'),
    secure: true,
    auth: {
      user: process.env.IMAP_USER || '',
      pass: process.env.IMAP_PASSWORD || '',
    },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  let rawEmail: Buffer | null = null;
  let uid: number | null = null;

  try {
    // Search for Etsy message notification emails
    const allUids = await client.search({ from: 'no-reply@account.etsy.com' }) as number[];
    if (!allUids || allUids.length === 0) {
      console.log('  No Etsy emails found in inbox');
      return null;
    }
    console.log(`  Found ${allUids.length} Etsy emails total`);

    // Scan from newest, find a "message" notification
    const checkUids = [...allUids].reverse().slice(0, 20);
    for (const checkUid of checkUids) {
      const msg = await client.fetchOne(checkUid, { source: true, envelope: true });
      if (!msg?.source) continue;
      const src = (msg.source as Buffer).toString();
      const subjectMatch = src.match(/^Subject:.*$/im);
      const subject = subjectMatch ? subjectMatch[0] : '';
      console.log(`  UID ${checkUid}: ${subject.substring(0, 80)}`);

      if (/message|Conversation|sent you/i.test(subject)) {
        uid = checkUid;
        rawEmail = msg.source as Buffer;
        console.log(`  → Using this email (${rawEmail.length} bytes)`);
        break;
      }
    }

    if (!rawEmail) {
      console.log('  Could not find a message-type Etsy notification in last 20 emails');
      return null;
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return rawEmail;
}

// ─── STEP 2: Parse email → store email + conversation URL ──────────────────
async function parseEtsyEmail(rawEmail: Buffer) {
  console.log('\n[2] Parsing email...');
  const parser = new EmailParser();
  const parsed = await parser.parse(rawEmail);

  if (!parsed) {
    console.log('  Not an Etsy message notification');
    return null;
  }

  console.log(`  Store email (To): ${parsed.storeEmail}`);
  console.log(`  Buyer name:       ${parsed.buyerName}`);
  console.log(`  Conversation URL: ${parsed.conversationLink}`);
  console.log(`  Subject:          ${parsed.subject}`);
  return parsed;
}

// ─── STEP 3: Resolve store from email ──────────────────────────────────────
async function resolveStore(storeEmail: string) {
  console.log('\n[3] Resolving store from email...');
  const result = await pool.query(
    'SELECT * FROM stores WHERE LOWER(store_email) = LOWER($1)',
    [storeEmail]
  );
  if (result.rows.length === 0) {
    // Try partial match (in case of forwarding address differences)
    const allStores = await pool.query('SELECT * FROM stores ORDER BY store_number');
    const match = allStores.rows.find(s =>
      storeEmail.toLowerCase().includes(s.store_email.toLowerCase()) ||
      s.store_email.toLowerCase().includes(storeEmail.toLowerCase())
    );
    if (match) {
      console.log(`  Matched store ${match.store_number} (${match.store_email}) via partial match`);
      return match;
    }
    console.log(`  No store found for email: ${storeEmail}`);
    console.log('  Available store emails:');
    allStores.rows.slice(0, 5).forEach(s => console.log(`    ${s.store_number}: ${s.store_email}`));
    return null;
  }
  const store = result.rows[0];
  console.log(`  Store ${store.store_number}: ${store.store_name} (profile: ${store.adspower_profile_id})`);
  return store;
}

// ─── STEP 4: Open AdsPower + scrape conversation ───────────────────────────
async function scrapeConversation(store: any, conversationUrl: string, buyerName: string) {
  console.log(`\n[4] Opening AdsPower profile ${store.adspower_profile_id}...`);
  const adspower = new AdsPowerController();

  // Close any existing session to get a fresh CDP port
  console.log(`  Closing any existing session for ${store.adspower_profile_id}...`);
  await adspower.closeProfile(store.adspower_profile_id).catch(() => {});
  await new Promise(r => setTimeout(r, 2500));

  let browserInfo = await adspower.openProfile(store.adspower_profile_id);
  if (!browserInfo) {
    throw new Error(`Could not open AdsPower profile ${store.adspower_profile_id}`);
  }

  console.log(`  Browser WS: ${browserInfo.ws.puppeteer}`);
  // Wait for browser to fully initialize before connecting
  await new Promise(r => setTimeout(r, 3000));
  console.log(`  Connecting Playwright over CDP...`);

  const browser = await chromium.connectOverCDP(browserInfo.ws.puppeteer, { timeout: 60000 });
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  try {
    const storeName = store.store_name || `Store ${store.store_number}`;
    const scraper = new EtsyScraper(page, storeName);

    console.log(`  Navigating to conversation: ${conversationUrl}`);
    console.log('  (Human behavior: random mouse movements, realistic delays...)');

    const conversation = await scraper.scrapeConversation(conversationUrl, buyerName);

    console.log(`\n  ✓ Scraped conversation:`);
    console.log(`    Customer: ${conversation.customerName}`);
    console.log(`    Messages: ${conversation.messages.length}`);
    conversation.messages.forEach((m, i) => {
      const preview = m.messageText.substring(0, 80).replace(/\n/g, ' ');
      console.log(`    [${i + 1}] ${m.senderType.toUpperCase()}: "${preview}${m.messageText.length > 80 ? '...' : ''}"`);
    });

    // Scrape listing previews via browser (automation, not API)
    const listingUrls = extractListingUrls(conversation.messages);
    if (listingUrls.length > 0) {
      console.log(`\n  [4b] Scraping ${listingUrls.length} product listing(s) via browser...`);
      const listingScraper = new ListingScraper(page);
      await listingScraper.scrapeAndSave(pool, listingUrls);
      console.log(`  ✓ Product previews saved to DB`);
    }

    return { conversation, browser, adspower, page };
  } catch (err) {
    await browser.close().catch(() => {});
    await adspower.closeProfile(store.adspower_profile_id).catch(() => {});
    throw err;
  }
}

// ─── STEP 5: Save to DB ─────────────────────────────────────────────────────
async function saveToDb(storeId: number, conversation: any) {
  console.log('\n[5] Saving to DB...');
  const syncEngine = new SyncEngine(pool);
  await syncEngine.syncConversation(storeId, conversation);

  // Read back what was saved
  const convResult = await pool.query(
    `SELECT c.*, COUNT(m.id) as message_count
     FROM conversations c
     LEFT JOIN messages m ON m.conversation_id = c.id
     WHERE c.store_id = $1 AND c.etsy_conversation_url = $2
     GROUP BY c.id`,
    [storeId, conversation.conversationUrl]
  );

  if (convResult.rows.length > 0) {
    const row = convResult.rows[0];
    console.log(`  ✓ Conversation saved: DB id=${row.id}, status=${row.status}`);
    console.log(`    Customer: ${row.customer_name}`);
    console.log(`    Messages in DB: ${row.message_count}`);
    console.log(`    Last message: ${(row.last_message_text || '').substring(0, 60)}`);
    return row;
  }
  return null;
}

// ─── STEP 6: Notify Profitly ────────────────────────────────────────────────
async function notifyProfitly(store: any, dbRow: any, conversation: any) {
  console.log('\n[6] Notifying Profitly API...');
  const notifier = new ProfitlyNotifier();

  const payload = {
    store_id: store.id,
    store_number: store.store_number,
    store_email: store.store_email,
    customer_name: conversation.customerName,
    etsy_conversation_url: conversation.conversationUrl,
    status: dbRow?.status || 'new',
    messages: conversation.messages.map((m: any) => ({
      sender_type: m.senderType,
      sender_name: m.senderName || (m.senderType === 'store' ? store.store_name : conversation.customerName),
      message_text: m.messageText,
      sent_at: m.sentAt,
    })),
    synced_at: new Date().toISOString(),
  };

  await notifier.notifyConversation(payload);
  console.log(`  Payload sent to Profitly (${payload.messages.length} messages)`);
  console.log('  (Profitly is at localhost:8000 — if not running, this is a warning not an error)');
  return payload;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== E2E Test: Gmail → AdsPower → Etsy → DB → Profitly ===\n');

  let browser: any = null;
  let adspower: any = null;
  let profileId: string = '';

  try {
    // Step 1: IMAP
    const rawEmail = await getLatestEtsyEmail();
    if (!rawEmail) {
      console.log('\n⚠ No Etsy email found. Make sure the central Gmail has received Etsy notifications.');
      process.exit(1);
    }

    // Step 2: Parse
    const parsed = await parseEtsyEmail(rawEmail);
    if (!parsed || !parsed.conversationLink) {
      console.log('\n⚠ Could not extract conversation URL from email.');
      console.log('  Raw email snippet (first 500 chars):');
      console.log(rawEmail.toString().substring(0, 500));
      process.exit(1);
    }

    // Step 3: Store
    const store = await resolveStore(parsed.storeEmail);
    if (!store) {
      console.log('\n⚠ Store not found. Check that store emails match the seeds.');
      process.exit(1);
    }

    profileId = store.adspower_profile_id;

    // Step 4: Scrape
    const { conversation, browser: b, adspower: ap } = await scrapeConversation(
      store, parsed.conversationLink, parsed.buyerName
    );
    browser = b;
    adspower = ap;

    // Step 5: DB
    const dbRow = await saveToDb(store.id, conversation);

    // Step 6: Profitly
    await notifyProfitly(store, dbRow, conversation);

    console.log('\n=== ✓ E2E Test PASSED ===');
    console.log(`Store: ${store.store_number} (${store.store_email})`);
    console.log(`Conversation: ${conversation.conversationUrl}`);
    console.log(`Messages saved: ${conversation.messages.length}`);

  } catch (err: any) {
    console.error('\n=== ✗ E2E Test FAILED ===');
    console.error(err?.message || err);
    if (err?.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
  } finally {
    if (browser) {
      console.log('\nCleaning up...');
      await browser.close().catch(() => {});
    }
    if (adspower && profileId) {
      await adspower.closeProfile(profileId).catch(() => {});
    }
    await pool.end();
  }
}

main();
