import { createModuleLogger } from '../utils/logger';
import { query } from '../storage/database';
import type { Niche } from '../storage/models';

const log = createModuleLogger('niche-scorer');

/**
 * Niche Score Formula:
 *   Demand × 0.35 + Opportunity × 0.25 + Trend × 0.20 + Profitability × 0.20
 *
 * Each sub-score is 0–100.
 */

function clamp(val: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, val));
}

interface KeywordStats {
  avg_volume: number;
  competition_score: number;
  trend: string;
  recommendation: string;
}

export async function scoreNiche(nicheId: number): Promise<void> {
  // Fetch niche
  const [niche] = await query<Niche>('SELECT * FROM research_niches WHERE id = $1', [nicheId]);
  if (!niche) {
    log.warn(`Niche ${nicheId} not found`);
    return;
  }

  // Fetch associated keywords
  const keywords = await query<KeywordStats>(
    'SELECT avg_volume, competition_score, trend, recommendation FROM research_keywords WHERE niche_id = $1',
    [nicheId]
  );

  if (keywords.length === 0) {
    log.warn(`No keywords found for niche ${nicheId} ("${niche.niche_name}") — skipping score`);
    return;
  }

  // ── Demand Score (0–100) ────────────────────────────────────────────────────
  // Based on weighted avg of keyword volumes. 50,000 searches = score 100.
  const avgVolume = keywords.reduce((s: number, k: KeywordStats) => s + (k.avg_volume || 0), 0) / keywords.length;
  const demandScore = clamp(Math.round((avgVolume / 50000) * 100));

  // ── Opportunity Score (0–100) ───────────────────────────────────────────────
  // Inverse of competition: low competition = high opportunity
  const avgComp = keywords.reduce((s: number, k: KeywordStats) => s + (k.competition_score || 50), 0) / keywords.length;
  const opportunityScore = clamp(Math.round(100 - avgComp));

  // ── Trend Score (0–100) ─────────────────────────────────────────────────────
  const risingCount = keywords.filter((k: KeywordStats) => k.trend === 'rising').length;
  const decliningCount = keywords.filter((k: KeywordStats) => k.trend === 'declining').length;
  const trendRatio = (risingCount - decliningCount) / keywords.length;
  const trendScore = clamp(Math.round(50 + trendRatio * 50));

  // ── Profitability Score (0–100) ─────────────────────────────────────────────
  let profitabilityScore = 50;
  const midPrice = ((niche.price_range_min || 10) + (niche.price_range_max || 30)) / 2;

  if (midPrice >= 50) profitabilityScore = 85;
  else if (midPrice >= 30) profitabilityScore = 70;
  else if (midPrice >= 15) profitabilityScore = 55;
  else profitabilityScore = 35;

  // Digital products bonus
  if (niche.product_type === 'digital') profitabilityScore = clamp(profitabilityScore + 20);

  // ── Composite Score ─────────────────────────────────────────────────────────
  const nicheScore = clamp(Math.round(
    demandScore * 0.35 +
    opportunityScore * 0.25 +
    trendScore * 0.20 +
    profitabilityScore * 0.20
  ));

  // ── Recommendation ──────────────────────────────────────────────────────────
  let recommendation: string;
  if (nicheScore > 80) recommendation = 'excellent';
  else if (nicheScore > 60) recommendation = 'good';
  else if (nicheScore > 40) recommendation = 'medium';
  else recommendation = 'avoid';

  // Persist
  await query(`
    UPDATE research_niches SET
      niche_score = $1,
      demand_score = $2,
      opportunity_score = $3,
      trend_score = $4,
      profitability_score = $5,
      recommendation = $6,
      last_validated_at = NOW(),
      updated_at = NOW()
    WHERE id = $7
  `, [nicheScore, demandScore, opportunityScore, trendScore, profitabilityScore, recommendation, nicheId]);

  log.info(`Niche "${niche.niche_name}" scored: ${nicheScore} (demand:${demandScore} opp:${opportunityScore} trend:${trendScore} profit:${profitabilityScore}) → ${recommendation}`);
}

export async function scoreAllUnscored(): Promise<void> {
  const niches = await query<{ id: number; niche_name: string }>(
    "SELECT id, niche_name FROM research_niches WHERE is_active = true AND (niche_score = 0 OR last_validated_at < NOW() - INTERVAL '12 hours')"
  );

  log.info(`Scoring ${niches.length} niches...`);

  for (const niche of niches) {
    try {
      await scoreNiche(niche.id);
    } catch (err: any) {
      log.error(`Failed to score niche ${niche.id} "${niche.niche_name}": ${err.message}`);
    }
  }

  log.info('Niche scoring complete');
}
