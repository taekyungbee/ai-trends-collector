import Parser from "rss-parser";
import {
    getVideosFromDb,
    getNewsFromDb,
    saveVideos,
    saveNews,
    DbTrendItem,
    getActiveChannels,
    addChannel,
    YouTubeChannelData,
} from "./db";

export type TrendItem = DbTrendItem;

export interface AiTrends {
    videos: TrendItem[];
    news: TrendItem[];
}

const parser = new Parser();

// 초기 채널 데이터 (DB가 비어있을 때 시드)
const INITIAL_CHANNELS: YouTubeChannelData[] = [
    // 한국 채널 - 사용자 구독 채널
    { channelId: "UCxj3eVTAv9KLdrowXcuCFDQ", name: "빌더 조쉬 Builder Josh", category: "korean" },
    { channelId: "UCxZ2AlaT0hOmxzZVbF_j_Sw", name: "코드팩토리", category: "korean" },
    { channelId: "UCXKXULkq--aSgzScYeLYJog", name: "단테랩스", category: "korean" },
    { channelId: "UC4QaHaQJ3t8nYDOO7NiDfcA", name: "Daniel Vision School Korea", category: "korean" },
    { channelId: "UCUpkgT9Entggw2fMBprWM4w", name: "엔드플랜 Endplan AI", category: "korean" },
    { channelId: "UCSJDgl6tVc08c5d6y6vuufA", name: "Metics Media | 한국어", category: "korean" },
    { channelId: "UCDLlMjELbrJdETmSiAB68AA", name: "시민개발자 구씨", category: "korean" },
    { channelId: "UCBtG00ljZ8R_DBQCTR4C00A", name: "기술노트with 알렉", category: "korean" },
    { channelId: "UC7iAOLiALt2rtMVAWWl4pnw", name: "나도코딩", category: "korean" },
    { channelId: "UCUpJs89fSBXNolQGOYKn0YQ", name: "노마드 코더 Nomad Coders", category: "korean" },
    { channelId: "UCQNE2JmbasNYbjGAcuBiRRg", name: "조코딩 JoCoding", category: "korean" },
    { channelId: "UCSLrpBAzr-ROVGHQ5EmxnUg", name: "코딩애플", category: "korean" },
    { channelId: "UCvc8kv-i5fvFTJBFAk6n1SA", name: "생활코딩", category: "korean" },
    { channelId: "UCSEOUzkGNCT_29EU_vnBYjg", name: "개발바닥", category: "korean" },
    // AI 전문 채널
    { channelId: "UCt2wAAXgm87ACiQnDHQEW6Q", name: "테디노트 TeddyNote", category: "korean" },
    { channelId: "UC2L1DgDMD5pJ-35G47Objfw", name: "빵형의 개발도상국", category: "korean" },
    { channelId: "UCeN2YeJcBCRJoXgzF_OU3qw", name: "안될공학", category: "korean" },
    { channelId: "UCt9jbjxLBawaSaEsGB87D6g", name: "딥러닝 호형", category: "korean" },
    { channelId: "UCHcG02L6TSS-StkSbqVy6Fg", name: "코드없는 프로그래밍", category: "korean" },
    // 글로벌 채널
    { channelId: "UC_x5XG1OV2P6uZZ5FSM9Ttw", name: "Google for Developers", category: "global" },
    { channelId: "UCsBjURrPoezykLs9EqgamOA", name: "Fireship", category: "global" },
    { channelId: "UCbfYPyITQ-7l4upoX8nvctg", name: "Two Minute Papers", category: "global" },
    { channelId: "UCXZCJLdBC09xxGZ6gcdrc6A", name: "OpenAI", category: "global" },
    { channelId: "UCFbNIlppjAuEX4znoulh0Cw", name: "Web Dev Simplified", category: "global" },
    { channelId: "UCW5YeuERMmlnqo4oq8vwUpg", name: "The Net Ninja", category: "global" },
    { channelId: "UC29ju8bIPH5as8OGnQzwJyA", name: "Traversy Media", category: "global" },
    { channelId: "UCyU5wkjgQYGRB0hIHMwm2Sg", name: "Theo - t3.gg", category: "global" },
];

