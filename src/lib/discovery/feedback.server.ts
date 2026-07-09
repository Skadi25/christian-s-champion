import { computeOpportunityScore } from "./scoring";

type Rating = "relevant" | "neutral" | "not_relevant";

/**
 * Record explicit user feedback on a video match and let the system learn:
 *  - Update the match itself (feedback + adjusted score + moved bucket)
 *  - Update per-channel affinity so future scoring/ranking reflects the taste
 */
export async function submitFeedbackForUser(userId: string, matchId: string, rating: Rating) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Load the match with its video
  const { data: match, error: loadErr } = await supabaseAdmin
    .from("video_matches")
    .select(
      "id, user_id, user_feedback, ai_confidence, video:videos(id, channel_id, channel_name, view_count, like_count, comment_count, published_at, language)",
    )
    .eq("id", matchId)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  if (!match) throw new Error("Video-Match nicht gefunden.");
  if (match.user_id !== userId) throw new Error("Keine Berechtigung.");

  const previous = (match.user_feedback as Rating | null) ?? null;
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

  // 2. Update channel_preferences (delta: undo previous, apply new)
  let newAffinity = 0;
  if (video?.channel_id) {
    const { data: existing } = await supabaseAdmin
      .from("channel_preferences")
      .select("id, positive_count, negative_count, neutral_count")
      .eq("user_id", userId)
      .eq("platform", "youtube")
      .eq("channel_id", video.channel_id)
      .maybeSingle();

    let pos = existing?.positive_count ?? 0;
    let neg = existing?.negative_count ?? 0;
    let neu = existing?.neutral_count ?? 0;

    // Undo previous
    if (previous === "relevant") pos = Math.max(0, pos - 1);
    else if (previous === "not_relevant") neg = Math.max(0, neg - 1);
    else if (previous === "neutral") neu = Math.max(0, neu - 1);

    // Apply new
    if (rating === "relevant") pos += 1;
    else if (rating === "not_relevant") neg += 1;
    else neu += 1;

    const total = pos + neg + neu;
    newAffinity = total > 0 ? (pos - neg) / total : 0;

    await supabaseAdmin.from("channel_preferences").upsert(
      {
        user_id: userId,
        platform: "youtube",
        channel_id: video.channel_id,
        channel_name: video.channel_name,
        positive_count: pos,
        negative_count: neg,
        neutral_count: neu,
        affinity: newAffinity,
      },
      { onConflict: "user_id,platform,channel_id" },
    );
  }

  // 3. Recompute this match's score with the new signals
  const r = video
    ? computeOpportunityScore({
        view_count: video.view_count,
        like_count: video.like_count,
        comment_count: video.comment_count,
        published_at: video.published_at,
        ai_confidence: (match.ai_confidence as number | null) ?? null,
        language: video.language,
        channel_affinity: video.channel_id ? newAffinity : null,
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

  // 4. Optionally propagate affinity change to other pending matches from the same channel
  if (video?.channel_id) {
    const { data: siblings } = await supabaseAdmin
      .from("video_matches")
      .select(
        "id, ai_confidence, user_feedback, video:videos!inner(view_count, like_count, comment_count, published_at, language, channel_id)",
      )
      .eq("user_id", userId)
      .neq("id", matchId)
      .limit(200);

    for (const s of siblings ?? []) {
      const sv = s.video as {
        view_count: number | null;
        like_count: number | null;
        comment_count: number | null;
        published_at: string | null;
        language: string | null;
        channel_id: string | null;
      } | null;
      if (!sv || sv.channel_id !== video.channel_id) continue;
      const sr = computeOpportunityScore({
        view_count: sv.view_count,
        like_count: sv.like_count,
        comment_count: sv.comment_count,
        published_at: sv.published_at,
        ai_confidence: (s.ai_confidence as number | null) ?? null,
        language: sv.language,
        channel_affinity: newAffinity,
        user_feedback: (s.user_feedback as Rating | null) ?? null,
      });
      await supabaseAdmin
        .from("video_matches")
        .update({ opportunity_score: sr.score, score_breakdown: sr.breakdown as never })
        .eq("id", s.id);
    }
  }

  return { ok: true, affinity: newAffinity };
}
