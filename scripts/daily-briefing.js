// scripts/daily-briefing.js
// EconPedia 데일리 브리핑 파이프라인
//
// Yahoo Finance → 시장 데이터 크롤링 → Gemini → 마크다운 기사 생성 → .astro 파일 저장
//
// Phase 1 리팩토링:
//   - persona.js + prompts.js 기반 구조화된 프롬프트
//   - 기존 하드코딩 프롬프트 제거

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
import { GoogleGenAI } from '@google/genai';
import { marked } from 'marked';
import dotenv from 'dotenv';

// 프롬프트 시스템 import
import { buildArticlePrompt } from '../src/data/prompts.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ─── 시장 데이터 크롤링 ──────────────────────────────────
async function getMarketData() {
  console.log('📡 Fetching market data...');
  try {
    const symbols = {
      sp500: '^GSPC',     // S&P 500
      nasdaq: '^IXIC',    // NASDAQ
      kospi: '^KS11',     // KOSPI
      bitcoin: 'BTC-USD', // Bitcoin
      krw: 'KRW=X'        // USD/KRW Exchange Rate
    };

    const results = {};
    for (const [key, symbol] of Object.entries(symbols)) {
      let quote;
      let retries = 3;
      while (retries > 0) {
        try {
          quote = await yahooFinance.quote(symbol);
          break;
        } catch (e) {
          retries--;
          console.warn(`   ⚠️ [${symbol}] Fetch failed, retrying... (${retries} retries left) - ${e.message}`);
          if (retries === 0) throw e;
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      
      results[key] = {
        price: quote.regularMarketPrice,
        change: quote.regularMarketChange,
        changePercent: quote.regularMarketChangePercent
      };
    }
    return results;
  } catch (error) {
    console.error('Error fetching market data:', error);
    throw error;
  }
}

function formatMarketDataForPrompt(data) {
  return `
[Global Market Data]
- S&P 500: ${data.sp500.price.toFixed(2)} (${data.sp500.changePercent > 0 ? '+' : ''}${data.sp500.changePercent.toFixed(2)}%)
- NASDAQ: ${data.nasdaq.price.toFixed(2)} (${data.nasdaq.changePercent > 0 ? '+' : ''}${data.nasdaq.changePercent.toFixed(2)}%)
- KOSPI: ${data.kospi.price.toFixed(2)} (${data.kospi.changePercent > 0 ? '+' : ''}${data.kospi.changePercent.toFixed(2)}%)
- USD/KRW: ${data.krw.price.toFixed(2)} (${data.krw.changePercent > 0 ? '+' : ''}${data.krw.changePercent.toFixed(2)}%)
- Bitcoin (USD): $${data.bitcoin.price.toFixed(2)} (${data.bitcoin.changePercent > 0 ? '+' : ''}${data.bitcoin.changePercent.toFixed(2)}%)
`;
}

// ─── Gemini 기사 생성 ────────────────────────────────────
async function generateArticle(marketDataString) {
  console.log('🤖 Generating article with Gemini (고도화 프롬프트)...');
  const today = Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

  // prompts.js에서 구조화된 프롬프트 조립
  const { system, user } = buildArticlePrompt(marketDataString, today);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        { role: 'user', parts: [{ text: system + '\n\n' + user }] }
      ],
      config: {
        temperature: 0.7,
      }
    });

    return response.text;
  } catch (error) {
    console.error('Error generating article:', error);
    throw error;
  }
}

