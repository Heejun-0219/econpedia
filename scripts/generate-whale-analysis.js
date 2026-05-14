// scripts/generate-whale-analysis.js
// .whale-signals.json에서 Top N 시그널을 읽고 AI 분석 페이지를 생성
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { marked } from 'marked';
import dotenv from 'dotenv';
import YahooFinance from 'yahoo-finance2';
import { buildWhaleAnalysisPrompt } from '../src/data/prompts.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const SIGNALS_PATH = path.join(ROOT, '.whale-signals.json');
const ANALYSES_JSON_PATH = path.join(ROOT, 'src', 'data', 'whale-analyses.json');
const WHALE_PAGES_DIR = path.join(ROOT, 'src', 'pages', 'whale');
const CASE_HISTORY_PATH = path.join(ROOT, 'data', 'insider-case-history.json');
const MAX_ANALYSES_PER_RUN = 3;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

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

// ── Yahoo Finance에서 후행 가격(D+N) 조회 ──────────────────
function yahooSymbolFor(signal) {
  if (signal.market === 'kr') return [`${signal.ticker}.KS`, `${signal.ticker}.KQ`];
  return [signal.ticker];
}

async function getFollowUpPrices(signal) {
  const baseDate = new Date(signal.date);
  if (Number.isNaN(baseDate.getTime())) return null;

  const horizons = { d0: 0, d30: 30, d90: 90, d180: 180, d365: 365 };
  const today = new Date();
  const farthest = new Date(baseDate);
  farthest.setDate(farthest.getDate() + 400);
  const period2 = farthest > today ? today : farthest;
  if (period2 <= baseDate) return null;

  const symbols = yahooSymbolFor(signal);
  let quotes = null;
  for (const sym of symbols) {
    try {
      const res = await yahooFinance.chart(sym, {
        period1: baseDate,
        period2,
        interval: '1d'
      });
      if (res?.quotes?.some(q => q.close)) { quotes = res.quotes.filter(q => q.close); break; }
    } catch { /* try next */ }
  }
  if (!quotes || quotes.length === 0) return null;

  const findClosest = (targetMs) => {
    let best = null;
    let bestDiff = Infinity;
    for (const q of quotes) {
      const d = Math.abs(q.date.getTime() - targetMs);
      if (d < bestDiff) { bestDiff = d; best = q; }
    }
    // 거래일 ± 7일 이내만 인정
    return bestDiff <= 7 * 24 * 60 * 60 * 1000 ? best : null;
  };

  const base = findClosest(baseDate.getTime());
  if (!base) return null;

  const result = { basePrice: base.close, baseDate: base.date.toISOString().split('T')[0], horizons: {} };
  const now = Date.now();
  for (const [label, days] of Object.entries(horizons)) {
    if (label === 'd0') continue;
    const target = baseDate.getTime() + days * 24 * 60 * 60 * 1000;
    if (target > now) { result.horizons[label] = null; continue; }
    const q = findClosest(target);
    if (!q) { result.horizons[label] = null; continue; }
    const pct = ((q.close - base.close) / base.close) * 100;
    result.horizons[label] = {
      date: q.date.toISOString().split('T')[0],
      close: parseFloat(q.close.toFixed(2)),
      pct: parseFloat(pct.toFixed(2))
    };
  }
  return result;
}

// ── 비슷한 업종 과거 사례 매칭 ──────────────────────────────
let _caseHistory = null;
async function loadCaseHistory() {
  if (_caseHistory) return _caseHistory;
  try {
    const raw = await fs.readFile(CASE_HISTORY_PATH, 'utf8');
    _caseHistory = JSON.parse(raw);
  } catch (e) {
    console.warn('  ⚠️ insider-case-history.json 로드 실패:', e.message);
    _caseHistory = { cases: [] };
  }
  return _caseHistory;
}

function buildSectorTokens(signal) {
  const tokens = new Set();
  const push = (v) => {
    if (!v) return;
    for (const t of String(v).toLowerCase().split(/[\s\-,\/]+/)) {
      if (t.length >= 3) tokens.add(t);
    }
  };
  push(signal.sector);
  push(signal.sicCode);
  push(signal.companyName);
  return tokens;
}

function magnitudeBucket(usd) {
  if (usd >= 1e9) return 4;
  if (usd >= 1e8) return 3;
  if (usd >= 1e7) return 2;
  if (usd >= 1e6) return 1;
  return 0;
}

