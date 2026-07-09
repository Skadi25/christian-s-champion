import type { PlatformAdapter, PlatformId } from "./types";
import { createYouTubeAdapter } from "./youtube.server";
import { createTikTokAdapter } from "./tiktok.server";
import { createInstagramAdapter } from "./instagram.server";

/**
 * Registry — every future platform is added here as a new adapter factory.
 * Discovery, Latest, Trends and Watchlist only see the adapter interface,
 * so a new platform is one file + one case.
 */
export function getPlatformAdapter(id: PlatformId): PlatformAdapter {
  switch (id) {
    case "youtube": {
      const key = process.env.YOUTUBE_API_KEY;
      if (!key) throw new Error("YOUTUBE_API_KEY ist nicht gesetzt.");
      return createYouTubeAdapter(key);
    }
    case "tiktok":
      return createTikTokAdapter();
    case "instagram":
      return createInstagramAdapter();
    case "facebook":
    case "x":
    case "threads":
      throw new Error(`Adapter für "${id}" ist noch nicht implementiert.`);
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
