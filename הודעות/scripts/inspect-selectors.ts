// כלי עזר לזיהוי סלקטורים של Etsy
// הרצה: npx tsx scripts/inspect-selectors.ts [serial_number]

import { chromium } from 'playwright';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const ADSPOWER_URL = process.env.ADSPOWER_API_URL || 'http://local.adspower.net:50325';
const userId = process.argv[2] || 'k16kmi55';

async function inspect() {
  console.log(`Opening AdsPower profile ${userId}...`);

  const response = await axios.get(`${ADSPOWER_URL}/api/v1/browser/start`, {
    params: { user_id: userId }
  });

  if (response.data.code !== 0) {
    console.error('Failed to open profile:', response.data.msg);
    return;
  }

  const wsUrl = response.data.data.ws.puppeteer;
  console.log('Connecting to browser...');

  const browser = await chromium.connectOverCDP(wsUrl);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  console.log('Navigating to Etsy messages...');
  await page.goto('https://www.etsy.com/messages', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Dump all links that might be conversations
  console.log('\n=== CONVERSATION LINKS ON PAGE ===\n');
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]'))
      .map(a => ({ href: (a as HTMLAnchorElement).href, text: a.textContent?.trim().substring(0, 60) }))
      .filter(l => l.href.includes('message') || l.href.includes('convo'));
  });
  console.log(JSON.stringify(links.slice(0, 10), null, 2));

  // Get raw HTML around first conversation-like element
  console.log('\n=== FIRST CONVERSATION ROW HTML ===\n');
  const rowHtml = await page.evaluate(() => {
    // Try various selectors
    const selectors = ['li[data-appears-component-tracking-id]', 'li.wt-list-unstyled', '[data-conversation-id]', '.wt-grid__item-xs-12'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return `Selector: ${sel}\n` + el.outerHTML.substring(0, 1000);
    }
    // Fallback: first <li> inside main content
    const li = document.querySelector('main li, [role="main"] li');
    if (li) return 'main li:\n' + li.outerHTML.substring(0, 1000);
    return 'No conversation elements found.\n\nPage title: ' + document.title + '\n\nBody start:\n' + document.body.innerHTML.substring(0, 2000);
  });
  console.log(rowHtml);

  console.log('\n=== Clicking first conversation link ===\n');
  const firstConvoLink = await page.$('a[href*="/messages/"], a[href*="conversations"]');
  if (firstConvoLink) {
    const href = await firstConvoLink.getAttribute('href');
    console.log('Clicking:', href);
    await firstConvoLink.click();
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);

    console.log('\n=== CONVERSATION PAGE URL ===');
    console.log(page.url());

    console.log('\n=== MESSAGE ELEMENTS ===\n');
    const msgData = await page.evaluate(() => {
      const results: string[] = [];
      // Dump all elements with text and their selectors
      const allEls = document.querySelectorAll('[class*="message"], [class*="Message"], [data-message-id], [data-message], .wt-text-body-01');
      allEls.forEach(el => {
        const text = el.textContent?.trim().substring(0, 100);
        if (text && text.length > 5) {
          results.push(`<${el.tagName.toLowerCase()} class="${el.className}" data-message-id="${el.getAttribute('data-message-id') || ''}">\n  ${text}`);
        }
      });
      return results.slice(0, 20).join('\n---\n');
    });
    console.log(msgData || 'No message elements found');

    console.log('\n=== TEXTAREA + BUTTONS ===\n');
    const inputData = await page.evaluate(() => {
      const results: object[] = [];
      document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]').forEach(el => {
        results.push({ tag: el.tagName, id: el.id, name: (el as HTMLInputElement).name, class: el.className.substring(0, 100), placeholder: el.getAttribute('placeholder') || '' });
      });
      document.querySelectorAll('button[type="submit"], button[class*="send"], button[class*="Send"], button[aria-label*="send" i], button[aria-label*="Send"]').forEach(el => {
        results.push({ tag: 'BUTTON', type: (el as HTMLButtonElement).type, text: el.textContent?.trim(), class: el.className.substring(0, 100), 'aria-label': el.getAttribute('aria-label') || '' });
      });
      return results;
    });
    console.log(JSON.stringify(inputData, null, 2));
  } else {
    console.log('No conversation link found - dumping full page structure');
    const pageHtml = await page.evaluate(() => document.body.innerHTML.substring(0, 3000));
    console.log(pageHtml);
  }

  console.log('\n=== DONE ===');
  console.log('Use the HTML above to identify the correct CSS selectors.');
  console.log('Update: src/browser/etsyScraper.ts and src/browser/etsySender.ts');

  await browser.close();
  await axios.get(`${ADSPOWER_URL}/api/v1/browser/stop`, { params: { user_id: userId } });
}

inspect().catch(console.error);