async function findSimilarCases(signal, max = 3) {
  const { cases } = await loadCaseHistory();
  if (!cases?.length) return [];
  const tokens = buildSectorTokens(signal);
  const targetBucket = magnitudeBucket(signal.totalUsd || 0);

  const scored = cases
    .filter(c => c.ticker !== signal.ticker) // 같은 종목은 제외 (자기참조 방지)
    .map(c => {
      let score = 0;
      if (c.direction === signal.direction) score += 30;
      for (const kw of c.sectorKeywords || []) {
        if (tokens.has(kw.toLowerCase())) score += 25;
      }
      const cBucket = magnitudeBucket(c.valueUsd || 0);
      score += Math.max(0, 20 - Math.abs(cBucket - targetBucket) * 6);
      if (c.market === signal.market) score += 10;
      return { case: c, score };
    })
    .filter(s => s.score >= 35) // 최소 매칭 점수
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(s => s.case);

  return scored;
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

function formatPct(pct) {
  if (pct === null || pct === undefined) return '—';
  const sign = pct > 0 ? '+' : '';
  const color = pct > 0 ? '#10b981' : pct < 0 ? '#ef4444' : '#94a3b8';
  return `<span style="color:${color};font-weight:700">${sign}${pct.toFixed(1)}%</span>`;
}

function renderFollowUpBlock(followUp) {
  if (!followUp) return '';
  const h = followUp.horizons || {};
  const rows = [
    ['D+30', h.d30],
    ['D+90', h.d90],
    ['D+180', h.d180],
    ['D+365', h.d365],
  ];
  const cells = rows.map(([label, v]) => `
    <div class="followup-cell">
      <div class="followup-label">${label}</div>
      <div class="followup-pct">${v ? formatPct(v.pct) : '<span style="opacity:.5">미도래</span>'}</div>
      <div class="followup-date">${v?.date || ''}</div>
    </div>
  `).join('');
  return `
    <div class="followup-card">
      <h4>🎯 이 거래 이후 주가 (단순 변동률, 시장 평균 미보정)</h4>
      <div class="followup-grid">${cells}</div>
      <p class="followup-caption">기준일 종가 ${followUp.basePrice.toFixed(2)} (${followUp.baseDate}) 대비. 미도래 구간은 향후 자동 백필됩니다.</p>
    </div>`;
}

function renderSimilarCasesBlock(similar) {
  if (!similar?.length) return '';
  const items = similar.map(c => {
    const flag = c.market === 'us' ? '🇺🇸' : '🇰🇷';
    const dirBadge = c.direction === 'buy'
      ? '<span style="background:rgba(16,185,129,.15);color:#10b981;padding:2px 8px;border-radius:4px;font-weight:700">매수</span>'
      : '<span style="background:rgba(239,68,68,.15);color:#ef4444;padding:2px 8px;border-radius:4px;font-weight:700">매도</span>';
    return `
      <div class="case-card">
        <div class="case-head">
          <strong>${flag} ${c.company} (${c.ticker})</strong>
          ${dirBadge}
        </div>
        <div class="case-meta">${c.person} · ${c.date} · 약 $${(c.valueUsd / 1e6).toFixed(1)}M</div>
        <div class="case-outcome">
          <span>D+30 ${formatPct(c.outcomePct30d)}</span>
          <span>D+90 ${formatPct(c.outcomePct90d)}</span>
          <span>D+180 ${formatPct(c.outcomePct180d)}</span>
          <span>D+365 ${formatPct(c.outcomePct365d)}</span>
        </div>
        <p class="case-narrative">${c.narrative}</p>
        <p class="case-source">📎 ${c.source} · 회사 후속: ${c.companyOutcome}</p>
      </div>`;
  }).join('');
  return `
    <h2 id="similar-cases">📊 비슷한 업종, 비슷한 규모 — 그 후 어떻게 됐나</h2>
    <p style="opacity:.85;font-size:.95em">아래는 EconPedia가 사전 큐레이션한 공개 사례 중 본 거래와 섹터·방향·규모가 가장 유사한 케이스입니다. <strong>모든 변동률은 단순 raw 종가 변동률(시장 평균 미보정)이며, 큐레이션 추정치라 단가 1자리 단위에서 오차가 있을 수 있습니다.</strong> 정확한 수치는 각 카드 하단 출처(SEC Form 4 / DART 공시)에서 직접 검증하세요.</p>
    <div class="similar-cases">${items}</div>`;
}

async function saveAnalysisPage(signal, markdownContent, metadata, isin, chartData, followUp, similarCases) {
  const cleanMarkdown = markdownContent.replace(/\`\`\`json\n[\s\S]*?\n\`\`\`/g, '').trim();
  let title = metadata.seoTitle;
  const titleMatch = cleanMarkdown.match(/^#\s+(.+)$/m);
  if (titleMatch) title = titleMatch[1].replace(/"/g, "'");
  const bodyMarkdown = cleanMarkdown.replace(/^#\s+(.+)$/m, '').trim();
  // Pre-process **bold** text manually since marked struggles with Korean particles attached to it
  const preProcessedMarkdown = bodyMarkdown.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const htmlContent = marked.parse(preProcessedMarkdown);

  const slug = metadata.slug || `whale-${signal.ticker.toLowerCase()}-${signal.date}`;
  const safeTitle = title.replace(/"/g, "'");
  const safeDescription = (metadata.seoDescription || '').replace(/"/g, "'");
  const isBuy = signal.direction === 'buy';
  const badgeStyle = isBuy
    ? 'background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);'
    : 'background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);';
  const marketFlag = signal.market === 'us' ? '🇺🇸' : '🇰🇷';

  const chartDataStr = chartData ? JSON.stringify(chartData).replace(/'/g, "\\'") : 'null';

  const astroComponent = `---
import BaseLayout from '../../layouts/BaseLayout.astro';
import TradeCTA from '../../components/TradeCTA.astro';
import TimeAttackLounge from '../../components/TimeAttackLounge.astro';
import WhaleChart from '../../components/WhaleChart.astro';

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
        <p><strong>거래 총액:</strong> ${(signal.amountUsd || signal.amountKrw)
          ? `${signal.amountUsd || ''}${signal.amountKrw ? ` <span style="opacity:.85">(약 ${signal.amountKrw})</span>` : ''}`
          : (signal.amount || '집계 불가')}</p>
        ${signal.shares ? `<p><strong>수량 · 단가:</strong> ${signal.shares.toLocaleString('en-US')}주 · ${signal.currency === 'KRW' ? `₩${Math.round(signal.pricePerShare || 0).toLocaleString('ko-KR')}` : `$${(signal.pricePerShare || 0).toFixed(2)}`}${signal.priceSource === 'estimate_50000_krw' ? ' <span style="opacity:.6">(단가 추정)</span>' : ''}</p>` : ''}
        <p><strong>출처:</strong> ${signal.source}${signal.sector ? ` · ${signal.sector}` : ''}</p>
      </div>

      <WhaleChart chartData='${chartDataStr}' transactionDate='${signal.date}' isBuy={${isBuy}} ticker='${signal.ticker}' currency='${signal.currency || 'USD'}' />

      ${renderFollowUpBlock(followUp)}

      ${htmlContent}

      ${renderSimilarCasesBlock(similarCases)}

      <TradeCTA
        ticker="${signal.ticker}"
        name="${signal.companyName}"
        isPositive={${isBuy}}
        isin="${isin || ''}"
      />

      <TimeAttackLounge signalId="${slug}" isBuy={${isBuy}} />

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

.followup-card {
  background: var(--color-surface-hover);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
  margin: 1.5rem 0 2rem;
}
.followup-card h4 { margin: 0 0 0.75rem; font-size: 1rem; }
.followup-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; }
.followup-cell {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.75rem;
  text-align: center;
}
.followup-label { font-size: 0.75rem; opacity: 0.7; }
.followup-pct { font-size: 1.1rem; margin: 0.25rem 0; }
.followup-date { font-size: 0.7rem; opacity: 0.55; }
.followup-caption { font-size: 0.8rem; opacity: 0.7; margin: 0.75rem 0 0; }

.similar-cases { display: grid; gap: 1rem; margin-top: 1rem; }
.case-card {
  background: var(--color-surface-hover);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-accent-primary);
  border-radius: 10px;
  padding: 1rem 1.25rem;
}
.case-head { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; }
.case-meta { font-size: 0.85rem; opacity: 0.75; margin: 0.25rem 0 0.5rem; }
.case-outcome { display: flex; gap: 0.75rem; flex-wrap: wrap; font-size: 0.85rem; margin-bottom: 0.5rem; }
.case-narrative { margin: 0.5rem 0 0.25rem; font-size: 0.95rem; line-height: 1.55; }
.case-source { margin: 0; font-size: 0.78rem; opacity: 0.6; }

@media (max-width: 640px) {
  .followup-grid { grid-template-columns: repeat(2, 1fr); }
}
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

    // 후행 가격(D+N) + 유사 사례 매칭
    const followUp = await getFollowUpPrices(signal);
    if (followUp) console.log(`  📈 후행: D+30 ${followUp.horizons.d30?.pct ?? '미도래'}%, D+180 ${followUp.horizons.d180?.pct ?? '미도래'}%`);
    const similarCases = await findSimilarCases(signal, 3);
    if (similarCases.length) console.log(`  🔁 유사 사례 매칭: ${similarCases.map(c => c.ticker).join(', ')}`);

    const prompt = buildWhaleAnalysisPrompt(signal, marketContext, { followUp, similarCases });
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
5. 숫자 환각 검수: 초안에 등장하는 모든 수치(거래 총액·변동률·과거 사례)는 시스템 프롬프트의 [후행 주가]·[유사 사례] 블록 또는 거래 정보 블록에 존재해야 합니다. 외부 지식으로 추정된 수치가 보이면 해당 문장을 삭제하세요.
6. 냉철함 검수: 매수 신호인데 유사 사례 D+365 평균이 음수라면 본문에 그 사실이 명시되어 있어야 합니다. 누락 시 한 문장 추가.

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

    // ── 고래 차트 데이터(Historical) 조회 ──
    let chartData = null;
    try {
      const now = new Date();
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      
      const queryOptions = { 
        period1: sixMonthsAgo.toISOString().split('T')[0], 
        period2: now.toISOString().split('T')[0], 
        interval: '1d' 
      };

      let hData;
      let symbolToSearch = signal.ticker;
      
      if (signal.market === 'kr') {
        try {
          hData = await yahooFinance.chart(`${signal.ticker}.KS`, queryOptions);
        } catch {
          hData = await yahooFinance.chart(`${signal.ticker}.KQ`, queryOptions);
        }
      } else {
        hData = await yahooFinance.chart(symbolToSearch, queryOptions);
      }
      
      if (hData && hData.quotes && hData.quotes.length > 0) {
        chartData = hData.quotes.filter(d => d.close).map(d => ({
          x: d.date.toISOString().split('T')[0],
          y: parseFloat(d.close.toFixed(2))
        }));
      }
    } catch (e) {
      console.warn(`  ⚠️ 차트 데이터 조회 실패 (${signal.ticker}):`, e.message);
    }

    const resultMeta = await saveAnalysisPage(signal, finalOutput, metadata, isin, chartData, followUp, similarCases);
    await updateManifest(resultMeta);

    // 텔레그램 Push 알림
    await sendWhaleTelegram(signal, resultMeta, { followUp, similarCases });

    console.log(`✅ [${signal.ticker}] 분석 완료.\n`);
  }

  console.log('🚀 Whale Alert Pipeline Completed Successfully.');
}

