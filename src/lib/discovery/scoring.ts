/**
 * Reaction Opportunity Score.
 *
 * Stance dominates (~45%). Debunks are hard-capped, unrelated near zero.
 * Reach/growth/recency/engagement modulate on top. Learned signals
 * (channel affinity, stance affinity, per-claim stance affinity) tilt
 * the score toward the user's revealed preferences.
 */

export type Stance = "promotes" | "mentions" | "debunks" | "unrelated";

export type ScoreInput = {
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  published_at: string | null;
  ai_confidence: number | null;
  language: string | null;
  stance: Stance | null;
  channel_affinity?: number | null;
  stance_affinity?: number | null;
  claim_stance_affinity?: number | null;
  channel_subscriber_count?: number | null;
  user_feedback?: "relevant" | "neutral" | "not_relevant" | null;
};

export type ScoreBreakdown = {
  stance: number;
  reach: number;
  growth: number;
  virality: number;
  recency: number;
  engagement: number;
  confidence: number;
  language: number;
  channel: number;
  channelSize: number;
  stanceAffinity: number;
  claimStanceAffinity: number;
  feedbackAdjustment: number;
  weights: Record<string, number>;
  stanceLabel: Stance | null;
};

export type ScoreResult = { score: number; breakdown: ScoreBreakdown };

const WEIGHTS = {
  stance: 0.42,
  reach: 0.12,
  growth: 0.06,
  virality: 0.08,
  recency: 0.06,
  engagement: 0.05,
  confidence: 0.05,
  language: 0.05,
  channel: 0.04,
  channelSize: 0.02,
  stanceAffinity: 0.03,
  claimStanceAffinity: 0.02,
};

const STANCE_BASE: Record<Stance, number> = {
  promotes: 100,
  mentions: 45,
  debunks: 5,
  unrelated: 0,
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

  // Virality = views/hour rewarded logarithmically, so a small channel with
  // fast take-off beats an old giant. Peak at ~1000 v/h ⇒ 100.
  const virality = Math.min(100, (Math.log10(perHour + 1) / 3) * 100);

  const recency = hoursSince <= 24 ? 100 : Math.max(0, 100 - ((hoursSince - 24) / (7 * 24 - 24)) * 100);
  const engagement = views > 0 ? Math.min(100, ((likes + comments) / views) * 2000) : 0;
  const confidence = Math.round(Math.max(0, Math.min(1, input.ai_confidence ?? 0)) * 100);

  const lang = (input.language ?? "").toLowerCase();
  const language = lang.startsWith("de") ? 100 : lang === "" ? 55 : 20;

  const chAff = input.channel_affinity;
  const channel = chAff == null ? 50 : Math.round(((chAff + 1) / 2) * 100);

  // Channel size: small-but-viral gets a mild bonus, mega-channels are neutral.
  const subs = input.channel_subscriber_count;
  const channelSize =
    subs == null
      ? 50
      : subs < 10_000
        ? 75
        : subs < 100_000
          ? 65
          : subs < 1_000_000
            ? 55
            : 50;

  const stanceKey: Stance = input.stance ?? "unrelated";
  const stance = STANCE_BASE[stanceKey];

  const stAff = input.stance_affinity;
  const stanceAffinity = stAff == null ? 50 : Math.round(((stAff + 1) / 2) * 100);

  const claimStAff = input.claim_stance_affinity;
  const claimStanceAffinity = claimStAff == null ? 50 : Math.round(((claimStAff + 1) / 2) * 100);

  const weighted =
    stance * WEIGHTS.stance +
    reach * WEIGHTS.reach +
    growth * WEIGHTS.growth +
    virality * WEIGHTS.virality +
    recency * WEIGHTS.recency +
    engagement * WEIGHTS.engagement +
    confidence * WEIGHTS.confidence +
    language * WEIGHTS.language +
    channel * WEIGHTS.channel +
    channelSize * WEIGHTS.channelSize +
    stanceAffinity * WEIGHTS.stanceAffinity +
    claimStanceAffinity * WEIGHTS.claimStanceAffinity;

  let feedbackAdjustment = 0;
  if (input.user_feedback === "relevant") feedbackAdjustment = 20;
  else if (input.user_feedback === "not_relevant") feedbackAdjustment = -100;

  let raw = weighted + feedbackAdjustment;
  if (stanceKey === "debunks") raw = Math.min(raw, 25);
  if (stanceKey === "unrelated") raw = Math.min(raw, 10);

  const finalScore = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    score: finalScore,
    breakdown: {
      stance,
      reach: Math.round(reach),
      growth: Math.round(growth),
      virality: Math.round(virality),
      recency: Math.round(recency),
      engagement: Math.round(engagement),
      confidence,
      language,
      channel,
      channelSize,
      stanceAffinity,
      claimStanceAffinity,
      feedbackAdjustment,
      weights: WEIGHTS,
      stanceLabel: input.stance ?? null,
    },
  };
}

/** Growth score used by the Trends page (independent of stance/AI). */
export function computeGrowthScore(input: {
  view_count: number | null;
  published_at: string | null;
  like_count: number | null;
  comment_count: number | null;
  view_count_delta?: number | null;
  delta_hours?: number | null;
}): number {
  const views = Math.max(0, input.view_count ?? 0);
  const hoursSince = input.published_at
    ? Math.max(1, (Date.now() - new Date(input.published_at).getTime()) / 3_600_000)
    : 24 * 30;
  const perHour =
    input.view_count_delta != null && input.delta_hours && input.delta_hours > 0
      ? input.view_count_delta / input.delta_hours
      : views / hoursSince;
  const engagement =
    views > 0 ? Math.min(1, ((input.like_count ?? 0) + (input.comment_count ?? 0)) / views) : 0;
  const viralityLog = Math.min(1, Math.log10(perHour + 1) / 3);
  const recencyBoost = hoursSince <= 24 ? 1 : hoursSince <= 24 * 7 ? 0.75 : 0.4;
  return Math.round((viralityLog * 0.7 + engagement * 20 * 0.15 + recencyBoost * 0.15) * 100);
}
