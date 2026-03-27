// כלי עזר לזיהוי סלקטורים של Etsy
// הרצה: npx tsx scripts/inspect-selectors.ts [serial_number]

import { chromium } from 'playwright';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const ADSPOWER_URL = process.env.ADSPOWER_API_URL || 'http://local.adspower.net:50325';
const serialNumber = process.argv[2] || '1';

async function inspect() {
  console.log(`Opening AdsPower profile ${serialNumber}...`);

  const response = await axios.get(`${ADSPOWER_URL}/api/v1/browser/start`, {
    params: { serial_number: serialNumber }
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
  await page.goto('https://www.etsy.com/your/messages', { waitUntil: 'networkidle' });

  console.log('\n=== CONVERSATION LIST HTML STRUCTURE ===\n');
  const listHtml = await page.evaluate(() => {
    const container = document.querySelector('[role="main"], main, #content, .messages-page');
    if (!container) return 'Could not find main container';
    return Array.from(container.children).slice(0, 5).map(child => {
      const html = child.outerHTML;
      return html.length > 500 ? html.substring(0, 500) + '...' : html;
    }).join('\n---\n');
  });
  console.log(listHtml);

  console.log('\n=== Trying to click first conversation ===\n');
  const firstLink = await page.$('a[href*="messages"], a[href*="conversations"]');
  if (firstLink) {
    await firstLink.click();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    console.log('\n=== CONVERSATION MESSAGES HTML STRUCTURE ===\n');
    const msgHtml = await page.evaluate(() => {
      const container = document.querySelector('[role="main"], main, #content');
      if (!container) return 'Could not find main container';
      return Array.from(container.children).slice(0, 10).map(child => {
        const html = child.outerHTML;
        return html.length > 500 ? html.substring(0, 500) + '...' : html;
      }).join('\n---\n');
    });
    console.log(msgHtml);

    const textarea = await page.$('textarea');
    if (textarea) {
      const attrs = await page.evaluate(el => {
        return { tag: el.tagName, name: el.getAttribute('name'), id: el.id, class: el.className, placeholder: el.getAttribute('placeholder') };
      }, textarea);
      console.log('\n=== TEXTAREA FOUND ===', attrs);
    }
  }

  console.log('\n=== DONE ===');
  console.log('Use the HTML above to identify the correct CSS selectors.');
  console.log('Update: src/browser/etsyScraper.ts and src/browser/etsySender.ts');

  await browser.close();
  await axios.get(`${ADSPOWER_URL}/api/v1/browser/stop`, { params: { serial_number: serialNumber } });
}

inspect().catch(console.error);
