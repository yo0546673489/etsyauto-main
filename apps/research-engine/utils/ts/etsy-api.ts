import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';
import { createModuleLogger } from '../utils/logger';

dotenv.config();

const log = createModuleLogger('etsy-api');

const BASE_URL = 'https://openapi.etsy.com/v3/application';

export interface EtsyShop {
  shop_id: number;
  shop_name: string;
  transaction_sold_count: number;
  review_average: number;
  listing_active_count: number;
  currency_code: string;
  country_iso: string;
  num_favorers: number;
  creation_tsz?: number;
}

export interface EtsyListing {
  listing_id: number;
  title: string;
  price: { amount: number; divisor: number; currency_code: string };
  quantity: number;
  tags: string[];
  materials: string[];
  num_favorers: number;
  views: number;
  is_digital: boolean;
  taxonomy_path?: string[];
  images?: Array<{ url_fullxfull: string }>;
}

export class EtsyApiClient {
  private client: AxiosInstance;
  private requestCount = 0;
  private lastReset = Date.now();

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        'x-api-key': process.env.ETSY_API_KEY || ''
      },
      timeout: 10000
    });

    this.client.interceptors.request.use(async (config) => {
      await this.throttle();
      return config;
    });
  }

  // Rate limiter: 150 QPS max, but we stay conservative at 10 QPS
  private async throttle(): Promise<void> {
    const now = Date.now();
    if (now - this.lastReset >= 1000) {
      this.requestCount = 0;
      this.lastReset = now;
    }
    if (this.requestCount >= 10) {
      await new Promise(r => setTimeout(r, 1000 - (now - this.lastReset)));
      this.requestCount = 0;
      this.lastReset = Date.now();
    }
    this.requestCount++;
  }

  // Find top shops via active listings search (public endpoint, no OAuth needed)
  async findTopShops(options: {
    keywords?: string;
    limit?: number;
    minSales?: number;
  } = {}): Promise<EtsyShop[]> {
    const { keywords = '', limit = 25, minSales = 5000 } = options;

    try {
      // Search active listings by keyword — public endpoint
      const res = await this.client.get('/listings/active', {
        params: {
          keywords,
          limit: Math.min(limit * 4, 100), // fetch more listings to find unique shops
          sort_on: 'score',
          sort_order: 'desc',
          includes: 'Shop'
        }
      });

      const listings: any[] = res.data.results || [];

      // Extract unique shops from listing results
      const shopMap = new Map<number, EtsyShop>();
      for (const listing of listings) {
        const shop = listing.shop;
        if (shop && !shopMap.has(shop.shop_id)) {
          shopMap.set(shop.shop_id, {
            shop_id: shop.shop_id,
            shop_name: shop.shop_name,
            transaction_sold_count: shop.transaction_sold_count || 0,
            review_average: shop.review_average || 0,
            listing_active_count: shop.listing_active_count || 0,
            currency_code: shop.currency_code || 'USD',
            country_iso: shop.country_iso || '',
            num_favorers: shop.num_favorers || 0
          });
        }
      }

      const shops = Array.from(shopMap.values())
        .filter(s => s.transaction_sold_count >= minSales)
        .sort((a, b) => b.transaction_sold_count - a.transaction_sold_count)
        .slice(0, limit);

      log.info(`findTopShops("${keywords}"): found ${shops.length} shops from ${listings.length} listings`);
      return shops;
    } catch (err: any) {
      log.error(`Etsy API findTopShops failed: ${err.response?.status} ${err.message}`);
      return [];
    }
  }

  // Get a specific shop by name
  async getShop(shopIdOrName: string): Promise<EtsyShop | null> {
    try {
      const res = await this.client.get(`/shops/${shopIdOrName}`);
      return res.data;
    } catch (err: any) {
      log.error(`Etsy API getShop failed for ${shopIdOrName}: ${err.message}`);
      return null;
    }
  }

  // Get active listings for a shop
  async getShopListings(shopId: string, limit = 100): Promise<EtsyListing[]> {
    try {
      const res = await this.client.get(`/shops/${shopId}/listings/active`, {
        params: {
          limit,
          includes: 'Images,Tags',
          sort_on: 'num_favorers',
          sort_order: 'desc'
        }
      });
      return res.data.results || [];
    } catch (err: any) {
      log.error(`Etsy API getShopListings failed for shop ${shopId}: ${err.message}`);
      return [];
    }
  }

  // Get listing details including tags
  async getListing(listingId: number): Promise<EtsyListing | null> {
    try {
      const res = await this.client.get(`/listings/${listingId}`, {
        params: { includes: 'Images,Tags' }
      });
      return res.data;
    } catch (err: any) {
      log.error(`Etsy API getListing failed for ${listingId}: ${err.message}`);
      return null;
    }
  }

  // Find listings by keyword
  async findListings(keyword: string, limit = 50): Promise<EtsyListing[]> {
    try {
      const res = await this.client.get('/listings/active', {
        params: {
          keywords: keyword,
          limit,
          sort_on: 'score',
          sort_order: 'desc',
          includes: 'Tags'
        }
      });
      return res.data.results || [];
    } catch (err: any) {
      log.error(`Etsy API findListings failed: ${err.message}`);
      return [];
    }
  }

  // Get taxonomy (categories)
  async getCategories(): Promise<any[]> {
    try {
      const res = await this.client.get('/seller-taxonomy/nodes');
      return res.data.results || [];
    } catch (err: any) {
      log.error(`Etsy API getCategories failed: ${err.message}`);
      return [];
    }
  }
}
