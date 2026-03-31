/**
 * Scrape ALL conversations from a specific store
 * Usage: npx tsx scripts/scrape-store.ts [storeNumber]
 */
import { chromium } from 'playwright';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

import { AdsPowerController } from '../src/adspower/controller';
import { EtsyScraper } from '../src/browser/etsyScraper';
import { ListingScraper, extractListingUrls } from '../src/browser/listingScraper';
import { SyncEngine } from '../src/sync/engine';
import { HumanBehavior } from '../src/browser/humanBehavior';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adspower = new AdsPowerController();

function randomDelay(min: number, max: number) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
}

async function main() {
  const storeNumber = parseInt(process.argv[2] || '1');
  console.log(`\n=== Scraping ALL conversations from Store ${storeNumber} ===\n`);

  // 1. Get store from DB
  const storeRes = await pool.query('SELECT * FROM stores WHERE store_number = $1', [storeNumber]);
  if (storeRes.rows.length === 0) { console.error(`Store ${storeNumber} not found`); process.exit(1); }
  const store = storeRes.rows[0];
  console.log(`Store: ${store.store_name} (${store.store_email})`);
  console.log(`Profile: ${store.adspower_profile_id}`);

  // 2. Use active profile or open fresh
  console.log('\n[1] Connecting to AdsPower profile...');
  let browserInfo = await adspower.getActiveProfile(store.adspower_profile_id);
  if (!browserInfo) {
    await adspower.closeProfile(store.adspower_profile_id).catch(() => {});
    await randomDelay(2500, 3000);
    browserInfo = await adspower.openProfile(store.adspower_profile_id);
    await randomDelay(3000, 4000);
  }
  if (!browserInfo) { console.error('Could not open profile'); await pool.end(); process.exit(1); }

  const cdpUrl = browserInfo.ws.puppeteer;
  console.log(`  CDP: ${cdpUrl}`);

  const browser = await chromium.connectOverCDP(cdpUrl!, { timeout: 60000 });
  const context = browser.contexts()[0] || await browser.newContext();
  const pages = context.pages();

  // 3. Use first page (Etsy messages is tab 0 based on debug)
  const page = pages[0] || await context.newPage();
  const human = new HumanBehavior(page);
  const storeName = store.store_name || `Store ${storeNumber}`;
  const scraper = new EtsyScraper(page, storeName);
  const syncEngine = new SyncEngine(pool);

  try {
    // Navigate to ALL messages (not just unread)
    console.log('\n[2] Navigating to All messages...');
    await human.humanNavigate('https://www.etsy.com/messages/all');
    await randomDelay(2500, 4000);
    await human.randomMouseMovement();
    console.log(`  URL: ${page.url()}`);

    // 4. Find conversation list items (LI elements in inbox list)
    console.log('\n[3] Finding conversation list items...');
    await randomDelay(1000, 2000);

    // Get all conversation LI items and their data
    const convItems = await page.evaluate(() => {
      // Try various selectors for conversation items
      const byInbox = document.querySelectorAll('[class*="inbox"] li, li[class*="inbox"]');
      const byConv = document.querySelectorAll('[class*="conversation-item"], [class*="ConversationItem"]');
      const byThread = document.querySelectorAll('[class*="thread-item"], [data-thread-id]');

      const allItems = Array.from(new Set([...byInbox, ...byConv, ...byThread]));

      return allItems.map((el, i) => ({
        index: i,
        tagName: el.tagName,
        classes: el.className?.toString().substring(0, 100) || '',
        text: el.textContent?.trim().substring(0, 80) || '',
        dataAttrs: Array.from(el.attributes)
          .filter(a => a.name.startsWith('data-'))
          .map(a => `${a.name}=${a.value}`)
          .join(', '),
        hasLink: el.querySelector('a') ? el.querySelector('a')?.href || 'yes' : 'no',
      }));
    });

    console.log(`  Found ${convItems.length} items:`);
    convItems.forEach(item => {
      console.log(`    [${item.index}] ${item.tagName}.${item.classes.substring(0, 40)} | "${item.text.substring(0, 50)}" | link=${item.hasLink}`);
      if (item.dataAttrs) console.log(`         data: ${item.dataAttrs}`);
    });

    if (convItems.length === 0) {
      // Take screenshot for debug
      await page.screenshot({ path: 'C:\\etsy\\debug-all.png' });
      console.log('\n  No conversations found. Screenshot: C:\\etsy\\debug-all.png');
      console.log('  Page URL:', page.url());
      await browser.close().catch(() => {});
      await pool.end();
      return;
    }

    // 5. Click each conversation and scrape
    console.log(`\n[4] Scraping ${convItems.length} conversations...`);
    let saved = 0; let failed = 0;

    for (let i = 0; i < convItems.length; i++) {
      console.log(`\n  [${i+1}/${convItems.length}] Clicking conversation...`);

      try {
        await randomDelay(800, 1500);

        // Click the conversation item
        await page.evaluate((idx: number) => {
          const byInbox = document.querySelectorAll('[class*="inbox"] li, li[class*="inbox"]');
          const byConv = document.querySelectorAll('[class*="conversation-item"], [class*="ConversationItem"]');
          const byThread = document.querySelectorAll('[class*="thread-item"], [data-thread-id]');
          const allItems = Array.from(new Set([...byInbox, ...byConv, ...byThread]));
          const el = allItems[idx] as HTMLElement;
          if (el) el.click();
        }, i);

        // Wait for messages to load
        await randomDelay(2000, 3500);
        await human.randomMouseMovement();

        // Get current URL after clicking
        const convUrl = page.url();
        console.log(`    URL: ${convUrl}`);

        // Scrape the loaded conversation
        const scraped = await page.evaluate((sn: string) => {
          const container = document.querySelector('div.scrolling-message-list');
          if (!container) return { messages: [], customerName: '' };

          // Get customer name from header
          const nameEls = document.querySelectorAll('[class*="buyer-name"], [class*="customer-name"], [class*="sender-name"]');
          let customerName = '';
          nameEls.forEach(el => {
            if (!customerName) customerName = el.textContent?.trim() || '';
          });
          if (!customerName) {
            const h = container.closest('[class*="thread"], [class*="conversation"]')
              ?.querySelector('h2, h3, [class*="name"]');
            customerName = h?.textContent?.trim() || '';
          }

          const bubbles = container.querySelectorAll('div.wt-rounded.wt-text-body-01');
          const messages: { senderType: string; senderName: string; messageText: string; sentAt: string }[] = [];

          bubbles.forEach(el => {
            const text = el.textContent?.trim() || '';
            if (text.length < 1) return;
            const clean = text.replace(/^Message:\s*/i, '').trim();
            if (!clean) return;
            const isStore = el.classList.contains('wt-sem-bg-surface-informational-subtle');
            messages.push({
              senderType: isStore ? 'store' : 'customer',
              senderName: isStore ? sn : '',
              messageText: clean,
              sentAt: new Date().toISOString(),
            });
          });

          const deduped = messages.filter((m, idx) =>
            idx === 0 || m.messageText !== messages[idx - 1].messageText
          );

          return { messages: deduped, customerName };
        }, storeName);

        if (scraped.messages.length === 0) {
          console.log('    ⚠ No messages visible — skipping');
          failed++;
          continue;
        }

        // Get customer name
        const customerName = scraped.customerName ||
          scraped.messages.find(m => m.senderType === 'customer')?.senderName ||
          `Customer ${i+1}`;

        console.log(`    Customer: ${customerName} | Messages: ${scraped.messages.length}`);
        scraped.messages.slice(0, 2).forEach(m =>
          console.log(`      [${m.senderType}] "${m.messageText.substring(0, 60)}"`)
        );

        // Save to DB
        const storeData = {
          id: store.id, storeNumber: store.store_number,
          storeName: store.store_name, storeEmail: store.store_email,
          adspowerProfileId: store.adspower_profile_id
        };
        const dbResult = await syncEngine.syncConversation(storeData, {
          conversationUrl: convUrl,
          customerName,
          messages: scraped.messages as any,
        });
        console.log(`    ✓ DB id=${dbResult.conversationId}, ${dbResult.newMessages} new messages`);
        saved++;

        // Scrape listing previews
        const listingUrls = extractListingUrls(scraped.messages as any);
        if (listingUrls.length > 0) {
          const listingScraper = new ListingScraper(page);
          await listingScraper.scrapeAndSave(pool, listingUrls);
        }

        await human.readingDelay(300);

      } catch (err) {
        console.error(`    ✗ ${err instanceof Error ? err.message : err}`);
        failed++;
      }
    }

    console.log(`\n=== Done: ${saved} saved, ${failed} failed ===`);

  } finally {
    await browser.close().catch(() => {});
    await pool.end();
    console.log('Done.');
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
