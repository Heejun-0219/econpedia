import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function getMarketData() {
  console.log('Fetching market data...');
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
  console.log('Generating article with Gemini...');
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

async function saveArticle(content) {
  const currentDate = new Date();
  // Format as YYYY-MM-DD
  const dateString = currentDate.toISOString().split('T')[0];
  
  // Extract the first H1 from markdown to use as the title in Astro frontmatter
  let title = `[EconPedia] ${dateString} 데일리 브리핑`;
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    title = titleMatch[1].replace(/"/g, "'"); // Escape quotes
    // Optionally remove the H1 from content to avoid duplicate titles in Astro layout
    content = content.replace(/^#\s+(.+)$/m, '').trim();
  }

  // Generate Astro file with frontmatter
  const astroComponent = `---
import Layout from '../../layouts/Layout.astro';

const title = "${title}";
const date = "${dateString}";
---

<Layout title={title}>
  <main class="max-w-3xl mx-auto px-4 py-12 markdown-body">
    <div class="mb-8 border-b border-gray-200 pb-8">
      <h1 class="text-4xl font-extrabold tracking-tight text-gray-900 mb-4">{title}</h1>
      <div class="flex items-center text-sm text-gray-500">
        <time datetime={date}>{date}</time>
        <span class="mx-2">•</span>
        <span>EconPedia AI</span>
      </div>
    </div>
    
    <article class="prose prose-lg prose-blue max-w-none">
      ${content}
    </article>
  </main>
</Layout>
`;

  const dirPath = path.join(__dirname, '..', 'src', 'pages', 'daily');
  const filePath = path.join(dirPath, `${dateString}.astro`);

  try {
    // Ensure directory exists
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, astroComponent, 'utf8');
    console.log(`✅ Article successfully saved at: ${filePath}`);
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
