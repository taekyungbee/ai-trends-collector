import cron from "node-cron";
import { updateAiTrends } from "./ai-trends";
import { summarizeVideosBatch } from "./video-summarizer";
import { syncTodaySummariesToNotion } from "./notion-trends";
import { sendTrendsSummaryEmail } from "./email-trends";

export function initScheduler() {
    // Run every day at 00:00 (Midnight) - Trends update
    cron.schedule("0 0 * * *", async () => {
        console.log("[Cron] Running daily AI Trends update...");
        await updateAiTrends();
    });

    // Run every day at 01:00 - Video summarization (after trends update)
    cron.schedule("0 1 * * *", async () => {
        console.log("[Cron] Running daily video summarization...");
        const result = await summarizeVideosBatch(20);
        console.log(`[Cron] Summarization complete: ${result.success}/${result.processed} success`);
    });

    // Run every day at 02:00 - Sync to Notion & Send Email
    cron.schedule("0 2 * * *", async () => {
        console.log("[Cron] Syncing summaries to Notion...");
        const notionResult = await syncTodaySummariesToNotion();
        console.log(`[Cron] Notion sync: ${notionResult.success}/${notionResult.total}`);

        console.log("[Cron] Sending summary email...");
        await sendTrendsSummaryEmail();
    });

    console.log("[Scheduler] Daily: 00:00 trends, 01:00 summarize, 02:00 notion+email");
}
