import { BaseScraper, KeywordData, ShopData, ProductData } from './base-scraper';
import { humanType, naturalClick, waitAndPause, randomDelay, gradualScroll } from '../utils/human-behavior';
import { saveRawKeyword } from '../storage/models';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('other-scrapers');

// ─────────────────────────────────────────────────────────────────────────────
// ALURA Scraper
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️  PLACEHOLDER SELECTORS — update after inspecting the real Alura UI
const ALURA_SELECTORS = {
  loginEmail: 'input[type="email"]',
  loginPassword: 'input[type="password"]',
  loginButton: 'button[type="submit"]',
  keywordInput: 'input[placeholder*="keyword"], input.search-input',
  keywordSearchBtn: 'button.search-btn, button[type="submit"]',
  volumeLabel: '.volume-badge, .search-volume, [data-metric="volume"]',
  competitionLabel: '.competition-score, [data-metric="competition"]',
  productRow: '.product-item, .listing-row',
  productTitle: '.listing-title, .product-name',
  productPrice: '.price, .listing-price',
  productSales: '.monthly-sales, .sales-estimate'
};

export class AluraScraper extends BaseScraper {
  name = 'Alura';
  profileId = process.env.ALURA_PROFILE_ID || 'R3';
  dailyLimit = 15;
  private loggedIn = false;

  async login(): Promise<void> {
    if (!this.page) throw new Error('Not connected');
    if (this.loggedIn) return;
    if (!process.env.ALURA_EMAIL || !process.env.ALURA_PASSWORD) {
      throw new Error('Alura credentials missing — set ALURA_EMAIL and ALURA_PASSWORD in .env');
    }

    await this.page.goto('https://www.alura.io/login', { waitUntil: 'domcontentloaded' });
    await waitAndPause(this.page, 1500);
    await humanType(this.page, ALURA_SELECTORS.loginEmail, process.env.ALURA_EMAIL || '');
    await randomDelay(300, 700);
    await humanType(this.page, ALURA_SELECTORS.loginPassword, process.env.ALURA_PASSWORD || '');
    await randomDelay(500, 1200);
    await naturalClick(this.page, ALURA_SELECTORS.loginButton);
    await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await waitAndPause(this.page, 2000);
    this.loggedIn = true;
    log.info('Alura login successful');
  }

  async searchKeyword(keyword: string): Promise<KeywordData> {
    if (!this.page) throw new Error('Not connected');
    if (!(await this.checkDailyLimit())) return { keyword, raw: null };

    await this.login();
    const start = Date.now();

    try {
      await this.page.goto('https://www.alura.io/keyword-finder', { waitUntil: 'domcontentloaded' });
      await waitAndPause(this.page, 1500);

      await this.page.fill(ALURA_SELECTORS.keywordInput, '');
      await humanType(this.page, ALURA_SELECTORS.keywordInput, keyword);
      await randomDelay(500, 1000);
      await naturalClick(this.page, ALURA_SELECTORS.keywordSearchBtn);
      await this.page.waitForSelector(ALURA_SELECTORS.volumeLabel, { timeout: 15000 });
      await waitAndPause(this.page, 1000);

      const data = await this.page.evaluate((s) => ({
        volume: document.querySelector(s.volumeLabel)?.textContent?.trim(),
        competition: document.querySelector(s.competitionLabel)?.textContent?.replace(/[^0-9.]/g, '')
      }), ALURA_SELECTORS);

      await saveRawKeyword(keyword, 'alura', data);
      await this.recordSuccess('keyword_search', 1, Date.now() - start);

      return {
        keyword,
        competition: data.competition,
        raw: data
      };
    } catch (err: any) {
      await this.saveScreenshotOnError('keyword');
      await this.recordFailure('keyword_search', err.message, Date.now() - start);
      return { keyword, raw: null };
    }
  }

  async getTopShops(_category?: string): Promise<ShopData[]> {
    return []; // Alura focuses on products/keywords, not shop lists
  }

