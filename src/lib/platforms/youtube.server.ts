import type { PlatformAdapter, PlatformVideo, SearchQuery, ChannelInfo } from "./types";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";
const PAGE_SIZE = 50;

export class YouTubeApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`YouTube API ${status}: ${body.slice(0, 200)}`);
    this.name = "YouTubeApiError";
  }
}

/** Thrown when the YouTube Data API v3 daily quota is exhausted. */
export class YouTubeQuotaExceededError extends Error {
  constructor(public apiKeyTail: string, public body: string) {
    super("YouTube API-Limit erreicht (quotaExceeded).");
    this.name = "YouTubeQuotaExceededError";
  }
}

function isQuotaExceeded(status: number, body: string): boolean {
  if (status !== 403 && status !== 429) return false;
  return /quotaExceeded|dailyLimitExceeded|rateLimitExceeded|userRateLimitExceeded/i.test(body);
}

function parseIsoDurationToSeconds(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  const [, h, mi, s] = m;
  return Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(s ?? 0);
}

type YTVideoItem = {
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
};

function mapVideoItem(v: YTVideoItem): PlatformVideo {
  return {
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
  };
}

function redactKey(url: string): string {
  return url.replace(/([?&]key=)[^&]+/g, "$1REDACTED");
}

async function fetchDetailsInBatches(
  apiKey: string,
  ids: string[],
  debug?: import("./types").SearchDiagnostic[],
): Promise<PlatformVideo[]> {
  const out: PlatformVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const p = new URLSearchParams({
      key: apiKey,
      id: chunk.join(","),
      part: "snippet,statistics,contentDetails",
    });
    const url = `${VIDEOS_URL}?${p}`;
    const r = await fetch(url);
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      debug?.push({
        url: redactKey(url),
        status: r.status,
        details_fetched: 0,
        error: (body || r.statusText).slice(0, 300),
      });
      throw new YouTubeApiError(r.status, body || r.statusText);
    }
    const j = (await r.json()) as { items?: YTVideoItem[] };
    debug?.push({
      url: redactKey(url),
      status: r.status,
      details_fetched: j.items?.length ?? 0,
    });
    for (const v of j.items ?? []) out.push(mapVideoItem(v));
  }
  return out;
}

