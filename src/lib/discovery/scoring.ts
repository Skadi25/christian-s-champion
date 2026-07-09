/**
 * Reaction Opportunity Score — transparent, aufschlüsselbar.
 * Alle Sub-Scores 0-100. Gesamt = gewichtete Summe (max 100).
 */

export type ScoreInput = {
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  published_at: string | null;
  ai_confidence: number | null; // 0..1
};

export type ScoreBreakdown = {
  reach: number;
  growth: number;
  recency: number;
  engagement: number;
  confidence: number;
  weights: { reach: number; growth: number; recency: number; engagement: number; confidence: number };
};

export type ScoreResult = {
  score: number;
  breakdown: ScoreBreakdown;
};

const WEIGHTS = {
  reach: 0.35,
  growth: 0.25,
  recency: 0.15,
  engagement: 0.15,
  confidence: 0.1,
};

export function computeOpportunityScore(input: ScoreInput): ScoreResult {
  const views = Math.max(0, input.view_count ?? 0);
  const likes = Math.max(0, input.like_count ?? 0);
  const comments = Math.max(0, input.comment_count ?? 0);
  const hoursSince = input.published_at
    ? Math.max(1, (Date.now() - new Date(input.published_at).getTime()) / 3_600_000)
    : 24 * 30;

  // reach: log-normalized to 10M views == 100
  const reach = Math.min(100, (Math.log10(views + 1) / 7) * 100);

  // growth: views/hour. 500/h ≈ 100. Fresh viral videos get boosted.
  const perHour = views / hoursSince;
  const growth = Math.min(100, (perHour / 500) * 100);

  // recency: full points <24h, linear falloff to 0 at 7 days
  const recency =
    hoursSince <= 24
      ? 100
      : Math.max(0, 100 - ((hoursSince - 24) / (7 * 24 - 24)) * 100);

  // engagement rate: (likes + comments) / views. 5% ≈ 100.
  const engagement =
    views > 0 ? Math.min(100, ((likes + comments) / views) * 2000) : 0;

  const confidence = Math.round(Math.max(0, Math.min(1, input.ai_confidence ?? 0)) * 100);

  const weighted =
    reach * WEIGHTS.reach +
    growth * WEIGHTS.growth +
    recency * WEIGHTS.recency +
    engagement * WEIGHTS.engagement +
    confidence * WEIGHTS.confidence;

  return {
    score: Math.round(weighted),
    breakdown: {
      reach: Math.round(reach),
      growth: Math.round(growth),
      recency: Math.round(recency),
      engagement: Math.round(engagement),
      confidence,
      weights: WEIGHTS,
    },
  };
}
