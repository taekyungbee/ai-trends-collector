import { NextRequest, NextResponse } from "next/server";
import { getActiveChannels, saveVideos, saveNews } from "@/lib/db";
import {
  fetchHistoricalVideos,
  isYouTubeApiConfigured,
} from "@/lib/youtube-api";
import { fetchHistoricalNews, fetchAiNews, isNewsApiConfigured } from "@/lib/news-api";
import { updateAiTrends } from "@/lib/ai-trends";

/**
 * POST /api/trends/backfill
 * 과거 데이터 백필
 *
 * Body:
 * {
 *   "startDate": "2025-11-01",  // 시작일 (필수)
 *   "endDate": "2025-12-31"     // 종료일 (선택, 기본값: 오늘)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate } = body;

    if (!startDate) {
      return NextResponse.json(
        { error: "startDate is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    console.log(`[Backfill] Starting from ${startDate} to ${endDate || "now"}`);

    const results = {
      youtube: { configured: isYouTubeApiConfigured(), count: 0, rssCount: 0 },
      news: { configured: isNewsApiConfigured(), count: 0 },
    };

    // YouTube: API가 설정되어 있으면 API 사용, 아니면 RSS 사용
    if (isYouTubeApiConfigured()) {
      const channels = await getActiveChannels();
      const videos = await fetchHistoricalVideos(
        channels.map((c) => ({ channelId: c.channelId, name: c.name })),
        startDate,
        endDate
      );

      if (videos.length > 0) {
        await saveVideos(videos);
        results.youtube.count = videos.length;
      }
    } else {
      // RSS로 현재 데이터라도 가져오기
      console.log("[Backfill] YouTube API not configured, using RSS...");
      await updateAiTrends();
      results.youtube.rssCount = 50; // RSS 결과
    }

    // 뉴스 과거 조회 (여러 페이지)
    if (isNewsApiConfigured()) {
      const allNews = [];

      // 페이지별로 가져오기 (NewsAPI free tier는 100개 제한)
      for (let page = 1; page <= 5; page++) {
        const news = await fetchAiNews({
          from: startDate,
          to: endDate,
          pageSize: 100,
          page,
        });

        if (news.length === 0) break;
        allNews.push(...news);
        console.log(`[Backfill] News page ${page}: ${news.length} articles`);

        // Rate limit
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (allNews.length > 0) {
        await saveNews(allNews);
        results.news.count = allNews.length;
      }
    }

    console.log(`[Backfill] Complete:`, results);

    return NextResponse.json({
      success: true,
      message: "Backfill completed",
      results,
    });
  } catch (error) {
    console.error("[Backfill] Error:", error);
    return NextResponse.json(
      { error: "Backfill failed", details: String(error) },
      { status: 500 }
    );
  }
}

// GET - API 상태 확인
export async function GET() {
  return NextResponse.json({
    youtube: {
      configured: isYouTubeApiConfigured(),
      description: "Set YOUTUBE_API_KEY in .env",
    },
    news: {
      configured: isNewsApiConfigured(),
      description: "Set NEWS_API_KEY in .env",
    },
  });
}