  async getTopProducts(keyword?: string): Promise<ProductData[]> {
    if (!this.page) throw new Error('Not connected');
    await this.login();

    const start = Date.now();

    try {
      let url = 'https://www.alura.io/product-research';
      if (keyword) url += `?keyword=${encodeURIComponent(keyword)}`;

      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      await waitAndPause(this.page, 2000);
      await gradualScroll(this.page);

      const products = await this.page.evaluate((s) => {
        return Array.from(document.querySelectorAll(s.productRow)).map((row) => ({
          title: row.querySelector(s.productTitle)?.textContent?.trim() || '',
          price: parseFloat(row.querySelector(s.productPrice)?.textContent?.replace(/[^0-9.]/g, '') || '0'),
          monthly_sales: parseInt(row.querySelector(s.productSales)?.textContent?.replace(/[^0-9]/g, '') || '0')
        })).filter(p => p.title);
      }, ALURA_SELECTORS);

      await this.recordSuccess('top_products', products.length, Date.now() - start);
      return products;
    } catch (err: any) {
      await this.saveScreenshotOnError('products');
      await this.recordFailure('top_products', err.message, Date.now() - start);
      return [];
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EHUNT Scraper
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️  PLACEHOLDER SELECTORS — update after inspecting the real EHunt UI
const EHUNT_SELECTORS = {
  loginEmail: 'input[type="email"]',
  loginPassword: 'input[type="password"]',
  loginButton: 'button[type="submit"]',
  keywordInput: 'input[placeholder*="keyword"], input.keyword-input',
  keywordSearchBtn: 'button[type="submit"], button.search',
  searchVolume: '.search-volume, .volume-value, [data-type="volume"]',
  competition: '.competition-score, .comp-level',
  shopInput: 'input[placeholder*="shop"], input.shop-input',
  shopSearchBtn: 'button.analyze-btn, button[type="submit"]',
  shopStats: '.shop-stats, .analytics-panel'
};

export class EHuntScraper extends BaseScraper {
  name = 'EHunt';
  profileId = process.env.EHUNT_PROFILE_ID || 'R5';
  dailyLimit = 8;
  private loggedIn = false;

  async login(): Promise<void> {
    if (!this.page) throw new Error('Not connected');
    if (this.loggedIn) return;
    if (!process.env.EHUNT_EMAIL || !process.env.EHUNT_PASSWORD) {
      throw new Error('EHunt credentials missing — set EHUNT_EMAIL and EHUNT_PASSWORD in .env');
    }

    await this.page.goto('https://ehunt.ai/user/login', { waitUntil: 'domcontentloaded' });
    await waitAndPause(this.page, 1500);
    await humanType(this.page, EHUNT_SELECTORS.loginEmail, process.env.EHUNT_EMAIL || '');
    await randomDelay(300, 700);
    await humanType(this.page, EHUNT_SELECTORS.loginPassword, process.env.EHUNT_PASSWORD || '');
    await randomDelay(500, 1200);
    await naturalClick(this.page, EHUNT_SELECTORS.loginButton);
    await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await waitAndPause(this.page, 2000);
    this.loggedIn = true;
    log.info('EHunt login successful');
  }

  async searchKeyword(keyword: string): Promise<KeywordData> {
    if (!this.page) throw new Error('Not connected');
    if (!(await this.checkDailyLimit())) return { keyword, raw: null };

    await this.login();
    const start = Date.now();

    try {
      await this.page.goto('https://ehunt.ai/keyword-tool', { waitUntil: 'domcontentloaded' });
      await waitAndPause(this.page, 1500);

      await this.page.fill(EHUNT_SELECTORS.keywordInput, '');
      await humanType(this.page, EHUNT_SELECTORS.keywordInput, keyword);
      await randomDelay(500, 1000);
      await naturalClick(this.page, EHUNT_SELECTORS.keywordSearchBtn);
      await this.page.waitForSelector(EHUNT_SELECTORS.searchVolume, { timeout: 15000 });
      await waitAndPause(this.page, 1000);

      const data = await this.page.evaluate((s) => ({
        volume: parseInt(document.querySelector(s.searchVolume)?.textContent?.replace(/[^0-9]/g, '') || '0'),
        competition: document.querySelector(s.competition)?.textContent?.trim()
      }), EHUNT_SELECTORS);

      await saveRawKeyword(keyword, 'ehunt', data);
      await this.recordSuccess('keyword_search', 1, Date.now() - start);

      return { keyword, searches: data.volume, competition: data.competition, raw: data };
    } catch (err: any) {
      await this.saveScreenshotOnError('keyword');
      await this.recordFailure('keyword_search', err.message, Date.now() - start);
      return { keyword, raw: null };
    }
  }

  async getTopShops(_category?: string): Promise<ShopData[]> {
    return [];
  }

  async getTopProducts(keyword?: string): Promise<ProductData[]> {
    return [];
  }

  async analyzeShop(shopName: string): Promise<any> {
    if (!this.page) throw new Error('Not connected');
    await this.login();

    try {
      await this.page.goto(`https://ehunt.ai/shop-analyzer?shop=${encodeURIComponent(shopName)}`, {
        waitUntil: 'domcontentloaded'
      });
      await waitAndPause(this.page, 2000);

      return await this.page.evaluate((s) => {
        return document.querySelector(s.shopStats)?.textContent?.trim() || '';
      }, EHUNT_SELECTORS);
    } catch (err: any) {
      await this.saveScreenshotOnError('shop-analyze');
      log.error(`EHunt shop analysis failed: ${err.message}`);
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EVERBEE Scraper
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️  PLACEHOLDER SELECTORS — EverBee is a Chrome extension; scraping is limited
// Monthly limit: ~10 keywords — use very sparingly
const EVERBEE_SELECTORS = {
  loginEmail: 'input[type="email"]',
  loginPassword: 'input[type="password"]',
  loginButton: 'button[type="submit"]',
  // EverBee injects data into Etsy product pages
  etsyProductPage: '.wt-grid__item-xs-6, .listing-page',
  everbeeRevenue: '[data-everbee-revenue], .everbee-revenue',
  everbeeMonthly: '[data-everbee-monthly], .everbee-monthly-sales'
};

export class EverBeeScraper extends BaseScraper {
  name = 'EverBee';
  profileId = process.env.EVERBEE_PROFILE_ID || 'R4';
  dailyLimit = 1; // 10 / month ≈ 0.3/day, rounded to 1 maximum

  async searchKeyword(_keyword: string): Promise<KeywordData> {
    // EverBee doesn't have a standalone keyword tool in Free plan
    return { keyword: _keyword, raw: null };
  }

  async getTopShops(_category?: string): Promise<ShopData[]> {
    return [];
  }

  async getTopProducts(_keyword?: string): Promise<ProductData[]> {
    return [];
  }

  // EverBee: open an Etsy shop page and read injected data
  async getShopProductEstimates(shopUrl: string): Promise<ProductData[]> {
    if (!this.page) throw new Error('Not connected');
    if (!(await this.checkDailyLimit())) return [];

    const start = Date.now();

    try {
      await this.page.goto(shopUrl, { waitUntil: 'domcontentloaded' });
      await waitAndPause(this.page, 3000); // wait for EverBee extension to inject

      const products = await this.page.evaluate((s) => {
        return Array.from(document.querySelectorAll(s.etsyProductPage)).map((item) => ({
          title: item.querySelector('.listing-link')?.textContent?.trim() || '',
          monthly_sales: parseInt(
            item.querySelector(s.everbeeMonthly)?.textContent?.replace(/[^0-9]/g, '') || '0'
          )
        })).filter(p => p.title && p.monthly_sales > 0);
      }, EVERBEE_SELECTORS);

      await this.recordSuccess('shop_estimates', products.length, Date.now() - start);
      log.info(`EverBee: ${products.length} products from ${shopUrl}`);
      return products;
    } catch (err: any) {
      await this.saveScreenshotOnError('everbee');
      await this.recordFailure('shop_estimates', err.message, Date.now() - start);
      return [];
    }
  }
}
