/**
 * Google API 연결 테스트
 */

import "dotenv/config";
import { isGeminiConfigured } from "../src/lib/gemini-api";
import { isYouTubeApiConfigured } from "../src/lib/youtube-api";
import { isEmailConfigured } from "../src/lib/email-trends";
import { isNotionConfigured } from "../src/lib/notion-trends";
import { isNewsApiConfigured } from "../src/lib/news-api";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function testGeminiApi() {
  console.log("\n=== Gemini API 테스트 ===");
  
  if (!isGeminiConfigured()) {
    console.log("❌ GEMINI_API_KEY 미설정");
    return false;
  }
  
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent("Say 'Hello' in Korean");
    const text = result.response.text();
    console.log("✅ Gemini API 정상:", text.slice(0, 50));
    return true;
  } catch (error: any) {
    console.log("❌ Gemini API 오류:", error.message);
    return false;
  }
}

async function testYouTubeApi() {
  console.log("\n=== YouTube Data API 테스트 ===");
  
  if (!isYouTubeApiConfigured()) {
    console.log("⚠️ YOUTUBE_API_KEY 미설정 (선택 기능)");
    return true;
  }
  
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=UCsBjURrPoezykLs9EqgamOA&key=${apiKey}`
    );
    
    if (!response.ok) {
      const error = await response.text();
      console.log("❌ YouTube API 오류:", error);
      return false;
    }
    
    const data = await response.json();
    console.log("✅ YouTube API 정상:", data.items?.[0]?.snippet?.title || "채널 조회 성공");
    return true;
  } catch (error: any) {
    console.log("❌ YouTube API 오류:", error.message);
    return false;
  }
}

async function testNotionApi() {
  console.log("\n=== Notion API 테스트 ===");
  
  if (!isNotionConfigured()) {
    console.log("⚠️ NOTION_TRENDS_API_KEY 미설정");
    return false;
  }
  
  try {
    const { Client } = await import("@notionhq/client");
    const notion = new Client({ auth: process.env.NOTION_TRENDS_API_KEY });
    
    // DB 조회 테스트
    const response = await notion.databases.retrieve({
      database_id: process.env.NOTION_TRENDS_DB_ID!,
    });
    
    console.log("✅ Notion API 정상: DB 연결됨");
    return true;
  } catch (error: any) {
    console.log("❌ Notion API 오류:", error.message);
    return false;
  }
}

function checkEmailConfig() {
  console.log("\n=== Gmail 설정 확인 ===");
  
  if (!isEmailConfigured()) {
    console.log("❌ GMAIL_USER 또는 GMAIL_APP_PASSWORD 미설정");
    return false;
  }
  
  console.log("✅ Gmail 설정됨 (실제 발송은 테스트하지 않음)");
  return true;
}

function checkNewsApiConfig() {
  console.log("\n=== News API 설정 확인 ===");
  
  if (!isNewsApiConfigured()) {
    console.log("⚠️ NEWS_API_KEY 미설정 (선택 기능)");
    return true;
  }
  
  console.log("✅ News API 설정됨");
  return true;
}

async function main() {
  console.log("🔍 API 연결 테스트 시작...\n");
  
  const results = {
    gemini: await testGeminiApi(),
    youtube: await testYouTubeApi(),
    notion: await testNotionApi(),
    gmail: checkEmailConfig(),
    news: checkNewsApiConfig(),
  };
  
  console.log("\n=== 테스트 결과 요약 ===");
  console.log("Gemini API:", results.gemini ? "✅" : "❌");
  console.log("YouTube API:", results.youtube ? "✅" : "❌");
  console.log("Notion API:", results.notion ? "✅" : "❌");
  console.log("Gmail:", results.gmail ? "✅" : "❌");
  console.log("News API:", results.news ? "✅" : "❌");
  
  const allPassed = Object.values(results).every(v => v);
  console.log("\n" + (allPassed ? "🎉 모든 API 정상!" : "⚠️ 일부 API 확인 필요"));
}

main().catch(console.error);
