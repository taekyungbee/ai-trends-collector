import { NextRequest, NextResponse } from "next/server";
import { sendTrendsSummaryEmail, sendTestEmailWithSample, isEmailConfigured } from "@/lib/email-trends";

export async function POST(request: NextRequest) {
  try {
    if (!isEmailConfigured()) {
      return NextResponse.json(
        { error: "Email not configured" },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { test } = body;

    // 테스트 모드: 샘플 데이터로 발송
    if (test) {
      const result = await sendTestEmailWithSample();
      return NextResponse.json({ success: result, mode: "test" });
    }

    const result = await sendTrendsSummaryEmail();

    return NextResponse.json({
      success: result,
    });
  } catch (error) {
    console.error("[Send Email] Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    configured: isEmailConfigured(),
    endpoint: "POST /api/trends/send-email",
  });
}
