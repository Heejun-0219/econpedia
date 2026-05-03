// scripts/generate-whale-analysis.js
// .whale-signals.json에서 Top N 시그널을 읽고 AI 분석 페이지를 생성
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { marked } from 'marked';
import dotenv from 'dotenv';
import { buildWhaleAnalysisPrompt } from '../src/data/prompts.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const SIGNALS_PATH = path.join(ROOT, '.whale-signals.json');
const ANALYSES_JSON_PATH = path.join(ROOT, 'src', 'data', 'whale-analyses.json');
const WHALE_PAGES_DIR = path.join(ROOT, 'src', 'pages', 'whale');
const MAX_ANALYSES_PER_RUN = 3;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function getIsinWithAI(companyName, ticker) {
  try {
    const prompt = `Find the ISIN for "${companyName}" (ticker: ${ticker}). Return ONLY the 12-character ISIN code. If unknown, return "unknown".`;
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.1, maxOutputTokens: 100 }
    });
    const isin = response.text?.trim().toUpperCase();
    if (!isin || isin === 'UNKNOWN' || isin.length !== 12) return null;
    return isin;
  } catch { return null; }
}

async function callGemini(prompt, temperature = 0.7, maxOutputTokens = 8192) {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [{ role: 'user', parts: [{ text: prompt.system + '\n\n' + prompt.user }] }],
    config: { temperature, maxOutputTokens }
  });
  return response.text;
}

