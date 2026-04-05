import { BaseScraper, KeywordData, ShopData, ProductData } from './base-scraper';
import { humanType, naturalClick, waitAndPause, randomDelay, gradualScroll, maybeRandomBreak } from '../utils/human-behavior';
import { saveRawKeyword } from '../storage/models';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('koalanda');

// ⚠️  PLACEHOLDER SELECTORS — update after inspecting the real Koalanda UI
const SELECTORS = {
  // Koalanda uses MUI components
  cookieAccept: '#rcc-confirm-button',
  loginEmail: 'input[type="text"], input[name="email"], input[placeholder*="email" i]',
  loginPassword: 'input[type="password"]',
  loginButton: 'button[type="submit"], button.MuiButton-contained',

  // Keyword search
  keywordInput: 'input[type="text"], input[placeholder*="keyword" i], input[placeholder*="search" i]',
  keywordSearchBtn: 'button[type="submit"], button.MuiButton-contained',
  searchScore: '[class*="score"], [class*="Score"]',
  trend: '[class*="trend"], [class*="Trend"]',
  competition: '[class*="competition"], [class*="Competition"]',
  ctr: '[class*="ctr"], [class*="Ctr"]',

  // Top Shops
  topShopsPage: 'https://koalanda.pro/top-etsy-shops',
  shopRow: '[class*="MuiTableRow"], [class*="shop-row"], tr',
  shopName: '[class*="MuiTableCell"]:first-child a, [class*="shop-name"]',
  shopSales: '[class*="MuiTableCell"]:nth-child(3), [class*="sales"]',
  shopRating: '[class*="MuiTableCell"]:nth-child(4), [class*="rating"]',
  shopCategory: '[class*="MuiTableCell"]:nth-child(2), [class*="category"]',

  // Top Products
  topProductsNav: 'a[href*="top-products"]',
  productRow: '[class*="product"], [class*="listing"]',
  productTitle: '[class*="title"], [class*="name"]',
  productPrice: '[class*="price"]',
  productSales: '[class*="sales"], [class*="revenue"]'
};

export class KoalandaScraper extends BaseScraper {
  name = 'Koalanda';
  profileId = process.env.KOALANDA_PROFILE_ID || 'R2';
  dailyLimit = 10;

  private loggedIn = false;

