import { Page } from 'playwright';
import { BaseScraper, KeywordData, ShopData, ProductData } from './base-scraper';
import { humanType, naturalClick, waitAndPause, randomDelay, gradualScroll, maybeRandomBreak } from '../utils/human-behavior';
import { saveRawKeyword } from '../storage/models';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('erank');

// ⚠️  PLACEHOLDER SELECTORS — update after inspecting the real eRank UI
const SELECTORS = {
  loginEmail: 'input[type="email"]',
  loginPassword: 'input[type="password"]',
  // eRank uses button[type="button"] not submit — find the login button by text
  loginButton: 'button[type="button"]:not(.p-disabled)',

  // Keyword Explorer
  keywordInput: 'input[type="search"], input[placeholder*="keyword" i], input[placeholder*="search" i]',
  keywordSearchBtn: 'button[type="button"]:not(.p-disabled), button[type="submit"]',
  resultsTable: 'table, .results-container, [class*="result"], [class*="keyword"]',
  searchVolume: '[class*="searches"], [class*="volume"], td:nth-child(2)',
  competition: '[class*="competition"], [class*="compete"], td:nth-child(3)',
  clickRate: '[class*="click"], [class*="ctr"], td:nth-child(4)',
  avgPrice: '[class*="price"], td:nth-child(5)',

  // Top Shops — requires login, then navigate
  topShopsNav: 'a[href*="top-shops"]',
  shopRow: 'table tr:not(:first-child), [class*="shop-row"], [class*="shop-item"]',
  shopName: 'td:first-child a, [class*="shop-name"]',
  shopSales: 'td:nth-child(3), [class*="sales"]',
  shopRating: 'td:nth-child(4), [class*="rating"]',

  // Trend Buzz
  trendBuzzNav: 'a[href*="trend-buzz"]'
};

export class ERankScraper extends BaseScraper {
  name = 'eRank';
  profileId = process.env.ERANK_PROFILE_ID || 'R1';
  dailyLimit = 45;

  private loggedIn = false;

  async login(): Promise<void> {
    if (!this.page) throw new Error('Not connected');
    if (this.loggedIn) return;

    const email = process.env.ERANK_EMAIL;
    const pass = process.env.ERANK_PASSWORD;
    if (!email || !pass) {
      throw new Error('eRank credentials missing — set ERANK_EMAIL and ERANK_PASSWORD in .env');
    }

    log.info('Logging in to eRank...');
    await this.page.goto('https://erank.com/login', { waitUntil: 'domcontentloaded' });
    await waitAndPause(this.page, 1500);

    await humanType(this.page, SELECTORS.loginEmail, process.env.ERANK_EMAIL || '');
    await randomDelay(300, 700);
    await humanType(this.page, SELECTORS.loginPassword, process.env.ERANK_PASSWORD || '');
    await randomDelay(500, 1200);
    // eRank login button is a PrimeVue button, click by text
    await this.page.getByRole('button', { name: /sign in|log in|login/i }).click().catch(async () => {
      await naturalClick(this.page!, SELECTORS.loginButton);
    });
    await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await waitAndPause(this.page, 2000);

    this.loggedIn = true;
    log.info('eRank login successful');
  }