function extractJsonBlock(content) {
  const regex = /\`\`\`json\n([\s\S]*?)\n\`\`\`/;
  const match = content.match(regex);
  if (match && match[1]) {
    try { return JSON.parse(match[1]); } catch { return null; }
  }
  return null;
}

async function saveAnalysisPage(signal, markdownContent, metadata, isin) {
  const cleanMarkdown = markdownContent.replace(/\`\`\`json\n[\s\S]*?\n\`\`\`/g, '').trim();
  let title = metadata.seoTitle;
  const titleMatch = cleanMarkdown.match(/^#\s+(.+)$/m);
  if (titleMatch) title = titleMatch[1].replace(/"/g, "'");
  const bodyMarkdown = cleanMarkdown.replace(/^#\s+(.+)$/m, '').trim();
  const htmlContent = marked.parse(bodyMarkdown);

  const slug = metadata.slug || `whale-${signal.ticker.toLowerCase()}-${signal.date}`;
  const safeTitle = title.replace(/"/g, "'");
  const safeDescription = (metadata.seoDescription || '').replace(/"/g, "'");
  const isBuy = signal.direction === 'buy';
  const badgeStyle = isBuy
    ? 'background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);'
    : 'background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);';
  const marketFlag = signal.market === 'us' ? '🇺🇸' : '🇰🇷';

  const astroComponent = `---
import BaseLayout from '../../layouts/BaseLayout.astro';
import TradeCTA from '../../components/TradeCTA.astro';

const title = "${safeTitle}";
const date = "${signal.date}";
const description = "${safeDescription}";
---

<BaseLayout title={title} description={description} article={true}>
  <div class="article-layout">
    <div class="article-header">
      <a href="/whale" class="article-header__category">🐋 Whale Alert</a>
      <h1 class="article-header__title">{title}</h1>
      <div class="article-header__meta">
        <time datetime={date}>{date}</time>
        <span>•</span>
        <span>EconPedia AI · 이코노</span>
        <span>•</span>
        <span>${marketFlag} ${signal.companyName}</span>
      </div>
    </div>

    <div class="article-content portfolio-content">
      <div class="investor-profile-card">
        <h3>${marketFlag} ${signal.companyName} (${signal.ticker})</h3>
        <p><strong>매매자:</strong> ${signal.person}</p>
        <p>
          <strong>거래 방향:</strong>
          <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 700; ${badgeStyle}">
            ${isBuy ? '🟢 장내 매수 (Buy)' : '🔴 장내 매도 (Sell)'}
          </span>
        </p>
        <p><strong>거래 규모:</strong> ${signal.amount}</p>
        <p><strong>출처:</strong> ${signal.source}</p>
      </div>

      ${htmlContent}

      <TradeCTA
        ticker="${signal.ticker}"
        name="${signal.companyName}"
        isPositive={${isBuy}}
        isin="${isin || ''}"
      />

      <div class="ai-disclaimer">
        <strong>⚠️ 투자 주의사항</strong>
        <p>본 콘텐츠는 AI(Google Gemini)가 공개된 공시 데이터를 바탕으로 생성한 정보 제공 목적의 콘텐츠입니다. 특정 종목에 대한 투자 추천 또는 투자 조언이 아니며, 투자 결정은 반드시 본인의 판단과 책임하에 이루어져야 합니다.</p>
      </div>
    </div>
  </div>
</BaseLayout>

<style>
.investor-profile-card {
  background: var(--color-surface-hover);
  padding: 1.5rem;
  border-radius: 12px;
  margin-bottom: 2rem;
  border-left: 4px solid var(--color-accent-primary);
}
.investor-profile-card h3 { margin-top: 0; margin-bottom: 0.5rem; }
.investor-profile-card p { margin: 0.35rem 0; font-size: 0.95em; opacity: 0.9; }
.ai-disclaimer {
  background: rgba(234, 179, 8, 0.08);
  border: 1px solid rgba(234, 179, 8, 0.3);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin-top: 2rem;
  font-size: 0.9em;
}
.ai-disclaimer strong { color: #ca8a04; display: block; margin-bottom: 0.4rem; }
.ai-disclaimer p { margin: 0; opacity: 0.85; line-height: 1.6; }
</style>
`;

  const filePath = path.join(WHALE_PAGES_DIR, `${slug}.astro`);
  await fs.mkdir(WHALE_PAGES_DIR, { recursive: true });
  await fs.writeFile(filePath, astroComponent, 'utf8');
  console.log(`✅ Page saved: ${slug}.astro`);

  return {
    slug, title: safeTitle, excerpt: safeDescription, date: signal.date,
    ticker: signal.ticker, companyName: signal.companyName,
    category: signal.type, market: signal.market, isBuy,
    person: signal.person, amount: signal.amount, significance: signal.significance
  };
}

async function updateManifest(newAnalysis) {
  let analyses = [];
  try {
    const existing = await fs.readFile(ANALYSES_JSON_PATH, 'utf8');
    analyses = JSON.parse(existing);
  } catch { }

  const idx = analyses.findIndex(a => a.slug === newAnalysis.slug);
  if (idx !== -1) analyses[idx] = newAnalysis;
  else analyses.unshift(newAnalysis);

  analyses.sort((a, b) => b.date.localeCompare(a.date));
  await fs.writeFile(ANALYSES_JSON_PATH, JSON.stringify(analyses, null, 2), 'utf8');
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set');
    process.exit(1);
  }

  let signals = [];
  try {
    signals = JSON.parse(await fs.readFile(SIGNALS_PATH, 'utf8'));
  } catch {
    console.log('ℹ️ No whale signals found. Skipping.');
    return;
  }

  if (signals.length === 0) {
    console.log('ℹ️ No whale signals to analyze today.');
    return;
  }

  let marketContext = "최근 거시경제 지표 및 시장 분위기 분석 필요";
  try {
    const md = JSON.parse(await fs.readFile(path.join(ROOT, '.market-data.json'), 'utf8'));
    marketContext = md.formatted || marketContext;
  } catch { }

  const topSignals = signals.slice(0, MAX_ANALYSES_PER_RUN);
  console.log(`🐋 Top ${topSignals.length} Whale Signal 분석 시작...\n`);

  for (const signal of topSignals) {
    console.log(`🤖 [${signal.ticker}] ${signal.person} 분석 생성 중...`);

    // ISIN 확보
    const isin = await getIsinWithAI(signal.companyName, signal.ticker);
    if (isin) console.log(`  🔗 ISIN: ${isin}`);

    const prompt = buildWhaleAnalysisPrompt(signal, marketContext);
    console.log(`  📝 [초안 작성 중...]`);
    const rawOutput = await callGemini(prompt, 0.7);

    console.log(`  🕵️‍♂️ [수석 에디터 QC 중...]`);
    const qcPrompt = {
      system: `당신은 EconPedia의 수석 에디터(데스크)이자 금융 컴플라이언스 전문가입니다.`,
      user: `아래는 주니어 애널리스트가 작성한 내부자 거래(Whale Alert) 분석 기사의 초안입니다.
당신의 임무는 이 초안을 검수하고, 다음 기준에 맞게 완벽히 다듬어진 최종본을 반환하는 것입니다.

[검수 기준]
1. 불필요한 메타 발언 제거: "본 분석은 AI가 작성했습니다", "결론적으로", "마무리하며", "참고로 이 데이터는" 같은 상투적인 문구를 모두 제거하세요.
2. 컴플라이언스 준수: "반드시 매수하세요", "강력 추천합니다" 같은 확정적인 투자 권유 뉘앙스가 있다면 중립적인 분석(예: "긍정적인 시그널로 해석될 수 있습니다")으로 톤다운하세요.
3. 포맷팅 유지: 초안 최상단에 있는 메타데이터 블록(\`\`\`json ... \`\`\`)은 절대로 훼손하지 말고 그대로 최상단에 유지하세요.
4. 가독성 극대화: 단락을 짧게 나누고, 중요한 수치나 인사이트는 볼드체(**)를 활용하세요. 문체는 "~합니다" 체를 사용하세요.

[초안 기사]
${rawOutput}

위 기준을 엄격히 적용하여 교정된 전체 텍스트(JSON 메타데이터 블록 포함)를 그대로 출력해주세요.`
    };
    
    const finalOutput = await callGemini(qcPrompt, 0.4);
    const metadata = extractJsonBlock(finalOutput) || {
      slug: `whale-${signal.ticker.toLowerCase()}-${signal.date}`,
      seoTitle: `[${signal.ticker}] ${signal.person} 거래 분석`,
      seoDescription: "Whale Alert 분석 결과입니다."
    };

    const resultMeta = await saveAnalysisPage(signal, finalOutput, metadata, isin);
    await updateManifest(resultMeta);

    // 텔레그램 Push 알림
    await sendWhaleTelegram(signal, resultMeta);

    console.log(`✅ [${signal.ticker}] 분석 완료.\n`);
  }

  console.log('🚀 Whale Alert Pipeline Completed Successfully.');
}

// ─── 텔레그램 Whale Alert Push ───────────────────────────
async function sendWhaleTelegram(signal, meta) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_OWNER_ID;
  if (!token || !chatId) return;

  const flag = signal.market === 'us' ? '🇺🇸' : '🇰🇷';
  const dir = signal.direction === 'buy' ? '🟢 매수' : '🔴 매도';
  const url = `https://econpedia.dedyn.io/whale/${meta.slug}/?utm_source=telegram&utm_medium=push&utm_campaign=whale`;

  const text = [
    `🐋 *Whale Alert — 내부자 거래 포착*`,
    ``,
    `${flag} *${signal.companyName}* (${signal.ticker})`,
    `${dir} · ${signal.amount}`,
    `👤 ${signal.person}`,
    ``,
    `📰 *${meta.title}*`,
    ``,
    `👉 [AI 분석 읽기](${url})`,
  ].join('\n');

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    });
    console.log(`  📨 [Telegram] Whale Push 전송 완료`);
  } catch (e) {
    console.warn(`  ⚠️ [Telegram] Whale Push 실패: ${e.message}`);
  }
}

main();
