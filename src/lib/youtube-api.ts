/**
 * YouTube Data API v3 Integration
 * 과거 영상 조회를 위한 API
 *
 * 환경 변수: YOUTUBE_API_KEY
 * API 발급: https://console.cloud.google.com/apis/credentials
 */

import { DbTrendItem } from "./db";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const API_BASE = "https://www.googleapis.com/youtube/v3";

interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    publishedAt: string;
    channelTitle: string;
    thumbnails: {
      medium: { url: string };
    };
  };
}

interface YouTubeSearchResponse {
  items: YouTubeSearchItem[];
  nextPageToken?: string;
}

/**
 * 특정 채널의 과거 영상 조회
 */
export async function fetchChannelVideos(
  channelId: string,
  channelName: string,
  options: {
    publishedAfter?: string; // ISO 8601 format
    publishedBefore?: string;
    maxResults?: number;
  } = {}
): Promise<DbTrendItem[]> {
  if (!YOUTUBE_API_KEY) {
    console.warn("[YouTube API] API key not configured");
    return [];
  }

  const { publishedAfter, publishedBefore, maxResults = 50 } = options;
  const videos: DbTrendItem[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const params = new URLSearchParams({
        key: YOUTUBE_API_KEY,
        channelId,
        part: "snippet",
        type: "video",
        order: "date",
        maxResults: Math.min(maxResults - videos.length, 50).toString(),
      });

      if (publishedAfter) params.append("publishedAfter", publishedAfter);
      if (publishedBefore) params.append("publishedBefore", publishedBefore);
      if (pageToken) params.append("pageToken", pageToken);

      const response = await fetch(`${API_BASE}/search?${params}`);

      if (!response.ok) {
        const error = await response.text();
        console.error(`[YouTube API] Error for ${channelName}:`, error);
        break;
      }

      const data: YouTubeSearchResponse = await response.json();

      for (const item of data.items) {
        videos.push({
          title: item.snippet.title,
          link: `https://www.youtube.com/watch?v=${item.id.videoId}`,
          pubDate: item.snippet.publishedAt,
          source: channelName,
          thumbnail: `https://img.youtube.com/vi/${item.id.videoId}/mqdefault.jpg`,
        });
      }

      pageToken = data.nextPageToken;
    } while (pageToken && videos.length < maxResults);

    console.log(`[YouTube API] Fetched ${videos.length} videos from ${channelName}`);
    return videos;
  } catch (error) {
    console.error(`[YouTube API] Failed for ${channelName}:`, error);
    return [];
  }
}

/**
 * 여러 채널의 과거 영상 일괄 조회
 */
export async function fetchHistoricalVideos(
  channels: { channelId: string; name: string }[],
  startDate: string, // YYYY-MM-DD
  endDate?: string
): Promise<DbTrendItem[]> {
  if (!YOUTUBE_API_KEY) {
    console.warn("[YouTube API] API key not configured, skipping historical fetch");
    return [];
  }

  const publishedAfter = new Date(startDate).toISOString();
  const publishedBefore = endDate ? new Date(endDate).toISOString() : new Date().toISOString();

  const allVideos: DbTrendItem[] = [];

  for (const channel of channels) {
    const videos = await fetchChannelVideos(channel.channelId, channel.name, {
      publishedAfter,
      publishedBefore,
      maxResults: 100, // 채널당 최대 100개
    });
    allVideos.push(...videos);

    // Rate limit 방지
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`[YouTube API] Total fetched: ${allVideos.length} videos`);
  return allVideos;
}

export function isYouTubeApiConfigured(): boolean {
  return !!YOUTUBE_API_KEY;
}
