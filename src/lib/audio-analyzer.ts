/**
 * Audio Analyzer
 * 유튜브 영상 오디오 추출 및 Gemini를 통한 분석
 * 1차: youtubei.js (추천)
 * 2차: @distube/ytdl-core (fallback)
 */

import { Innertube } from "youtubei.js";
import ytdl from "@distube/ytdl-core";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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
 * 유튜브 영상에서 오디오 다운로드 (youtubei.js 사용)
 */
async function downloadAudio(videoId: string): Promise<string | null> {
    const tempDir = os.tmpdir();
    const audioPath = path.join(tempDir, `${videoId}.mp3`);

    try {
        if (fs.existsSync(audioPath)) {
            console.log(`[AudioAnalyzer] Using cached audio: ${audioPath}`);
            return audioPath;
        }

        console.log(`[AudioAnalyzer] Downloading audio for ${videoId} via youtubei.js...`);

        const yt = await getInnertube();
        const stream = await yt.download(videoId, {
            type: 'audio',
            quality: 'bestefficiency', // 용량 효율적인 품질
            format: 'mp4', // mp4 오디오 스트림
        });

        const fileStream = fs.createWriteStream(audioPath);
        const reader = stream.getReader();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fileStream.write(value);
        }

        fileStream.end();

        await new Promise<void>((resolve) => fileStream.on('finish', () => resolve()));

        const stats = fs.statSync(audioPath);
        console.log(`[AudioAnalyzer] Downloaded: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        return audioPath;
    } catch (error) {
        console.warn(`[AudioAnalyzer] youtubei.js download failed for ${videoId}, trying ytdl-core fallback...`, error);

        // Fallback to ytdl-core
        try {
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            const audioStream = ytdl(videoUrl, {
                filter: "audioonly",
                quality: "lowestaudio",
            });

            const writeStream = fs.createWriteStream(audioPath);

            await new Promise<void>((resolve, reject) => {
                audioStream.pipe(writeStream);
                audioStream.on("error", reject);
                writeStream.on("finish", resolve);
                writeStream.on("error", reject);
            });

            return audioPath;
        } catch (fallbackError) {
            console.error(`[AudioAnalyzer] Both download methods failed for ${videoId}:`, fallbackError);
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            return null;
        }
    }
}

/**
 * 오디오 파일을 Gemini에 업로드
 */
async function uploadAudioToGemini(audioPath: string): Promise<string | null> {
    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured");
    }

    try {
        const fileManager = new GoogleAIFileManager(GEMINI_API_KEY);

        console.log(`[AudioAnalyzer] Uploading audio to Gemini...`);

        const uploadResult = await fileManager.uploadFile(audioPath, {
            mimeType: "audio/mpeg",
            displayName: path.basename(audioPath),
        });

        let file = uploadResult.file;
        while (file.state === FileState.PROCESSING) {
            console.log(`[AudioAnalyzer] Processing...`);
            await new Promise((r) => setTimeout(r, 2000));
            file = await fileManager.getFile(file.name);
        }

        if (file.state === FileState.FAILED) {
            console.error(`[AudioAnalyzer] File processing failed`);
            return null;
        }

        console.log(`[AudioAnalyzer] Upload complete: ${file.uri}`);
        return file.uri;
    } catch (error) {
        console.error(`[AudioAnalyzer] Upload failed:`, error);
        return null;
    }
}

/**
 * Gemini로 오디오 분석 및 요약
 */
async function analyzeAudioWithGemini(
    fileUri: string,
    videoTitle: string
): Promise<string | null> {
    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured");
    }

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

        const prompt = `이 오디오는 "${videoTitle}"이라는 유튜브 영상입니다.
영상 내용을 듣고 반드시 한국어로 요약해주세요.
AI 모델의 답변 여부나 서론 없이 작성된 요약 내용만 즉시 출력하세요.

[출력 형식]
(핵심 주제 1줄)

(주요 내용 3-5개 bullet point)

(결론/시사점 1줄)

* 주의: "핵심 주제:", "주요 내용:", "결론:" 같은 라벨을 붙이지 말고 내용만 작성하세요.`;

        console.log(`[AudioAnalyzer] Analyzing audio with Gemini...`);

        const result = await model.generateContent([
            {
                fileData: {
                    mimeType: "audio/mpeg",
                    fileUri: fileUri,
                },
            },
            { text: prompt },
        ]);

        const response = await result.response;
        const summary = response.text();

        console.log(`[AudioAnalyzer] Analysis complete: ${summary.length} chars`);
        return summary;
    } catch (error) {
        console.error(`[AudioAnalyzer] Analysis failed:`, error);
        return null;
    }
}

/**
 * 임시 오디오 파일 정리
 */
function cleanupAudioFile(audioPath: string): void {
    try {
        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
            console.log(`[AudioAnalyzer] Cleaned up: ${audioPath}`);
        }
    } catch (error) {
        console.error(`[AudioAnalyzer] Cleanup failed:`, error);
    }
}

/**
 * 유튜브 영상 오디오 분석 (통합 함수)
 */
export async function summarizeFromAudio(
    videoId: string,
    videoTitle: string
): Promise<string | null> {
    let audioPath: string | null = null;

    try {
        // 1. 오디오 다운로드
        audioPath = await downloadAudio(videoId);
        if (!audioPath) {
            return null;
        }

        // 2. Gemini에 업로드
        const fileUri = await uploadAudioToGemini(audioPath);
        if (!fileUri) {
            return null;
        }

        // 3. 분석 및 요약
        const summary = await analyzeAudioWithGemini(fileUri, videoTitle);
        return summary;
    } catch (error) {
        console.error(`[AudioAnalyzer] summarizeFromAudio failed:`, error);
        return null;
    } finally {
        if (audioPath) {
            cleanupAudioFile(audioPath);
        }
    }
}

export { downloadAudio, uploadAudioToGemini, analyzeAudioWithGemini };