// 채널 시드 (DB에 INITIAL_CHANNELS의 모든 채널이 있는지 확인 및 추가)
export async function seedChannels() {
    console.log("[Seed] Syncing YouTube channels with INITIAL_CHANNELS...");
    for (const channel of INITIAL_CHANNELS) {
        await addChannel(channel);
    }
}

/**
 * AI Trends 업데이트
 * @param options.initialLoad - true면 2025년 7월 이후 모든 영상 수집, false면 전일자만 수집
 */
export async function updateAiTrends(options?: { initialLoad?: boolean }) {
    const isInitialLoad = options?.initialLoad ?? false;
    console.log(`[Scheduler] Starting AI Trends update... (initialLoad: ${isInitialLoad})`);

    // 채널 시드 확인
    await seedChannels();

    const videos: TrendItem[] = [];
    const news: TrendItem[] = [];

    // DB에서 활성 채널 가져오기
    const channels = await getActiveChannels();

    // 날짜 필터 설정
    const now = new Date();
    let cutoffDate: Date;

    if (isInitialLoad) {
        // 초기 로드: 2025년 7월 1일 이후
        cutoffDate = new Date("2025-07-01T00:00:00Z");
    } else {
        // 일일 수집: 전일 00:00 기준
        cutoffDate = new Date(now);
        cutoffDate.setDate(cutoffDate.getDate() - 1);
        cutoffDate.setHours(0, 0, 0, 0);
    }

    console.log(`[Scheduler] Cutoff date: ${cutoffDate.toISOString()}`);

    // 1. Fetch YouTube RSS (최신 영상)
    for (const channel of channels) {
        try {
            const feed = await parser.parseURL(
                `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channelId}`
            );

            // 전체 아이템 중 cutoffDate 이후만 필터링
            feed.items.forEach((item) => {
                const videoId = item.id?.replace("yt:video:", "") || "";
                const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();

                // 날짜 필터: cutoffDate 이후인 항목만 수집
                if (videoId && pubDate >= cutoffDate) {
                    videos.push({
                        title: item.title || "No Title",
                        link: item.link || `https://www.youtube.com/watch?v=${videoId}`,
                        pubDate: item.pubDate || new Date().toISOString(),
                        source: channel.name,
                        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
                    });
                }
            });
        } catch (error) {
            console.error(`[Scheduler] YouTube fetch failed for ${channel.name}:`, error);
        }
    }

    // 2. Fetch News RSS
    try {
        const feed = await parser.parseURL(
            "https://news.google.com/rss/search?q=%EC%9D%B8%EA%B3%B5%EC%A7%80%EB%8A%A5+OR+AI+OR+ChatGPT+when:7d&hl=ko&gl=KR&ceid=KR:ko"
        );
        feed.items.slice(0, 50).forEach((item) => {
            news.push({
                title: item.title || "No Title",
                link: item.link || "#",
                pubDate: item.pubDate || new Date().toISOString(),
                source: extractSource(item.title) || "Google News",
            });
        });
    } catch (error) {
        console.error("[Scheduler] News fetch failed:", error);
    }

    // Save to DB
    if (videos.length > 0) {
        await saveVideos(videos);
    }
    if (news.length > 0) {
        await saveNews(news);
    }
    console.log(`[Scheduler] Updated ${videos.length} videos and ${news.length} news items.`);
}

// Google News RSS 제목에서 출처 추출 (예: "뉴스 제목 - 한겨레")
function extractSource(title: string | undefined): string {
    if (!title) return "Google News";
    const match = title.match(/ - ([^-]+)$/);
    return match ? match[1].trim() : "Google News";
}

export async function getAiTrends(): Promise<AiTrends> {
    // 채널 시드 확인
    await seedChannels();

    let videos = await getVideosFromDb(50);
    let news = await getNewsFromDb(20);

    // If DB is empty, trigger an update immediately (first run)
    if (videos.length === 0 && news.length === 0) {
        console.log("[DB] Empty, triggering initial update...");
        await updateAiTrends();
        videos = await getVideosFromDb(50);
        news = await getNewsFromDb(20);
    }

    return { videos, news };
}
