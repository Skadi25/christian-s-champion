/**
 * Reaction Opportunity Score.
 *
 * WICHTIG: Der dominante Faktor ist die STANCE des Videos.
 *  - "promotes":  vertritt/verbreitet die Falschaussage aktiv          → sehr hoch
 *  - "mentions":  erwähnt sie neutral / spricht darüber ohne zu werten → mittel
 *  - "debunks":   widerlegt sie bereits selbst                         → sehr niedrig
 *  - "unrelated": geht gar nicht darum                                 → 0
 *
 * Reichweite/Growth/Engagement modulieren nur noch OBEN DRAUF — ein virales
 * Debunk-Video bleibt niedrig, ein kleines Promoter-Video kann trotzdem hoch
 * ranken, wenn seine Reichweite passt.
 *
 * Zusätzlich fließen die aus Nutzer-Feedback gelernten Affinitäten ein
 * (Kanal-Affinität + globale Stance-Affinität dieses Nutzers).
 */

export type Stance = "promotes" | "mentions" | "debunks" | "unrelated";

export type ScoreInput = {
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  published_at: string | null;
  ai_confidence: number | null; // 0..1
  language: string | null;
  stance: Stance | null;
  channel_affinity?: number | null; // -1..+1
  stance_affinity?: number | null; // -1..+1  (aus stance_preferences des Nutzers)
  user_feedback?: "relevant" | "neutral" | "not_relevant" | null;
};

export type ScoreBreakdown = {
  stance: number;
  reach: number;
  growth: number;
  recency: number;
  engagement: number;
  confidence: number;
  language: number;
  channel: number;
  stanceAffinity: number;
  feedbackAdjustment: number;
  weights: Record<string, number>;
  stanceLabel: Stance | null;
};

export type ScoreResult = { score: number; breakdown: ScoreBreakdown };

const WEIGHTS = {
  stance: 0.45,
  reach: 0.15,
  growth: 0.08,
  recency: 0.07,
  engagement: 0.05,
  confidence: 0.05,
  language: 0.05,
  channel: 0.05,
  stanceAffinity: 0.05,
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
  const recency = hoursSince <= 24 ? 100 : Math.max(0, 100 - ((hoursSince - 24) / (7 * 24 - 24)) * 100);
  const engagement = views > 0 ? Math.min(100, ((likes + comments) / views) * 2000) : 0;
  const confidence = Math.round(Math.max(0, Math.min(1, input.ai_confidence ?? 0)) * 100);

  const lang = (input.language ?? "").toLowerCase();
  const language = lang.startsWith("de") ? 100 : lang === "" ? 55 : 20;

  const chAff = input.channel_affinity;
  const channel = chAff == null ? 50 : Math.round(((chAff + 1) / 2) * 100);

  const stanceKey: Stance = input.stance ?? "unrelated";
  const stance = STANCE_BASE[stanceKey];

  const stAff = input.stance_affinity;
  const stanceAffinity = stAff == null ? 50 : Math.round(((stAff + 1) / 2) * 100);

  const weighted =
    stance * WEIGHTS.stance +
    reach * WEIGHTS.reach +
    growth * WEIGHTS.growth +
    recency * WEIGHTS.recency +
    engagement * WEIGHTS.engagement +
    confidence * WEIGHTS.confidence +
    language * WEIGHTS.language +
    channel * WEIGHTS.channel +
    stanceAffinity * WEIGHTS.stanceAffinity;

  let feedbackAdjustment = 0;
  if (input.user_feedback === "relevant") feedbackAdjustment = 20;
  else if (input.user_feedback === "not_relevant") feedbackAdjustment = -100;

  // Hard cap: Debunks & unrelated dürfen niemals hoch scoren, egal wie viral.
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
      recency: Math.round(recency),
      engagement: Math.round(engagement),
      confidence,
      language,
      channel,
      stanceAffinity,
      feedbackAdjustment,
      weights: WEIGHTS,
      stanceLabel: input.stance ?? null,
    },
  };
}
