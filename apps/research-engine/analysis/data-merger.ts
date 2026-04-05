import { createModuleLogger } from '../utils/logger';
import { upsertKeyword, saveRawKeyword } from '../storage/models';
import type { Keyword } from '../storage/models';

const log = createModuleLogger('data-merger');

// Weight per source for computing avg_volume
const WEIGHTS = {
  erank: 0.50,
  koalanda: 0.30,
  alura: 0.20
};

// Normalize Koalanda's 0-100 score to estimated search volume
function koalandaScoreToVolume(score: number): number {
  // Rough linear mapping: score 100 ≈ 50,000 searches, score 10 ≈ 1,000
  return Math.round((score / 100) * 50000);
}

// Normalize Alura volume label to a number
function aluraVolumeToNumber(label: string): number {
  const map: Record<string, number> = {
    very_high: 40000,
    high: 15000,
    medium: 5000,
    low: 1000,
    very_low: 200
  };
  return map[label?.toLowerCase().replace(/\s+/g, '_')] ?? 0;
}

// Competition labels to 0-100 score (higher = more competitive)
function competitionToScore(competition: string | undefined): number {
  if (!competition) return 50;
  const c = competition.toLowerCase();
  if (c.includes('very high') || c.includes('very_high')) return 90;
  if (c.includes('high')) return 70;
  if (c.includes('medium')) return 50;
  if (c.includes('low') && !c.includes('very')) return 30;
  if (c.includes('very low') || c.includes('very_low')) return 10;
  // Numeric string
  const num = parseFloat(c);
  if (!isNaN(num)) return Math.min(100, num);
  return 50;
}

// Trend normalization
function normalizeTrend(raw: string | undefined): 'rising' | 'stable' | 'declining' {
  if (!raw) return 'stable';
  const t = raw.toLowerCase();
  if (t.includes('ris') || t.includes('up') || t.includes('grow') || t.includes('increas')) return 'rising';
  if (t.includes('declin') || t.includes('fall') || t.includes('down') || t.includes('decreas')) return 'declining';
  return 'stable';
}

// Keyword recommendation based on demand and competition
function getRecommendation(avgVolume: number, competitionScore: number, trend: string): string {
  const opportunityScore = 100 - competitionScore;
  const trendBonus = trend === 'rising' ? 15 : trend === 'declining' ? -15 : 0;
  const score = (avgVolume / 500) * 0.5 + opportunityScore * 0.5 + trendBonus;

  if (score > 70 && avgVolume > 5000) return 'excellent';
  if (score > 50 && avgVolume > 2000) return 'good';
  if (score > 30) return 'medium';
  return 'avoid';
}

export interface RawKeywordSources {
  keyword: string;
  niche_id?: number;
  erank?: {
    searches?: number;
    competition?: string;
    click_rate?: number;
  };
  koalanda?: {
    search_score?: number;
    trend?: string;
    competition?: number;
  };
  alura?: {
    volume?: string;
    competition?: number | string;
  };
}

export async function mergeAndSaveKeyword(sources: RawKeywordSources): Promise<void> {
  const { keyword, niche_id } = sources;

  // Compute weighted avg_volume
  const volumes: Array<{ vol: number; weight: number }> = [];

  if (sources.erank?.searches) {
    volumes.push({ vol: sources.erank.searches, weight: WEIGHTS.erank });
  }
  if (sources.koalanda?.search_score !== undefined) {
    volumes.push({ vol: koalandaScoreToVolume(sources.koalanda.search_score), weight: WEIGHTS.koalanda });
  }
  if (sources.alura?.volume) {
    volumes.push({ vol: aluraVolumeToNumber(sources.alura.volume), weight: WEIGHTS.alura });
  }

  let avgVolume = 0;
  if (volumes.length > 0) {
    const totalWeight = volumes.reduce((s, v) => s + v.weight, 0);
    avgVolume = Math.round(volumes.reduce((s, v) => s + v.vol * v.weight, 0) / totalWeight);
  }

  // Competition score (average across sources)
  const compScores: number[] = [];
  if (sources.erank?.competition) compScores.push(competitionToScore(sources.erank.competition));
  if (sources.koalanda?.competition !== undefined) compScores.push(sources.koalanda.competition);
  if (sources.alura?.competition !== undefined) {
    compScores.push(typeof sources.alura.competition === 'string'
      ? competitionToScore(sources.alura.competition)
      : sources.alura.competition * 100);
  }
  const competitionScore = compScores.length > 0
    ? compScores.reduce((a, b) => a + b, 0) / compScores.length
    : 50;

  // Trend
  const rawTrend = sources.koalanda?.trend;
  const trend = normalizeTrend(rawTrend);

  const recommendation = getRecommendation(avgVolume, competitionScore, trend);

  const kw: Keyword = {
    keyword,
    niche_id,
    erank_searches: sources.erank?.searches,
    erank_competition: sources.erank?.competition,
    erank_click_rate: sources.erank?.click_rate,
    koalanda_search_score: sources.koalanda?.search_score,
    koalanda_trend: sources.koalanda?.trend,
    alura_volume: sources.alura?.volume,
    alura_competition: typeof sources.alura?.competition === 'number'
      ? sources.alura.competition
      : undefined,
    avg_volume: avgVolume,
    competition_score: Math.round(competitionScore * 100) / 100,
    trend,
    recommendation
  };

  await upsertKeyword(kw);
  log.info(`Merged keyword: "${keyword}" — volume:${avgVolume} comp:${competitionScore.toFixed(0)} trend:${trend} → ${recommendation}`);
}

export async function mergeKeywordBatch(keywords: RawKeywordSources[]): Promise<void> {
  log.info(`Merging ${keywords.length} keywords...`);
  for (const kw of keywords) {
    try {
      await mergeAndSaveKeyword(kw);
    } catch (err: any) {
      log.error(`Failed to merge keyword "${kw.keyword}": ${err.message}`);
    }
  }
  log.info('Keyword batch merge complete');
}
