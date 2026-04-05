/**
 * Diagnostic tool — opens each scraping target, takes screenshots,
 * and reports what CSS selectors were found.
 *
 * Usage: ts-node src/utils/diagnose.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SITES = [
  {
    name: 'eRank Login',
    url: 'https://erank.com/login',
    selectors: ['input[type="email"]', 'input[type="password"]', 'button[type="submit"]', 'form']
  },
  {
    name: 'Koalanda Login',
    url: 'https://koalanda.pro/login',
    selectors: ['input[type="email"]', 'input[type="password"]', 'button[type="submit"]', 'form']
  },
  {
    name: 'Alura Login',
    url: 'https://www.alura.io/login',
    selectors: ['input[type="email"]', 'input[type="password"]', 'button[type="submit"]', 'form']
  },
  {
    name: 'EHunt Login',
    url: 'https://ehunt.ai/login',
    selectors: ['input[type="email"]', 'input[type="password"]', 'button[type="submit"]', 'form']
  },
  {
    name: 'eRank Top Shops',
    url: 'https://erank.com/top-shops',
    selectors: ['table', '.shop', '.shops', 'tr', '.top-shops']
  },
  {
    name: 'Koalanda Top Shops',
    url: 'https://koalanda.pro/top-etsy-shops',
    selectors: ['table', '.shop', '.shops', 'tr']
  }
];

const logsDir = path.join(process.cwd(), 'logs', 'diagnose');

async function diagnose() {
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  console.log('\n=== Research Engine Diagnostics ===\n');

  // Check .env credentials
  console.log('--- Credentials Check ---');
  const creds = [
    ['ETSY_API_KEY', process.env.ETSY_API_KEY],
    ['ANTHROPIC_API_KEY', process.env.ANTHROPIC_API_KEY],
    ['APIFY_API_TOKEN', process.env.APIFY_API_TOKEN],
    ['ERANK_EMAIL', process.env.ERANK_EMAIL],
    ['KOALANDA_EMAIL', process.env.KOALANDA_EMAIL],
    ['ALURA_EMAIL', process.env.ALURA_EMAIL],
    ['EHUNT_EMAIL', process.env.EHUNT_EMAIL],
    ['EVERBEE_EMAIL', process.env.EVERBEE_EMAIL],
  ];
  for (const [key, val] of creds) {
    const status = val && !val.includes('xxx') && val.trim() !== '' ? '✅' : '❌ MISSING';
    console.log(`  ${key}: ${status}`);
  }

  // Test Etsy API
  console.log('\n--- Etsy API Test ---');
  const axios = require('axios');
  try {
    const res = await axios.get('https://openapi.etsy.com/v3/application/listings/active', {
      headers: { 'x-api-key': process.env.ETSY_API_KEY },
      params: { limit: 1, keywords: 'art' },
      timeout: 8000
    });
    console.log(`  ✅ Etsy API works! Got ${res.data.results?.length} listings`);
  } catch (err: any) {
    const status = err.response?.status || 'network error';
    console.log(`  ❌ Etsy API failed: HTTP ${status}`);
    if (status === 403) {
      console.log('     → API key is invalid or not approved. Get a new key at:');
      console.log('       https://www.etsy.com/developers/register');
    }
  }

  // Browser screenshots
  console.log('\n--- Browser Screenshots ---');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  for (const site of SITES) {
    const page = await browser.newPage();
    try {
      await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);

      // Take screenshot
      const filename = site.name.toLowerCase().replace(/\s+/g, '-') + '.png';
      const filepath = path.join(logsDir, filename);
      await page.screenshot({ path: filepath, fullPage: false });

      // Check selectors
      const found: string[] = [];
      const missing: string[] = [];
      for (const sel of site.selectors) {
        const el = await page.$(sel);
        if (el) found.push(sel);
        else missing.push(sel);
      }

      // Get actual input/button selectors on the page
      const inputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input, button, form'))
          .map(el => {
            const tag = el.tagName.toLowerCase();
            const type = el.getAttribute('type') || '';
            const name = el.getAttribute('name') || '';
            const id = el.getAttribute('id') || '';
            const cls = Array.from(el.classList).slice(0, 3).join('.');
            return `${tag}${type ? '[type="'+type+'"]' : ''}${id ? '#'+id : ''}${cls ? '.'+cls : ''}`;
          }).slice(0, 10);
      });

      console.log(`\n  ${site.name} (${site.url})`);
      console.log(`  Screenshot: logs/diagnose/${filename}`);
      console.log(`  Found selectors: ${found.join(', ') || 'none'}`);
      console.log(`  Missing: ${missing.join(', ') || 'none'}`);
      console.log(`  Page elements: ${inputs.join(', ')}`);
    } catch (err: any) {
      console.log(`  ❌ ${site.name}: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log('\n=== Done. Screenshots saved to logs/diagnose/ ===\n');
  process.exit(0);
}

diagnose().catch(err => {
  console.error('Diagnose failed:', err.message);
  process.exit(1);
});
