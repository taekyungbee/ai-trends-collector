/**
 * YouTube Transcript Extraction
 * 1차: youtubei.js로 자막 추출
 * 2차: 페이지 직접 파싱 fallback
 */

import { Innertube } from "youtubei.js";

let innertube: Innertube | null = null;

async function getInnertube(): Promise<Innertube> {
  if (!innertube) {
    innertube = await Innertube.create({
      lang: "ko",
      location: "KR",
    });
  }
  return innertube;
}

/**
 * youtubei.js로 자막 추출 (1차 시도)
 */
async function getTranscriptViaInnertube(videoId: string): Promise<string | null> {
  try {
    const yt = await getInnertube();
    const info = await yt.getInfo(videoId);

    const transcriptInfo = await info.getTranscript();
    if (!transcriptInfo?.transcript?.content?.body?.initial_segments) {
      console.log(`[Transcript] No transcript via Innertube for ${videoId}`);
      return null;
    }

    const segments = transcriptInfo.transcript.content.body.initial_segments;
    const text = segments
      .map((seg: { snippet?: { text?: string } }) => seg.snippet?.text || "")
      .filter((t: string) => t.length > 0)
      .join(" ");

    if (text.length > 0) {
      console.log(`[Transcript] Innertube: ${text.length} chars for ${videoId}`);
      return text;
    }

    return null;
  } catch (error) {
    console.log(`[Transcript] Innertube error for ${videoId}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * 페이지 직접 파싱 (2차 fallback)
 */
async function getTranscriptViaPage(videoId: string): Promise<string | null> {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (!response.ok) {
      console.log(`[Transcript] Page fetch error ${response.status} for ${videoId}`);
      return null;
    }

    const html = await response.text();

    // captionTracks JSON 추출
    const captionMatch = html.match(/"captionTracks":(\[.*?\])/);
    if (!captionMatch) {
      console.log(`[Transcript] No caption tracks in page for ${videoId}`);
      return null;
    }

    const captionTracks = JSON.parse(captionMatch[1]);
    if (!captionTracks || captionTracks.length === 0) {
      return null;
    }

    // 한국어 우선, 없으면 영어
    let track = captionTracks.find(
      (t: { languageCode: string }) =>
        t.languageCode === "ko" || t.languageCode === "ko-KR"
    );
    if (!track) {
      track = captionTracks.find(
        (t: { languageCode: string }) =>
          t.languageCode === "en" || t.languageCode.startsWith("en")
      );
    }
    if (!track) {
      track = captionTracks[0];
    }

    console.log(`[Transcript] Page: found ${track.languageCode} for ${videoId}`);

    // 자막 XML 가져오기
    const captionResponse = await fetch(track.baseUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/xml, application/xml, */*",
      },
    });

    if (!captionResponse.ok) {
      console.log(`[Transcript] Caption fetch error ${captionResponse.status} for ${videoId}`);
      return null;
    }

    const xml = await captionResponse.text();
    const transcript = parseTranscriptXml(xml);

    if (transcript.length > 0) {
      console.log(`[Transcript] Page: ${transcript.length} chars for ${videoId}`);
      return transcript;
    }

    return null;
  } catch (error) {
    console.log(`[Transcript] Page error for ${videoId}:`, error);
    return null;
  }
}

/**
 * 자막 XML 파싱
 */
function parseTranscriptXml(xml: string): string {
  const regex = /<text[^>]*>([^<]*)<\/text>/g;
  const texts: string[] = [];
  let match;

  while ((match = regex.exec(xml)) !== null) {
    let text = match[1];
    text = text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/\\n/g, " ")
      .replace(/\n/g, " ")
      .trim();
    if (text.length > 0) {
      texts.push(text);
    }
  }

  return texts.join(" ");
}

/**
 * 유튜브 영상 ID로 자막 추출 (통합)
 * 1차: youtubei.js
 * 2차: 페이지 직접 파싱
 */
export async function getTranscript(videoId: string): Promise<string | null> {
  // 1차: youtubei.js
  const transcript = await getTranscriptViaInnertube(videoId);
  if (transcript) {
    return transcript;
  }

  // 2차: 페이지 직접 파싱
  return getTranscriptViaPage(videoId);
}

/**
 * 영상 정보 가져오기 (Gemini fallback용)
 * 1차: youtubei.js
 * 2차: 페이지 직접 파싱 (oEmbed + HTML)
 */
export async function getVideoInfo(videoId: string): Promise<{
  title: string;
  description: string;
  channelName: string;
  duration: string;
} | null> {
  // 1차: youtubei.js
  try {
    const yt = await getInnertube();
    const info = await yt.getBasicInfo(videoId);
    const details = info.basic_info;

    if (details.title && details.short_description) {
      return {
        title: details.title || "",
        description: details.short_description || "",
        channelName: details.channel?.name || "",
        duration: formatDuration(details.duration || 0),
      };
    }
  } catch (error) {
    console.log(`[VideoInfo] Innertube error for ${videoId}:`, error instanceof Error ? error.message : error);
  }

  // 2차: 페이지 직접 파싱
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (!response.ok) {
      console.log(`[VideoInfo] Page fetch error ${response.status} for ${videoId}`);
      return null;
    }

    const html = await response.text();

    // JSON-LD에서 정보 추출
    const ldRegex = /<script type="application\/ld\+json"[^>]*>([^<]+)<\/script>/g;
    let ldMatch;
    while ((ldMatch = ldRegex.exec(html)) !== null) {
      try {
        const jsonData = JSON.parse(ldMatch[1]);
        if (jsonData["@type"] === "VideoObject") {
          console.log(`[VideoInfo] Page: found JSON-LD for ${videoId}`);
          return {
            title: jsonData.name || "",
            description: jsonData.description || "",
            channelName: jsonData.author?.name || "",
            duration: jsonData.duration || "",
          };
        }
      } catch {
        // JSON 파싱 실패시 다음 매치로
        continue;
      }
    }

    // meta 태그에서 정보 추출
    const titleMatch = html.match(/<meta name="title" content="([^"]*)">/);
    const descMatch = html.match(/<meta name="description" content="([^"]*)">/);
    const channelMatch = html.match(/<link itemprop="name" content="([^"]*)">/);

    if (titleMatch || descMatch) {
      console.log(`[VideoInfo] Page: found meta tags for ${videoId}`);
      return {
        title: titleMatch?.[1] || "",
        description: descMatch?.[1] || "",
        channelName: channelMatch?.[1] || "",
        duration: "",
      };
    }

    return null;
  } catch (error) {
    console.log(`[VideoInfo] Page error for ${videoId}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * 유튜브 URL에서 video ID 추출
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
    /youtu\.be\/([a-zA-Z0-9_-]+)/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}
