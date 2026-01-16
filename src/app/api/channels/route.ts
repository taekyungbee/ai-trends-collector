import { NextRequest, NextResponse } from "next/server";
import { getAllChannels, addChannel, removeChannel, YouTubeChannelData } from "@/lib/db";

// GET - 모든 채널 조회
export async function GET() {
  try {
    const channels = await getAllChannels();
    return NextResponse.json(channels);
  } catch (error) {
    console.error("Failed to get channels:", error);
    return NextResponse.json({ error: "Failed to get channels" }, { status: 500 });
  }
}

// POST - 채널 추가
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelId, name, category } = body as YouTubeChannelData;

    if (!channelId || !name || !category) {
      return NextResponse.json(
        { error: "channelId, name, category are required" },
        { status: 400 }
      );
    }

    if (!channelId.startsWith("UC") || channelId.length !== 24) {
      return NextResponse.json(
        { error: "Invalid channel ID format. Must start with UC and be 24 characters" },
        { status: 400 }
      );
    }

    await addChannel({ channelId, name, category });
    return NextResponse.json({ success: true, message: `Channel ${name} added` });
  } catch (error) {
    console.error("Failed to add channel:", error);
    return NextResponse.json({ error: "Failed to add channel" }, { status: 500 });
  }
}

// DELETE - 채널 비활성화
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");

    if (!channelId) {
      return NextResponse.json({ error: "channelId is required" }, { status: 400 });
    }

    await removeChannel(channelId);
    return NextResponse.json({ success: true, message: `Channel ${channelId} removed` });
  } catch (error) {
    console.error("Failed to remove channel:", error);
    return NextResponse.json({ error: "Failed to remove channel" }, { status: 500 });
  }
}
