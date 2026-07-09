import type { PlatformAdapter, PlatformId } from "./types";
import { createYouTubeAdapter } from "./youtube.server";

/**
 * Returns the requested platform adapter. Adding TikTok/Instagram later
 * only means adding a new case here — the rest of the discovery pipeline
 * stays unchanged because it depends solely on the `PlatformAdapter` shape.
 */
export function getPlatformAdapter(id: PlatformId): PlatformAdapter {
  switch (id) {
    case "youtube": {
      const key = process.env.YOUTUBE_API_KEY;
      if (!key) {
        throw new Error(
          "YOUTUBE_API_KEY ist nicht gesetzt. Bitte hinterlege den Key in den Cloud-Secrets.",
        );
      }
      return createYouTubeAdapter(key);
    }
    case "tiktok":
    case "instagram":
      throw new Error(
        `Adapter für "${id}" ist noch nicht implementiert. Kommt in einer späteren Phase.`,
      );
    default: {
      const _exhaustive: never = id;
      throw new Error(`Unbekannte Plattform: ${_exhaustive}`);
    }
  }
}

export function getEnabledPlatforms(): PlatformId[] {
  const enabled: PlatformId[] = [];
  if (process.env.YOUTUBE_API_KEY) enabled.push("youtube");
  return enabled;
}
