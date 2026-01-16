import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const stats = await prisma.trendVideo.groupBy({
    by: ["source"],
    _count: { source: true },
    orderBy: { _count: { source: "desc" } },
  });

  const allChannels = await prisma.youTubeChannel.findMany({
    where: { active: true },
    select: { name: true, channelId: true },
  });

  const channelNames = new Set(allChannels.map((c) => c.name));
  const statsMap = new Map(stats.map((s) => [s.source, s._count.source]));

  const result = allChannels.map((c) => ({
    name: c.name,
    count: statsMap.get(c.name) || 0,
  })).sort((a, b) => b.count - a.count);

  const total = stats.reduce((sum, s) => sum + s._count.source, 0);

  return NextResponse.json({
    channels: result,
    totalVideos: total,
    channelsWithData: result.filter((c) => c.count > 0).length,
    channelsWithoutData: result.filter((c) => c.count === 0).length,
  });
}
