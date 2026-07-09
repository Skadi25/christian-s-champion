import type { PlatformAdapter, PlatformVideo, SearchQuery } from "./types";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const PAGE_SIZE = 50; // YouTube max

function parseIsoDurationToSeconds(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  const [, h, mi, s] = m;
  return Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(s ?? 0);
}

export function createYouTubeAdapter(apiKey: string): PlatformAdapter {
  return {
    id: "youtube",
    async search(q: SearchQuery): Promise<PlatformVideo[]> {
      const target = Math.max(1, q.maxResults ?? 50);
      const ids: string[] = [];
      let pageToken: string | undefined = undefined;

      // Fetch multiple pages of search results (IDs only) to build a large candidate pool.
      // We also alternate order (relevance vs. viewCount) across a second search to broaden coverage.
      const orders: Array<"relevance" | "viewCount" | "date"> = ["relevance", "viewCount", "date"];
      let orderIdx = 0;
      const seen = new Set<string>();

      while (ids.length < target) {
        const params = new URLSearchParams({
          key: apiKey,
          part: "snippet",
          type: "video",
          q: q.query,
          maxResults: String(Math.min(PAGE_SIZE, target - ids.length)),
          order: orders[orderIdx],
          relevanceLanguage: q.language ?? "de",
          regionCode: q.region ?? "DE",
          safeSearch: "none",
        });
        if (q.publishedAfter) params.set("publishedAfter", q.publishedAfter);
        if (pageToken) params.set("pageToken", pageToken);

        const res = await fetch(`${SEARCH_URL}?${params}`);
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          // Rotate order or stop cleanly on quota — avoid dead-looping.
          if (res.status === 403 || res.status === 400) {
            if (ids.length > 0) break;
            throw new YouTubeApiError(res.status, body || res.statusText);
          }
          throw new YouTubeApiError(res.status, body || res.statusText);
        }
        const json = (await res.json()) as {
          items?: Array<{ id: { videoId?: string } }>;
          nextPageToken?: string;
        };
        for (const it of json.items ?? []) {
          const id = it.id?.videoId;
          if (id && !seen.has(id)) {
            seen.add(id);
            ids.push(id);
          }
        }
        if (json.nextPageToken && ids.length < target) {
          pageToken = json.nextPageToken;
        } else {
          // No more pages on this order — advance to next order strategy.
          orderIdx++;
          pageToken = undefined;
          if (orderIdx >= orders.length) break;
        }
      }

      if (ids.length === 0) return [];

      // Fetch full details in batches of 50 (YouTube max for /videos endpoint).
      const details: PlatformVideo[] = [];
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        const p = new URLSearchParams({
          key: apiKey,
          id: chunk.join(","),
          part: "snippet,statistics,contentDetails",
        });
        const r = await fetch(`${VIDEOS_URL}?${p}`);
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          throw new YouTubeApiError(r.status, body || r.statusText);
        }
        const j = (await r.json()) as {
          items?: Array<{
            id: string;
            snippet?: {
              title?: string;
              description?: string;
              channelTitle?: string;
              channelId?: string;
              publishedAt?: string;
              thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
              defaultAudioLanguage?: string;
              defaultLanguage?: string;
            };
            statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
            contentDetails?: { duration?: string };
          }>;
        };
        for (const v of j.items ?? []) {
          details.push({
            platform: "youtube",
            external_id: v.id,
            url: `https://www.youtube.com/watch?v=${v.id}`,
            title: v.snippet?.title ?? "",
            description: v.snippet?.description ?? null,
            channel_name: v.snippet?.channelTitle ?? null,
            channel_id: v.snippet?.channelId ?? null,
            thumbnail_url:
              v.snippet?.thumbnails?.high?.url ?? v.snippet?.thumbnails?.medium?.url ?? null,
            published_at: v.snippet?.publishedAt ?? null,
            view_count: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
            like_count: v.statistics?.likeCount ? Number(v.statistics.likeCount) : null,
            comment_count: v.statistics?.commentCount ? Number(v.statistics.commentCount) : null,
            duration_seconds: parseIsoDurationToSeconds(v.contentDetails?.duration),
            language: v.snippet?.defaultAudioLanguage ?? v.snippet?.defaultLanguage ?? null,
            raw_metadata: v as unknown as Record<string, unknown>,
          });
        }
      }
      return details;
    },
  };
}

export class YouTubeApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`YouTube API ${status}: ${body.slice(0, 200)}`);
    this.name = "YouTubeApiError";
  }
}
