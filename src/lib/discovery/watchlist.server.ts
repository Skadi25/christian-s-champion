import { getPlatformAdapter } from "@/lib/platforms/registry.server";
import type { PlatformId } from "@/lib/platforms/types";

/**
 * Watchlist — Kanäle und Videos, die der Nutzer explizit im Blick hat.
 * Beim Hinzufügen wird die Identifikation (URL, Handle, ID) über den
 * Plattform-Adapter aufgelöst, damit später TikTok/Instagram nur andere
 * Adapter brauchen.
 */
export async function addToWatchlistForUser(
  userId: string,
  input: { kind: "channel" | "video"; platform: PlatformId; identifier: string; label?: string },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (input.kind === "channel") {
    const adapter = getPlatformAdapter(input.platform);
    if (!adapter.resolveChannel) throw new Error("Plattform unterstützt keine Kanal-Auflösung.");
    const info = await adapter.resolveChannel(input.identifier);
    if (!info) throw new Error("Kanal konnte nicht gefunden werden.");

    const { data, error } = await supabaseAdmin
      .from("watchlist_items")
      .upsert(
        {
          user_id: userId,
          kind: "channel",
          platform: input.platform,
          external_id: info.channel_id,
          label: input.label ?? info.channel_name ?? info.channel_id,
          thumbnail_url: info.thumbnail_url,
          url:
            input.platform === "youtube"
              ? `https://www.youtube.com/channel/${info.channel_id}`
              : null,
        },
        { onConflict: "user_id,platform,kind,external_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, item: data };
  }

  // Video: erwartet Video-ID oder YouTube-URL
  let externalId = input.identifier.trim();
  const m = externalId.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) externalId = m[1];
  const { data, error } = await supabaseAdmin
    .from("watchlist_items")
    .upsert(
      {
        user_id: userId,
        kind: "video",
        platform: input.platform,
        external_id: externalId,
        label: input.label ?? externalId,
        url:
          input.platform === "youtube"
            ? `https://www.youtube.com/watch?v=${externalId}`
            : null,
      },
      { onConflict: "user_id,platform,kind,external_id" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, item: data };
}
