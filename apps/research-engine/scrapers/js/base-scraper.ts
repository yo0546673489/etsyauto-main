import { Browser, BrowserContext, Page, chromium } from 'playwright';
import axios from 'axios';
import path from 'path';
import { createModuleLogger } from '../utils/logger';
import { logScrape, getDailyUsage } from '../storage/models';
import { randomDelay, maybeRandomBreak } from '../utils/human-behavior';

const log = createModuleLogger('base-scraper');

export interface KeywordData {
  keyword: string;
  searches?: number;
  competition?: string;
  click_rate?: number;
  avg_price?: number;
  trend?: string;
  score?: number;
  raw?: any;
}

export interface ShopData {
  etsy_shop_id: string;
  shop_name: string;
  total_sales?: number;
  rating?: number;
  main_category?: string;
  country?: string;
  listing_count?: number;
}

export interface ProductData {
  etsy_listing_id?: number;
  title: string;
  price?: number;
  monthly_sales?: number;
  sales_estimate?: number;
  favorites?: number;
  tags?: string[];
  category_path?: string;
  is_digital?: boolean;
}

export interface IScraper {
  name: string;
  profileId: string;
  dailyLimit: number;
  connect(): Promise<void>;
  searchKeyword(keyword: string): Promise<KeywordData>;
  getTopShops(category?: string): Promise<ShopData[]>;
  getTopProducts(keyword?: string): Promise<ProductData[]>;
  disconnect(): Promise<void>;
}

export abstract class BaseScraper implements IScraper {
  abstract name: string;
  abstract profileId: string;
  abstract dailyLimit: number;

  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected searchesUsedToday = 0;

  // Connect via AdsPower profile
  async connect(): Promise<void> {
    log.info(`Connecting ${this.name} via AdsPower profile ${this.profileId}...`);

    try {
      const adsPowerUrl = process.env.ADSPOWER_API_URL || 'http://local.adspower.net:50325';

      // Open AdsPower profile browser
      const startRes = await axios.get(`${adsPowerUrl}/api/v1/browser/start`, {
        params: { user_id: this.profileId }
      });

      if (startRes.data.code !== 0) {
        throw new Error(`AdsPower error: ${JSON.stringify(startRes.data)}`);
      }

      const wsUrl = startRes.data.data.ws.puppeteer;

      this.browser = await chromium.connectOverCDP(wsUrl);
      const contexts = this.browser.contexts();
      this.context = contexts[0] || await this.browser.newContext();
      this.page = await this.context.newPage();

      log.info(`${this.name} connected successfully`);
    } catch (err: any) {
      log.warn(`AdsPower connection failed, falling back to headless browser: ${err.message}`);
      // Fallback: headless browser (for testing without AdsPower)
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--headless=new'
        ]
      });
      this.context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
      });
      this.page = await this.context.newPage();
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.page) await this.page.close();
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
    } catch (err: any) {
      log.warn(`Error during disconnect: ${err.message}`);
    } finally {
      this.browser = null;
      this.context = null;
      this.page = null;
    }

    try {
      const adsPowerUrl = process.env.ADSPOWER_API_URL || 'http://local.adspower.net:50325';
      await axios.get(`${adsPowerUrl}/api/v1/browser/stop`, {
        params: { user_id: this.profileId }
      });
    } catch { /* ignore */ }
  }

  protected async checkDailyLimit(): Promise<boolean> {
    this.searchesUsedToday = await getDailyUsage(this.name.toLowerCase());
    if (this.searchesUsedToday >= this.dailyLimit) {
      log.warn(`${this.name} daily limit reached (${this.searchesUsedToday}/${this.dailyLimit})`);
      return false;
    }
    return true;
  }

  protected async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    label = 'operation'
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        if (attempt === maxRetries) throw err;
        log.warn(`${this.name} ${label} failed (attempt ${attempt}/${maxRetries}): ${err.message}`);
        await randomDelay(5000, 15000);
      }
    }
    throw new Error('Should not reach here');
  }

  protected async saveScreenshotOnError(label: string): Promise<void> {
    if (!this.page) return;
    try {
      const filename = path.join(process.cwd(), 'logs', `error-${this.name}-${label}-${Date.now()}.png`);
      await this.page.screenshot({ path: filename, fullPage: true });
      log.info(`Screenshot saved: ${filename}`);
    } catch { /* ignore */ }
  }

  protected async recordSuccess(action: string, items: number, durationMs: number): Promise<void> {
    await logScrape(this.name.toLowerCase(), action, 'success', items, durationMs);
  }

  protected async recordFailure(action: string, error: string, durationMs: number): Promise<void> {
    await logScrape(this.name.toLowerCase(), action, 'failed', 0, durationMs, error);
  }

  abstract searchKeyword(keyword: string): Promise<KeywordData>;
  abstract getTopShops(category?: string): Promise<ShopData[]>;
  abstract getTopProducts(keyword?: string): Promise<ProductData[]>;
}
