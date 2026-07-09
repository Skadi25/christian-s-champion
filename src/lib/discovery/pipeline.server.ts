import { getPlatformAdapter } from "@/lib/platforms/registry.server";
import type { PlatformVideo } from "@/lib/platforms/types";
import { chatJson, AIGatewayError } from "@/lib/ai/gateway.server";
import { computeOpportunityScore, type Stance } from "./scoring";

type Claim = {
  id: string;
  text: string;
  why_problematic: string | null;
  topic_id: string | null;
  topic_name: string | null;
};

const MAX_CLAIMS_PER_RUN = 25;
const MAX_VIDEOS_PER_CLAIM = 300; // paginated across relevance/viewCount/date
const MAX_CANDIDATE_POOL = 5000; // total across all claims
const MAX_CLASSIFICATIONS = 200; // AI only runs on top-K after prefilter
const LOOKBACK_DAYS = 60;

export async function runDiscoveryForUser(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: run, error: runErr } = await supabaseAdmin
    .from("discovery_runs")
    .insert({ user_id: userId, status: "running" })
    .select("id")
    .single();
  if (runErr || !run) throw new Error(runErr?.message ?? "Konnte Discovery-Run nicht starten.");
  const runId = run.id as string;

  try {
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
      .map(
        (c: {
          id: string;
          text: string;
          why_problematic: string | null;
          topic_id: string | null;
          topics: { name: string } | null;
        }) => ({
          id: c.id,
          text: c.text,
          why_problematic: c.why_problematic,
          topic_id: c.topic_id,
          topic_name: c.topics?.name ?? null,
        }),
      );

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

    // 1. Wide sweep: many candidates per claim
    const adapter = getPlatformAdapter("youtube");
    const publishedAfter = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3_600_000).toISOString();

    type Candidate = { video: PlatformVideo; claim: Claim };
    const uniqueByVideoClaim = new Map<string, Candidate>();
    let poolCount = 0;

    for (const claim of claims) {
      if (poolCount >= MAX_CANDIDATE_POOL) break;
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
          if (uniqueByVideoClaim.has(key)) continue;
          uniqueByVideoClaim.set(key, { video: v, claim });
          poolCount++;
          if (poolCount >= MAX_CANDIDATE_POOL) break;
        }
      } catch (e) {
        console.warn(`[discovery] Suche fehlgeschlagen für "${claim.text}":`, e);
      }
    }

    const allCandidates = [...uniqueByVideoClaim.values()];

    // 2. Learned preferences (channel + stance + prior video feedback)
    const [{ data: channelPrefs }, { data: stancePrefs }] = await Promise.all([
      supabaseAdmin
        .from("channel_preferences")
        .select("channel_id, channel_name, affinity, positive_count, negative_count")
        .eq("user_id", userId),
      supabaseAdmin
        .from("stance_preferences")
        .select("stance, affinity, positive_count, negative_count")
        .eq("user_id", userId),
    ]);

    const affinityByChannel = new Map<string, number>();
    for (const p of channelPrefs ?? []) {
      if (p.channel_id) affinityByChannel.set(p.channel_id, Number(p.affinity) || 0);
    }
    const affinityByStance = new Map<Stance, number>();
    for (const p of stancePrefs ?? []) {
      affinityByStance.set(p.stance as Stance, Number(p.affinity) || 0);
    }
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

    // 3. Heuristic prefilter → top MAX_CLASSIFICATIONS candidates for the AI
    function heuristic(c: Candidate): number {
      const v = c.video;
      const views = v.view_count ?? 0;
      const reach = Math.min(1, Math.log10(views + 1) / 7);
      const hours = v.published_at
        ? Math.max(1, (Date.now() - new Date(v.published_at).getTime()) / 3_600_000)
        : 24 * 30;
      const recency = hours <= 24 * 30 ? 1 - hours / (24 * 30) : 0;
      const lang = (v.language ?? "").toLowerCase();
      const langBoost = lang.startsWith("de") ? 1 : lang === "" ? 0.6 : 0.2;
      const chAff = v.channel_id ? affinityByChannel.get(v.channel_id) ?? 0 : 0;
      const claimWords = c.claim.text
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3);
      const hay = `${v.title} ${v.description ?? ""}`.toLowerCase();
      const hits = claimWords.filter((w) => hay.includes(w)).length;
      const claimFit = claimWords.length > 0 ? hits / claimWords.length : 0.5;
      return (
        reach * 0.35 +
        recency * 0.15 +
        langBoost * 0.15 +
        claimFit * 0.25 +
        ((chAff + 1) / 2) * 0.1
      );
    }

    const ranked = allCandidates
      .map((c) => ({ c, h: heuristic(c) }))
      .sort((a, b) => b.h - a.h);
    const shortlist = ranked.slice(0, MAX_CLASSIFICATIONS).map((r) => r.c);

    // 4. Upsert only shortlisted videos into DB
    const uniqueVideos = new Map<string, PlatformVideo>();
    for (const c of shortlist)
      uniqueVideos.set(`${c.video.platform}:${c.video.external_id}`, c.video);
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
      for (const v of upserted ?? [])
        videoIdByExternal.set(`${v.platform}:${v.external_id}`, v.id);
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

    // 5. Classify each shortlisted candidate (stance-aware) with concurrency
    const CONCURRENCY = 8;
    let matched = 0;
    let rejected = 0;
    let aiErrors = 0;
    const stanceStats: Record<Stance, number> = {
      promotes: 0,
      mentions: 0,
      debunks: 0,
      unrelated: 0,
    };
    const queue = [...shortlist];

    const dislikedStances = [...affinityByStance.entries()]
      .filter(([, a]) => a < -0.2)
      .map(([s]) => s);
    const likedStances = [...affinityByStance.entries()]
      .filter(([, a]) => a > 0.2)
      .map(([s]) => s);

    const preferenceHint =
      `Nutzerpräferenz (aus vergangenem Feedback): bevorzugte Kanäle: ${topLiked.join(", ") || "—"}. Abgelehnte Kanäle: ${topDisliked.join(", ") || "—"}. Bevorzugte Stance-Typen: ${likedStances.join(", ") || "—"}. Abgelehnte Stance-Typen: ${dislikedStances.join(", ") || "—"}. Deutschsprachige Videos werden generell bevorzugt.`;

    async function classifyAndStore(cand: Candidate) {
      const videoDbId = videoIdByExternal.get(
        `${cand.video.platform}:${cand.video.external_id}`,
      );
      if (!videoDbId) return;

      let ai: { stance: Stance; confidence: number; summary: string; reasoning: string };
      try {
        ai = await chatJson<typeof ai>({
          system:
            "Du bist Faktenchecker. Bestimme die HALTUNG des Videos zur genannten Falschaussage. Antworte STRICT als JSON mit den Feldern:\n" +
            '- stance: "promotes" (Video vertritt/verbreitet die Falschaussage aktiv als wahr), "mentions" (erwähnt sie neutral ohne zu werten), "debunks" (widerlegt die Falschaussage), "unrelated" (Video geht nicht darum)\n' +
            "- confidence: 0-1\n" +
            "- summary: 1 kurzer deutscher Satz\n" +
            "- reasoning: 1-2 Sätze deutsch, warum die Stance so eingestuft wurde\n\n" +
            "WICHTIG: Ein Video, das die Falschaussage widerlegt (Fakten dagegen bringt, richtigstellt, wissenschaftliche Studien zitiert die dagegen sprechen), ist IMMER 'debunks' — auch wenn der Titel wie eine Behauptung klingt (Clickbait). " +
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
        console.warn("[discovery] AI-Klassifizierung fehlgeschlagen:", e);
        aiErrors++;
        return;
      }

      const stance: Stance = (["promotes", "mentions", "debunks", "unrelated"] as const).includes(
        ai.stance,
      )
        ? ai.stance
        : "unrelated";
      stanceStats[stance]++;

      const priorFeedback = feedbackByVideoClaim.get(`${videoDbId}:${cand.claim.id}`) ?? null;
      const channelAffinity = cand.video.channel_id
        ? affinityByChannel.get(cand.video.channel_id) ?? null
        : null;
      const stanceAffinity = affinityByStance.get(stance) ?? null;

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
        user_feedback: priorFeedback,
      });

      // Nur "promotes" ist ein echter Match. "mentions" landet bei mittlerer Confidence
      // auch bei den priorisierten Videos, aber mit deutlich niedrigerem Score.
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
        console.warn("[discovery] Konnte Klassifizierung nicht speichern:", mErr);
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
      poolSize: allCandidates.length,
      scanned: shortlist.length,
      matched,
      rejected,
      aiErrors,
      claimsUsed: claims.length,
      stanceStats,
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
