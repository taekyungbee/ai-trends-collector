import { NextResponse } from "next/server";
import { updateAiTrends } from "@/lib/ai-trends";
import { summarizeVideosBatch } from "@/lib/video-summarizer";
import { syncRecentSummariesToNotion, isNotionConfigured } from "@/lib/notion-trends";
import { isGeminiConfigured } from "@/lib/gemini-api";

/**
 * POST /api/trends/daily
 * 일일 트렌드 작업 순차 실행: RSS 수집 → 요약 생성 → Notion 동기화
 * - RSS: 새 영상만 추가 (upsert)
 * - 요약: summary가 null인 영상만 처리
 */
export async function POST() {
  const results: { step: string; success: boolean; detail?: string }[] = [];

  try {
    // 1. RSS 수집 (기존 데이터 유지, 새 영상만 추가)
    console.log("[Daily] Step 1: RSS 수집 시작");
    await updateAiTrends();
    results.push({
      step: "refresh",
      success: true,
      detail: "RSS 수집 완료",
    });

    // 2. 요약 생성
    console.log("[Daily] Step 2: 요약 생성 시작");
    if (isGeminiConfigured()) {
      const summarizeResult = await summarizeVideosBatch(20);
      results.push({
        step: "summarize",
        success: true,
        detail: `${summarizeResult.success}/${summarizeResult.processed}개 성공`,
      });
    } else {
      results.push({
        step: "summarize",
        success: false,
        detail: "Gemini API 미설정",
      });
    }

    // 3. Notion 동기화
    console.log("[Daily] Step 3: Notion 동기화 시작");
    if (isNotionConfigured()) {
      const notionResult = await syncRecentSummariesToNotion(50);
      results.push({
        step: "notion",
        success: true,
        detail: `${notionResult.success}/${notionResult.total}개 동기화`,
      });
    } else {
      results.push({
        step: "notion",
        success: false,
        detail: "Notion API 미설정",
      });
    }

    console.log("[Daily] 완료:", results);

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("[Daily] 오류:", error);
    return NextResponse.json(
      {
        success: false,
        results,
        error: String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/trends/daily",
    description: "일일 트렌드 작업 순차 실행 (refresh → summarize → notion)",
  });
}
