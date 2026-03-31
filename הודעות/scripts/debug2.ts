/**
 * Debug2: Find actual conversation rows in Etsy messages
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
  console.log('Navigating to messages/all...');
  await human.humanNavigate('https://www.etsy.com/messages/all');
  await randomDelay(4000, 5000);
  console.log('URL:', page.url());

  // Take a screenshot first
  await page.screenshot({ path: 'C:\\etsy\\debug2-before.png', fullPage: false });
  console.log('Screenshot: C:\\etsy\\debug2-before.png');

  // Deep inspection: find everything inside conversations-subapp
  const analysis = await page.evaluate(() => {
    const subapp = document.querySelector('.conversations-subapp');
    if (!subapp) return { error: 'conversations-subapp not found' };

    // Find all LI, TR, DIV elements that look like they could be conversation rows
    // Conversation rows should have: a name, a short message preview, a timestamp
    const allEls = Array.from(subapp.querySelectorAll('*'));

    // Look for elements with specific patterns
    const results: any[] = [];

    // Check UL/OL elements first — conversation list might be a ul
    const lists = subapp.querySelectorAll('ul, ol');
    results.push({
      type: 'lists',
      count: lists.length,
      items: Array.from(lists).slice(0, 5).map(el => ({
        tag: el.tagName,
        classes: el.className?.toString().substring(0, 100),
        childCount: el.children.length,
        firstChildClass: el.children[0]?.className?.toString().substring(0, 80) || '',
        firstChildText: el.children[0]?.textContent?.trim().substring(0, 60) || '',
      }))
    });

    // Look for elements with role="listitem" or role="row"
    const roleEls = subapp.querySelectorAll('[role="listitem"], [role="row"], [role="option"], [tabindex="0"]');
    results.push({
      type: 'role-elements',
      count: roleEls.length,
      items: Array.from(roleEls).slice(0, 10).map(el => ({
        tag: el.tagName,
        role: el.getAttribute('role'),
        tabindex: el.getAttribute('tabindex'),
        classes: el.className?.toString().substring(0, 80),
        text: el.textContent?.trim().substring(0, 60),
      }))
    });

    // Find clickable elements (with click handlers) — try looking for onclick or event-bound elements
    // Check for elements that have cursor:pointer style
    const clickableEls = Array.from(allEls).filter(el => {
      const style = window.getComputedStyle(el);
      return style.cursor === 'pointer' && el.tagName !== 'A' && el.tagName !== 'BUTTON';
    });
    results.push({
      type: 'cursor-pointer-non-anchor',
      count: clickableEls.length,
      items: clickableEls.slice(0, 10).map(el => ({
        tag: el.tagName,
        classes: (el as HTMLElement).className?.toString().substring(0, 80),
        text: el.textContent?.trim().substring(0, 60),
        rect: (() => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) }; })(),
      }))
    });

    // Look for anchor tags inside the subapp
    const anchors = subapp.querySelectorAll('a[href]');
    results.push({
      type: 'anchors',
      count: anchors.length,
      items: Array.from(anchors).slice(0, 10).map(el => ({
        href: (el as HTMLAnchorElement).href.substring(0, 80),
        text: el.textContent?.trim().substring(0, 60),
        classes: el.className?.toString().substring(0, 60),
      }))
    });

    // Dump the inner HTML structure of conversations-subapp (abbreviated)
    const innerHTML = subapp.innerHTML.substring(0, 3000);

    return { results, subappHTML: innerHTML };
  });

  fs.writeFileSync('C:\\etsy\\debug2-analysis.json', JSON.stringify(analysis, null, 2));
  console.log('Analysis saved to C:\\etsy\\debug2-analysis.json');

  if ((analysis as any).error) {
    console.log('ERROR:', (analysis as any).error);
  } else {
    const a = analysis as any;
    for (const r of a.results) {
      console.log(`\n=== ${r.type} (${r.count}) ===`);
      if (r.items) {
        r.items.forEach((item: any, i: number) => {
          console.log(`  [${i}]`, JSON.stringify(item).substring(0, 150));
        });
      }
    }
  }

  // Now try clicking the first conversation using coordinates from cursor-pointer elements
  const cursorPointers = (analysis as any).results?.find((r: any) => r.type === 'cursor-pointer-non-anchor');
  if (cursorPointers && cursorPointers.items && cursorPointers.items.length > 0) {
    // Find first element that's in the main content area (not sidebar — left side ~200px wide)
    const mainAreaItems = cursorPointers.items.filter((item: any) => item.rect && item.rect.left > 200 && item.rect.width > 100);

    if (mainAreaItems.length > 0) {
      const first = mainAreaItems[0];
      const clickX = first.rect.left + first.rect.width / 2;
      const clickY = first.rect.top + first.rect.height / 2;
      console.log(`\nClicking first main-area cursor-pointer at (${clickX}, ${clickY}): "${first.text?.substring(0, 40)}"`);

      await human.randomMouseMovement();
      await page.mouse.move(clickX - 20, clickY - 5);
      await randomDelay(300, 500);
      await page.mouse.move(clickX, clickY);
      await randomDelay(200, 400);
      await page.mouse.click(clickX, clickY);
      await randomDelay(3000, 4000);

      const afterUrl = page.url();
      console.log('URL after click:', afterUrl);
      await page.screenshot({ path: 'C:\\etsy\\debug2-after-click.png' });
      console.log('Screenshot: C:\\etsy\\debug2-after-click.png');

      // Check if message list appeared
      const msgList = await page.evaluate(() => {
        const container = document.querySelector('div.scrolling-message-list');
        if (container) {
          const bubbles = container.querySelectorAll('div.wt-rounded.wt-text-body-01');
          return { found: true, bubbles: bubbles.length, text: container.textContent?.trim().substring(0, 200) };
        }
        // Try other selectors
        const alt1 = document.querySelector('[class*="message-list"]');
        const alt2 = document.querySelector('[class*="convo-messages"]');
        const alt3 = document.querySelector('[class*="thread-messages"]');
        return { found: false, alt1: !!alt1, alt2: !!alt2, alt3: !!alt3 };
      });
      console.log('Message list after click:', JSON.stringify(msgList));
    } else {
      console.log('No main-area cursor-pointer elements found');
    }
  }

  // Also try: look for the conversation list using a different approach
  // Navigate directly to first convo URL by looking for data attributes
  const convUrls = await page.evaluate(() => {
    // Look for any element with href matching messages/convo pattern
    const allLinks = Array.from(document.querySelectorAll('a'));
    return allLinks
      .filter(a => a.href && (a.href.includes('/messages/') || a.href.includes('etsy.com/messages')))
      .map(a => ({ href: a.href, text: a.textContent?.trim().substring(0, 50) }))
      .slice(0, 20);
  });

  console.log('\nMessage-related links found:');
  convUrls.forEach(l => console.log('  ', l.href, '|', l.text?.substring(0, 40)));

  await browser.close().catch(() => {});
  await pool.end();
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