  async searchKeyword(keyword: string): Promise<KeywordData> {
    if (!this.page) throw new Error('Not connected');
    if (!(await this.checkDailyLimit())) {
      return { keyword, raw: null };
    }

    await this.login();
    const start = Date.now();

    try {
      const result = await this.withRetry(async () => {
        await this.page!.goto('https://erank.com/keyword-explorer', { waitUntil: 'domcontentloaded' });
        await waitAndPause(this.page!, 1500);

        // Clear and type keyword
        await this.page!.fill(SELECTORS.keywordInput, '');
        await humanType(this.page!, SELECTORS.keywordInput, keyword);
        await randomDelay(500, 1000);
        await naturalClick(this.page!, SELECTORS.keywordSearchBtn);

        await this.page!.waitForSelector(SELECTORS.resultsTable, { timeout: 15000 });
        await waitAndPause(this.page!, 1000);
        await gradualScroll(this.page!);

        const data = await this.page!.evaluate((s) => {
          const getNum = (sel: string) => {
            const el = document.querySelector(sel);
            if (!el) return undefined;
            const text = el.textContent?.replace(/[^0-9.]/g, '') || '';
            return text ? parseFloat(text) : undefined;
          };
          const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim();

          return {
            searches: getNum(s.searchVolume),
            competition: getText(s.competition),
            click_rate: getNum(s.clickRate),
            avg_price: getNum(s.avgPrice)
          };
        }, SELECTORS);

        return data;
      }, 2, `keyword:${keyword}`);

      await saveRawKeyword(keyword, 'erank', result);
      await this.recordSuccess('keyword_search', 1, Date.now() - start);
      await maybeRandomBreak();

      return {
        keyword,
        searches: result.searches,
        competition: result.competition,
        click_rate: result.click_rate,
        avg_price: result.avg_price,
        raw: result
      };
    } catch (err: any) {
      await this.saveScreenshotOnError('keyword');
      await this.recordFailure('keyword_search', err.message, Date.now() - start);
      log.error(`eRank keyword search failed: ${err.message}`);
      return { keyword, raw: null };
    }
  }

  async getTopShops(category?: string): Promise<ShopData[]> {
    if (!this.page) throw new Error('Not connected');
    await this.login();

    const start = Date.now();

    try {
      await this.page.goto('https://erank.com/top-shops', { waitUntil: 'domcontentloaded' });
      await waitAndPause(this.page, 2000);
      await gradualScroll(this.page, 1200);

      const shops = await this.page.evaluate((s) => {
        const rows = document.querySelectorAll(s.shopRow);
        const results: any[] = [];

        rows.forEach((row) => {
          const nameEl = row.querySelector(s.shopName);
          if (!nameEl) return;

          const salesText = row.querySelector(s.shopSales)?.textContent?.replace(/[^0-9]/g, '') || '0';
          const ratingText = row.querySelector(s.shopRating)?.textContent?.replace(/[^0-9.]/g, '') || '0';

          // Extract shop ID from URL if present
          const href = nameEl.getAttribute('href') || '';
          const shopIdMatch = href.match(/shop\/([^/?]+)/);

          results.push({
            shop_name: nameEl.textContent?.trim() || '',
            etsy_shop_id: shopIdMatch?.[1] || nameEl.textContent?.trim()?.replace(/\s+/g, '') || '',
            total_sales: parseInt(salesText) || 0,
            rating: parseFloat(ratingText) || 0
          });
        });

        return results.filter(s => s.shop_name && s.total_sales >= 1000);
      }, SELECTORS);

      await this.recordSuccess('top_shops', shops.length, Date.now() - start);
      log.info(`eRank: scraped ${shops.length} top shops`);
      return shops;
    } catch (err: any) {
      await this.saveScreenshotOnError('top-shops');
      await this.recordFailure('top_shops', err.message, Date.now() - start);
      log.error(`eRank top shops failed: ${err.message}`);
      return [];
    }
  }

  async getTopProducts(keyword?: string): Promise<ProductData[]> {
    // eRank doesn't have a direct "top products" page in Free plan
    // Returns empty — product data comes from Etsy API / Apify
    return [];
  }

  async getTrendBuzz(): Promise<string[]> {
    if (!this.page) throw new Error('Not connected');
    await this.login();

    try {
      await this.page.goto('https://erank.com/trend-buzz', { waitUntil: 'domcontentloaded' });
      await waitAndPause(this.page, 2000);

      const trends = await this.page.evaluate(() => {
        const items = document.querySelectorAll('.trend-item, .trending-keyword, .buzz-item');
        return Array.from(items).map(el => el.textContent?.trim() || '').filter(Boolean);
      });

      log.info(`eRank Trend Buzz: ${trends.length} trends`);
      return trends;
    } catch (err: any) {
      await this.saveScreenshotOnError('trend-buzz');
      log.error(`eRank Trend Buzz failed: ${err.message}`);
      return [];
    }
  }
}
