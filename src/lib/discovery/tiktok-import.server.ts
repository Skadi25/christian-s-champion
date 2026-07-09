import { chatJson, AIGatewayError } from "@/lib/ai/gateway.server";
import { computeOpportunityScore, type Stance } from "./scoring";

/**
 * Manuelles Anlegen eines TikTok-Videos.
 * User pflegt URL + optionale Metadaten. Wir klassifizieren die Stance
 * gegen den gewählten Claim mit derselben KI-Logik wie im YouTube-Pfad
 * und legen einen video_match an.
 */
export type TikTokImportInput = {
  url: string;
  claimId: string;
  creator?: string | null;
  title?: string | null;
  caption?: string | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
};

function extractTikTokId(url: string): string {
  // Match /video/1234567890, /@user/video/1234567890, vm.tiktok.com/XXXX
  const m = url.match(/\/video\/(\d+)/) || url.match(/tiktok\.com\/([A-Za-z0-9]+)$/);
  if (m?.[1]) return m[1];
  // Fallback: hash of url
  return "tt_" + Math.abs(hashCode(url)).toString(36);
}
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

export async function addTikTokVideoForUser(userId: string, input: TikTokImportInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: claim, error: cErr } = await supabaseAdmin
    .from("claims")
    .select("id, text, why_problematic, topic_id, user_id")
    .eq("id", input.claimId)
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  if (!claim || claim.user_id !== userId) throw new Error("Claim nicht gefunden.");

  const externalId = extractTikTokId(input.url);
  const title = input.title?.trim() || input.caption?.trim() || "TikTok-Video";
  const creator = input.creator?.trim() || null;

  // AI: Stance einschätzen
  let stance: Stance = "mentions";
  let confidence = 0.6;
  let summary = title.slice(0, 140);
  let reasoning = "Manuell hinzugefügtes TikTok-Video.";
  try {
    const ai = await chatJson<{
      stance: Stance;
      confidence: number;
      summary: string;
      reasoning: string;
    }>({
      system:
        "Du bist Faktenchecker. Bestimme die HALTUNG des TikToks zur Falschaussage. STRICT JSON:\n" +
        '- stance: "promotes" | "mentions" | "debunks" | "unrelated"\n' +
        "- confidence: 0-1\n" +
        "- summary: 1 kurzer deutscher Satz\n" +
        "- reasoning: 1-2 Sätze deutsch",
      user: JSON.stringify({
        falschaussage: claim.text,
        warum_problematisch: claim.why_problematic ?? undefined,
        video_titel: title,
        video_beschreibung: input.caption ?? undefined,
        kanal: creator ?? undefined,
        plattform: "tiktok",
      }),
      temperature: 0.1,
    });
    stance = (["promotes", "mentions", "debunks", "unrelated"] as const).includes(ai.stance)
      ? ai.stance
      : "mentions";
    confidence = Math.max(0, Math.min(1, ai.confidence));
    summary = ai.summary;
    reasoning = ai.reasoning;
  } catch (e) {
    if (e instanceof AIGatewayError && e.status === 402) throw e;
    // Fallback bleibt „mentions/0.6", damit der Import trotzdem gelingt.
  }

  // videos upsert
  const { data: video, error: vErr } = await supabaseAdmin
    .from("videos")
    .upsert(
      {
        platform: "tiktok",
        external_id: externalId,
        url: input.url,
        title,
        description: input.caption ?? null,
        channel_name: creator,
        channel_id: creator ? `tt_${creator.replace(/^@/, "")}` : null,
        thumbnail_url: null,
        published_at: new Date().toISOString(),
        view_count: input.views ?? null,
        like_count: input.likes ?? null,
        comment_count: input.comments ?? null,
        duration_seconds: null,
        language: "de",
        raw_metadata: { source: "manual_tiktok" } as never,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "platform,external_id" },
    )
    .select("id")
    .single();
  if (vErr || !video) throw new Error(vErr?.message ?? "Video konnte nicht gespeichert werden.");

  const r = computeOpportunityScore({
    view_count: input.views ?? null,
    like_count: input.likes ?? null,
    comment_count: input.comments ?? null,
    published_at: new Date().toISOString(),
    ai_confidence: confidence,
    language: "de",
    stance,
  });

  const status = stance === "unrelated" ? "rejected" : "new";

  const { error: mErr } = await supabaseAdmin.from("video_matches").upsert(
    {
      user_id: userId,
      video_id: video.id,
      claim_id: claim.id,
      topic_id: claim.topic_id,
      detected_claim: claim.text,
      opportunity_score: r.score,
      score_breakdown: r.breakdown as never,
      ai_confidence: confidence,
      ai_summary: summary,
      ai_reasoning: reasoning,
      stance,
      matched_at: new Date().toISOString(),
      status,
    },
    { onConflict: "user_id,video_id,claim_id" },
  );
  if (mErr) throw new Error(mErr.message);

  return { ok: true, stance, score: r.score, status };
}
