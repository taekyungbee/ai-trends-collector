import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/trends/cleanup
 * 중복 비디오 정리 (shorts와 watch?v= 중복 제거)
 */
export async function POST() {
  try {
    // 모든 비디오 조회
    const videos = await prisma.trendVideo.findMany({
      orderBy: { pubDate: "desc" },
    });

    // videoId 추출 함수
    const extractVideoId = (link: string): string | null => {
      // /shorts/VIDEO_ID
      const shortsMatch = link.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shortsMatch) return shortsMatch[1];

      // /watch?v=VIDEO_ID
      const watchMatch = link.match(/[?&]v=([a-zA-Z0-9_-]+)/);
      if (watchMatch) return watchMatch[1];

      return null;
    };

    // videoId별로 그룹화
    const videoMap = new Map<string, typeof videos>();

    for (const video of videos) {
      const videoId = extractVideoId(video.link);
      if (!videoId) continue;

      if (!videoMap.has(videoId)) {
        videoMap.set(videoId, []);
      }
      videoMap.get(videoId)!.push(video);
    }

    // 중복 제거 (첫 번째만 유지, 나머지 삭제)
    const idsToDelete: number[] = [];

    for (const [videoId, duplicates] of videoMap) {
      if (duplicates.length > 1) {
        // watch?v= 형식 우선, 그 다음 최신 것 유지
        const sorted = duplicates.sort((a, b) => {
          const aIsWatch = a.link.includes("/watch?v=");
          const bIsWatch = b.link.includes("/watch?v=");
          if (aIsWatch && !bIsWatch) return -1;
          if (!aIsWatch && bIsWatch) return 1;
          return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
        });

        // 첫 번째 제외하고 삭제 대상에 추가
        for (let i = 1; i < sorted.length; i++) {
          idsToDelete.push(sorted[i].id);
        }
      }
    }

    // 삭제 실행
    if (idsToDelete.length > 0) {
      await prisma.trendVideo.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    const remainingCount = await prisma.trendVideo.count();

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${idsToDelete.length} duplicate videos`,
      before: videos.length,
      after: remainingCount,
      removed: idsToDelete.length,
    });
  } catch (error) {
    console.error("Cleanup failed:", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}

// GET - 중복 현황 확인
export async function GET() {
  const videos = await prisma.trendVideo.findMany();

  const extractVideoId = (link: string): string | null => {
    const shortsMatch = link.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) return shortsMatch[1];
    const watchMatch = link.match(/[?&]v=([a-zA-Z0-9_-]+)/);
    if (watchMatch) return watchMatch[1];
    return null;
  };

  const videoMap = new Map<string, number>();
  for (const video of videos) {
    const videoId = extractVideoId(video.link);
    if (videoId) {
      videoMap.set(videoId, (videoMap.get(videoId) || 0) + 1);
    }
  }

  const duplicates = Array.from(videoMap.entries())
    .filter(([_, count]) => count > 1)
    .map(([videoId, count]) => ({ videoId, count }));

  return NextResponse.json({
    total: videos.length,
    unique: videoMap.size,
    duplicateCount: duplicates.length,
    duplicates: duplicates.slice(0, 20),
  });
}
