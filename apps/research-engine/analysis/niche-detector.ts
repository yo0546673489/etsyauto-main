import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { createModuleLogger } from '../utils/logger';
import { upsertNiche } from '../storage/models';
import type { Niche } from '../storage/models';

dotenv.config();

const log = createModuleLogger('niche-detector');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

export interface ProductSummary {
  title: string;
  price?: number;
  monthly_sales?: number;
  tags?: string[];
  category_path?: string;
  is_digital?: boolean;
}

export interface DetectedNiche {
  niche_name: string;
  parent_niche: string;
  category: string;
  sub_niche_level: number;
  keywords: string[];
  product_type: 'digital' | 'physical' | 'pod' | 'dropship';
  price_range: { min: number; max: number };
  target_audience: string;
  production_method: string;
}

export async function detectNichesFromProducts(
  products: ProductSummary[],
  shopExamples: string[]
): Promise<DetectedNiche[]> {
  if (products.length === 0) return [];

  if (!process.env.GEMINI_API_KEY) {
    log.warn('GEMINI_API_KEY not set — skipping niche detection');
    return [];
  }

  const productLines = products.slice(0, 30).map((p, i) => {
    const tags = p.tags?.slice(0, 5).join(', ') || '';
    return `${i + 1}. "${p.title}" — $${p.price ?? '?'}, ~${p.monthly_sales ?? '?'} sales/mo, tags: [${tags}]${p.is_digital ? ' [DIGITAL]' : ''}`;
  }).join('\n');

  const prompt = `You are an Etsy niche analyst. Analyze these top-selling products and identify distinct sub-niches.

Products:
${productLines}

Identify 1-4 distinct niches. Return ONLY a JSON array, no other text:
[
  {
    "niche_name": "specific niche (e.g. 'Custom Minimalist Couple Line Art Portraits')",
    "parent_niche": "parent category (e.g. 'Wall Art')",
    "category": "Etsy main category",
    "sub_niche_level": 3,
    "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
    "product_type": "digital|physical|pod|dropship",
    "price_range": { "min": 15, "max": 45 },
    "target_audience": "who buys this",
    "production_method": "how to make it"
  }
]`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      log.warn('No JSON array in Gemini response');
      return [];
    }

    const niches: DetectedNiche[] = JSON.parse(jsonMatch[0]);
    log.info(`Detected ${niches.length} niches from ${products.length} products`);

    for (const niche of niches) {
      try {
        const record: Niche = {
          niche_name: niche.niche_name,
          parent_niche: niche.parent_niche,
          category: niche.category,
          sub_niche_level: niche.sub_niche_level,
          keywords: niche.keywords,
          product_type: niche.product_type,
          price_range_min: niche.price_range.min,
          price_range_max: niche.price_range.max,
          target_audience: niche.target_audience,
          production_method: niche.production_method,
          shop_examples: shopExamples,
          ai_analysis: JSON.stringify(niche)
        };
        await upsertNiche(record);
      } catch (err: any) {
        log.error(`Failed to save niche "${niche.niche_name}": ${err.message}`);
      }
    }

    return niches;
  } catch (err: any) {
    log.error(`Gemini niche detection failed: ${err.message}`);
    return [];
  }
}

export async function detectNichesFromShopBatch(
  shops: Array<{ shopName: string; products: ProductSummary[] }>
): Promise<DetectedNiche[]> {
  const allDetected: DetectedNiche[] = [];

  const batchSize = 3;
  for (let i = 0; i < shops.length; i += batchSize) {
    const batch = shops.slice(i, i + batchSize);
    const allProducts: ProductSummary[] = [];
    const shopNames: string[] = [];

    for (const { shopName, products } of batch) {
      allProducts.push(...products.slice(0, 10));
      shopNames.push(shopName);
    }

    if (allProducts.length === 0) continue;

    const detected = await detectNichesFromProducts(allProducts, shopNames);
    allDetected.push(...detected);

    if (i + batchSize < shops.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return allDetected;
}
