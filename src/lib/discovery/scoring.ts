/**
 * Reaction Opportunity Score — transparent, aufschlüsselbar.
 * Alle Sub-Scores 0-100. Gesamt = gewichtete Summe (max 100), plus optionale
 * Feedback-Modifikatoren aus den bisherigen 👍/👎-Bewertungen des Nutzers.
 */

export type ScoreInput = {
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  published_at: string | null;
  ai_confidence: number | null; // 0..1
  language: string | null;
  channel_affinity?: number | null; // -1..+1 (aus channel_preferences), null = unbekannt
  user_feedback?: "relevant" | "neutral" | "not_relevant" | null;
};

export type ScoreBreakdown = {
  reach: number;
  growth: number;
  recency: number;
  engagement: number;
  confidence: number;
  language: number;
  channel: number;
  feedbackAdjustment: number; // additive Modifikator (-100..+25)
  weights: {
    reach: number;
    growth: number;
    recency: number;
    engagement: number;
    confidence: number;
    language: number;
    channel: number;
  };
};

export type ScoreResult = {
  score: number;
  breakdown: ScoreBreakdown;
};

const WEIGHTS = {
  reach: 0.25,
  growth: 0.2,
  recency: 0.1,
  engagement: 0.1,
  confidence: 0.1,
  language: 0.1,
  channel: 0.15,
};

export function computeOpportunityScore(input: ScoreInput): ScoreResult {
  const views = Math.max(0, input.view_count ?? 0);
  const likes = Math.max(0, input.like_count ?? 0);
  const comments = Math.max(0, input.comment_count ?? 0);
  const hoursSince = input.published_at
    ? Math.max(1, (Date.now() - new Date(input.published_at).getTime()) / 3_600_000)
    : 24 * 30;

  const reach = Math.min(100, (Math.log10(views + 1) / 7) * 100);
  const perHour = views / hoursSince;
  const growth = Math.min(100, (perHour / 500) * 100);
  const recency =
    hoursSince <= 24
      ? 100
      : Math.max(0, 100 - ((hoursSince - 24) / (7 * 24 - 24)) * 100);
  const engagement =
    views > 0 ? Math.min(100, ((likes + comments) / views) * 2000) : 0;
  const confidence = Math.round(Math.max(0, Math.min(1, input.ai_confidence ?? 0)) * 100);

  // Deutschsprachige Videos werden stark bevorzugt (Chris reagiert auf Deutsch).
  const lang = (input.language ?? "").toLowerCase();
  const language = lang.startsWith("de") ? 100 : lang === "" ? 55 : 20;

  // Kanal-Affinität aus vergangenem Feedback (-1..+1). Unbekannt = neutral (50).
  const aff = input.channel_affinity;
  const channel = aff == null ? 50 : Math.round(((aff + 1) / 2) * 100);

  const weighted =
    reach * WEIGHTS.reach +
    growth * WEIGHTS.growth +
    recency * WEIGHTS.recency +
    engagement * WEIGHTS.engagement +
    confidence * WEIGHTS.confidence +
    language * WEIGHTS.language +
    channel * WEIGHTS.channel;

  // Direktes Feedback auf DIESES Video schlägt alles.
  let feedbackAdjustment = 0;
  if (input.user_feedback === "relevant") feedbackAdjustment = 20;
  else if (input.user_feedback === "not_relevant") feedbackAdjustment = -100;

  const finalScore = Math.max(0, Math.min(100, Math.round(weighted + feedbackAdjustment)));

  return {
    score: finalScore,
    breakdown: {
      reach: Math.round(reach),
      growth: Math.round(growth),
      recency: Math.round(recency),
      engagement: Math.round(engagement),
      confidence,
      language,
      channel,
      feedbackAdjustment,
      weights: WEIGHTS,
    },
  };
}
