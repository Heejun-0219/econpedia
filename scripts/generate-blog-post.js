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
import { publishToBlogger, publishToWordPress, publishToMedium } from './publish-external.js';

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
  console.log('📝 Gemini에 블로그 포스트 요청 중...');

  const { system, user } = buildBlogPrompt(formattedData, today);

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: [
      { role: 'user', parts: [{ text: system + '\n\n' + user }] }
    ],
    config: {
      temperature: 0.7,
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

    // ─── 외부 파이프라인 연동 ────────────────────────────────
    const canonicalUrl = `https://econpedia.dedyn.io/blog/${result.slug}`;
    const externalLogs = [];
    
    // Blogger (수익 메인 채널)
    try {
      const bloggerMsg = await publishToBlogger(result.title, result.htmlContent, result.tags);
      externalLogs.push(bloggerMsg);
    } catch (e) {
      externalLogs.push(`[Blogger] 실패: ${e.message}`);
    }

    // WordPress (서브 수익 / 자산)
    try {
      const wpMsg = await publishToWordPress(result.title, result.htmlContent, result.tags);
      externalLogs.push(wpMsg);
    } catch (e) {
      externalLogs.push(`[WordPress] 실패: ${e.message}`);
    }

    // Medium (SEO 및 트래픽용 백링크 채널 - 투트랙 미끼 전략)
    try {
      // 본문의 첫 700자 이후 나오는 첫 번째 H태그(서브제목) 앞에서 컷오프
      const cutoffIndex = result.htmlContent.indexOf('<h', 600);
      let mediumHtml = result.htmlContent;
      if (cutoffIndex > 0) {
        mediumHtml = result.htmlContent.substring(0, cutoffIndex);
      } else {
        mediumHtml = result.htmlContent.substring(0, 1000) + '...';
      }
      
      mediumHtml += `
      <br /><hr /><br />
      <h3>🚀 <strong>이 리포트의 더 깊은 통찰과 전체 전문은 <a href="${canonicalUrl}" target="_blank">EconPedia 공식 사이트</a>에서 바로 확인하세요!</strong></h3>
      <p>애드센스 광고 없는 깔끔한 UI와 프리미엄 경제 브리핑을 매일 아침 무료로 만나보실 수 있습니다.</p>
      `;

      const mediumMsg = await publishToMedium(result.title, mediumHtml, result.tags, canonicalUrl);
      externalLogs.push(mediumMsg);
    } catch (e) {
      externalLogs.push(`[Medium] 실패: ${e.message}`);
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
