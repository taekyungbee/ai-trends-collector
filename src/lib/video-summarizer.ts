/**
 * Video Summarizer
 * 유튜브 영상 자막 추출 → Gemini 요약 → DB 저장
 */

import { prisma } from "./prisma";
import { getTranscript, extractVideoId, getVideoInfo } from "./youtube-transcript";
import { summarizeText, summarizeFromVideoInfo, isGeminiConfigured } from "./gemini-api";
import { summarizeFromAudio } from "./audio-analyzer";

interface VideoToSummarize {
  id: number;
  link: string;
  title: string;
  source: string;
}

/**
 * 요약이 없는 최근 영상들 조회
 */
export async function getVideosWithoutSummary(
  limit: number = 20
): Promise<VideoToSummarize[]> {
  const videos = await prisma.trendVideo.findMany({
    where: {
      summary: null,
    },
    orderBy: { pubDate: "desc" },
    take: limit,
    select: {
      id: true,
      link: true,
      title: true,
      source: true,
    },
  });

  return videos;
}

/**
 * 단일 영상 요약 생성 및 저장
 */
export async function summarizeAndSaveVideo(
  video: VideoToSummarize
): Promise<{ success: boolean; summary?: string; error?: string }> {
  try {
    const videoId = extractVideoId(video.link);
    if (!videoId) {
      return { success: false, error: "Invalid video URL" };
    }

    // 1. 자막 추출 시도
    const transcript = await getTranscript(videoId);

    let summary: string;

    if (transcript) {
      // 2A. 자막이 있으면 자막 기반 요약
      console.log(`[Summarizer] Using transcript for ${videoId}`);
      summary = await summarizeText(transcript, {
        title: video.title,
        language: "ko",
      });
    } else {
      // 2B. 자막 없으면 오디오 분석 시도
      console.log(`[Summarizer] No transcript, trying audio analysis for ${videoId}`);
      const audioSummary = await summarizeFromAudio(videoId, video.title);

      if (audioSummary) {
        console.log(`[Summarizer] Audio analysis successful for ${videoId}`);
        summary = audioSummary;
      } else {
        // 2C. 오디오 분석도 실패하면 영상 정보로 fallback
        console.log(`[Summarizer] Audio failed, using video info fallback for ${videoId}`);
        const videoInfo = await getVideoInfo(videoId);

        if (!videoInfo || !videoInfo.description) {
          // 영상 정보도 없으면 실패
          await prisma.trendVideo.update({
            where: { id: video.id },
            data: { summary: "[요약 불가]" },
          });
          return { success: true, summary: "[요약 불가]" };
        }

        summary = await summarizeFromVideoInfo({
          title: videoInfo.title || video.title,
          description: videoInfo.description,
          channelName: videoInfo.channelName || video.source,
          duration: videoInfo.duration,
        });
      }
    }

    // 3. DB 저장
    await prisma.trendVideo.update({
      where: { id: video.id },
      data: { summary },
    });

    console.log(`[Summarizer] Summarized: ${video.title.slice(0, 50)}...`);
    return { success: true, summary };
  } catch (error) {
    console.error(`[Summarizer] Failed: ${video.title}`, error);
    return { success: false, error: String(error) };
  }
}

/**
 * 배치로 여러 영상 요약
 */
export async function summarizeVideosBatch(
  limit: number = 10
): Promise<{ processed: number; success: number; failed: number }> {
  if (!isGeminiConfigured()) {
    console.warn("[Summarizer] Gemini API not configured");
    return { processed: 0, success: 0, failed: 0 };
  }

  const videos = await getVideosWithoutSummary(limit);
  console.log(`[Summarizer] Processing ${videos.length} videos...`);

  let success = 0;
  let failed = 0;

  for (const video of videos) {
    const result = await summarizeAndSaveVideo(video);

    if (result.success) {
      success++;
    } else {
      failed++;
    }

    // Rate limit: Gemini 무료 티어 = 분당 15회
    // 4.5초 간격으로 호출 (분당 약 13회)
    await new Promise((r) => setTimeout(r, 4500));
  }

  console.log(
    `[Summarizer] Complete: ${success} success, ${failed} failed`
  );

  return { processed: videos.length, success, failed };
}

/**
 * 오늘 새로 추가된 영상만 요약
 */
export async function summarizeTodaysVideos(): Promise<{
  processed: number;
  success: number;
  failed: number;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const videos = await prisma.trendVideo.findMany({
    where: {
      summary: null,
      createdAt: { gte: today },
    },
    orderBy: { pubDate: "desc" },
    select: {
      id: true,
      link: true,
      title: true,
      source: true,
    },
  });

  console.log(`[Summarizer] Today's videos without summary: ${videos.length}`);

  let success = 0;
  let failed = 0;

  for (const video of videos) {
    const result = await summarizeAndSaveVideo(video);
    if (result.success) success++;
    else failed++;

    await new Promise((r) => setTimeout(r, 4500));
  }

  return { processed: videos.length, success, failed };
}
