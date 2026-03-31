/**
 * Debug3: Connect with longer timeout, find conversations
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
  console.log('Store:', store.store_name);

  // Get fresh CDP URL
  const browserInfo = await adspower.getActiveProfile(store.adspower_profile_id);
  if (!browserInfo) {
    console.error('Profile not active');
    process.exit(1);
  }

  const cdpUrl = browserInfo.ws.puppeteer;
  console.log('CDP URL:', cdpUrl);

  // Connect with longer timeout
  console.log('Connecting to CDP...');
  const browser = await chromium.connectOverCDP(cdpUrl, { timeout: 120000 });
  console.log('Connected!');

  const context = browser.contexts()[0];
  const pages = context.pages();
  console.log(`Tabs: ${pages.length}`);
  pages.forEach((p, i) => console.log(`  [${i}] ${p.url()}`));

  // Find Etsy messages page
  let page = pages.find(p => p.url().includes('etsy.com/messages')) || pages[0];
  console.log('Using page:', page.url());

  // Bring to front
  await page.bringToFront();
  const human = new HumanBehavior(page);

  // If not on messages page, navigate
  if (!page.url().includes('etsy.com/messages')) {
    console.log('Navigating to messages...');
    await human.humanNavigate('https://www.etsy.com/messages/all');
    await randomDelay(4000, 5000);
  } else {
    console.log('Already on messages page');
    await randomDelay(1000, 2000);
  }

  console.log('Current URL:', page.url());
  await page.screenshot({ path: 'C:\\etsy\\debug3-initial.png' });
  console.log('Screenshot: C:\\etsy\\debug3-initial.png');

  // Find all elements that could be conversation rows
  const analysis = await page.evaluate(() => {
    // The conversations-subapp contains the inbox
    const subapp = document.querySelector('.conversations-subapp');
    const appEl = subapp || document.body;

    // Strategy: find all clickable LI/DIV elements that look like conversation rows
    // They should have: time, name, preview text
    // Filter by: in the main content area, has reasonable height, has cursor:pointer

    const allClickable = Array.from(appEl.querySelectorAll('li, [role="listitem"]')).filter(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const text = el.textContent?.trim() || '';
      // Must be visible, in main content area, have reasonable size
      return rect.height > 20 && rect.height < 200 && rect.width > 100 && rect.top > 50 &&
             text.length > 5 && !text.startsWith('Inbox') && !text.startsWith('Starred') &&
             !text.startsWith('All') && !text.startsWith('Unread') && !text.startsWith('Sent');
    });

    const convCandidates = allClickable.map((el, i) => {
      const rect = el.getBoundingClientRect();
      return {
        index: i,
        tag: el.tagName,
        classes: el.className?.toString().substring(0, 80),
        text: el.textContent?.trim().substring(0, 80),
        rect: { top: Math.round(rect.top), left: Math.round(rect.left), w: Math.round(rect.width), h: Math.round(rect.height) },
        cursor: window.getComputedStyle(el).cursor,
      };
    });

    // Also check all elements with specific patterns (date+name+preview)
    // Look at elements in range y=100..600, x=200..900 that have cursor:pointer
    const allEls = Array.from(appEl.querySelectorAll('div, li, tr, td, article, section'));
    const cursorPointers = allEls
      .filter(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return style.cursor === 'pointer' && rect.top > 80 && rect.top < 700 &&
               rect.left > 180 && rect.width > 100 && rect.height > 30 && rect.height < 120;
      })
      .map((el, i) => {
        const rect = el.getBoundingClientRect();
        return {
          index: i,
          tag: el.tagName,
          classes: el.className?.toString().substring(0, 80),
          text: el.textContent?.trim().substring(0, 80),
          rect: { top: Math.round(rect.top), left: Math.round(rect.left), w: Math.round(rect.width), h: Math.round(rect.height) },
        };
      });

    return { convCandidates, cursorPointers: cursorPointers.slice(0, 20) };
  });

  fs.writeFileSync('C:\\etsy\\debug3-analysis.json', JSON.stringify(analysis, null, 2));
  console.log('Analysis saved to C:\\etsy\\debug3-analysis.json');

  console.log(`\nConversation candidates (li/listitem): ${(analysis as any).convCandidates.length}`);
  (analysis as any).convCandidates.slice(0, 10).forEach((c: any) => {
    console.log(`  [${c.index}] ${c.tag} "${c.text?.substring(0, 50)}" rect=${JSON.stringify(c.rect)}`);
  });

  console.log(`\nCursor-pointer divs: ${(analysis as any).cursorPointers.length}`);
  (analysis as any).cursorPointers.slice(0, 10).forEach((c: any) => {
    console.log(`  [${c.index}] ${c.tag} "${c.text?.substring(0, 50)}" rect=${JSON.stringify(c.rect)}`);
  });

  // Try clicking the first cursor-pointer element in main area
  const candidates = (analysis as any).cursorPointers as any[];
  if (candidates.length > 0) {
    const first = candidates[0];
    const x = first.rect.left + first.rect.w / 2;
    const y = first.rect.top + first.rect.h / 2;
    console.log(`\nClicking at (${Math.round(x)}, ${Math.round(y)})...`);

    await human.randomMouseMovement();
    await page.mouse.move(x - 15, y - 5, { steps: 5 });
    await randomDelay(300, 500);
    await page.mouse.move(x, y, { steps: 3 });
    await randomDelay(150, 300);
    await page.mouse.click(x, y);
    await randomDelay(3000, 4000);

    console.log('URL after click:', page.url());
    await page.screenshot({ path: 'C:\\etsy\\debug3-after-click.png' });
    console.log('Screenshot: C:\\etsy\\debug3-after-click.png');

    // Check if messages loaded
    const msgInfo = await page.evaluate(() => {
      const container = document.querySelector('div.scrolling-message-list');
      const bubbles = container?.querySelectorAll('div.wt-rounded') || [];
      const headerName = document.querySelector('[class*="buyer-name"], [class*="customer-name"], h2, h3')?.textContent?.trim();
      return { hasContainer: !!container, bubbleCount: bubbles.length, headerName };
    });
    console.log('Message info:', JSON.stringify(msgInfo));
  } else {
    console.log('No cursor-pointer candidates found!');
    // Try clicking by URL navigation
    const convLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="messages"]'))
        .map(a => ({ href: (a as HTMLAnchorElement).href, text: a.textContent?.trim().substring(0, 40) }))
        .filter(l => l.href.includes('convo') || l.href.match(/messages\/\d+/));
    });
    console.log('Conversation links:', JSON.stringify(convLinks.slice(0, 5)));
  }

  await browser.close().catch(() => {});
  await pool.end();
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
