import { getPlatformAdapter } from "@/lib/platforms/registry.server";
import { chatJson, AIGatewayError } from "@/lib/ai/gateway.server";
import { computeOpportunityScore, type Stance } from "./scoring";
import { RunTrace } from "./trace";
import { ensureQueryVariants, type ClaimForQueries } from "./queries";
import {
  dedupeCandidates,
  filterLanguage,
  filterTimeframe,
  prefilter,
  type Candidate,
} from "./stages";
import type { PlatformVideo } from "@/lib/platforms/types";

const MAX_CLAIMS_PER_RUN = 30;
const MAX_VIDEOS_PER_QUERY = 50;
const MAX_CANDIDATE_POOL = 10_000;
const MAX_CLASSIFICATIONS = 250;
const LOOKBACK_DAYS = 365; // 12 Monate

type ClaimRow = {
  id: string;
  text: string;
  why_problematic: string | null;
  topic_id: string | null;
  topic_name: string | null;
  query_variants: string[] | null;
};

export async function runDiscoveryForUser(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const trace = new RunTrace();

  const { data: run, error: runErr } = await supabaseAdmin
    .from("discovery_runs")
    .insert({ user_id: userId, status: "running" })
    .select("id")
    .single();
  if (runErr || !run) throw new Error(runErr?.message ?? "Konnte Discovery-Run nicht starten.");
  const runId = run.id as string;

  try {
    // ─── 0. Claims laden ─────────────────────────────────────────────
    const { data: claimsRaw, error: claimsErr } = await supabaseAdmin
      .from("claims")
      .select(
        "id, text, why_problematic, topic_id, query_variants, topics!inner(id, name, is_active)",
      )
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(MAX_CLAIMS_PER_RUN);
    if (claimsErr) throw new Error(claimsErr.message);

    const claims: ClaimRow[] = (claimsRaw ?? [])
      .filter((c: { topics: { is_active: boolean } | null }) => c.topics?.is_active !== false)
      .map((c: {
        id: string;
        text: string;
        why_problematic: string | null;
        topic_id: string | null;
        query_variants: unknown;
        topics: { name: string } | null;
      }) => ({
        id: c.id,
        text: c.text,
        why_problematic: c.why_problematic,
        topic_id: c.topic_id,
        topic_name: c.topics?.name ?? null,
        query_variants: Array.isArray(c.query_variants) ? (c.query_variants as string[]) : null,
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

    // ─── 1. Query-Varianten (Cache oder KI) ──────────────────────────
    const queriesByClaim = new Map<string, string[]>();
    for (const c of claims) {
      const claimForQ: ClaimForQueries = {
        id: c.id,
        text: c.text,
        why_problematic: c.why_problematic,
        topic_name: c.topic_name,
        query_variants: c.query_variants,
      };
      const variants = await ensureQueryVariants(claimForQ, async (v) => {
        await supabaseAdmin
          .from("claims")
          .update({
            query_variants: v as never,
            query_variants_generated_at: new Date().toISOString(),
          })
          .eq("id", c.id);
      });
      queriesByClaim.set(c.id, variants);
    }
    const totalQueries = [...queriesByClaim.values()].reduce((s, v) => s + v.length, 0);
    trace.record("generateQueries", claims.length, totalQueries, {
      queries_per_claim: [...queriesByClaim.entries()].map(([id, q]) => ({
        claim_id: id,
        count: q.length,
      })),
    });

    // ─── 2. Wide Sweep (YouTube) ─────────────────────────────────────
    const adapter = getPlatformAdapter("youtube");
    const publishedAfter = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3_600_000).toISOString();
    const queryHits: Array<{
      claim_id: string;
      query: string;
      hits: number;
      requests: import("@/lib/platforms/types").SearchDiagnostic[];
      error?: string;
    }> = [];
    const collected: Candidate[] = [];

    outer: for (const claim of claims) {
      const variants = queriesByClaim.get(claim.id) ?? [claim.text];
      for (const query of variants) {
        if (collected.length >= MAX_CANDIDATE_POOL) break outer;
        const debug: import("@/lib/platforms/types").SearchDiagnostic[] = [];
        try {
          const videos = await adapter.search({
            query,
            maxResults: MAX_VIDEOS_PER_QUERY,
            publishedAfter,
            language: "de",
            region: "DE",
            debug,
          });
          queryHits.push({ claim_id: claim.id, query, hits: videos.length, requests: debug });
          for (const v of videos) {
            collected.push({ video: v, claim, source_query: query });
            if (collected.length >= MAX_CANDIDATE_POOL) break;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          queryHits.push({ claim_id: claim.id, query, hits: 0, requests: debug, error: msg });
          console.warn(`[discovery] search failed "${query}":`, msg);
        }
      }
    }
    trace.record("fetchCandidates", totalQueries, collected.length, {
      pool_cap: MAX_CANDIDATE_POOL,
      published_after: publishedAfter,
      query_hits: queryHits,
    });

    // ─── 3. Dedupe → Zeitraum → Sprache ──────────────────────────────
    let candidates = dedupeCandidates(collected, trace);
    candidates = filterTimeframe(candidates, LOOKBACK_DAYS, trace);
    candidates = filterLanguage(candidates, trace);

    // ─── 4. Learned preferences laden ────────────────────────────────
    const [{ data: channelPrefs }, { data: stancePrefs }, { data: claimStancePrefs }] =
      await Promise.all([
        supabaseAdmin
          .from("channel_preferences")
          .select("channel_id, channel_name, affinity, positive_count, negative_count")
          .eq("user_id", userId),
        supabaseAdmin
          .from("stance_preferences")
          .select("stance, affinity, positive_count, negative_count")
          .eq("user_id", userId),
        supabaseAdmin
          .from("claim_stance_preferences")
          .select("claim_id, stance, affinity")
          .eq("user_id", userId),
      ]);

    const affinityByChannel = new Map<string, number>();
    for (const p of channelPrefs ?? []) {
      if (p.channel_id) affinityByChannel.set(p.channel_id, Number(p.affinity) || 0);
    }
    const affinityByStance = new Map<Stance, number>();
    for (const p of stancePrefs ?? []) affinityByStance.set(p.stance as Stance, Number(p.affinity) || 0);
    const affinityByClaimStance = new Map<string, number>();
    for (const p of claimStancePrefs ?? [])
      affinityByClaimStance.set(`${p.claim_id}:${p.stance}`, Number(p.affinity) || 0);

    const topLiked = (channelPrefs ?? [])
      .filter((p) => (p.positive_count ?? 0) > 0)
      .sort((a, b) => Number(b.affinity ?? 0) - Number(a.affinity ?? 0))
      .slice(0, 5)
      .map((p) => p.channel_name)
      .filter(Boolean) as string[];
    const topDisliked = (channelPrefs ?? [])
      .filter((p) => (p.negative_count ?? 0) > 0)
      .sort((a, b) => Number(a.affinity ?? 0) - Number(b.affinity ?? 0))
      .slice(0, 5)
      .map((p) => p.channel_name)
      .filter(Boolean) as string[];
    const dislikedStances = [...affinityByStance.entries()].filter(([, a]) => a < -0.2).map(([s]) => s);
    const likedStances = [...affinityByStance.entries()].filter(([, a]) => a > 0.2).map(([s]) => s);

    // ─── 5. Prefilter → Shortlist für KI ─────────────────────────────
    const shortlist = prefilter(candidates, MAX_CLASSIFICATIONS, affinityByChannel, trace);
    const prefilteredOutIds = new Set(candidates.map((c) => `${c.video.external_id}:${c.claim.id}`));
    for (const s of shortlist) prefilteredOutIds.delete(`${s.video.external_id}:${s.claim.id}`);

    // ─── 6. Videos upserten (nur Shortlist) ─────────────────────────
    const uniqueVideos = new Map<string, PlatformVideo>();
    for (const c of shortlist) uniqueVideos.set(`${c.video.platform}:${c.video.external_id}`, c.video);
    const videoIdByExternal = new Map<string, string>();
    if (uniqueVideos.size > 0) {
      const { data: upserted, error: upErr } = await supabaseAdmin
        .from("videos")
        .upsert(
          [...uniqueVideos.values()].map((v) => ({
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
      for (const v of upserted ?? []) videoIdByExternal.set(`${v.platform}:${v.external_id}`, v.id);

      // Snapshot pro Video für Trend-Wachstum
      await supabaseAdmin.from("video_stats_snapshots").insert(
        [...uniqueVideos.values()].map((v) => ({
          video_id: videoIdByExternal.get(`${v.platform}:${v.external_id}`)!,
          view_count: v.view_count,
          like_count: v.like_count,
          comment_count: v.comment_count,
        })).filter((r) => r.video_id) as never,
      );
    }

    const feedbackByVideoClaim = new Map<string, "relevant" | "neutral" | "not_relevant">();
    if (videoIdByExternal.size > 0) {
      const { data: prev } = await supabaseAdmin
        .from("video_matches")
        .select("video_id, claim_id, user_feedback")
        .eq("user_id", userId)
        .in("video_id", [...videoIdByExternal.values()])
        .not("user_feedback", "is", null);
      for (const row of prev ?? []) {
        if (row.user_feedback)
          feedbackByVideoClaim.set(
            `${row.video_id}:${row.claim_id}`,
            row.user_feedback as never,
          );
      }
    }

    // ─── 7. KI klassifiziert Shortlist ───────────────────────────────
    const CONCURRENCY = 8;
    let matched = 0;
    let rejected = 0;
    let aiErrors = 0;
    const stanceStats: Record<Stance, number> = { promotes: 0, mentions: 0, debunks: 0, unrelated: 0 };
    const queue = [...shortlist];

    const preferenceHint =
      `Nutzerpräferenz: bevorzugte Kanäle: ${topLiked.join(", ") || "—"}. Abgelehnte Kanäle: ${topDisliked.join(", ") || "—"}. Bevorzugte Stances: ${likedStances.join(", ") || "—"}. Abgelehnte Stances: ${dislikedStances.join(", ") || "—"}. Deutschsprachige Videos werden generell bevorzugt.`;

    async function classifyAndStore(cand: Candidate) {
      const videoDbId = videoIdByExternal.get(`${cand.video.platform}:${cand.video.external_id}`);
      if (!videoDbId) return;

      let ai: { stance: Stance; confidence: number; summary: string; reasoning: string };
      try {
        ai = await chatJson<typeof ai>({
          system:
            "Du bist Faktenchecker. Bestimme die HALTUNG des Videos zur Falschaussage. Antworte STRICT als JSON:\n" +
            '- stance: "promotes" (vertritt/verbreitet aktiv), "mentions" (erwähnt neutral), "debunks" (widerlegt / bringt Fakten dagegen / Faktencheck / zitiert Studien dagegen), "unrelated"\n' +
            "- confidence: 0-1\n" +
            "- summary: 1 kurzer deutscher Satz\n" +
            "- reasoning: 1-2 Sätze deutsch\n\n" +
            "WICHTIG: Debunk-Signale sind u.a. 'Studie zeigt …', 'Faktencheck', 'falsch, weil …', 'Mythos widerlegt'. Auch wenn der Titel wie eine Behauptung klingt (Clickbait), gilt das Video als 'debunks', sobald es die Falschaussage widerlegt. " +
            preferenceHint,
          user: JSON.stringify({
            falschaussage: cand.claim.text,
            warum_problematisch: cand.claim.why_problematic ?? undefined,
            video_titel: cand.video.title,
            video_beschreibung: (cand.video.description ?? "").slice(0, 1500),
            kanal: cand.video.channel_name ?? undefined,
            sprache: cand.video.language ?? undefined,
          }),
          temperature: 0.1,
        });
      } catch (e) {
        if (e instanceof AIGatewayError && e.status === 402) throw e;
        console.warn("[discovery] AI failed:", e);
        aiErrors++;
        return;
      }

      const stance: Stance = (["promotes", "mentions", "debunks", "unrelated"] as const).includes(ai.stance)
        ? ai.stance
        : "unrelated";
      stanceStats[stance]++;

      const priorFeedback = feedbackByVideoClaim.get(`${videoDbId}:${cand.claim.id}`) ?? null;
      const channelAffinity = cand.video.channel_id ? affinityByChannel.get(cand.video.channel_id) ?? null : null;
      const stanceAffinity = affinityByStance.get(stance) ?? null;
      const claimStanceAffinity = affinityByClaimStance.get(`${cand.claim.id}:${stance}`) ?? null;

      const r = computeOpportunityScore({
        view_count: cand.video.view_count,
        like_count: cand.video.like_count,
        comment_count: cand.video.comment_count,
        published_at: cand.video.published_at,
        ai_confidence: ai.confidence,
        language: cand.video.language,
        stance,
        channel_affinity: channelAffinity,
        stance_affinity: stanceAffinity,
        claim_stance_affinity: claimStanceAffinity,
        user_feedback: priorFeedback,
      });

      const isMatch =
        priorFeedback === "relevant"
          ? true
          : priorFeedback === "not_relevant"
            ? false
            : (stance === "promotes" && ai.confidence >= 0.5) ||
              (stance === "mentions" && ai.confidence >= 0.7);

      const effectiveStatus = isMatch ? "new" : "rejected";

      const { error: mErr } = await supabaseAdmin.from("video_matches").upsert(
        {
          user_id: userId,
          video_id: videoDbId,
          topic_id: cand.claim.topic_id,
          claim_id: cand.claim.id,
          detected_claim: cand.claim.text,
          opportunity_score: r.score,
          score_breakdown: r.breakdown as never,
          ai_confidence: ai.confidence,
          ai_summary: ai.summary,
          ai_reasoning: ai.reasoning,
          stance,
          matched_at: new Date().toISOString(),
          status: effectiveStatus,
          user_feedback: priorFeedback,
        },
        { onConflict: "user_id,video_id,claim_id" },
      );
      if (mErr) {
        console.warn("[discovery] persist match failed:", mErr);
        return;
      }
      if (effectiveStatus === "new") matched++;
      else rejected++;
    }

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

    trace.record("classify", shortlist.length, matched + rejected, {
      matched,
      rejected,
      ai_errors: aiErrors,
      stance_stats: stanceStats,
    });

    // ─── 8. Trace persistieren ───────────────────────────────────────
    if (trace.stages.length > 0) {
      await supabaseAdmin.from("discovery_run_stages").insert(
        trace.stages.map((s, i) => ({
          run_id: runId,
          user_id: userId,
          stage_index: i,
          stage_name: s.stage,
          input_count: s.input,
          output_count: s.output,
          meta: (s.meta ?? null) as never,
        })) as never,
      );
    }

    await supabaseAdmin
      .from("discovery_runs")
      .update({
        status: "done",
        finished_at: new Date().toISOString(),
        videos_scanned: shortlist.length,
        videos_matched: matched,
      })
      .eq("id", runId);

    return {
      runId,
      poolSize: collected.length,
      afterDedupe: candidates.length,
      scanned: shortlist.length,
      matched,
      rejected,
      aiErrors,
      claimsUsed: claims.length,
      totalQueries,
      stanceStats,
      note: "ok" as const,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from("discovery_runs")
      .update({ status: "error", finished_at: new Date().toISOString(), error: msg })
      .eq("id", runId);
    // Auch bei Fehler die bisherigen Stages speichern
    if (trace.stages.length > 0) {
      await supabaseAdmin.from("discovery_run_stages").insert(
        trace.stages.map((s, i) => ({
          run_id: runId,
          user_id: userId,
          stage_index: i,
          stage_name: s.stage,
          input_count: s.input,
          output_count: s.output,
          meta: (s.meta ?? null) as never,
        })) as never,
      );
    }
    throw e;
  }
}
