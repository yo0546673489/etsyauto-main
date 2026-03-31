import { Page } from 'playwright';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  return new Promise(resolve =>
    setTimeout(resolve, Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs)
  );
}

export interface ListingData {
  listingId: string;
  url: string;
  title: string | null;
  imageUrl: string | null;
  price: string | null;
  originalPrice: string | null;
  currencyCode: string | null;
}

// Extract all Etsy listing IDs from message texts
export function extractListingUrls(messages: { messageText: string }[]): string[] {
  const urls = new Set<string>();
  for (const msg of messages) {
    const matches = msg.messageText.match(/(?:https?:\/\/)?(?:www\.)?etsy\.com\/listing\/(\d+)(?:\/[^\s]*)*/gi) || [];
    for (const match of matches) {
      const full = match.startsWith('http') ? match : 'https://' + match;
      urls.add(full.split('?')[0]); // strip query params
    }
  }
  return Array.from(urls);
}

export class ListingScraper {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async scrapeListing(url: string): Promise<ListingData | null> {
    const idMatch = url.match(/listing\/(\d+)/);
    if (!idMatch) return null;
    const listingId = idMatch[1];

    try {
      await randomDelay(800, 1800);
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await randomDelay(1000, 2000);

      // Wait for price to load (Etsy renders price via JS after initial HTML)
      await this.page.waitForSelector(
        '[data-buy-box-region] p.wt-text-title-03, .wt-text-title-03, [class*="price-value"], [class*="currency-value"], meta[property="og:price:amount"]',
        { timeout: 8000 }
      ).catch(() => {
        // Price element may not appear — continue anyway
      });

      const data = await this.page.evaluate(() => {
        // Title
        const title =
          document.querySelector('h1[data-buy-box-listing-title]')?.textContent?.trim() ||
          document.querySelector('h1.wt-text-body-01')?.textContent?.trim() ||
          document.querySelector('h1')?.textContent?.trim() ||
          document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
          null;

        // Image — og:image is most reliable
        const image =
          document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
          document.querySelector('img[data-listing-image]')?.getAttribute('src') ||
          document.querySelector('.wt-max-width-full img')?.getAttribute('src') ||
          null;

        // Price — try multiple selectors since Etsy changes them
        const priceSelectors = [
          '[data-buy-box-region] p.wt-text-title-03',
          '.wt-text-title-03',
          'p[class*="price"]',
          '[class*="price-value"]',
          '[class*="currency-value"]',
          'meta[property="og:price:amount"]',
          'meta[name="twitter:data1"]',
        ];
        let price: string | null = null;
        for (const sel of priceSelectors) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const raw = el.getAttribute('content') || el.textContent || '';
          const num = raw.replace(/[^\d.]/g, '').trim();
          if (num && parseFloat(num) > 0) { price = num; break; }
        }
        // Fallback: scan page source for JSON price data
        if (!price) {
          const html = document.body.innerHTML;
          const m = html.match(/"price":\s*"?(\d+\.?\d*)"?/) ||
                    html.match(/US\$\s*([\d,]+\.?\d*)/) ||
                    html.match(/\$\s*([\d,]+\.?\d*)/);
          if (m) price = m[1].replace(',', '');
        }

        // Original (before-sale) price — look for strikethrough element
        const originalPriceSelectors = [
          '[data-buy-box-region] p.wt-text-strikethrough',
          '.wt-text-strikethrough',
          '[class*="original-price"]',
          '[class*="before-price"]',
          'del',
          's',
        ];
        let originalPrice: string | null = null;
        for (const sel of originalPriceSelectors) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const raw = el.textContent || '';
          const num = raw.replace(/[^\d.]/g, '').trim();
          if (num && parseFloat(num) > 0) { originalPrice = num; break; }
        }
        // Fallback: look for originalPrice in JSON-LD or page source
        if (!originalPrice) {
          const html = document.body.innerHTML;
          const m = html.match(/"original_price":\s*"?(\d+\.?\d*)"?/) ||
                    html.match(/"originalPrice":\s*"?(\d+\.?\d*)"?/) ||
                    html.match(/"before_price":\s*"?(\d+\.?\d*)"?/);
          if (m) originalPrice = m[1].replace(',', '');
        }

        const currency =
          document.querySelector('meta[property="og:price:currency"]')?.getAttribute('content') ||
          'USD';

        return { title, image, price, originalPrice, currency };
      });

      logger.info(`Scraped listing ${listingId}: "${data.title?.substring(0, 50)}" price=${data.price} orig=${data.originalPrice}`);

      return {
        listingId,
        url,
        title: data.title,
        imageUrl: data.image,
        price: data.price,
        originalPrice: data.originalPrice,
        currencyCode: data.currency,
      };
    } catch (err) {
      logger.warn(`Failed to scrape listing ${listingId}: ${err}`);
      return null;
    }
  }

  async scrapeAndSave(pool: Pool, urls: string[]): Promise<void> {
    for (const url of urls) {
      const idMatch = url.match(/listing\/(\d+)/);
      if (!idMatch) continue;
      const listingId = idMatch[1];

      // Skip if already scraped recently (within 24h)
      const existing = await pool.query(
        `SELECT id FROM listing_previews WHERE listing_id = $1 AND scraped_at > NOW() - INTERVAL '24 hours'`,
        [listingId]
      );
      if (existing.rows.length > 0) {
        logger.debug(`Listing ${listingId} already cached`);
        continue;
      }

      const data = await this.scrapeListing(url);
      if (!data) continue;

      await pool.query(
        `INSERT INTO listing_previews (listing_id, url, title, image_url, price, original_price, currency_code, scraped_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (listing_id) DO UPDATE SET
           title = EXCLUDED.title,
           image_url = EXCLUDED.image_url,
           price = EXCLUDED.price,
           original_price = EXCLUDED.original_price,
           currency_code = EXCLUDED.currency_code,
           scraped_at = NOW(),
           updated_at = NOW()`,
        [data.listingId, data.url, data.title, data.imageUrl, data.price, data.originalPrice, data.currencyCode]
      );
      logger.info(`Saved listing preview: ${listingId}`);
    }
  }
}
