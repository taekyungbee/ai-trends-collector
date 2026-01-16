/**
 * Gemini API Integration
 * 유튜브 영상 요약을 위한 API
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;

function getGenAI() {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return genAI;
}

export async function summarizeText(
  text: string,
  options: {
    title?: string;
    maxLength?: number;
    language?: "ko" | "en";
  } = {}
): Promise<string> {
  const { title, maxLength = 500, language = "ko" } = options;

  const ai = getGenAI();
  const model = ai.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const prompt = language === "ko"
    ? `다음은 유튜브 영상의 자막입니다. 핵심 내용을 ${maxLength}자 이내로 반드시 한국어로 요약해주세요.
AI 모델의 답변 여부나 서론 없이 작성된 요약 내용만 즉시 출력하세요.
${title ? `영상 제목: ${title}\n` : ""}
[출력 형식]
(핵심 주제 1줄)

(주요 내용 3-5개 bullet point)

(결론/시사점 1줄)

(참고 자료/링크 - 영상/자막 내 언급된 유용한 URL이나 자료가 있다면 간단히 명시. 없으면 생략)

* 주의: "핵심 주제:", "주요 내용:", "결론:" 같은 라벨을 붙이지 말고 내용만 작성하세요.

자막:
${text}`
    : `Summarize the following YouTube video transcript in ${maxLength} characters or less.
${title ? `Video title: ${title}\n` : ""}
Format:
- Main topic (1 line)
- Key points (3-5 bullet points)
- Conclusion (1 line)

Transcript:
${text}`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("[Gemini API] Summarization failed:", error);
    throw error;
  }
}

export async function summarizeVideoBatch(
  videos: { videoId: string; title: string; transcript: string }[]
): Promise<Map<string, string>> {
  const summaries = new Map<string, string>();

  for (const video of videos) {
    try {
      // 자막이 너무 길면 앞부분만 사용 (약 15000자 = Gemini 토큰 한도 고려)
      const truncatedTranscript = video.transcript.slice(0, 15000);

      const summary = await summarizeText(truncatedTranscript, {
        title: video.title,
        language: "ko",
      });

      summaries.set(video.videoId, summary);

      // Rate limit 방지 (분당 15회 제한)
      await new Promise((r) => setTimeout(r, 4500));
    } catch (error) {
      console.error(`[Gemini API] Failed to summarize ${video.videoId}:`, error);
      summaries.set(video.videoId, "요약 생성 실패");
    }
  }

  return summaries;
}

export function isGeminiConfigured(): boolean {
  return !!GEMINI_API_KEY;
}

/**
 * 영상 정보만으로 요약 생성 (자막 없을 때 fallback)
 */
export async function summarizeFromVideoInfo(info: {
  title: string;
  description: string;
  channelName: string;
  duration: string;
}): Promise<string> {
  const ai = getGenAI();
  const model = ai.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const language = "ko";

  const prompt = language === "ko"
    ? `다음 유튜브 영상의 제목과 설명을 요약해주세요.
AI 모델의 답변 여부나 서론 없이 작성된 요약 내용만 즉시 출력하세요.

영상 제목: ${info.title}
채널명: ${info.channelName}
영상 길이: ${info.duration}
영상 설명:
${info.description.slice(0, 2000)}

[출력 형식]
(주제 1줄)

(주요 내용 3-5개 bullet point)

(시청 추천 대상 1줄)

(참고 자료/링크 - 설명란에 있는 유용한 URL이나 자료가 있다면 간단히 명시. 없으면 생략)

* 주의: "주제:", "주요 내용:", "시청 추천 대상:" 같은 라벨을 붙이지 말고 내용만 작성하세요.`
    : `Summarize the following YouTube video based on its title and description.

Video Title: ${info.title}
Channel: ${info.channelName}
Duration: ${info.duration}
Description:
${info.description.slice(0, 2000)}

Format:
- Topic (1 line)
- Key points (3-5 bullet points)
- Recommended audience (1 line)`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("[Gemini API] Video info summarization failed:", error);
    throw error;
  }
}

export async function translateToKorean(text: string): Promise<string> {
  const ai = getGenAI();
  const model = ai.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const prompt = `Translate the following text to Korean. Maintain the original formatting and meaning. If the text is already in Korean, return it as is.

Text:
${text}`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("[Gemini API] Translation failed:", error);
    throw error;
  }
}

/**
 * 뉴스 기사 요약
 */
export async function summarizeNews(
  title: string,
  content: string,
  source: string
): Promise<string> {
  const ai = getGenAI();
  const model = ai.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const prompt = `다음 뉴스 기사의 내용을 한국어로 요약해 주세요.
AI 모델의 답변 여부나 서론, 본문 없음 언급 등을 절대 포함하지 말고 작성된 요약 내용만 즉시 출력하세요.
입력 데이터가 부족해도 가능한 범위 내에서 요약문 형식만 반환하세요.

기사 제목: ${title}
출처: ${source}

기사 본문(일부):
${content.slice(0, 10000)}

[출력 형식]
(핵심 요약 2-3문장. 기사의 전체 맥락을 파악할 수 있도록 구체적으로 작성)

(상세 주요 내용 5-7개 bullet point, '-'로 시작. 각 항목은 단순 나열이 아닌 서술형으로 1-2문장씩 작성)

(업계 파급효과 및 시사점 2-3문장. 단순 결론이 아닌 통찰력 있는 분석 포함)

* 주의: "핵심 요약:", "상세 주요 내용:", "업계 파급효과:" 같은 라벨을 붙이지 말고 내용만 작성하세요.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("[Gemini API] News summarization failed:", error);
    throw error;
  }
}
