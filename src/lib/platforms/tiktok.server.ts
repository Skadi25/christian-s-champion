import type { PlatformAdapter } from "./types";

/** Stub adapter — reserved slot. Wire in a real TikTok data source later. */
export function createTikTokAdapter(): PlatformAdapter {
  return {
    id: "tiktok",
    async search() {
      throw new Error("TikTok-Adapter ist noch nicht implementiert.");
    },
  };
}