// ─── 유틸리티 ────────────────────────────────────────────
function extractExcerpt(markdownContent, maxLength = 150) {
  // Remove H1 title, then get first meaningful paragraph
  const withoutTitle = markdownContent.replace(/^#\s+(.+)$/m, '').trim();
  const lines = withoutTitle.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---'));
  const firstPara = lines[0] || '';
  // Strip markdown formatting
  const clean = firstPara.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
  return clean.length > maxLength ? clean.slice(0, maxLength) + '...' : clean;
}

async function updateManifest(dateString, title, excerpt) {
  const manifestPath = path.join(__dirname, '..', 'src', 'data', 'daily-articles.json');
  let articles = [];

  try {
    const existing = await fs.readFile(manifestPath, 'utf8');
    articles = JSON.parse(existing);
  } catch {
    // File doesn't exist yet, start fresh
  }

  // Remove existing entry for same date (in case of re-run)
  articles = articles.filter(a => a.date !== dateString);

  // Add new entry at the front
  articles.unshift({
    date: dateString,
    title: title,
    excerpt: excerpt,
    href: `/daily/${dateString}`
  });

  // Sort by date descending
  articles.sort((a, b) => b.date.localeCompare(a.date));

  // Ensure directory exists
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(articles, null, 2), 'utf8');
  console.log(`📋 Manifest updated: ${manifestPath}`);
}

// ─── .astro 파일 저장 ────────────────────────────────────
async function saveArticle(content) {
  const dateString = Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

  // Extract the first H1 from markdown to use as the title
  let title = `[EconPedia] ${dateString} 데일리 브리핑`;
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    title = titleMatch[1].replace(/"/g, "'");
    content = content.replace(/^#\s+(.+)$/m, '').trim();
  }

  // Extract excerpt for the manifest
  const excerpt = extractExcerpt(content);

  // Convert markdown to HTML using marked
  const htmlContent = marked.parse(content);

  // Escape backticks and dollar signs for Astro template literal safety
  const safeTitle = title.replace(/`/g, "'");
  const safeDescription = excerpt.replace(/`/g, "'").replace(/"/g, "'");

  // Generate Astro file with BaseLayout and proper design system classes
  const astroComponent = `---
import BaseLayout from '../../layouts/BaseLayout.astro';

const title = "${safeTitle}";
const date = "${dateString}";
const description = "${safeDescription}";
---

<BaseLayout title={title} description={description} article={true}>
  <div class="article-layout">
    <div class="article-header">
      <a href="/daily" class="article-header__category">📰 데일리 브리핑</a>
      <h1 class="article-header__title">{title}</h1>
      <div class="article-header__meta">
        <time datetime={date}>{date}</time>
        <span>•</span>
        <span>EconPedia AI · 이코노</span>
        <span>•</span>
        <span>⏱ 5분 읽기</span>
      </div>
    </div>

    <div class="article-content">
      ${htmlContent}
    </div>
  </div>
</BaseLayout>
`;

  const dirPath = path.join(__dirname, '..', 'src', 'pages', 'daily');
  const filePath = path.join(dirPath, `${dateString}.astro`);

  try {
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, astroComponent, 'utf8');
    console.log(`✅ Article saved: ${filePath}`);

    // Update the manifest
    await updateManifest(dateString, title, excerpt);

    return { filePath, title, excerpt, dateString, marketDataString: '' };
  } catch (error) {
    console.error('Error saving article:', error);
    throw error;
  }
}

// ─── 메인 파이프라인 ─────────────────────────────────────
async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ Error: GEMINI_API_KEY environment variable is not set.');
    process.exit(1);
  }

  try {
    const rawData = await getMarketData();
    const formattedData = formatMarketDataForPrompt(rawData);
    console.log('--- Market Data ---');
    console.log(formattedData);

    const articleMarkdown = await generateArticle(formattedData);
    const result = await saveArticle(articleMarkdown);

    // 시장 데이터를 파일로 저장 — 카드뉴스/블로그 스크립트에서 재사용
    const marketDataPath = path.join(__dirname, '..', '.market-data.json');
    await fs.writeFile(marketDataPath, JSON.stringify({
      raw: rawData,
      formatted: formattedData,
      date: result.dateString,
    }, null, 2), 'utf8');
    console.log(`📊 Market data saved for downstream scripts: ${marketDataPath}`);

    console.log('🚀 Daily Briefing Pipeline Completed Successfully.');
  } catch (error) {
    console.error('Pipeline failed:', error);
    process.exit(1);
  }
}

main();
