import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isGeminiConfigured } from "@/lib/gemini-api";
import { summarizeAndSaveVideo } from "@/lib/video-summarizer";
import { extractVideoId } from "@/lib/youtube-transcript";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * GET /api/trends/summarize
 * 요약 상태 조회
 */
export async function GET() {
  try {
    const pendingCount = await prisma.trendVideo.count({
      where: { summary: null },
    });

    const summarizedCount = await prisma.trendVideo.count({
      where: { summary: { not: null } },
    });

    const pendingVideos = await prisma.trendVideo.findMany({
      where: { summary: null },
      orderBy: { pubDate: "desc" },
      take: 10,
      select: { title: true, source: true },
    });

    return NextResponse.json({
      geminiConfigured: !!GEMINI_API_KEY,
      pendingCount,
      summarizedCount,
      pendingVideos,
    });
  } catch (error) {
    console.error("[Summarize API] GET Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/trends/summarize
 * 영상 요약 실행 (자막 → Gemini fallback)
 */
export async function POST(request: NextRequest) {
  try {
    if (!isGeminiConfigured()) {
      return NextResponse.json(
        { error: "Gemini API not configured" },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { limit = 5 } = body;

    const videos = await prisma.trendVideo.findMany({
      where: { summary: null },
      orderBy: { pubDate: "desc" },
      take: limit,
      select: { id: true, title: true, link: true, source: true },
    });

    const results: { title: string; status: string; summary?: string }[] = [];

    for (const video of videos) {
      try {
        const videoId = extractVideoId(video.link);
        if (!videoId) {
          await prisma.trendVideo.update({
            where: { id: video.id },
            data: { summary: "[URL 파싱 실패]" },
          });
          results.push({ title: video.title, status: "invalid_url" });
          continue;
        }

        // summarizeAndSaveVideo 사용 (자막 → Gemini fallback 포함)
        const result = await summarizeAndSaveVideo(video);

        if (result.success) {
          results.push({
            title: video.title,
            status: "success",
            summary: result.summary?.slice(0, 100),
          });
        } else {
          results.push({
            title: video.title,
            status: `error: ${result.error}`,
          });
        }

        // Rate limit (분당 15회)
        await new Promise((r) => setTimeout(r, 4500));
      } catch (err) {
        await prisma.trendVideo.update({
          where: { id: video.id },
          data: { summary: "[요약 실패]" },
        });
        results.push({ title: video.title, status: `error: ${err}` });
      }
    }

    return NextResponse.json({
      processed: videos.length,
      results,
    });
  } catch (error) {
    console.error("[Summarize API] POST Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
