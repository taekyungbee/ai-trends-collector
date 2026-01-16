/**
 * Notion Trends Integration
 * AI Trends 요약을 노션 데이터베이스에 저장
 */

import { Client } from "@notionhq/client";
import { prisma } from "./prisma";

const NOTION_API_KEY = process.env.NOTION_TRENDS_API_KEY;
const NOTION_TRENDS_DB_ID = process.env.NOTION_TRENDS_DB_ID;

let notionClient: Client | null = null;

function getNotionClient(): Client {
  if (!NOTION_API_KEY) {
    throw new Error("NOTION_API_KEY is not configured");
  }
  if (!notionClient) {
    notionClient = new Client({ auth: NOTION_API_KEY });
  }
  return notionClient;
}

export function isNotionConfigured(): boolean {
  return !!(NOTION_API_KEY && NOTION_TRENDS_DB_ID);
}

interface VideoForNotion {
  id: number;
  title: string;
  link: string;
  source: string;
  summary: string;
  pubDate: Date;
}

/**
 * 요약 텍스트를 노션 블록으로 변환
 */
type NotionBlock = Parameters<Client["blocks"]["children"]["append"]>[0]["children"][number];

function summaryToBlocks(summary: string): NotionBlock[] {
  const blocks: NotionBlock[] = [];
  const lines = summary.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 불릿 포인트
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: trimmed.slice(2) } }],
        },
      });
    }
    // 일반 텍스트
    else {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: trimmed } }],
        },
      });
    }
  }

  return blocks;
}

/**
 * 요약된 영상을 노션에 등록 (본문 포함)
 */
export async function addVideoToNotion(video: VideoForNotion): Promise<boolean> {
  try {
    const notion = getNotionClient();

    // 1. 페이지 생성
    const page = await notion.pages.create({
      parent: { database_id: NOTION_TRENDS_DB_ID! },
      properties: {
        Title: {
          title: [{ text: { content: video.title } }],
        },
        Source: {
          select: { name: video.source },
        },
        Summary: {
          rich_text: [{ text: { content: video.summary.slice(0, 2000) } }],
        },
        Link: {
          url: video.link,
        },
        PubDate: {
          date: { start: video.pubDate.toISOString().split("T")[0] },
        },
      },
    });

    // 2. 본문에 요약 내용 추가
    const contentBlocks = summaryToBlocks(video.summary);
    if (contentBlocks.length > 0) {
      const blocks: NotionBlock[] = [
        // 유튜브 링크 북마크
        {
          object: "block",
          type: "bookmark",
          bookmark: {
            url: video.link,
          },
        },
        // 구분선
        {
          object: "block",
          type: "divider",
          divider: {},
        },
        // 요약 내용
        ...contentBlocks,
      ];

      await notion.blocks.children.append({
        block_id: page.id,
        children: blocks,
      });
    }

    console.log(`[Notion] Added: ${video.title.slice(0, 50)}...`);
    return true;
  } catch (error) {
    console.error(`[Notion] Failed to add video:`, error);
    return false;
  }
}

/**
 * 오늘 요약된 영상들을 노션에 일괄 등록
 */
export async function syncTodaySummariesToNotion(): Promise<{
  total: number;
  success: number;
  failed: number;
}> {
  if (!isNotionConfigured()) {
    console.warn("[Notion] Not configured");
    return { total: 0, success: 0, failed: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 오늘 요약된 영상 조회 (실제 요약이 있는 것만)
  const videos = await prisma.trendVideo.findMany({
    where: {
      summary: {
        not: null,
        notIn: ["[자막 없음]", "[URL 파싱 실패]", "[요약 실패]"],
      },
      createdAt: { gte: today },
    },
    orderBy: { pubDate: "desc" },
    select: {
      id: true,
      title: true,
      link: true,
      source: true,
      summary: true,
      pubDate: true,
    },
  });

  console.log(`[Notion] Syncing ${videos.length} videos...`);

  let success = 0;
  let failed = 0;

  for (const video of videos) {
    if (!video.summary) continue;

    const result = await addVideoToNotion({
      ...video,
      summary: video.summary,
    });

    if (result) {
      success++;
    } else {
      failed++;
    }

    // Rate limit 방지
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`[Notion] Sync complete: ${success}/${videos.length} success`);

  return { total: videos.length, success, failed };
}

/**
 * 최근 요약된 영상 N개를 노션에 등록
 */
export async function syncRecentSummariesToNotion(
  limit: number = 10
): Promise<{ total: number; success: number; failed: number }> {
  if (!isNotionConfigured()) {
    console.warn("[Notion] Not configured");
    return { total: 0, success: 0, failed: 0 };
  }

  const videos = await prisma.trendVideo.findMany({
    where: {
      summary: {
        not: null,
        notIn: ["[자막 없음]", "[URL 파싱 실패]", "[요약 실패]"],
      },
    },
    orderBy: { pubDate: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      link: true,
      source: true,
      summary: true,
      pubDate: true,
    },
  });

  console.log(`[Notion] Syncing ${videos.length} recent videos...`);

  let success = 0;
  let failed = 0;

  for (const video of videos) {
    if (!video.summary) continue;

    const result = await addVideoToNotion({
      ...video,
      summary: video.summary,
    });

    if (result) {
      success++;
    } else {
      failed++;
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  return { total: videos.length, success, failed };
}
