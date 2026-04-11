// scripts/generate-blog-post.js
// EconPedia 블로그 포스팅 자동 생성 파이프라인
//
// 흐름: .market-data.json → Gemini (심층 분석) → 마크다운 → .astro 저장
//
// 필요한 환경 변수:
//   GEMINI_API_KEY
//
// 의존 스크립트: daily-briefing.js가 먼저 실행되어 .market-data.json을 생성해야 함

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { marked } from 'marked';
import dotenv from 'dotenv';
import { publishToBlogger, publishToTelegram, publishToTistory } from './publish-external.js';

// 프롬프트 시스템 import
import { buildBlogPrompt } from '../src/data/prompts.js';

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

// ─── Gemini → 블로그 마크다운 생성 ───────────────────────
async function generateBlogContent(formattedData, today) {
  console.log('📝 Gemini (gemini-3.1-pro-preview)에 심층 블로그 리포트 요청 중...');

  const { system, user } = buildBlogPrompt(formattedData, today);

  // @google/genai v1.x SDK에서는 models.generateContent를 직접 사용하거나 
  // 아래와 같은 방식으로 호출합니다.
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [
      { role: 'user', parts: [{ text: system + '\n\n' + user }] }
    ],
    config: {
      temperature: 0.8,
      topP: 0.9,
      maxOutputTokens: 4096,
    }
  });

  return response.text;
}

// ─── 메타데이터 JSON 추출 ────────────────────────────────
function extractMetadata(markdown) {
  const jsonMatch = markdown.match(/```json\s*([\s\S]*?)```/);

  const defaults = {
    slug: Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()),
    seoTitle: 'EconPedia 블로그',
    seoDescription: 'EconPedia 경제 심층 분석 블로그',
    tags: ['경제', '분석'],
  };

  if (!jsonMatch) {
    console.warn('⚠️  블로그 메타데이터 JSON 블록이 없습니다. 기본값 사용.');
    return { metadata: defaults, cleanMarkdown: markdown };
  }

  try {
    const metadata = { ...defaults, ...JSON.parse(jsonMatch[1].trim()) };
    // JSON 블록 제거한 본문
    const cleanMarkdown = markdown.replace(/```json\s*[\s\S]*?```/, '').trim();
    return { metadata, cleanMarkdown };
  } catch (e) {
    console.warn('⚠️  메타데이터 JSON 파싱 실패:', e.message);
    return { metadata: defaults, cleanMarkdown: markdown };
  }
}

