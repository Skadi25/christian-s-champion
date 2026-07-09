import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Discovery + Latest + Trends + Watchlist server functions.
 * All heavy helpers live in imported .server.ts modules so the
 * server-fn split transform keeps sibling references intact.
 */

export const runDiscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runDiscoveryForUser } = await import("./discovery/pipeline.server");
    return runDiscoveryForUser(context.userId);
  });

const feedSelect =
  "id, opportunity_score, score_breakdown, detected_claim, ai_summary, ai_reasoning, ai_confidence, stance, matched_at, status, user_feedback, video:videos(id, platform, external_id, url, title, channel_name, channel_id, thumbnail_url, view_count, like_count, comment_count, published_at, duration_seconds, language), topic:topics(id, name), claim:claims(id, text)";

export const getDiscoveryFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: matches, error: mErr }, { data: rejected, error: rErr }] =
      await Promise.all([
        supabase
          .from("video_matches")
          .select(feedSelect)
          .eq("user_id", userId)
          .eq("status", "new")
          .order("opportunity_score", { ascending: false, nullsFirst: false })
          .limit(100),
        supabase
          .from("video_matches")
          .select(feedSelect)
          .eq("user_id", userId)
          .eq("status", "rejected")
          .order("ai_confidence", { ascending: false, nullsFirst: false })
          .limit(100),
      ]);

    if (mErr) throw new Error(mErr.message);
    if (rErr) throw new Error(rErr.message);

    const { data: lastRun } = await supabase
      .from("discovery_runs")
      .select("id, started_at, finished_at, status, videos_scanned, videos_matched, error")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      matches: matches ?? [],
      rejected: rejected ?? [],
      lastRun: lastRun ?? null,
    };
  });

const FeedbackInput = z.object({
  matchId: z.string().uuid(),
  rating: z.enum(["relevant", "neutral", "not_relevant"]),
});

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => FeedbackInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { submitFeedbackForUser } = await import("./discovery/feedback.server");
    return submitFeedbackForUser(context.userId, data.matchId, data.rating);
  });

// ── Pipeline-Trace des letzten Runs ──────────────────────────────────
export const getLastRunTrace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: run } = await supabase
      .from("discovery_runs")
      .select("id, started_at, finished_at, status, error, videos_scanned, videos_matched")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!run) return { run: null, stages: [] };
    const { data: stages } = await supabase
      .from("discovery_run_stages")
      .select("stage_index, stage_name, input_count, output_count, meta")
      .eq("run_id", run.id)
      .order("stage_index", { ascending: true });
    return { run, stages: stages ?? [] };
  });

// ── Neueste Videos (rein chronologisch) ──────────────────────────────
const LatestInput = z.object({
  windowHours: z.number().int().min(1).max(24 * 90).default(24),
});

export const getLatestVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => LatestInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cutoff = new Date(Date.now() - data.windowHours * 3_600_000).toISOString();
    const { data: rows, error } = await supabase
      .from("video_matches")
      .select(feedSelect)
      .eq("user_id", userId)
      .gte("video.published_at", cutoff)
      .order("matched_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    // Client-seitig nach published_at sortieren (Supabase kann nested nicht ordnen).
    const list = (rows ?? []).filter((r) => r.video?.published_at);
    list.sort(
      (a, b) =>
        new Date(b.video!.published_at!).getTime() - new Date(a.video!.published_at!).getTime(),
    );
    return { items: list };
  });

// ── Trends (Wachstum) ────────────────────────────────────────────────
export const getTrendingVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getTrendingForUser } = await import("./discovery/trending.server");
    return getTrendingForUser(context.userId);
  });

// ── Watchlist ────────────────────────────────────────────────────────
export const getWatchlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("watchlist_items")
      .select("id, kind, platform, external_id, label, thumbnail_url, url, last_checked_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

const AddWatchInput = z.object({
  kind: z.enum(["channel", "video"]),
  platform: z.enum(["youtube", "tiktok", "instagram", "facebook", "x", "threads"]).default("youtube"),
  identifier: z.string().min(1),
  label: z.string().optional(),
});

export const addToWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AddWatchInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { addToWatchlistForUser } = await import("./discovery/watchlist.server");
    return addToWatchlistForUser(context.userId, data);
  });

const RemoveWatchInput = z.object({ id: z.string().uuid() });

export const removeFromWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RemoveWatchInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("watchlist_items")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
