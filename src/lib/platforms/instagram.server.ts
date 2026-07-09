import type { PlatformAdapter } from "./types";

/** Stub adapter — reserved slot for Instagram Reels. */
export function createInstagramAdapter(): PlatformAdapter {
  return {
    id: "instagram",
    async search() {
      throw new Error("Instagram-Adapter ist noch nicht implementiert.");
    },
  };
}
