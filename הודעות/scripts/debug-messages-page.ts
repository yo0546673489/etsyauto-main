/**
 * Debug: click first conversation and see URL + structure
 */
import { chromium } from 'playwright';
import { Pool } from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

import { AdsPowerController } from '../src/adspower/controller';
import { HumanBehavior } from '../src/browser/humanBehavior';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adspower = new AdsPowerController();

function randomDelay(min: number, max: number) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
}

async function main() {
  const storeRes = await pool.query('SELECT * FROM stores WHERE store_number = 1');
  const store = storeRes.rows[0];

  const browserInfo = await adspower.getActiveProfile(store.adspower_profile_id);
  if (!browserInfo) { console.error('Profile not active — please open AdsPower first'); process.exit(1); }

  const browser = await chromium.connectOverCDP(browserInfo.ws.puppeteer, { timeout: 60000 });
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  const human = new HumanBehavior(page);

  // Navigate to ALL messages
  await human.humanNavigate('https://www.etsy.com/messages/all');
  await randomDelay(3000, 4000);
  console.log('URL after navigate:', page.url());

  // Find ALL clickable elements in the conversation list area
  // Looking for rows/items that contain sender names
  const clickables = await page.evaluate(() => {
    // The conversation rows are likely <tr> elements or list items with specific data
    // Try to find elements by visual position — items in the main content area
    const candidates = [
      ...Array.from(document.querySelectorAll('tr[class*="convo"], tr[data-id]')),
      ...Array.from(document.querySelectorAll('[class*="convo-thread"], [class*="thread-row"]')),
      ...Array.from(document.querySelectorAll('[class*="message-row"], [class*="msg-row"]')),
      ...Array.from(document.querySelectorAll('ul.convo-list li, ol.convo-list li')),
      // Look for rows in tables
      ...Array.from(document.querySelectorAll('tbody tr')),
    ];

    // Filter: only elements that have text (sender names) and are not navigation
    const filtered = candidates.filter(el => {
      const text = el.textContent?.trim() || '';
      const cls = (el as HTMLElement).className?.toString() || '';
      return text.length > 5 && !cls.includes('sidebar') && !cls.includes('inbox-v2-tag');
    });

    return filtered.map((el, i) => ({
      index: i,
      tag: el.tagName,
      classes: (el as HTMLElement).className?.toString().substring(0, 100) || '',
      text: el.textContent?.trim().substring(0, 80) || '',
      hasHref: (el as HTMLAnchorElement).href || '',
      dataAttrs: Array.from(el.attributes)
        .filter(a => a.name.startsWith('data-'))
        .map(a => `${a.name}="${a.value.substring(0,20)}"`)
        .join(', '),
    }));
  });

  console.log(`\nFound ${clickables.length} candidates:`);
  clickables.forEach(c => {
    console.log(`  [${c.index}] <${c.tag}> "${c.text.substring(0, 60)}"`);
    console.log(`         class: ${c.classes.substring(0, 60)}`);
    if (c.dataAttrs) console.log(`         data: ${c.dataAttrs}`);
  });

  // Try clicking the FIRST conversation row using coordinates
  // From the screenshot, the first conversation row is around y=75 in the content area
  console.log('\nTrying to click first conversation by coordinates...');
  const beforeUrl = page.url();

  // Click at ~y=75 (first conversation row) and x=350 (middle of content)
  await page.mouse.click(350, 75);
  await randomDelay(2000, 3000);
  const afterUrl = page.url();
  console.log('URL before click:', beforeUrl);
  console.log('URL after click:', afterUrl);

  await page.screenshot({ path: 'C:\\etsy\\debug-after-click.png' });
  console.log('Screenshot after click: C:\\etsy\\debug-after-click.png');

  // Check what changed
  if (afterUrl !== beforeUrl) {
    console.log('\n✓ URL changed! Pattern:', afterUrl);
  } else {
    console.log('\nURL did not change — checking page content for new elements...');
    const msgContainer = await page.evaluate(() => {
      const container = document.querySelector('div.scrolling-message-list');
      return container ? 'FOUND: ' + container.textContent?.substring(0, 100) : 'not found';
    });
    console.log('Message container:', msgContainer);
  }

  await browser.close().catch(() => {});
  await pool.end();
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
