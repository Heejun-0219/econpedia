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
import { analyzeSignals } from './signal-engine.js';

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
      krw: 'KRW=X',       // USD/KRW Exchange Rate
      oil: 'CL=F'         // Crude Oil
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

    // Fetch real Korea Base Rate from Bank of Korea (BOK)
    try {
      const bokResponse = await fetch('https://www.bok.or.kr/portal/main/main.do');
      if (bokResponse.ok) {
        const html = await bokResponse.text();
        const rateMatch = html.match(/<span class="ctype2"><em>(\d+\.\d+)<\/em>%<\/span>/);
        if (rateMatch && rateMatch[1]) {
          const currentRate = parseFloat(rateMatch[1]);
          results.baseRate = {
            price: currentRate,
            // Assuming 0 change today for now; in a real DB, you'd compare against yesterday's rate.
            change: 0,
            changePercent: 0
          };
          console.log(`✅ [BOK Base Rate] Fetched: ${currentRate}%`);
        }
      }
    } catch (e) {
      console.warn('⚠️ Failed to fetch Base Rate from BOK:', e.message);
    }

    // Fallback if BOK fetch fails
    if (!results.baseRate) {
      results.baseRate = { price: 3.50, change: 0, changePercent: 0 };
    }

    // Mock API for Korea CPI (Phase 3 Data Source Integration pending)
    results.cpi = { price: 114.2, change: 0.3, changePercent: 0.26 }; // e.g., inflation up 0.3%

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
- Crude Oil (WTI): $${data.oil.price.toFixed(2)} (${data.oil.changePercent > 0 ? '+' : ''}${data.oil.changePercent.toFixed(2)}%)
- KR Base Rate: ${data.baseRate.price.toFixed(2)}% (${data.baseRate.change > 0 ? '+' : ''}${data.baseRate.change.toFixed(2)}%p)
- KR CPI Index: ${data.cpi.price.toFixed(1)} (${data.cpi.changePercent > 0 ? '+' : ''}${data.cpi.changePercent.toFixed(2)}%)
`;
}

// ─── Gemini 기사 생성 ────────────────────────────────────
async function generateArticle(marketDataString, weatherData) {
  console.log('🤖 Generating article with Gemini (날씨 맞춤 프롬프트)...');
  const today = Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

  // prompts.js에서 구조화된 프롬프트 조립
  const { system, user } = buildArticlePrompt(marketDataString, weatherData, today);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [
        { role: 'user', parts: [{ text: system + '\n\n' + user }] }
      ],
      config: {
        temperature: 0.7,
      }
    });

    return response.text;
  } catch (error) {
    if (error.status === 429 || (error.message && error.message.includes('spending cap'))) {
      console.log('⚠️ API quota exceeded. Falling back to mock article generation.');
      return `# [EconPedia] ${today} 데일리 브리핑\n\n현재 API 사용량 초과(Quota Exceeded)로 임시 생성된 브리핑입니다. 시스템 관리자에게 문의하여 API 한도를 늘리거나 키를 교체해주세요.\n\n${marketDataString}`;
    }
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
  // Pre-process **bold** text manually since marked struggles with Korean particles attached to it
  const preProcessedContent = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const htmlContent = marked.parse(preProcessedContent);

  // Escape backticks and dollar signs for Astro template literal safety
  const safeTitle = title.replace(/`/g, "'");
  const safeDescription = excerpt.replace(/`/g, "'").replace(/"/g, "'");

  // Generate Astro file with BaseLayout and proper design system classes
  const astroComponent = `---
import BaseLayout from '../../layouts/BaseLayout.astro';
import PollWidget from '../../components/PollWidget.astro';

const title = "${safeTitle}";
const date = "${dateString}";
const description = "${safeDescription}";
---

<BaseLayout title={title} description={description} article={true}>
  <div class="article-layout">
    <div class="article-header">
      <a href="/daily" class="article-header__category">데일리 브리핑</a>
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

      <PollWidget 
        questionId={\`daily-\${date}\`}
        question="오늘 브리핑에서 가장 인상 깊었던 이슈는 무엇인가요?"
        optionA="📈 긍정적인 지표/소식"
        optionB="📉 우려되는 지표/소식"
      />
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

// ─── 슬랙 에러 알림 ──────────────────────────────────────
async function sendSlackError(context, error) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const errorMessage = error instanceof Error ? error.message : String(error);
  let errorDetail = '';
  
  if (errorMessage.includes('429') && errorMessage.includes('spending cap')) {
    errorDetail = '💡 *원인:* Gemini API 월 사용량 한도(Spending Cap) 초과\n💡 *조치:* <https://ai.studio/spend|Google AI Studio Billing> 에서 한도 확인 및 수정 또는 API 키 교체 필요';
  } else if (context.includes('Market Data Fetch')) {
    errorDetail = '💡 *원인:* Yahoo Finance 또는 한국은행 API 크롤링 실패 (네트워크 이슈, API 구조 변경 등)';
  } else if (context.includes('Environment')) {
    errorDetail = '💡 *원인:* 필수 환경변수(.env) 누락';
  }

  const payload = {
    text: `🚨 *EconPedia 파이프라인 에러 알림*\n\n*발생 단계:* ${context}\n\n*에러 내용:*\n\`\`\`\n${errorMessage}\n\`\`\`\n\n${errorDetail}`
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log('✅ Slack error notification sent.');
  } catch (e) {
    console.error('❌ Failed to send Slack notification:', e);
  }
}

