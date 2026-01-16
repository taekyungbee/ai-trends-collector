import { NextRequest, NextResponse } from "next/server";
import { updateAiTrends } from "@/lib/ai-trends";
import { deleteVideosBefore, resetFailedSummaries } from "@/lib/db";

/**
 * POST /api/trends/refresh
 * 쿼리 파라미터:
 * - initialLoad=true: 2025년 7월 이후 모든 영상 수집
 * - cleanup=true: 2025년 7월 이전 영상 삭제
 * - resetFailed=true: 실패한 요약 리셋 (재시도용)
 * - 기본값: 전일자 영상만 수집
 */
export async function POST(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const initialLoad = searchParams.get("initialLoad") === "true";
        const cleanup = searchParams.get("cleanup") === "true";
        const resetFailed = searchParams.get("resetFailed") === "true";

        let deletedCount = 0;
        let resetCount = 0;

        // 2025년 7월 이전 데이터 삭제
        if (cleanup) {
            const cutoffDate = new Date("2025-07-01T00:00:00Z");
            deletedCount = await deleteVideosBefore(cutoffDate);
        }

        // 실패한 요약 리셋
        if (resetFailed) {
            resetCount = await resetFailedSummaries();
        }

        // YouTube RSS와 News RSS에서 새 데이터 가져오기 (upsert)
        await updateAiTrends({ initialLoad });

        return NextResponse.json({
            success: true,
            deletedCount: cleanup ? deletedCount : undefined,
            resetCount: resetFailed ? resetCount : undefined,
            message: resetFailed
                ? `Reset ${resetCount} failed summaries`
                : cleanup
                    ? `Deleted ${deletedCount} old videos, then refreshed`
                    : initialLoad
                        ? "AI Trends data refreshed (initial load from July 2025)"
                        : "AI Trends data refreshed (previous day only)"
        });
    } catch (error) {
        console.error("[API] Refresh trends error:", error);
        return NextResponse.json(
            { success: false, error: String(error) },
            { status: 500 }
        );
    }
}
