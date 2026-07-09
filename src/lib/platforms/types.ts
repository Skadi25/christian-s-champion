/**
 * Platform-agnostic types for video discovery.
 * Every adapter (YouTube, TikTok, Instagram, ...) implements this shape.
 * The rest of the app never depends on a specific provider.
 */

export type PlatformId = "youtube" | "tiktok" | "instagram" | "facebook" | "x" | "threads";

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

export type SearchDiagnostic = {
  url: string;
  status: number;
  order?: string;
  page?: number;
  items_returned?: number;
  ids_collected_so_far?: number;
  next_page_token?: boolean;
  details_fetched?: number;
  api_key_tail?: string;
  quota_used?: number | string;
  quota_remaining?: number | string;
  error?: string;
};

export type SearchQuery = {
  query: string;
  language?: string;
  region?: string;
  publishedAfter?: string;
  maxResults?: number;
  order?: "relevance" | "date" | "viewCount";
  /** Optional debug collector; adapter pushes one entry per HTTP request. */
  debug?: SearchDiagnostic[];
};

export type LatestQuery = {
  language?: string;
  region?: string;
  publishedAfter?: string;
  maxResults?: number;
  categoryHints?: string[];
};

export type ChannelInfo = {
  platform: PlatformId;
  channel_id: string;
  channel_name: string | null;
  thumbnail_url: string | null;
  subscriber_count: number | null;
};

export interface PlatformAdapter {
  readonly id: PlatformId;
  /** Wide keyword search across the platform. */
  search(query: SearchQuery): Promise<PlatformVideo[]>;
  /** Refresh view/like/comment counts for known videos (Trend delta). */
  fetchVideoStats?(externalIds: string[]): Promise<PlatformVideo[]>;
  /** Recent uploads from a specific channel (Watchlist refresh). */
  fetchChannelVideos?(channelId: string, opts?: { maxResults?: number; publishedAfter?: string }): Promise<PlatformVideo[]>;
  /** Resolve a channel URL/handle into stable channel metadata. */
  resolveChannel?(identifier: string): Promise<ChannelInfo | null>;
}
