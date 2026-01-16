import { NextResponse } from "next/server";
import { updateAiTrends } from "@/lib/ai-trends";

// POST - 트렌드 데이터 수동 업데이트
export async function POST() {
  try {
    console.log("[API] Manual trend update triggered");
    await updateAiTrends();
    return NextResponse.json({ success: true, message: "Trends updated successfully" });
  } catch (error) {
    console.error("Failed to update trends:", error);
    return NextResponse.json({ error: "Failed to update trends" }, { status: 500 });
  }
}
