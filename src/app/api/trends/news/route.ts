import { NextRequest, NextResponse } from "next/server";
import { getNewsPaginated } from "@/lib/db";

/**
 * GET /api/trends/news
 * 페이징된 뉴스 목록 조회
 *
 * Query params:
 * - page: 페이지 번호 (기본값: 1)
 * - pageSize: 페이지당 개수 (기본값: 20, 최대: 100)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")));

    const result = await getNewsPaginated(page, pageSize);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to get news:", error);
    return NextResponse.json({ error: "Failed to get news" }, { status: 500 });
  }
}
