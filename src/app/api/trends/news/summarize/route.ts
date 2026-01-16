import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isGeminiConfigured } from "@/lib/gemini-api";
import { summarizeNewsBatch } from "@/lib/news-summarizer";

/**
 * GET /api/trends/news/summarize
 * 뉴스 요약 상태 조회
 */
export async function GET() {
    try {
        const pendingCount = await prisma.trendNews.count({
            where: { summary: null },
        });

        const summarizedCount = await prisma.trendNews.count({
            where: { summary: { not: null } },
        });

        return NextResponse.json({
            geminiConfigured: isGeminiConfigured(),
            pendingCount,
            summarizedCount,
        });
    } catch (error) {
        console.error("[News Summarize API] GET Error:", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

/**
 * POST /api/trends/news/summarize
 * 뉴스 요약 실행
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

        const result = await summarizeNewsBatch(limit);

        return NextResponse.json(result);
    } catch (error) {
        console.error("[News Summarize API] POST Error:", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
