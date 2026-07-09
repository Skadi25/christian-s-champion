import { computeGrowthScore } from "./scoring";

/**
 * Trends — bevorzugt Wachstum statt Reichweite.
 * Nutzt die letzten Stats-Snapshots pro Video um ein Views-Delta zu bilden.
 * Kleine Videos mit schnellem Aufwärtstrend landen oben.
 */
export async function getTrendingForUser(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const since = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();
  const { data: matches, error } = await supabaseAdmin
    .from("video_matches")
    .select(
      "id, opportunity_score, stance, ai_summary, ai_confidence, status, user_feedback, video:videos!inner(id, platform, external_id, url, title, channel_name, channel_id, thumbnail_url, view_count, like_count, comment_count, published_at, duration_seconds, language), topic:topics(id, name)",
    )
    .eq("user_id", userId)
    .limit(1000);
  if (error) throw new Error(error.message);

  const videoIds = (matches ?? []).map((m) => m.video?.id).filter(Boolean) as string[];
  const snapshots = new Map<string, { captured_at: string; view_count: number | null }[]>();
  if (videoIds.length > 0) {
    const { data: snaps } = await supabaseAdmin
      .from("video_stats_snapshots")
      .select("video_id, captured_at, view_count")
      .in("video_id", videoIds)
      .order("captured_at", { ascending: false });
    for (const s of snaps ?? []) {
      const arr = snapshots.get(s.video_id) ?? [];
      arr.push({ captured_at: s.captured_at, view_count: s.view_count });
      snapshots.set(s.video_id, arr);
    }
  }

  const sinceMs = new Date(since).getTime();
  const scored = (matches ?? [])
    .filter((m) => m.video && m.video.published_at && new Date(m.video.published_at).getTime() >= sinceMs)
    .map((m) => {
      const v = m.video!;
      const snaps = snapshots.get(v.id) ?? [];
      let delta: number | null = null;
      let hours: number | null = null;
      if (snaps.length >= 2 && v.view_count != null) {
        const oldest = snaps[snaps.length - 1];
        if (oldest.view_count != null) {
          delta = v.view_count - oldest.view_count;
          hours = (Date.now() - new Date(oldest.captured_at).getTime()) / 3_600_000;
        }
      }
      const growth = computeGrowthScore({
        view_count: v.view_count,
        published_at: v.published_at,
        like_count: v.like_count,
        comment_count: v.comment_count,
        view_count_delta: delta,
        delta_hours: hours,
      });
      return { match: m, growth, delta, deltaHours: hours };
    })
    .filter((r) => r.match.stance !== "unrelated")
    .sort((a, b) => b.growth - a.growth)
    .slice(0, 100);

  return { items: scored };
}
