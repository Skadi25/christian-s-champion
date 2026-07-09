import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Discovery pipeline — orchestrated server-side.
 * Reads user's claims -> searches YouTube -> classifies with AI -> stores matches.
 * All helpers are imported (never sibling functions in this file) so the
 * server-fn split transform keeps them.
 */

export const runDiscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runDiscoveryForUser } = await import("./discovery/pipeline.server");
    return runDiscoveryForUser(context.userId);
  });

export const getDiscoveryFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: matches, error } = await supabase
      .from("video_matches")
      .select(
        "id, opportunity_score, score_breakdown, detected_claim, ai_summary, ai_reasoning, ai_confidence, matched_at, status, video:videos(id, platform, external_id, url, title, channel_name, thumbnail_url, view_count, like_count, comment_count, published_at, duration_seconds), topic:topics(id, name), claim:claims(id, text)",
      )
      .eq("user_id", userId)
      .order("opportunity_score", { ascending: false, nullsFirst: false })
      .limit(50);

    if (error) throw new Error(error.message);

    const { data: lastRun } = await supabase
      .from("discovery_runs")
      .select("id, started_at, finished_at, status, videos_scanned, videos_matched, error")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return { matches: matches ?? [], lastRun: lastRun ?? null };
  });