// ─── .astro 블로그 파일 저장 ─────────────────────────────
async function saveBlogPost(markdown, dateString) {
  const { metadata, cleanMarkdown } = extractMetadata(markdown);

  // H1 제목 추출
  let title = metadata.seoTitle;
  const titleMatch = cleanMarkdown.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    title = titleMatch[1].replace(/"/g, "'");
  }

  // H1 제거한 본문
  const bodyMarkdown = cleanMarkdown.replace(/^#\s+(.+)$/m, '').trim();

  // 첫 문단 추출 (요약)
  const lines = bodyMarkdown.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('>'));
  const firstPara = (lines[0] || '').replace(/\*\*/g, '').replace(/\*/g, '').trim();
  const excerpt = firstPara.length > 155 ? firstPara.slice(0, 155) + '...' : firstPara;

  // 마크다운 → HTML
  const htmlContent = marked.parse(bodyMarkdown);

  const safeTitle = title.replace(/`/g, "'");
  const safeDescription = (metadata.seoDescription || excerpt).replace(/`/g, "'").replace(/"/g, "'");
  const safeTags = JSON.stringify(metadata.tags || []);

  const astroComponent = `---
import BaseLayout from '../../layouts/BaseLayout.astro';

const title = "${safeTitle}";
const date = "${dateString}";
const description = "${safeDescription}";
const tags = ${safeTags};
---

<BaseLayout title={title} description={description} article={true}>
  <div class="article-layout">
    <div class="article-header">
      <a href="/blog" class="article-header__category">📝 블로그 · 심층분석</a>
      <h1 class="article-header__title">{title}</h1>
      <div class="article-header__meta">
        <time datetime={date}>{date}</time>
        <span>•</span>
        <span>EconPedia AI · 이코노</span>
        <span>•</span>
        <span>⏱ 10분 읽기</span>
      </div>
      <div class="article-header__tags">
        {tags.map(tag => <span class="tag">{tag}</span>)}
      </div>
    </div>

    <div class="article-content blog-content">
      ${htmlContent}
    </div>
  </div>
</BaseLayout>
`;

  const slug = metadata.slug || dateString;
  const dirPath = path.join(ROOT, 'src', 'pages', 'blog');
  const filePath = path.join(dirPath, `${slug}.astro`);

  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(filePath, astroComponent, 'utf8');
  console.log(`✅ Blog post saved: ${filePath}`);

  // 매니페스트 업데이트
  await updateBlogManifest(dateString, slug, title, excerpt, metadata.tags);

  return { slug, title, excerpt, filePath, htmlContent, tags: metadata.tags };
}

// ─── 블로그 매니페스트 ───────────────────────────────────
async function updateBlogManifest(dateString, slug, title, excerpt, tags) {
  const manifestPath = path.join(ROOT, 'src', 'data', 'blog-articles.json');
  let articles = [];

  try {
    const existing = await fs.readFile(manifestPath, 'utf8');
    articles = JSON.parse(existing);
  } catch {
    // 첫 번째 글
  }

  // 같은 날짜 중복 제거
  articles = articles.filter(a => a.date !== dateString);

  articles.unshift({
    date: dateString,
    slug,
    title,
    excerpt,
    tags: tags || [],
    href: `/blog/${slug}`,
  });

  articles.sort((a, b) => b.date.localeCompare(a.date));

  await fs.writeFile(manifestPath, JSON.stringify(articles, null, 2), 'utf8');
  console.log(`📋 Blog manifest updated: ${manifestPath}`);
}

// ─── 블로그 상태 저장 ────────────────────────────────────
async function saveBlogStatus(success, message, slug) {
  const statusPath = path.join(ROOT, '.blog-status.json');
  const status = {
    success,
    message,
    slug: slug || null,
    ts: new Date().toISOString(),
  };
  await fs.writeFile(statusPath, JSON.stringify(status, null, 2), 'utf-8');
  console.log(`📋 블로그 상태 저장: ${statusPath}`);
}

// ─── 메인 ────────────────────────────────────────────────
async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY 환경 변수가 없습니다.');
    await saveBlogStatus(false, 'GEMINI_API_KEY 미설정', null);
    process.exit(0);
  }

  try {
    const marketData = await loadMarketData();
    const today = marketData.date || Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

    const blogMarkdown = await generateBlogContent(marketData.formatted, today);
    const result = await saveBlogPost(blogMarkdown, today);

    // ─── 외부 마케팅 파이프라인 연동 ───────────────────────
    const canonicalUrl = `https://econpedia.kr/blog/${result.slug}`;
    const externalLogs = [];
    
    // 1. Blogger (구글 검색 최적화 및 메인 수익 채널)
    try {
      const bloggerMsg = await publishToBlogger(result.title, result.htmlContent, result.tags);
      externalLogs.push(bloggerMsg);
    } catch (e) {
      externalLogs.push(`[Blogger] 실패: ${e.message}`);
    }

    // 2. 텔레그램 채널 알림 (무료, 가장 즉각적인 유입 경로)
    try {
      const tgMsg = await publishToTelegram(result.title, canonicalUrl);
      externalLogs.push(tgMsg);
    } catch (e) {
      externalLogs.push(`[Telegram] 실패: ${e.message}`);
    }

    // 3. 티스토리 (준비 중 - 국내 검색 엔진 유입 극대화)
    try {
      const tistoryMsg = await publishToTistory(result.title, result.htmlContent, result.tags);
      externalLogs.push(tistoryMsg);
    } catch (e) {
      externalLogs.push(`[Tistory] 실패: ${e.message}`);
    }
    // ──────────────────────────────────────────────────────────

    // 블로그 상태에 외부 연동 로그 추가
    await saveBlogStatus(true, `${result.slug} 발행 완료\n` + externalLogs.join('\n'), result.slug);
    console.log('🚀 Blog Post Pipeline Completed Successfully.');

  } catch (error) {
    console.error('❌ 블로그 파이프라인 실패:', error.message);
    await saveBlogStatus(false, error.message, null);
    process.exit(0);
  }
}

main();
