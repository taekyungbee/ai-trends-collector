import { NextResponse } from "next/server";
import { syncRecentSummariesToNotion, isNotionConfigured } from "@/lib/notion-trends";

export async function POST() {
  try {
    if (!isNotionConfigured()) {
      return NextResponse.json(
        { error: "Notion not configured" },
        { status: 500 }
      );
    }

    const result = await syncRecentSummariesToNotion(50);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Sync Notion] Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    configured: isNotionConfigured(),
    endpoint: "POST /api/trends/sync-notion",
  });
}
