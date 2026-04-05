import axios from 'axios';
import dotenv from 'dotenv';
import { createModuleLogger } from '../utils/logger';

dotenv.config();

const log = createModuleLogger('apify-client');

const APIFY_BASE = 'https://api.apify.com/v2';
// Apify Etsy Scraper actor ID
const ETSY_SCRAPER_ACTOR = 'etsy/etsy-scraper';

export interface ApifyProduct {
  id: string;
  title: string;
  price: number;
  currency: string;
  url: string;
  shopName: string;
  tags: string[];
  numFavorers: number;
  numReviews: number;
  isDigital: boolean;
  images: string[];
  category: string;
}

export class ApifyClient {
  private token: string;
  private monthlyBudgetUsd = 5;
  private dailyCreditLimit = 4.5;

  constructor() {
    this.token = process.env.APIFY_API_TOKEN || '';
    if (!this.token) {
      log.warn('APIFY_API_TOKEN not set — Apify scraping will be skipped');
    }
  }

  // Run the Etsy scraper for a shop URL and return products
  async scrapeShop(shopUrl: string, maxItems = 50): Promise<ApifyProduct[]> {
    if (!this.token) return [];

    log.info(`Apify: scraping shop ${shopUrl} (max ${maxItems} items)...`);

    try {
      // Start actor run
      const runRes = await axios.post(
        `${APIFY_BASE}/acts/${ETSY_SCRAPER_ACTOR}/runs`,
        {
          startUrls: [{ url: shopUrl }],
          maxItems,
          proxyConfiguration: { useApifyProxy: true }
        },
        {
          headers: { Authorization: `Bearer ${this.token}` },
          params: { timeout: 120, memory: 256 }
        }
      );

      const runId = runRes.data.data.id;
      log.info(`Apify run started: ${runId}`);

      // Poll for completion
      const result = await this.waitForRun(runId);
      if (!result) return [];

      // Fetch dataset items
      const dataRes = await axios.get(
        `${APIFY_BASE}/actor-runs/${runId}/dataset/items`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
          params: { limit: maxItems, format: 'json' }
        }
      );

      const items: ApifyProduct[] = dataRes.data || [];
      log.info(`Apify: retrieved ${items.length} products from ${shopUrl}`);
      return items;
    } catch (err: any) {
      log.error(`Apify scrapeShop failed: ${err.message}`);
      return [];
    }
  }

  // Scrape multiple shops (batched to stay within budget)
  async scrapeShops(shopUrls: string[], maxItemsPerShop = 30): Promise<Map<string, ApifyProduct[]>> {
    const results = new Map<string, ApifyProduct[]>();

    for (const url of shopUrls) {
      const products = await this.scrapeShop(url, maxItemsPerShop);
      if (products.length > 0) {
        results.set(url, products);
      }
      // Small delay between shops
      await new Promise(r => setTimeout(r, 2000));
    }

    return results;
  }

  // Search Etsy listings by keyword via Apify
  async searchListings(keyword: string, maxItems = 50): Promise<ApifyProduct[]> {
    if (!this.token) return [];

    const searchUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    return this.scrapeShop(searchUrl, maxItems);
  }

  private async waitForRun(runId: string, timeoutMs = 120000): Promise<boolean> {
    const start = Date.now();
    const pollInterval = 5000;

    while (Date.now() - start < timeoutMs) {
      try {
        const res = await axios.get(
          `${APIFY_BASE}/actor-runs/${runId}`,
          { headers: { Authorization: `Bearer ${this.token}` } }
        );
        const status = res.data.data.status;

        if (status === 'SUCCEEDED') return true;
        if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
          log.error(`Apify run ${runId} ended with status: ${status}`);
          return false;
        }
      } catch (err: any) {
        log.warn(`Apify poll error: ${err.message}`);
      }

      await new Promise(r => setTimeout(r, pollInterval));
    }

    log.error(`Apify run ${runId} timed out after ${timeoutMs}ms`);
    return false;
  }

  // Check remaining Apify credits (approximate)
  async getRemainingCredits(): Promise<number | null> {
    if (!this.token) return null;

    try {
      const res = await axios.get(
        `${APIFY_BASE}/users/me`,
        { headers: { Authorization: `Bearer ${this.token}` } }
      );
      return res.data.data.plan?.monthlyUsageCreditsUsd ?? null;
    } catch {
      return null;
    }
  }
}
