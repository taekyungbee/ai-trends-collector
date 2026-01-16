/**
 * News API Integration
 * 과거 뉴스 조회를 위한 API
 *
 * 환경 변수: NEWS_API_KEY
 * API 발급: https://newsapi.org/register
 *
 * Free tier 제한:
 * - 100 requests/day
 * - 1 month historical data
 */

import { DbTrendItem } from "./db";

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const API_BASE = "https://newsapi.org/v2";

interface NewsArticle {
  title: string;
  url: string;
  publishedAt: string;
  source: { name: string };
}

interface NewsApiResponse {
  status: string;
  totalResults: number;
  articles: NewsArticle[];
}

/**
 * AI 관련 뉴스 조회
 */
export async function fetchAiNews(options: {
  from?: string; // YYYY-MM-DD
  to?: string;
  pageSize?: number;
  page?: number;
}): Promise<DbTrendItem[]> {
  if (!NEWS_API_KEY) {
    console.warn("[News API] API key not configured");
    return [];
  }

  const { from, to, pageSize = 100, page = 1 } = options;

  try {
    const params = new URLSearchParams({
      apiKey: NEWS_API_KEY,
      q: "인공지능 OR AI OR ChatGPT OR GPT OR LLM OR 머신러닝",
      language: "ko",
      sortBy: "publishedAt",
      pageSize: pageSize.toString(),
      page: page.toString(),
    });

    if (from) params.append("from", from);
    if (to) params.append("to", to);

    const response = await fetch(`${API_BASE}/everything?${params}`);

    if (!response.ok) {
      const error = await response.text();
      console.error("[News API] Error:", error);
      return [];
    }

    const data: NewsApiResponse = await response.json();

    if (data.status !== "ok") {
      console.error("[News API] Status not ok:", data);
      return [];
    }

    const news: DbTrendItem[] = data.articles.map((article) => ({
      title: article.title,
      link: article.url,
      pubDate: article.publishedAt,
      source: article.source.name,
    }));

    console.log(`[News API] Fetched ${news.length} articles`);
    return news;
  } catch (error) {
    console.error("[News API] Failed:", error);
    return [];
  }
}

/**
 * 과거 뉴스 일괄 조회 (여러 페이지)
 */
export async function fetchHistoricalNews(
  startDate: string, // YYYY-MM-DD
  endDate?: string,
  maxArticles = 500
): Promise<DbTrendItem[]> {
  if (!NEWS_API_KEY) {
    console.warn("[News API] API key not configured, skipping historical fetch");
    return [];
  }

  const allNews: DbTrendItem[] = [];
  let page = 1;
  const pageSize = 100;

  while (allNews.length < maxArticles) {
    const news = await fetchAiNews({
      from: startDate,
      to: endDate,
      pageSize,
      page,
    });

    if (news.length === 0) break;

    allNews.push(...news);
    page++;

    // Rate limit 방지
    await new Promise((r) => setTimeout(r, 500));

    // NewsAPI free tier는 100 results까지만
    if (page > 1) break;
  }

  console.log(`[News API] Total fetched: ${allNews.length} articles`);
  return allNews;
}

export function isNewsApiConfigured(): boolean {
  return !!NEWS_API_KEY;
}