  async login(): Promise<void> {
    if (!this.page) throw new Error('Not connected');
    if (this.loggedIn) return;

    const email = process.env.KOALANDA_EMAIL;
    const pass = process.env.KOALANDA_PASSWORD;
    if (!email || !pass) {
      throw new Error('Koalanda credentials missing — set KOALANDA_EMAIL and KOALANDA_PASSWORD in .env');
    }

    log.info('Logging in to Koalanda...');
    await this.page.goto('https://koalanda.pro/login', { waitUntil: 'domcontentloaded' });
    await waitAndPause(this.page, 2000);

    // Accept cookie consent if present
    const cookieBtn = await this.page.$(SELECTORS.cookieAccept);
    if (cookieBtn) {
      await cookieBtn.click();
      await randomDelay(500, 1000);
    }

    await humanType(this.page, SELECTORS.loginEmail, process.env.KOALANDA_EMAIL || '');
    await randomDelay(300, 700);
    await humanType(this.page, SELECTORS.loginPassword, process.env.KOALANDA_PASSWORD || '');
    await randomDelay(500, 1200);
    await naturalClick(this.page, SELECTORS.loginButton);
    await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await waitAndPause(this.page, 2000);

    this.loggedIn = true;
    log.info('Koalanda login successful');
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
        await this.page!.goto('https://koalanda.pro/keyword-research', { waitUntil: 'domcontentloaded' });
        await waitAndPause(this.page!, 1500);

        await this.page!.fill(SELECTORS.keywordInput, '');
        await humanType(this.page!, SELECTORS.keywordInput, keyword);
        await randomDelay(500, 1000);
        await naturalClick(this.page!, SELECTORS.keywordSearchBtn);

        // Wait for results to load
        await this.page!.waitForSelector(SELECTORS.searchScore, { timeout: 15000 });
        await waitAndPause(this.page!, 1000);

        return await this.page!.evaluate((s) => {
          const getNum = (sel: string) => {
            const el = document.querySelector(sel);
            const text = el?.textContent?.replace(/[^0-9.]/g, '') || '';
            return text ? parseFloat(text) : undefined;
          };
          const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim();

          return {
            search_score: getNum(s.searchScore),
            trend: getText(s.trend),
            competition: getNum(s.competition),
            ctr: getNum(s.ctr)
          };
        }, SELECTORS);
      }, 2, `keyword:${keyword}`);

      await saveRawKeyword(keyword, 'koalanda', result);
      await this.recordSuccess('keyword_search', 1, Date.now() - start);
      await maybeRandomBreak();

      return {
        keyword,
        score: result.search_score,
        trend: result.trend,
        competition: result.competition?.toString(),
        raw: result
      };
    } catch (err: any) {
      await this.saveScreenshotOnError('keyword');
      await this.recordFailure('keyword_search', err.message, Date.now() - start);
      log.error(`Koalanda keyword search failed: ${err.message}`);
      return { keyword, raw: null };
    }
  }

  async getTopShops(category?: string): Promise<ShopData[]> {
    if (!this.page) throw new Error('Not connected');
    await this.login();

    const start = Date.now();

    try {
      let url = SELECTORS.topShopsPage;
      if (category) url += `?category=${encodeURIComponent(category)}`;

      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      await waitAndPause(this.page, 2000);
      await gradualScroll(this.page, 1500);

      const shops = await this.page.evaluate((s) => {
        const rows = document.querySelectorAll(s.shopRow);
        const results: any[] = [];

        rows.forEach((row) => {
          const nameEl = row.querySelector(s.shopName);
          if (!nameEl) return;

          const salesText = row.querySelector(s.shopSales)?.textContent?.replace(/[^0-9]/g, '') || '0';
          const ratingText = row.querySelector(s.shopRating)?.textContent?.replace(/[^0-9.]/g, '') || '0';
          const categoryText = row.querySelector(s.shopCategory)?.textContent?.trim() || '';

          const href = nameEl.getAttribute('href') || '';
          const shopIdMatch = href.match(/shop\/([^/?]+)/);

          results.push({
            shop_name: nameEl.textContent?.trim() || '',
            etsy_shop_id: shopIdMatch?.[1] || nameEl.textContent?.trim()?.replace(/\s+/g, '') || '',
            total_sales: parseInt(salesText) || 0,
            rating: parseFloat(ratingText) || 0,
            main_category: categoryText
          });
        });

        return results.filter(s => s.shop_name && s.total_sales >= 5000);
      }, SELECTORS);

      await this.recordSuccess('top_shops', shops.length, Date.now() - start);
      log.info(`Koalanda: scraped ${shops.length} top shops`);
      return shops;
    } catch (err: any) {
      await this.saveScreenshotOnError('top-shops');
      await this.recordFailure('top_shops', err.message, Date.now() - start);
      log.error(`Koalanda top shops failed: ${err.message}`);
      return [];
    }
  }

  async getTopProducts(keyword?: string): Promise<ProductData[]> {
    if (!this.page) throw new Error('Not connected');
    await this.login();

    const start = Date.now();

    try {
      let url = 'https://koalanda.pro/top-products';
      if (keyword) url += `?keyword=${encodeURIComponent(keyword)}`;

      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      await waitAndPause(this.page, 2000);
      await gradualScroll(this.page, 1200);

      const products = await this.page.evaluate((s) => {
        const items = document.querySelectorAll(s.productRow);
        const results: any[] = [];

        items.forEach((item) => {
          const titleEl = item.querySelector(s.productTitle);
          if (!titleEl) return;

          const priceText = item.querySelector(s.productPrice)?.textContent?.replace(/[^0-9.]/g, '') || '0';
          const salesText = item.querySelector(s.productSales)?.textContent?.replace(/[^0-9]/g, '') || '0';

          results.push({
            title: titleEl.textContent?.trim() || '',
            price: parseFloat(priceText) || 0,
            monthly_sales: parseInt(salesText) || 0
          });
        });

        return results.filter(p => p.title);
      }, SELECTORS);

      await this.recordSuccess('top_products', products.length, Date.now() - start);
      log.info(`Koalanda: scraped ${products.length} top products`);
      return products;
    } catch (err: any) {
      await this.saveScreenshotOnError('top-products');
      await this.recordFailure('top_products', err.message, Date.now() - start);
      log.error(`Koalanda top products failed: ${err.message}`);
      return [];
    }
  }
}
