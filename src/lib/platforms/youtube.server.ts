import type { PlatformAdapter, PlatformVideo, SearchQuery } from "./types";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

function parseIsoDurationToSeconds(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  const [, h, mi, s] = m;
  return (Number(h ?? 0) * 3600) + (Number(mi ?? 0) * 60) + Number(s ?? 0);
}

export function createYouTubeAdapter(apiKey: string): PlatformAdapter {
  return {
    id: "youtube",
    async search(q: SearchQuery): Promise<PlatformVideo[]> {
      const searchParams = new URLSearchParams({
        key: apiKey,
        part: "snippet",
        type: "video",
        q: q.query,
        maxResults: String(q.maxResults ?? 8),
        order: "viewCount",
        relevanceLanguage: q.language ?? "de",
        regionCode: q.region ?? "DE",
        safeSearch: "none",
      });
      if (q.publishedAfter) searchParams.set("publishedAfter", q.publishedAfter);

      const searchRes = await fetch(`${SEARCH_URL}?${searchParams}`);
      if (!searchRes.ok) {
        const body = await searchRes.text().catch(() => "");
        throw new YouTubeApiError(searchRes.status, body || searchRes.statusText);
      }
      const searchJson = (await searchRes.json()) as {
        items?: Array<{ id: { videoId: string } }>;
      };
      const ids = (searchJson.items ?? [])
        .map((i) => i.id?.videoId)
        .filter((x): x is string => !!x);
      if (ids.length === 0) return [];

      const detailParams = new URLSearchParams({
        key: apiKey,
        id: ids.join(","),
        part: "snippet,statistics,contentDetails",
      });
      const detailRes = await fetch(`${VIDEOS_URL}?${detailParams}`);
      if (!detailRes.ok) {
        const body = await detailRes.text().catch(() => "");
        throw new YouTubeApiError(detailRes.status, body || detailRes.statusText);
      }
      const detailJson = (await detailRes.json()) as {
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

      return (detailJson.items ?? []).map((v): PlatformVideo => ({
        platform: "youtube",
        external_id: v.id,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        title: v.snippet?.title ?? "",
        description: v.snippet?.description ?? null,
        channel_name: v.snippet?.channelTitle ?? null,
        channel_id: v.snippet?.channelId ?? null,
        thumbnail_url:
          v.snippet?.thumbnails?.high?.url ??
          v.snippet?.thumbnails?.medium?.url ??
          null,
        published_at: v.snippet?.publishedAt ?? null,
        view_count: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
        like_count: v.statistics?.likeCount ? Number(v.statistics.likeCount) : null,
        comment_count: v.statistics?.commentCount ? Number(v.statistics.commentCount) : null,
        duration_seconds: parseIsoDurationToSeconds(v.contentDetails?.duration),
        language: v.snippet?.defaultAudioLanguage ?? v.snippet?.defaultLanguage ?? null,
        raw_metadata: v as unknown as Record<string, unknown>,
      }));
    },
  };
}

export class YouTubeApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`YouTube API ${status}: ${body.slice(0, 200)}`);
    this.name = "YouTubeApiError";
  }
}
