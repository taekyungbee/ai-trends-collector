
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
    try {
        // 1. Find potential English summaries
        // Criteria: Contains "Main topic", "Expected topic", "Key points"
        const englishSummaries = await prisma.trendVideo.findMany({
            where: {
                OR: [
                    { summary: { contains: "Main topic" } },
                    { summary: { contains: "Expected topic" } },
                    { summary: { contains: "Key points" } },
                    { summary: { contains: "Video title:" } }, // Another English indicator
                ]
            },
            select: { id: true, title: true }
        });

        if (englishSummaries.length === 0) {
            return NextResponse.json({
                success: true,
                message: "No English summaries found to reset.",
                count: 0
            });
        }

        // 2. Reset them to null
        const result = await prisma.trendVideo.updateMany({
            where: {
                id: { in: englishSummaries.map(v => v.id) }
            },
            data: {
                summary: null
            }
        });

        // 3. Trigger immediate summarization for these (optional)
        // We can't easily trigger the batch process here without importing it or calling the API.
        // Let's just return success and let the user/client call the summarize endpoint.

        return NextResponse.json({
            success: true,
            message: `Reset ${result.count} summaries.`,
            resetUnknowns: englishSummaries.map(v => v.title)
        });
    } catch (error) {
        console.error("[Reset API] Error:", error);
        return NextResponse.json(
            { success: false, error: String(error) },
            { status: 500 }
        );
    }
}
