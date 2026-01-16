import { NextResponse } from "next/server";
import { fetchHistoricalVideos } from "@/lib/youtube-api";
import { saveVideos } from "@/lib/db";
import { prisma } from "@/lib/prisma";

// DB에 데이터가 없는 채널들
const MISSING_CHANNELS = [
  { channelId: "UCXKXULkq--aSgzScYeLYJog", name: "단테랩스" },
  { channelId: "UC4QaHaQJ3t8nYDOO7NiDfcA", name: "Daniel Vision School Korea" },
  { channelId: "UCUpkgT9Entggw2fMBprWM4w", name: "엔드플랜 Endplan AI" },
  { channelId: "UC7iAOLiALt2rtMVAWWl4pnw", name: "나도코딩" },
  { channelId: "UCt2wAAXgm87ACiQnDHQEW6Q", name: "테디노트 TeddyNote" },
  { channelId: "UC2L1DgDMD5pJ-35G47Objfw", name: "빵형의 개발도상국" },
  { channelId: "UCt9jbjxLBawaSaEsGB87D6g", name: "딥러닝 호형" },
  { channelId: "UCHcG02L6TSS-StkSbqVy6Fg", name: "코드없는 프로그래밍" },
  { channelId: "UCsBjURrPoezykLs9EqgamOA", name: "Fireship" },
];

export async function POST() {
  try {
    const results: Record<string, number> = {};
    const startDate = "2025-11-01";
    let totalVideos = 0;

    for (const channel of MISSING_CHANNELS) {
      console.log(`[Backfill] Fetching ${channel.name}...`);

      const videos = await fetchHistoricalVideos(
        [channel],
        startDate
      );

      if (videos.length > 0) {
        await saveVideos(videos);
        results[channel.name] = videos.length;
        totalVideos += videos.length;
      } else {
        results[channel.name] = 0;
      }

      // Rate limit between channels
      await new Promise((r) => setTimeout(r, 500));
    }

    // Get updated stats
    const total = await prisma.trendVideo.count();

    return NextResponse.json({
      success: true,
      channelsProcessed: MISSING_CHANNELS.length,
      results,
      totalNewVideos: totalVideos,
      totalVideosInDb: total,
    });
  } catch (error) {
    console.error("[Backfill Missing] Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  // 현재 DB에 없는 채널 확인
  const existingSources = await prisma.trendVideo.groupBy({
    by: ["source"],
    _count: { source: true },
  });

  const existingNames = new Set(existingSources.map((s) => s.source));
  const missing = MISSING_CHANNELS.filter((c) => !existingNames.has(c.name));

  return NextResponse.json({
    totalRegistered: MISSING_CHANNELS.length,
    missing: missing.map((c) => c.name),
    existing: existingSources,
  });
}
