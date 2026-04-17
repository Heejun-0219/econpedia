// scripts/generate-card-news.js
// EconPedia 카드뉴스 자동 생성 파이프라인
//
// 흐름: .market-data.json → Gemini → JSON → Puppeteer → 5장 PNG
//
// 필요한 환경 변수:
//   GEMINI_API_KEY
//
// 의존 스크립트: daily-briefing.js가 먼저 실행되어 .market-data.json을 생성해야 함

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// 프롬프트 시스템 import
import { buildCardNewsPrompt } from '../src/data/prompts.js';
import { publishCardNewsToTelegram } from './publish-external.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ─── 시장 데이터 로드 ────────────────────────────────────
async function loadMarketData() {
  const marketDataPath = path.join(ROOT, '.market-data.json');
  try {
    const raw = await fs.readFile(marketDataPath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('❌ .market-data.json 로드 실패. daily-briefing.js가 먼저 실행되어야 합니다.');
    console.error('   에러:', e.message);
    process.exit(1);
  }
}

// ─── Gemini → 카드뉴스 JSON 생성 ─────────────────────────
async function generateCardNewsData(formattedData, weatherData, today) {
  console.log('🎨 Gemini에 카드뉴스 데이터 요청 중...');

  const { system, user } = buildCardNewsPrompt(formattedData, weatherData, today);

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [
      { role: 'user', parts: [{ text: system + '\n\n' + user }] }
    ],
    config: {
      temperature: 0.7,
    }
  });

  const text = response.text;

  // JSON 추출 — Gemini가 코드블록으로 감쌀 수 있으므로 처리
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const data = JSON.parse(jsonStr);
    if (!data.slides || data.slides.length !== 1) {
      throw new Error(`❌ 슬라이드 수가 1이 아닙니다: ${data.slides?.length}`);
    }
    // 새 바이럴 타입과 레거시 타입 모두 허용
    const validTypes = ['all_in_one', 'hook', 'surprise', 'wallet', 'insider', 'cta', 'cover', 'data', 'insight'];
    for (const s of data.slides) {
      if (!validTypes.includes(s.type)) {
        console.warn(`   ⚠️ 알 수 없는 슬라이드 타입: ${s.type} — 렌더링 시 폴백 처리`);
      }
    }
    console.log(`✅ 카드뉴스 데이터 생성 완료 (${data.slides.length}장, 타입: ${data.slides.map(s => s.type).join('→')})`);
    return data;
  } catch (e) {
    console.error('❌ JSON 파싱 실패:', e.message);
    console.error('원본 응답:', text.slice(0, 500));
    throw e;
  }
}

// ─── Puppeteer → 이미지 생성 ─────────────────────────────
async function renderCardImages(cardData, dateString) {
  const outputDir = path.join(ROOT, 'public', 'cards', dateString);
  await fs.mkdir(outputDir, { recursive: true });

  const templatePath = path.join(__dirname, 'templates', 'card-news.html');
  const templateUrl = `file://${templatePath}`;

  console.log('📸 Puppeteer 이미지 렌더링 시작...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
  await page.goto(templateUrl, { waitUntil: 'networkidle0' });

  const imagePaths = [];

  for (let i = 0; i < cardData.slides.length; i++) {
    // 슬라이드 데이터 주입 및 렌더링
    await page.evaluate((data, idx) => {
      window.renderSlide(data, idx);
    }, cardData, i);

    // 폰트 로드 대기
    await page.waitForFunction(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 300));

    const imgPath = path.join(outputDir, `slide-${i + 1}.png`);
    await page.screenshot({
      path: imgPath,
      type: 'png',
      clip: { x: 0, y: 0, width: 1080, height: 1350 },
    });

    imagePaths.push(imgPath);
    console.log(`   📷 Slide ${i + 1}/${cardData.slides.length} saved: ${imgPath}`);
  }

  await browser.close();
  console.log(`✅ 카드뉴스 이미지 생성 완료: ${outputDir}`);

  return { outputDir, imagePaths };
}

// ─── 카드뉴스 상태 저장 ──────────────────────────────────
async function saveCardNewsStatus(success, message, dateString, outputDir) {
  const statusPath = path.join(ROOT, '.cardnews-status.json');
  const status = {
    success,
    message,
    date: dateString,
    outputDir: outputDir || null,
    slideCount: success ? 1 : 0,
    ts: new Date().toISOString(),
  };
  await fs.writeFile(statusPath, JSON.stringify(status, null, 2), 'utf-8');
  console.log(`📋 카드뉴스 상태 저장: ${statusPath}`);
}

// ─── 메인 ────────────────────────────────────────────────
async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY 환경 변수가 없습니다.');
    await saveCardNewsStatus(false, 'GEMINI_API_KEY 미설정', '', null);
    process.exit(0); // 전체 파이프라인 중단 방지
  }

  try {
    const marketData = await loadMarketData();
    const today = marketData.date || Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

    if (marketData.weatherData && marketData.weatherData.shouldPublishCardNews === false) {
      console.log('😴 날씨가 평화로워 오늘 카드뉴스는 발행하지 않습니다.');
      await saveCardNewsStatus(true, '평화로운 날씨로 카드뉴스 발행 스킵', today, null);
      process.exit(0);
    }

    // Gemini로 카드뉴스 데이터 생성
    const cardData = await generateCardNewsData(marketData.formatted, marketData.weatherData, today);

    // 카드뉴스 JSON 저장 (디버깅 용도)
    const jsonPath = path.join(ROOT, 'public', 'cards', today, 'data.json');
    await fs.mkdir(path.dirname(jsonPath), { recursive: true });
    await fs.writeFile(jsonPath, JSON.stringify(cardData, null, 2), 'utf-8');

    // Puppeteer로 이미지 렌더링
    const { outputDir, imagePaths } = await renderCardImages(cardData, today);

    // ─── 텔레그램 카드뉴스 앨범 발행 ───────────────────
    if (process.env.TELEGRAM_BOT_TOKEN) {
      const canonicalUrl = `https://econpedia.dedyn.io/daily/${today}`;
      // 새 바이럴 타입(hook.question)과 레거시(cover.headline) 모두 대응
      const firstSlide = cardData.slides[0];
      const tgTitle = firstSlide.question || firstSlide.headline || '오늘의 카드뉴스';
      const tgMsg = await publishCardNewsToTelegram(tgTitle, imagePaths, canonicalUrl);
      console.log(tgMsg);
    }
    // ──────────────────────────────────────────────────

    await saveCardNewsStatus(true, `${today} 카드뉴스 1장 생성`, today, outputDir);
    console.log('🚀 Card News Pipeline Completed Successfully.');

  } catch (error) {
    console.error('❌ 카드뉴스 파이프라인 실패:', error.message);
    await saveCardNewsStatus(false, error.message, '', null);
    process.exit(0); // 전체 파이프라인 중단 방지
  }
}

main();
