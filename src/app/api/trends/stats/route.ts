import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const videoCount = await prisma.trendVideo.count();
  const newsCount = await prisma.trendNews.count();
  const channelCount = await prisma.youTubeChannel.count({ where: { active: true } });

  const latestVideo = await prisma.trendVideo.findFirst({ orderBy: { pubDate: "desc" } });
  const oldestVideo = await prisma.trendVideo.findFirst({ orderBy: { pubDate: "asc" } });
  const latestNews = await prisma.trendNews.findFirst({ orderBy: { pubDate: "desc" } });
  const oldestNews = await prisma.trendNews.findFirst({ orderBy: { pubDate: "asc" } });

  return NextResponse.json({
    channels: channelCount,
    videos: {
      count: videoCount,
      oldest: oldestVideo?.pubDate,
      latest: latestVideo?.pubDate,
    },
    news: {
      count: newsCount,
      oldest: oldestNews?.pubDate,
      latest: latestNews?.pubDate,
    },
  });
}