export function createYouTubeAdapter(apiKey: string): PlatformAdapter {
  return {
    id: "youtube",

    async search(q: SearchQuery): Promise<PlatformVideo[]> {
      const target = Math.max(1, q.maxResults ?? 50);
      const orders: Array<"relevance" | "viewCount" | "date"> = q.order
        ? [q.order]
        : ["relevance", "viewCount", "date"];

      const seen = new Set<string>();
      const ids: string[] = [];
      const debug = q.debug;

      outer: for (const order of orders) {
        let pageToken: string | undefined;
        let page = 0;
        while (ids.length < target) {
          page++;
          const params = new URLSearchParams({
            key: apiKey,
            part: "snippet",
            type: "video",
            q: q.query,
            maxResults: String(Math.min(PAGE_SIZE, target - ids.length)),
            order,
            safeSearch: "none",
          });
          // Sprache/Region sind BIAS, kein Hard-Filter — trotzdem optional halten,
          // damit ein Aufrufer sie ausschalten kann (region=""/language="").
          if (q.language !== "") params.set("relevanceLanguage", q.language ?? "de");
          if (q.region !== "") params.set("regionCode", q.region ?? "DE");
          if (q.publishedAfter) params.set("publishedAfter", q.publishedAfter);
          if (pageToken) params.set("pageToken", pageToken);

          const url = `${SEARCH_URL}?${params}`;
          const res = await fetch(url);
          const apiKeyTail = apiKey.slice(-4);
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            debug?.push({
              url: redactKey(url),
              status: res.status,
              order,
              page,
              items_returned: 0,
              ids_collected_so_far: ids.length,
              api_key_tail: apiKeyTail,
              error: (body || res.statusText).slice(0, 300),
            });
            if (isQuotaExceeded(res.status, body)) {
              throw new YouTubeQuotaExceededError(apiKeyTail, body);
            }
            if (res.status === 403 || res.status === 400) {
              if (ids.length > 0) break outer;
              throw new YouTubeApiError(res.status, body || res.statusText);
            }
            throw new YouTubeApiError(res.status, body || res.statusText);
          }
          const json = (await res.json()) as {
            items?: Array<{ id: { videoId?: string } }>;
            nextPageToken?: string;
          };
          const itemCount = json.items?.length ?? 0;
          for (const it of json.items ?? []) {
            const id = it.id?.videoId;
            if (id && !seen.has(id)) {
              seen.add(id);
              ids.push(id);
            }
          }
          debug?.push({
            url: redactKey(url),
            status: res.status,
            order,
            page,
            items_returned: itemCount,
            ids_collected_so_far: ids.length,
            next_page_token: Boolean(json.nextPageToken),
            api_key_tail: apiKeyTail,
          });
          if (!json.nextPageToken || ids.length >= target) break;
          pageToken = json.nextPageToken;
        }
      }

      if (ids.length === 0) return [];
      return fetchDetailsInBatches(apiKey, ids, debug);
    },

    async fetchVideoStats(externalIds: string[]): Promise<PlatformVideo[]> {
      if (externalIds.length === 0) return [];
      return fetchDetailsInBatches(apiKey, externalIds);
    },

    async fetchChannelVideos(channelId, opts): Promise<PlatformVideo[]> {
      const target = Math.max(1, opts?.maxResults ?? 25);
      const ids: string[] = [];
      let pageToken: string | undefined;
      while (ids.length < target) {
        const params = new URLSearchParams({
          key: apiKey,
          part: "snippet",
          type: "video",
          channelId,
          order: "date",
          maxResults: String(Math.min(PAGE_SIZE, target - ids.length)),
        });
        if (opts?.publishedAfter) params.set("publishedAfter", opts.publishedAfter);
        if (pageToken) params.set("pageToken", pageToken);
        const r = await fetch(`${SEARCH_URL}?${params}`);
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          if (ids.length > 0) break;
          throw new YouTubeApiError(r.status, body || r.statusText);
        }
        const j = (await r.json()) as {
          items?: Array<{ id: { videoId?: string } }>;
          nextPageToken?: string;
        };
        for (const it of j.items ?? []) if (it.id?.videoId) ids.push(it.id.videoId);
        if (!j.nextPageToken) break;
        pageToken = j.nextPageToken;
      }
      return fetchDetailsInBatches(apiKey, ids);
    },

    async resolveChannel(identifier: string): Promise<ChannelInfo | null> {
      // Accept: channelId (UCxxxx), @handle, full URL, plain name
      let channelId: string | null = null;
      let handle: string | null = null;
      const trimmed = identifier.trim();
      const urlMatch = trimmed.match(/youtube\.com\/(?:channel\/(UC[\w-]+)|@([\w.-]+)|c\/([\w.-]+)|user\/([\w.-]+))/i);
      if (urlMatch) {
        channelId = urlMatch[1] ?? null;
        handle = urlMatch[2] ?? urlMatch[3] ?? urlMatch[4] ?? null;
      } else if (/^UC[\w-]{20,}$/.test(trimmed)) {
        channelId = trimmed;
      } else if (trimmed.startsWith("@")) {
        handle = trimmed.slice(1);
      } else {
        handle = trimmed;
      }

      const params = new URLSearchParams({
        key: apiKey,
        part: "snippet,statistics",
      });
      if (channelId) params.set("id", channelId);
      else if (handle) params.set("forHandle", handle);
      else return null;

      const r = await fetch(`${CHANNELS_URL}?${params}`);
      if (!r.ok) return null;
      const j = (await r.json()) as {
        items?: Array<{
          id: string;
          snippet?: { title?: string; thumbnails?: { default?: { url?: string }; high?: { url?: string } } };
          statistics?: { subscriberCount?: string };
        }>;
      };
      const item = j.items?.[0];
      if (!item) return null;
      return {
        platform: "youtube",
        channel_id: item.id,
        channel_name: item.snippet?.title ?? null,
        thumbnail_url: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
        subscriber_count: item.statistics?.subscriberCount ? Number(item.statistics.subscriberCount) : null,
      };
    },
  };
}
