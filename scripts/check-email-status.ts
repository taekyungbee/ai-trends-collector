/**
 * 이메일 발송 상태 확인
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("📊 이메일 발송 상태 확인\n");

  // 1. 최근 영상 수집 현황
  const recentVideos = await prisma.trendVideo.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { title: true, createdAt: true, source: true },
  });
  
  console.log("=== 최근 수집된 영상 (최근 5개) ===");
  if (recentVideos.length === 0) {
    console.log("❌ 수집된 영상 없음!");
  } else {
    recentVideos.forEach((v, i) => {
      console.log(`${i + 1}. [${v.createdAt.toLocaleDateString()}] ${v.source}: ${v.title.slice(0, 40)}...`);
    });
  }

  // 2. 요약 상태
  const totalVideos = await prisma.trendVideo.count();
  const withSummary = await prisma.trendVideo.count({ where: { summary: { not: null } } });
  const pendingSummary = await prisma.trendVideo.count({ where: { summary: null } });
  
  console.log("\n=== 요약 상태 ===");
  console.log(`전체 영상: ${totalVideos}개`);
  console.log(`요약 완료: ${withSummary}개`);
  console.log(`요약 대기: ${pendingSummary}개`);

  // 3. 이메일 발송 상태
  const notSent = await prisma.trendVideo.count({
    where: {
      emailSent: false,
      summary: { not: null, notIn: ["[요약 불가]", "[자막 없음]", "[요약 실패]"] },
    },
  });
  const alreadySent = await prisma.trendVideo.count({ where: { emailSent: true } });

  console.log("\n=== 이메일 발송 상태 ===");
  console.log(`발송 완료: ${alreadySent}개`);
  console.log(`발송 대기 (요약 있음): ${notSent}개`);

  // 4. 최근 7일간 수집 현황
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const recentCount = await prisma.trendVideo.count({
    where: { createdAt: { gte: sevenDaysAgo } },
  });

  console.log("\n=== 최근 7일 수집 현황 ===");
  console.log(`최근 7일 수집: ${recentCount}개`);

  // 5. 날짜별 수집 현황
  const last7Days = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
    SELECT DATE(created_at) as date, COUNT(*) as count 
    FROM trend_videos 
    WHERE created_at >= NOW() - INTERVAL '7 days'
    GROUP BY DATE(created_at) 
    ORDER BY date DESC
  `;

  console.log("\n=== 날짜별 수집 현황 ===");
  if (last7Days.length === 0) {
    console.log("❌ 최근 7일간 수집된 영상 없음!");
  } else {
    last7Days.forEach((row) => {
      console.log(`${row.date}: ${row.count}개`);
    });
  }

  // 6. 발송 대기 중인 영상 목록
  const pendingEmails = await prisma.trendVideo.findMany({
    where: {
      emailSent: false,
      summary: { not: null, notIn: ["[요약 불가]", "[자막 없음]", "[요약 실패]"] },
    },
    orderBy: { pubDate: "desc" },
    take: 5,
    select: { title: true, source: true, pubDate: true },
  });

  console.log("\n=== 발송 대기 영상 (최근 5개) ===");
  if (pendingEmails.length === 0) {
    console.log("발송 대기 영상 없음 (이미 모두 발송됨)");
  } else {
    pendingEmails.forEach((v, i) => {
      console.log(`${i + 1}. [${v.pubDate.toLocaleDateString()}] ${v.source}: ${v.title.slice(0, 40)}...`);
    });
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);
