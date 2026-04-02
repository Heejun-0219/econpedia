import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
import { GoogleGenAI } from '@google/genai';
import { marked } from 'marked';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function getMarketData() {
  console.log('📡 Fetching market data...');
  try {
    const symbols = {
      sp500: '^GSPC',    // S&P 500
      nasdaq: '^IXIC',   // NASDAQ
      kospi: '^KS11',    // KOSPI
      bitcoin: 'BTC-USD',// Bitcoin
      krw: 'KRW=X'       // USD/KRW Exchange Rate
    };

    const results = {};
    for (const [key, symbol] of Object.entries(symbols)) {
      const quote = await yahooFinance.quote(symbol);
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

async function generateArticle(marketDataString) {
  console.log('🤖 Generating article with Gemini...');
  const today = new Date().toISOString().split('T')[0];

  const systemPrompt = `당신은 'EconPedia'의 총괄 시니어 기자이자 최고의 데이터 애널리스트입니다.
오늘의 주요 글로벌 경제 지표 데이터를 분석하여, 초보자도 쉽게 이해할 수 있는 매력적이고 바이럴 가능성이 높은 아침 경제 브리핑 기사를 작성하십시오.

[작업 원칙]
1. 킬러 헤드라인: 호기심과 숫자를 자극하는 매력적인 헤드라인을 맨 위에 하나만 작성하세요. (마크다운 H1)
2. 친근한 어조: 딱딱한 뉴스가 아닌 옆에서 똑똑한 친구가 설명해주는 듯한 톤(뉴닉, 어피티 스타일) 유지.
3. 데이터 스토리텔링: "환율이 올랐다"가 아니라 그게 "내 월급과 주식 계좌에 무슨 의미인지" 맥락을 짚어주세요.
4. 요약(Executive Summary): 상단에 오늘의 핵심을 3줄 요약하세요.
5. 포맷: Astro 페이지에 삽입하기 쉬운 순수 Markdown 본문으로 작성해주세요 (frontmatter는 제외).

오늘 날짜: ${today}
`;

  const userPrompt = `다음은 오늘 아침의 최신 금융/경제 데이터입니다:\n${marketDataString}\n\n위 데이터를 분석하여 오늘의 경제 브리핑 기사 마크다운 콘텐츠를 작성해주세요. H1 제목 꼭 포함해주세요.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
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

async function saveArticle(content) {
  const currentDate = new Date();
  const dateString = currentDate.toISOString().split('T')[0];

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
        <span>EconPedia AI</span>
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

    return filePath;
  } catch (error) {
    console.error('Error saving article:', error);
    throw error;
  }
}

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
    await saveArticle(articleMarkdown);

    console.log('🚀 Daily Briefing Pipeline Completed Successfully.');
  } catch (error) {
    console.error('Pipeline failed:', error);
    process.exit(1);
  }
}

main();
