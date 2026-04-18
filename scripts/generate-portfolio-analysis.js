// scripts/generate-portfolio-analysis.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { marked } from 'marked';
import dotenv from 'dotenv';
import { buildPortfolioAnalysisPrompt } from '../src/data/prompts.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const INVESTORS_PATH = path.join(ROOT, 'src', 'data', 'portfolio-investors.json');
const HOLDINGS_PATH = path.join(ROOT, '.portfolio-holdings.json');
const ANALYSES_JSON_PATH = path.join(ROOT, 'src', 'data', 'portfolio-analyses.json');
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

async function saveAnalysisPage(investor, markdownContent, metadata, analysisDate) {
  const cleanMarkdown = markdownContent.replace(/\`\`\`json\n[\s\S]*?\n\`\`\`/g, '').trim();
  let title = metadata.seoTitle;
  const titleMatch = cleanMarkdown.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    title = titleMatch[1].replace(/"/g, "'");
  }
  const bodyMarkdown = cleanMarkdown.replace(/^#\s+(.+)$/m, '').trim();
  const htmlContent = marked.parse(bodyMarkdown);
  
  const slug = metadata.slug || `portfolio-${investor.id}-${analysisDate}`;
  const safeTitle = title.replace(/"/g, "'");
  const safeDescription = (metadata.seoDescription || '').replace(/"/g, "'");

  const astroComponent = `---
import BaseLayout from '../../layouts/BaseLayout.astro';

const title = "${safeTitle}";
const date = "${analysisDate}";
const description = "${safeDescription}";
const investorName = "${investor.name}";
const investorEmoji = "${investor.emoji}";
---

<BaseLayout title={title} description={description} article={true}>
  <div class="article-layout">
    <div class="article-header">
      <a href="/portfolio" class="article-header__category">{investorEmoji} 포트폴리오 X-Ray</a>
      <h1 class="article-header__title">{title}</h1>
      <div class="article-header__meta">
        <time datetime={date}>{date}</time>
        <span>•</span>
        <span>EconPedia AI · 이코노</span>
        <span>•</span>
        <span>{investorName}</span>
      </div>
    </div>

    <div class="article-content portfolio-content">
      <div class="investor-profile-card">
        <h3>{investorEmoji} 대상: {investorName}</h3>
        <p><strong>분류:</strong> ${investor.category === 'superinvestor' ? '슈퍼인베스터' : investor.category === 'fund' ? '액티브 펀드' : '국가 자금'}</p>
        <p><strong>운용 규모:</strong> ${investor.aum}</p>
        <p><strong>투자 철학:</strong> ${investor.philosophy}</p>
      </div>
      
      ${htmlContent}

      <TradeCTA ticker="SPY" name="${investor.name} 관련 ETF" isPositive={true} />

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
.investor-profile-card p { margin: 0.25rem 0; font-size: 0.95em; opacity: 0.9; }
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
  
  return { slug, title: safeTitle, excerpt: safeDescription, date: analysisDate, investorId: investor.id, category: investor.category, emoji: investor.emoji };
}

async function updateManifest(newAnalysis) {
  let analyses = [];
  try {
    const existing = await fs.readFile(ANALYSES_JSON_PATH, 'utf8');
    analyses = JSON.parse(existing);
  } catch { } // no existing
  
  analyses.unshift(newAnalysis);
  analyses.sort((a, b) => b.date.localeCompare(a.date));
  
  await fs.writeFile(ANALYSES_JSON_PATH, JSON.stringify(analyses, null, 2), 'utf8');
  console.log(`📋 Analyses manifest updated.`);
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set');
    process.exit(1);
  }

  let investors = [];
  let holdings = {};
  
  try {
    investors = JSON.parse(await fs.readFile(INVESTORS_PATH, 'utf8'));
    holdings = JSON.parse(await fs.readFile(HOLDINGS_PATH, 'utf8'));
  } catch (e) {
    console.error('ℹ️ No triggers found. Skipping portfolio analysis.');
    return;
  }
  
  if (Object.keys(holdings).length === 0) {
    console.log('ℹ️ No new filings to analyze today.');
    return;
  }
  
  // 오늘 시장 컨텍스트 (Market Data) 로드하여 AI에게 넘기기
  let marketContext = "최근 거시경제 지표 및 시장 분위기 분석 필요";
  try {
    const md = JSON.parse(await fs.readFile(path.join(ROOT, '.market-data.json'), 'utf8'));
    marketContext = md.formatted || marketContext;
  } catch (e) { }

  const today = new Date().toISOString().split('T')[0];

  for (const invId of Object.keys(holdings)) {
    const investor = investors.find(i => i.id === invId);
    if (!investor) continue;
    
    console.log(`🤖 [${investor.name}] 포트폴리오 분석 생성 중...`);
    
    const holdingData = holdings[invId].mockData;
    const prompt = buildPortfolioAnalysisPrompt(investor, holdingData, marketContext);
    
    const rawOutput = await callGemini(prompt, 0.7);
    const metadata = extractJsonBlock(rawOutput) || { 
      slug: `portfolio-${investor.id}-${today}`, 
      seoTitle: `${investor.name} 포트폴리오 분석`,
      seoDescription: "포트폴리오 X-Ray 분석 결과입니다."
    };
    
    // 페이지 저장
    const resultMeta = await saveAnalysisPage(investor, rawOutput, metadata, today);
    await updateManifest(resultMeta);
    
    console.log(`✅ [${investor.name}] 분석 완료.`);
  }
  
  console.log('🚀 Portfolio X-Ray Pipeline Completed Successfully.');
}

main();
