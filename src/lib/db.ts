import { prisma } from "./prisma";

export interface DbTrendItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  thumbnail?: string;
  summary?: string;
}

/**
 * YouTube 링크 정규화 (/shorts/xxx -> /watch?v=xxx)
 */
function normalizeYouTubeLink(link: string): string {
  // /shorts/VIDEO_ID -> /watch?v=VIDEO_ID
  const shortsMatch = link.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
  if (shortsMatch) {
    return `https://www.youtube.com/watch?v=${shortsMatch[1]}`;
  }
  return link;
}

export async function saveVideos(videos: DbTrendItem[]) {
  for (const video of videos) {
    const pubDate = new Date(video.pubDate);
    const normalizedLink = normalizeYouTubeLink(video.link);

    await prisma.trendVideo.upsert({
      where: { link: normalizedLink },
      update: {
        title: video.title,
        pubDate,
        source: video.source,
        thumbnail: video.thumbnail,
      },
      create: {
        title: video.title,
        link: normalizedLink,
        pubDate,
        source: video.source,
        thumbnail: video.thumbnail,
      },
    });
  }

  // Keep only latest 5000
  const oldVideos = await prisma.trendVideo.findMany({
    orderBy: { pubDate: "desc" },
    skip: 5000,
    select: { id: true },
  });

  if (oldVideos.length > 0) {
    await prisma.trendVideo.deleteMany({
      where: { id: { in: oldVideos.map((v) => v.id) } },
    });
  }
}

export async function saveNews(newsItems: DbTrendItem[]) {
  for (const news of newsItems) {
    const pubDate = new Date(news.pubDate);

    await prisma.trendNews.upsert({
      where: { link: news.link },
      update: {
        title: news.title,
        pubDate,
        source: news.source,
        // 요약은 수동/AI로 생성되므로 upsert 시에는 덮어쓰지 않음 (필요시 추가)
      },
      create: {
        title: news.title,
        link: news.link,
        pubDate,
        source: news.source,
        summary: news.summary,
      },
    });
  }

  // Keep only latest 5000
  const oldNews = await prisma.trendNews.findMany({
    orderBy: { pubDate: "desc" },
    skip: 5000,
    select: { id: true },
  });

  if (oldNews.length > 0) {
    await prisma.trendNews.deleteMany({
      where: { id: { in: oldNews.map((n) => n.id) } },
    });
  }
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getVideosFromDb(limit = 10): Promise<DbTrendItem[]> {
  const videos = await prisma.trendVideo.findMany({
    orderBy: { pubDate: "desc" },
    take: limit,
  });

  return videos.map((v) => ({
    title: v.title,
    link: v.link,
    pubDate: v.pubDate.toISOString(),
    source: v.source,
    thumbnail: v.thumbnail ?? undefined,
    summary: v.summary ?? undefined,
  }));
}

export async function getVideosPaginated(
  page = 1,
  pageSize = 20,
  source?: string
): Promise<PaginatedResult<DbTrendItem>> {
  const where = source ? { source } : {};

  const [videos, total] = await Promise.all([
    prisma.trendVideo.findMany({
      where,
      orderBy: { pubDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.trendVideo.count({ where }),
  ]);

  return {
    items: videos.map((v) => ({
      title: v.title,
      link: v.link,
      pubDate: v.pubDate.toISOString(),
      source: v.source,
      thumbnail: v.thumbnail ?? undefined,
      summary: v.summary ?? undefined,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getNewsFromDb(limit = 10): Promise<DbTrendItem[]> {
  const news = await prisma.trendNews.findMany({
    orderBy: { pubDate: "desc" },
    take: limit,
  });

  return news.map((n) => ({
    title: n.title,
    link: n.link,
    pubDate: n.pubDate.toISOString(),
    source: n.source,
    summary: n.summary ?? undefined,
  }));
}

export async function getNewsPaginated(
  page = 1,
  pageSize = 20
): Promise<PaginatedResult<DbTrendItem>> {
  const [news, total] = await Promise.all([
    prisma.trendNews.findMany({
      orderBy: { pubDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.trendNews.count(),
  ]);

  return {
    items: news.map((n) => ({
      title: n.title,
      link: n.link,
      pubDate: n.pubDate.toISOString(),
      source: n.source,
      summary: n.summary ?? undefined,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function clearAllTrends() {
  await prisma.trendVideo.deleteMany({});
  await prisma.trendNews.deleteMany({});
  console.log("[DB] All trends cleared.");
}

/**
 * 특정 날짜 이전의 비디오 삭제
 */
export async function deleteVideosBefore(date: Date): Promise<number> {
  const result = await prisma.trendVideo.deleteMany({
    where: { pubDate: { lt: date } },
  });
  console.log(`[DB] Deleted ${result.count} videos before ${date.toISOString()}`);
  return result.count;
}

/**
 * 실패한 요약을 null로 리셋 (재시도용)
 */
export async function resetFailedSummaries(): Promise<number> {
  const result = await prisma.trendVideo.updateMany({
    where: {
      summary: {
        in: ["[요약 불가]", "[자막 없음]", "[요약 실패]", "[URL 파싱 실패]"],
      },
    },
    data: { summary: null },
  });
  console.log(`[DB] Reset ${result.count} failed summaries`);
  return result.count;
}

// YouTube Channel Management
export interface YouTubeChannelData {
  channelId: string;
  name: string;
  category: "korean" | "global";
}

export async function getActiveChannels(): Promise<YouTubeChannelData[]> {
  const channels = await prisma.youTubeChannel.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return channels.map((c) => ({
    channelId: c.channelId,
    name: c.name,
    category: c.category as "korean" | "global",
  }));
}

export async function getChannelsByCategory(
  category: "korean" | "global"
): Promise<YouTubeChannelData[]> {
  const channels = await prisma.youTubeChannel.findMany({
    where: { active: true, category },
    orderBy: { name: "asc" },
  });

  return channels.map((c) => ({
    channelId: c.channelId,
    name: c.name,
    category: c.category as "korean" | "global",
  }));
}

export async function addChannel(data: YouTubeChannelData): Promise<void> {
  await prisma.youTubeChannel.upsert({
    where: { channelId: data.channelId },
    update: { name: data.name, category: data.category, active: true },
    create: { channelId: data.channelId, name: data.name, category: data.category },
  });
}

export async function removeChannel(channelId: string): Promise<void> {
  await prisma.youTubeChannel.update({
    where: { channelId },
    data: { active: false },
  });
}

export async function getAllChannels() {
  return prisma.youTubeChannel.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

// 비디오를 채널별로 그룹화해서 조회
export async function getVideosBySource(limit = 5): Promise<Record<string, DbTrendItem[]>> {
  const videos = await prisma.trendVideo.findMany({
    orderBy: { pubDate: "desc" },
    take: 100,
  });

  const grouped: Record<string, DbTrendItem[]> = {};
  for (const v of videos) {
    if (!grouped[v.source]) {
      grouped[v.source] = [];
    }
    if (grouped[v.source].length < limit) {
      grouped[v.source].push({
        title: v.title,
        link: v.link,
        pubDate: v.pubDate.toISOString(),
        source: v.source,
        thumbnail: v.thumbnail ?? undefined,
      });
    }
  }

  return grouped;
}