// ─── 메인 파이프라인 ─────────────────────────────────────
async function main() {
  if (!process.env.GEMINI_API_KEY) {
    const msg = 'GEMINI_API_KEY environment variable is not set.';
    console.error(`❌ Error: ${msg}`);
    await sendSlackError('Environment Validation', new Error(msg));
    process.exit(1);
  }

  try {
    let rawData, formattedData, weatherData;
    
    try {
      rawData = await getMarketData();
      formattedData = formatMarketDataForPrompt(rawData);
      // 1. Signal Engine으로 경제 날씨 판정
      weatherData = analyzeSignals(rawData);
    } catch (e) {
      await sendSlackError('Market Data Fetch (시장 데이터 크롤링)', e);
      throw e;
    }

    console.log(`\n⛅ 오늘의 경제 날씨: ${weatherData.emoji} ${weatherData.label}`);
    console.log(`➡️ 헤드라인: ${weatherData.headline}`);
    console.log(`➡️ 발행 결정: 기사=${weatherData.shouldPublishArticle}, 내용깊이=${weatherData.contentDepth}\n`);

    let articleResult = null;

    // 2. 발행 조건 만족 시에만 기사 생성
    if (weatherData.shouldPublishArticle) {
      let articleMarkdown;
      try {
        articleMarkdown = await generateArticle(formattedData, weatherData);
      } catch (e) {
        await sendSlackError('Article Generation (Gemini AI 기사 생성)', e);
        throw e;
      }
      
      try {
        articleResult = await saveArticle(articleMarkdown);
      } catch (e) {
        await sendSlackError('File Save (Astro 파일 및 Manifest 저장)', e);
        throw e;
      }
    } else {
      console.log('😴 날씨가 평화로워 오늘 기사는 발행하지 않습니다.');
    }

    // 3. 시장 데이터를 파일로 저장 — 카드뉴스/블로그/홈페이지 위젯에서 재사용
    try {
      const marketDataPath = path.join(__dirname, '..', '.market-data.json');
      const todayStr = Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
      
      await fs.writeFile(marketDataPath, JSON.stringify({
        raw: rawData,
        formatted: formattedData,
        weatherData: weatherData,
        date: articleResult ? articleResult.dateString : todayStr,
      }, null, 2), 'utf8');
      console.log(`📊 Market data & weather saved for downstream scripts: ${marketDataPath}`);
    } catch (e) {
      await sendSlackError('Market Data Save (시장 데이터 JSON 저장)', e);
      throw e;
    }

    // 4. 텔레그램 채널 Push 알림 — "Push First" 전략
    if (articleResult) {
      await sendTelegramBriefing(articleResult, weatherData);
    }

    console.log('🚀 Daily Briefing Pipeline Completed Successfully.');
  } catch (error) {
    console.error('Pipeline failed:', error);
    process.exit(1);
  }
}

// ─── 텔레그램 데일리 브리핑 Push ───────────────────────────
async function sendTelegramBriefing(articleResult, weatherData) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_OWNER_ID;

  if (!token || !chatId) {
    console.log('⏭️ TELEGRAM_BOT_TOKEN 미설정 — 텔레그램 Push 건너뜀');
    return;
  }

  const articleUrl = `https://econpedia.dedyn.io/daily/${articleResult.dateString}/?utm_source=telegram&utm_medium=push&utm_campaign=daily`;

  // 지갑 영향 요약 (top 3 변동 항목)
  const walletLines = (weatherData.walletImpacts || [])
    .filter(w => w.sentiment !== 'neutral')
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 3)
    .map(w => `${w.emoji} ${w.message}`)
    .join('\n');

  const text = [
    `${weatherData.emoji} *오늘의 경제 날씨: ${weatherData.label}*`,
    ``,
    `📰 *${articleResult.title}*`,
    ``,
    articleResult.excerpt,
    ``,
    walletLines ? `💰 *내 지갑 타격감*\n${walletLines}` : '',
    ``,
    `👉 [3분 브리핑 전문 읽기](${articleUrl})`,
    ``,
    `📮 매일 아침 이 브리핑을 받으려면 👉 [뉴스레터 구독](https://econpedia.dedyn.io/#newsletter-block?utm_source=telegram)`,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    });

    if (res.ok) {
      console.log('✅ [Telegram] 데일리 브리핑 Push 전송 성공');
    } else {
      const err = await res.json();
      console.warn(`⚠️ [Telegram] Push 전송 실패: ${err.description}`);
    }
  } catch (e) {
    console.warn(`⚠️ [Telegram] Push 통신 에러: ${e.message}`);
  }
}

main();