// ─── 텔레그램 Whale Alert Push ───────────────────────────
// Telegram legacy Markdown (parse_mode: 'Markdown') escape — _ * ` [ ] 만 처리
function escapeMd(s) {
  return String(s ?? '').replace(/([_*`\[\]])/g, '\\$1');
}

async function sendWhaleTelegram(signal, meta, ctx = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_OWNER_ID;
  if (!token || !chatId) return;

  const flag = signal.market === 'us' ? '🇺🇸' : '🇰🇷';
  const dir = signal.direction === 'buy' ? '🟢 매수' : '🔴 매도';
  const url = `https://econpedia.dedyn.io/whale/${meta.slug}/?utm_source=telegram&utm_medium=push&utm_campaign=whale`;

  // 총액 라인 — 새 필드 없으면 legacy `amount` 로 fallback
  const totalLine = (signal.amountUsd || signal.amountKrw)
    ? `💵 ${signal.amountUsd || ''}${signal.amountKrw ? ` (약 ${signal.amountKrw})` : ''}${signal.shares ? ` · ${signal.shares.toLocaleString('en-US')}주` : ''}`
    : `💵 ${signal.amount || ''}`;

  // 후행 가격 한 줄 (있을 때만)
  const fu = ctx.followUp?.horizons;
  const followLine = fu ? [
    fu.d30 && `D+30 ${fu.d30.pct > 0 ? '+' : ''}${fu.d30.pct.toFixed(1)}%`,
    fu.d90 && `D+90 ${fu.d90.pct > 0 ? '+' : ''}${fu.d90.pct.toFixed(1)}%`,
    fu.d180 && `D+180 ${fu.d180.pct > 0 ? '+' : ''}${fu.d180.pct.toFixed(1)}%`,
    fu.d365 && `D+365 ${fu.d365.pct > 0 ? '+' : ''}${fu.d365.pct.toFixed(1)}%`,
  ].filter(Boolean).join(' · ') : null;

  // 비슷한 사례 한 줄 (Top 1)
  const top = ctx.similarCases?.[0];
  const similarLine = top
    ? `🔁 유사 사례: ${top.market === 'us' ? '🇺🇸' : '🇰🇷'} ${escapeMd(top.company)} (${top.date}, ${top.direction === 'buy' ? '매수' : '매도'}) → D+365 ${top.outcomePct365d > 0 ? '+' : ''}${top.outcomePct365d}%`
    : null;

  const lines = [
    `🐋 *Whale Alert — 내부자 거래 포착*`,
    ``,
    `${flag} *${escapeMd(signal.companyName)}* (${escapeMd(signal.ticker)})`,
    `${dir} · ${escapeMd(signal.person)}`,
    totalLine,
  ];
  if (followLine) lines.push(`📈 ${followLine}`);
  if (similarLine) lines.push(similarLine);
  lines.push(``, `📰 *${escapeMd(meta.title)}*`, ``, `👉 [냉철한 AI 분석 읽기](${url})`);
  const text = lines.join('\n');

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
