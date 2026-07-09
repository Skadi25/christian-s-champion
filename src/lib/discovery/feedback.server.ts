import { computeOpportunityScore, type Stance } from "./scoring";

type Rating = "relevant" | "neutral" | "not_relevant";

/**
 * Record explicit user feedback on a video match and let the system learn:
 *  - Update the match itself (feedback + re-score + moved bucket)
 *  - Update per-channel affinity  (channel_preferences)
 *  - Update per-stance affinity   (stance_preferences)  ← global taste signal
 */
export async function submitFeedbackForUser(userId: string, matchId: string, rating: Rating) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: match, error: loadErr } = await supabaseAdmin
    .from("video_matches")
    .select(
      "id, user_id, user_feedback, ai_confidence, stance, video:videos(id, channel_id, channel_name, view_count, like_count, comment_count, published_at, language)",
    )
    .eq("id", matchId)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  if (!match) throw new Error("Video-Match nicht gefunden.");
  if (match.user_id !== userId) throw new Error("Keine Berechtigung.");

  const previous = (match.user_feedback as Rating | null) ?? null;
  const stance = (match.stance as Stance | null) ?? null;
  const video = match.video as {
    id: string;
    channel_id: string | null;
    channel_name: string | null;
    view_count: number | null;
    like_count: number | null;
    comment_count: number | null;
    published_at: string | null;
    language: string | null;
  } | null;

  // Helper to update a counts row and return new affinity
  async function bumpCounts(
    table: "channel_preferences" | "stance_preferences",
    match: Record<string, unknown>,
    extra: Record<string, unknown>,
  ): Promise<number> {
    const q = supabaseAdmin
      .from(table)
      .select("positive_count, negative_count, neutral_count")
      .eq("user_id", userId);
    for (const [k, v] of Object.entries(match)) q.eq(k, v as never);
    const { data: existing } = await q.maybeSingle();
    let pos = existing?.positive_count ?? 0;
    let neg = existing?.negative_count ?? 0;
    let neu = existing?.neutral_count ?? 0;
    if (previous === "relevant") pos = Math.max(0, pos - 1);
    else if (previous === "not_relevant") neg = Math.max(0, neg - 1);
    else if (previous === "neutral") neu = Math.max(0, neu - 1);
    if (rating === "relevant") pos += 1;
    else if (rating === "not_relevant") neg += 1;
    else neu += 1;
    const total = pos + neg + neu;
    const affinity = total > 0 ? (pos - neg) / total : 0;
    await supabaseAdmin
      .from(table)
      .upsert(
        {
          user_id: userId,
          positive_count: pos,
          negative_count: neg,
          neutral_count: neu,
          affinity,
          ...match,
          ...extra,
        },
        { onConflict: table === "channel_preferences" ? "user_id,platform,channel_id" : "user_id,stance" },
      );
    return affinity;
  }

  // 1. Channel affinity
  let newChannelAffinity: number | null = null;
  if (video?.channel_id) {
    newChannelAffinity = await bumpCounts(
      "channel_preferences",
      { platform: "youtube", channel_id: video.channel_id },
      { channel_name: video.channel_name },
    );
  }

  // 2. Stance affinity (global — this is how the system "learns you don't like debunks")
  let newStanceAffinity: number | null = null;
  if (stance) {
    newStanceAffinity = await bumpCounts("stance_preferences", { stance }, {});
  }

  // 3. Re-score this match
  const r = video
    ? computeOpportunityScore({
        view_count: video.view_count,
        like_count: video.like_count,
        comment_count: video.comment_count,
        published_at: video.published_at,
        ai_confidence: (match.ai_confidence as number | null) ?? null,
        language: video.language,
        stance,
        channel_affinity: newChannelAffinity,
        stance_affinity: newStanceAffinity,
        user_feedback: rating,
      })
    : null;

  const newStatus = rating === "not_relevant" ? "rejected" : "new";

  const { error: updErr } = await supabaseAdmin
    .from("video_matches")
    .update({
      user_feedback: rating,
      feedback_at: new Date().toISOString(),
      status: newStatus,
      opportunity_score: r?.score ?? null,
      score_breakdown: (r?.breakdown ?? null) as never,
    })
    .eq("id", matchId);
  if (updErr) throw new Error(updErr.message);

  // 4. Propagate the new channel/stance affinity to sibling pending matches
  const { data: siblings } = await supabaseAdmin
    .from("video_matches")
    .select(
      "id, ai_confidence, user_feedback, stance, video:videos!inner(view_count, like_count, comment_count, published_at, language, channel_id)",
    )
    .eq("user_id", userId)
    .neq("id", matchId)
    .limit(500);

  for (const s of siblings ?? []) {
    const sv = s.video as {
      view_count: number | null;
      like_count: number | null;
      comment_count: number | null;
      published_at: string | null;
      language: string | null;
      channel_id: string | null;
    } | null;
    if (!sv) continue;
    const sStance = (s.stance as Stance | null) ?? null;
    const chAff =
      sv.channel_id === video?.channel_id ? newChannelAffinity ?? null : null;
    const stAff = sStance && sStance === stance ? newStanceAffinity ?? null : null;
    // Only recompute if either affinity applies to this sibling
    if (chAff == null && stAff == null) continue;

    const sr = computeOpportunityScore({
      view_count: sv.view_count,
      like_count: sv.like_count,
      comment_count: sv.comment_count,
      published_at: sv.published_at,
      ai_confidence: (s.ai_confidence as number | null) ?? null,
      language: sv.language,
      stance: sStance,
      channel_affinity: chAff,
      stance_affinity: stAff,
      user_feedback: (s.user_feedback as Rating | null) ?? null,
    });
    await supabaseAdmin
      .from("video_matches")
      .update({ opportunity_score: sr.score, score_breakdown: sr.breakdown as never })
      .eq("id", s.id);
  }

  return {
    ok: true,
    channel_affinity: newChannelAffinity,
    stance_affinity: newStanceAffinity,
  };
}
