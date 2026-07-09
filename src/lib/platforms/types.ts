/**
 * Platform-agnostic types for video discovery.
 * Every adapter (YouTube, TikTok, Instagram) implements this shape,
 * so the rest of the app never depends on a specific provider.
 */

export type PlatformId = "youtube" | "tiktok" | "instagram";

export type PlatformVideo = {
  platform: PlatformId;
  external_id: string;
  url: string;
  title: string;
  description: string | null;
  channel_name: string | null;
  channel_id: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  duration_seconds: number | null;
  language: string | null;
  raw_metadata: Record<string, unknown>;
};

export type SearchQuery = {
  query: string;
  language?: string;
  region?: string;
  publishedAfter?: string;
  maxResults?: number;
};

export interface PlatformAdapter {
  readonly id: PlatformId;
  search(query: SearchQuery): Promise<PlatformVideo[]>;
}
