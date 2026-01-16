/**
 * News Summarizer
 * 뉴스 기사 본문 추출 → Gemini 요약 → DB 저장
 */

import { prisma } from "./prisma";
import { summarizeNews, isGeminiConfigured } from "./gemini-api";

interface NewsToSummarize {
    id: number;
    link: string;
    title: string;
    source: string;
}

/**
 * 요약이 없는 최근 뉴스 조회
 */
export async function getNewsWithoutSummary(
    limit: number = 20
): Promise<NewsToSummarize[]> {
    const news = await prisma.trendNews.findMany({
        where: {
            summary: null,
        },
        orderBy: { pubDate: "desc" },
        take: limit,
        select: {
            id: true,
            link: true,
            title: true,
            source: true,
        },
    });

    return news;
}

/**
 * HTML 태그 제거 및 본문 추출 (심플 버전)
 */
function extractBodyText(html: string): string {
    try {
        // 스크립트, 스타일 태그 제거
        let text = html
            .replace(/<script\b[^<]*>([\s\S]*?)<\/script>/gmi, "")
            .replace(/<style\b[^<]*>([\s\S]*?)<\/style>/gmi, "");

        // 나머지 태그 제거
        text = text.replace(/<[^>]+>/g, " ");

        // 연속된 공백 정리
        text = text.replace(/\s+/g, " ").trim();

        // 기사 본문이라고 추측되는 부분만 자르기 (보통 너무 길면 Gemini 토큰 낭비)
        // 10,000자 정도면 충분
        return text.slice(0, 10000);
    } catch (error) {
        console.error("[NewsSummarizer] HTML parsing failed:", error);
        return "";
    }
}

/**
 * 뉴스 본문 인출 시도
 */
async function fetchNewsContent(url: string): Promise<string> {
    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            },
            next: { revalidate: 3600 }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        return extractBodyText(html);
    } catch (error) {
        console.warn(`[NewsSummarizer] Failed to fetch ${url}:`, error);
        return "";
    }
}

/**
 * 단일 뉴스 요약 생성 및 저장
 */
export async function summarizeAndSaveNews(
    news: NewsToSummarize
): Promise<{ success: boolean; summary?: string; error?: string }> {
    try {
        // 1. 본문 추출 시도
        let content = await fetchNewsContent(news.link);
        let isTitleOnly = false;

        // 본문 추출 실패 시 제목만이라도 사용
        if (!content || content.length < 100) {
            console.log(`[NewsSummarizer] Little or no content for ${news.id}, summarizing based on title.`);
            // 프롬프트에 제목만 요약하라는 신호를 주기 위해 텍스트 구성 변경
            content = `(본문 없음) 제목: ${news.title}`;
            isTitleOnly = true;
        }

        // 2. Gemini 요약
        const summary = await summarizeNews(news.title, content, news.source);

        // 3. DB 저장
        await prisma.trendNews.update({
            where: { id: news.id },
            data: { summary },
        });

        console.log(`[NewsSummarizer] Summarized: ${news.title.slice(0, 50)}...`);
        return { success: true, summary };
    } catch (error) {
        console.error(`[NewsSummarizer] Failed: ${news.title}`, error);
        return { success: false, error: String(error) };
    }
}

/**
 * 배치로 여러 뉴스 요약
 */
export async function summarizeNewsBatch(
    limit: number = 10
): Promise<{ processed: number; success: number; failed: number }> {
    if (!isGeminiConfigured()) {
        console.warn("[NewsSummarizer] Gemini API not configured");
        return { processed: 0, success: 0, failed: 0 };
    }

    const newsItems = await getNewsWithoutSummary(limit);
    console.log(`[NewsSummarizer] Processing ${newsItems.length} news items...`);

    let success = 0;
    let failed = 0;

    for (const news of newsItems) {
        const result = await summarizeAndSaveNews(news);

        if (result.success) {
            success++;
        } else {
            failed++;
        }

        // Rate limit: 4.5초 간격으로 호출 (Gemini 무료 티어 고려)
        await new Promise((r) => setTimeout(r, 4500));
    }

    return { processed: newsItems.length, success, failed };
}
