// scripts/generate-insider-analysis.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { marked } from 'marked';
import dotenv from 'dotenv';
import { buildInsiderAnalysisPrompt } from '../src/data/prompts.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const COMPANIES_PATH = path.join(ROOT, 'src', 'data', 'insider-companies.json');
const TRIGGERS_PATH = path.join(ROOT, '.insider-triggers.json');
const ANALYSES_JSON_PATH = path.join(ROOT, 'src', 'data', 'portfolio-analyses.json'); // 함께 노출되도록 같은 json 사용
const PORTFOLIO_PAGES_DIR = path.join(ROOT, 'src', 'pages', 'portfolio');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function callGemini(prompt, temperature = 0.7, maxOutputTokens = 8192) {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [{ role: 'user', parts: [{ text: prompt.system + '\n\n' + prompt.user }] }],
    config: { temperature, maxOutputTokens }
  });
  return response.text;
}

function extractJsonBlock(markdownContent) {
  const regex = /\`\`\`json\n([\s\S]*?)\n\`\`\`/;
  const match = markdownContent.match(regex);
  if (match && match[1]) {
    try { return JSON.parse(match[1]); } catch (e) { return null; }
  }
  return null;
}

async function saveAnalysisPage(company, triggerData, markdownContent, metadata, analysisDate) {
  const cleanMarkdown = markdownContent.replace(/\`\`\`json\n[\s\S]*?\n\`\`\`/g, '').trim();
  let title = metadata.seoTitle;
  const titleMatch = cleanMarkdown.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    title = titleMatch[1].replace(/"/g, "'");
  }
  const bodyMarkdown = cleanMarkdown.replace(/^#\s+(.+)$/m, '').trim();
  const htmlContent = marked.parse(bodyMarkdown);
  
  const slug = metadata.slug || `insider-${company.id}-${analysisDate}`;
  const safeTitle = title.replace(/"/g, "'");
  const safeDescription = (metadata.seoDescription || '').replace(/"/g, "'");
  
  const isBuy = triggerData.type === 'buy';
  const badgeStyle = isBuy 
    ? 'background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);'
    : 'background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);';

  const astroComponent = `---
import BaseLayout from '../../layouts/BaseLayout.astro';

const title = "${safeTitle}";
const date = "${analysisDate}";
const description = "${safeDescription}";
const companyName = "${company.name}";
const companyEmoji = "${company.emoji}";
---

<BaseLayout title={title} description={description} article={true}>
  <div class="article-layout">
    <div class="article-header">
      <a href="/portfolio" class="article-header__category">🕵️ CEO 내부 거래 레이더</a>
      <h1 class="article-header__title">{title}</h1>
      <div class="article-header__meta">
        <time datetime={date}>{date}</time>
        <span>•</span>
        <span>EconPedia AI · 이코노</span>
        <span>•</span>
        <span>{companyName}</span>
      </div>
    </div>

    <div class="article-content portfolio-content">
      <div class="investor-profile-card">
        <h3>{companyEmoji} 기업명: {companyName} (${company.ticker})</h3>
        <p><strong>매매 임원:</strong> ${triggerData.person}</p>
        <p>
          <strong>거래 방향:</strong>
          <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 700; ${badgeStyle}">
            ${isBuy ? '🟢 장내 매수 (Buy)' : '🔴 장내 매도 (Sell)'}
          </span>
        </p>
        <p><strong>거래 규모:</strong> ${triggerData.amount}</p>
      </div>

      ${htmlContent}

      <TradeCTA 
        ticker="${company.ticker || company.id}" 
        name="${company.name}" 
        isPositive={${isBuy}} 
        isin="${company.isin || ''}"
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

  const filePath = path.join(PORTFOLIO_PAGES_DIR, `${slug}.astro`);
  await fs.mkdir(PORTFOLIO_PAGES_DIR, { recursive: true });
  await fs.writeFile(filePath, astroComponent, 'utf8');
  console.log(`✅ Analysis page saved: ${slug}.astro`);
  
  return { 
    slug, 
    title: safeTitle, 
    excerpt: safeDescription, 
    date: analysisDate, 
    investorId: company.id, // For mapping in index.astro
    category: 'insider', 
    emoji: company.emoji,
    isBuy
  };
}

async function updateManifest(newAnalysis) {
  let analyses = [];
  try {
    const existing = await fs.readFile(ANALYSES_JSON_PATH, 'utf8');
    analyses = JSON.parse(existing);
  } catch { } 
  
  // Update or push
  const idx = analyses.findIndex(a => a.slug === newAnalysis.slug);
  if (idx !== -1) {
    analyses[idx] = newAnalysis;
  } else {
    analyses.unshift(newAnalysis);
  }
  
  analyses.sort((a, b) => b.date.localeCompare(a.date));
  await fs.writeFile(ANALYSES_JSON_PATH, JSON.stringify(analyses, null, 2), 'utf8');
  console.log(`📋 Analyses manifest updated.`);
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set');
    process.exit(1);
  }

  let companies = [];
  let triggers = {};
  
  try {
    companies = JSON.parse(await fs.readFile(COMPANIES_PATH, 'utf8'));
    triggers = JSON.parse(await fs.readFile(TRIGGERS_PATH, 'utf8'));
  } catch (e) {
    console.log('ℹ️ No triggers found. Skipping insider analysis.');
    return;
  }
  
  if (Object.keys(triggers).length === 0) {
    console.log('ℹ️ No new insider filings to analyze today.');
    return;
  }
  
  let marketContext = "최근 거시경제 지표 및 시장 분위기 분석 필요";
  try {
    const md = JSON.parse(await fs.readFile(path.join(ROOT, '.market-data.json'), 'utf8'));
    marketContext = md.formatted || marketContext;
  } catch (e) { }

  const today = new Date().toISOString().split('T')[0];

  for (const compId of Object.keys(triggers)) {
    const company = companies.find(c => c.id === compId);
    if (!company) continue;

    const triggerData = triggers[compId];
    if (!triggerData.type || !triggerData.person || !triggerData.amount) {
      console.log(`ℹ️ [${company.name}] 실제 거래 데이터 미파싱 — 분석 생략 (SEC Form 4 XML 파싱 필요)`);
      continue;
    }

    console.log(`🤖 [${company.name}] 내부자 거래 분석 생성 중...`);

    const prompt = buildInsiderAnalysisPrompt(company, triggerData, marketContext);
    
    const rawOutput = await callGemini(prompt, 0.7);
    const metadata = extractJsonBlock(rawOutput) || { 
      slug: `insider-${company.id}-${today}`, 
      seoTitle: `[${company.ticker}] 내부자 거래 분석`,
      seoDescription: "내부자 거래 X-Ray 분석 결과입니다."
    };
    
    const resultMeta = await saveAnalysisPage(company, triggerData, rawOutput, metadata, today);
    await updateManifest(resultMeta);
    
    console.log(`✅ [${company.name}] 내부자 거래 보고서 컴파일 완료.`);
  }
  
  console.log('🚀 Insider Radar Pipeline Completed Successfully.');
}

main();
