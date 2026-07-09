import { getPlatformAdapter } from "@/lib/platforms/registry.server";
import type { PlatformVideo } from "@/lib/platforms/types";
import { chatJson, AIGatewayError } from "@/lib/ai/gateway.server";
import { computeOpportunityScore } from "./scoring";

type Claim = {
  id: string;
  text: string;
  why_problematic: string | null;
  topic_id: string | null;
  topic_name: string | null;
};

const MAX_CLAIMS_PER_RUN = 25;
const MAX_VIDEOS_PER_CLAIM = 50; // YouTube API max per call
const MAX_CLASSIFICATIONS = 150;
const LOOKBACK_DAYS = 30;
const MIN_MATCH_CONFIDENCE = 0.5;

export async function runDiscoveryForUser(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Start run log
  const { data: run, error: runErr } = await supabaseAdmin
    .from("discovery_runs")
    .insert({ user_id: userId, status: "running" })
    .select("id")
    .single();
  if (runErr || !run) throw new Error(runErr?.message ?? "Konnte Discovery-Run nicht starten.");
  const runId = run.id as string;

  try {
    // 2. Load active claims + topic names
    const { data: claimsRaw, error: claimsErr } = await supabaseAdmin
      .from("claims")
      .select("id, text, why_problematic, topic_id, topics!inner(id, name, is_active)")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(MAX_CLAIMS_PER_RUN);
    if (claimsErr) throw new Error(claimsErr.message);

    const claims: Claim[] = (claimsRaw ?? [])
      .filter((c: { topics: { is_active: boolean } | null }) => c.topics?.is_active !== false)
      .map((c: { id: string; text: string; why_problematic: string | null; topic_id: string | null; topics: { name: string } | null }) => ({
        id: c.id,
        text: c.text,
        why_problematic: c.why_problematic,
        topic_id: c.topic_id,
        topic_name: c.topics?.name ?? null,
      }));

    if (claims.length === 0) {
      await supabaseAdmin
        .from("discovery_runs")
        .update({
          status: "empty",
          finished_at: new Date().toISOString(),
          error: "Keine aktiven Claims. Lege im Themen-Editor Falschaussagen an.",
        })
        .eq("id", runId);
      return { runId, scanned: 0, matched: 0, note: "no_claims" as const };
    }

    // 3. Fetch videos per claim (YouTube for now — architecture is platform-agnostic)
    const adapter = getPlatformAdapter("youtube");
    const publishedAfter = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3_600_000).toISOString();

    type CandidateVideo = { video: PlatformVideo; claim: Claim };
    const candidates: CandidateVideo[] = [];
    const seen = new Set<string>();

    for (const claim of claims) {
      try {
        const videos = await adapter.search({
          query: claim.text,
          maxResults: MAX_VIDEOS_PER_CLAIM,
          publishedAfter,
          language: "de",
          region: "DE",
        });
        for (const v of videos) {
          const key = `${v.platform}:${v.external_id}:${claim.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({ video: v, claim });
          if (candidates.length >= MAX_CLASSIFICATIONS) break;
        }
      } catch (e) {
        console.warn(`[discovery] Suche fehlgeschlagen für Claim "${claim.text}":`, e);
      }
      if (candidates.length >= MAX_CLASSIFICATIONS) break;
    }

    // 4. Upsert unique videos
    const uniqueVideosMap = new Map<string, PlatformVideo>();
    for (const c of candidates) {
      uniqueVideosMap.set(`${c.video.platform}:${c.video.external_id}`, c.video);
    }
    const uniqueVideos = [...uniqueVideosMap.values()];

    const videoIdByExternal = new Map<string, string>();
    if (uniqueVideos.length > 0) {
      const { data: upserted, error: upErr } = await supabaseAdmin
        .from("videos")
        .upsert(
          uniqueVideos.map((v) => ({
            platform: v.platform,
            external_id: v.external_id,
            url: v.url,
            title: v.title,
            description: v.description,
            channel_name: v.channel_name,
            channel_id: v.channel_id,
            thumbnail_url: v.thumbnail_url,
            published_at: v.published_at,
            view_count: v.view_count,
            like_count: v.like_count,
            comment_count: v.comment_count,
            duration_seconds: v.duration_seconds,
            language: v.language,
            raw_metadata: v.raw_metadata as never,
            fetched_at: new Date().toISOString(),
          })),
          { onConflict: "platform,external_id" },
        )
        .select("id, platform, external_id");
      if (upErr) throw new Error(`Video-Upsert fehlgeschlagen: ${upErr.message}`);
      for (const v of upserted ?? []) {
        videoIdByExternal.set(`${v.platform}:${v.external_id}`, v.id);
      }
    }

    // 5. Classify each candidate with AI (parallel with concurrency cap)
    // We ALWAYS store the classification (matches + rejects) so the user can
    // see which videos were checked and why they were dismissed.
    const CONCURRENCY = 8;
    let matched = 0;
    let rejected = 0;
    let aiErrors = 0;
    const queue = [...candidates];

    async function classifyAndStore(cand: CandidateVideo) {
      const videoDbId = videoIdByExternal.get(`${cand.video.platform}:${cand.video.external_id}`);
      if (!videoDbId) return;

      let ai: {
        matches: boolean;
        confidence: number;
        summary: string;
        reasoning: string;
      };
      try {
        ai = await chatJson<typeof ai>({
          system:
            "Du bist ein Faktenchecker. Prüfe, ob das folgende Video die genannte Falschaussage aufstellt, verteidigt oder bewirbt (nicht: widerlegt). Antworte STRICT als JSON mit den Feldern matches (boolean, true nur wenn das Video die Falschaussage AKTIV vertritt), confidence (0-1), summary (kurzer deutscher Satz, was das Video sagt), reasoning (1-2 Sätze deutsch, warum es (nicht) matched).",
          user: JSON.stringify({
            falschaussage: cand.claim.text,
            warum_problematisch: cand.claim.why_problematic ?? undefined,
            video_titel: cand.video.title,
            video_beschreibung: (cand.video.description ?? "").slice(0, 1200),
            kanal: cand.video.channel_name ?? undefined,
          }),
          temperature: 0.1,
        });
      } catch (e) {
        if (e instanceof AIGatewayError && e.status === 402) throw e; // bubble up: stop run
        console.warn("[discovery] AI-Klassifizierung fehlgeschlagen:", e);
        aiErrors++;
        return;
      }

      const isMatch = ai.matches && ai.confidence >= MIN_MATCH_CONFIDENCE;

      let score: number | null = null;
      let breakdown: unknown = null;
      if (isMatch) {
        const r = computeOpportunityScore({
          view_count: cand.video.view_count,
          like_count: cand.video.like_count,
          comment_count: cand.video.comment_count,
          published_at: cand.video.published_at,
          ai_confidence: ai.confidence,
        });
        score = r.score;
        breakdown = r.breakdown;
      }

      const { error: mErr } = await supabaseAdmin.from("video_matches").upsert(
        {
          user_id: userId,
          video_id: videoDbId,
          topic_id: cand.claim.topic_id,
          claim_id: cand.claim.id,
          detected_claim: cand.claim.text,
          opportunity_score: score,
          score_breakdown: breakdown as never,
          ai_confidence: ai.confidence,
          ai_summary: ai.summary,
          ai_reasoning: ai.reasoning,
          matched_at: new Date().toISOString(),
          status: isMatch ? "new" : "rejected",
        },
        { onConflict: "user_id,video_id,claim_id" },
      );
      if (mErr) {
        console.warn("[discovery] Konnte Klassifizierung nicht speichern:", mErr);
        return;
      }
      if (isMatch) matched++;
      else rejected++;
    }

    // Simple concurrency runner
    const workers: Promise<void>[] = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      workers.push(
        (async () => {
          while (queue.length > 0) {
            const item = queue.shift();
            if (!item) return;
            await classifyAndStore(item);
          }
        })(),
      );
    }
    await Promise.all(workers);

    await supabaseAdmin
      .from("discovery_runs")
      .update({
        status: "done",
        finished_at: new Date().toISOString(),
        videos_scanned: candidates.length,
        videos_matched: matched,
      })
      .eq("id", runId);

    return {
      runId,
      scanned: candidates.length,
      matched,
      rejected,
      aiErrors,
      claimsUsed: claims.length,
      note: "ok" as const,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from("discovery_runs")
      .update({ status: "error", finished_at: new Date().toISOString(), error: msg })
      .eq("id", runId);
    throw e;
  }
}
