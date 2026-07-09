import type { PlatformVideo } from "@/lib/platforms/types";
import type { RunTrace } from "./trace";

export type Candidate = {
  video: PlatformVideo;
  claim: {
    id: string;
    text: string;
    why_problematic: string | null;
    topic_id: string | null;
    topic_name: string | null;
  };
  /** Which search query produced this candidate (for debugging). */
  source_query?: string;
};

export function dedupeCandidates(input: Candidate[], trace: RunTrace): Candidate[] {
  const seen = new Set<string>();
  const kept: Candidate[] = [];
  let dupClaim = 0;
  for (const c of input) {
    const key = `${c.video.platform}:${c.video.external_id}:${c.claim.id}`;
    if (seen.has(key)) {
      dupClaim++;
      continue;
    }
    seen.add(key);
    kept.push(c);
  }
  trace.record("dedupe", input.length, kept.length, { duplicates_removed: dupClaim });
  return kept;
}

export function filterTimeframe(input: Candidate[], lookbackDays: number, trace: RunTrace): Candidate[] {
  const cutoff = Date.now() - lookbackDays * 24 * 3_600_000;
  let tooOld = 0;
  const kept = input.filter((c) => {
    const t = c.video.published_at ? new Date(c.video.published_at).getTime() : Date.now();
    if (t < cutoff) {
      tooOld++;
      return false;
    }
    return true;
  });
  trace.record("filterTimeframe", input.length, kept.length, { too_old: tooOld, lookback_days: lookbackDays });
  return kept;
}

export function filterLanguage(input: Candidate[], trace: RunTrace): Candidate[] {
  // Do not drop non-German videos, but flag them — the prefilter downranks them.
  let de = 0;
  let unknown = 0;
  let other = 0;
  for (const c of input) {
    const l = (c.video.language ?? "").toLowerCase();
    if (l.startsWith("de")) de++;
    else if (l === "") unknown++;
    else other++;
  }
  trace.record("filterLanguage", input.length, input.length, {
    de,
    unknown,
    other,
    strategy: "downrank_only",
  });
  return input;
}

export function prefilter(
  input: Candidate[],
  maxOut: number,
  affinityByChannel: Map<string, number>,
  trace: RunTrace,
): Candidate[] {
  function heuristic(c: Candidate): number {
    const v = c.video;
    const views = v.view_count ?? 0;
    const reach = Math.min(1, Math.log10(views + 1) / 7);
    const hours = v.published_at
      ? Math.max(1, (Date.now() - new Date(v.published_at).getTime()) / 3_600_000)
      : 24 * 90;
    const recency = hours <= 24 * 90 ? 1 - hours / (24 * 90) : 0;
    const lang = (v.language ?? "").toLowerCase();
    const langBoost = lang.startsWith("de") ? 1 : lang === "" ? 0.6 : 0.25;
    const chAff = v.channel_id ? affinityByChannel.get(v.channel_id) ?? 0 : 0;
    const claimWords = c.claim.text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);
    const hay = `${v.title} ${v.description ?? ""}`.toLowerCase();
    const hits = claimWords.filter((w) => hay.includes(w)).length;
    const claimFit = claimWords.length > 0 ? hits / claimWords.length : 0.5;
    return (
      reach * 0.3 +
      recency * 0.15 +
      langBoost * 0.15 +
      claimFit * 0.3 +
      ((chAff + 1) / 2) * 0.1
    );
  }

  const scored = input.map((c) => ({ c, h: heuristic(c) })).sort((a, b) => b.h - a.h);
  const kept = scored.slice(0, maxOut).map((r) => r.c);
  trace.record("prefilter", input.length, kept.length, {
    max_out: maxOut,
    top_score: scored[0]?.h ?? 0,
    cut_score: scored[maxOut - 1]?.h ?? 0,
  });
  return kept;
}
