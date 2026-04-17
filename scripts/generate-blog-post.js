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
import { publishToBlogger, publishToTelegram, publishThreadToX, publishToThreads, publishToLinkedIn } from './publish-external.js';

// 프롬프트 시스템 import (4단계 하네스)
import { buildBlogResearchPrompt, buildBlogDraftPrompt, buildBlogVerifyPrompt, buildBlogFinalPrompt } from '../src/data/prompts.js';

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

// ─── 최근 블로그 주제 로드 (주제 다각화 엔진) ──────────
async function loadRecentTopics(days = 7) {
  const manifestPath = path.join(ROOT, 'src', 'data', 'blog-articles.json');
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    const articles = JSON.parse(raw);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(cutoff);
    const recent = articles.filter(a => a.date >= cutoffStr);
    console.log(`📚 최근 ${days}일 블로그 ${recent.length}개 로드 (주제 중복 회피용)`);
    return recent.map(a => ({ date: a.date, title: a.title }));
  } catch {
    console.log('ℹ️  블로그 매니페스트 없음 — 주제 회피 건너뛰');
    return [];
  }
}

// ─── Gemini 호출 헬퍼 (하네스 각 단계에서 공통 사용) ─────
async function callGemini(prompt, temperature = 0.7, maxOutputTokens = 8192) {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [
      { role: 'user', parts: [{ text: prompt.system + '\n\n' + prompt.user }] }
    ],
    config: {
      temperature,
      topP: 0.9,
      maxOutputTokens,
    }
  });
  return response.text;
}

// ─── 4단계 하네스 파이프라인 ──────────────────────────────
async function runBlogHarness(formattedData, today, recentTopics = []) {
  // Phase 1: 리서치 에이전트 — 핵심 앵글 도출
  console.log('🔬 [Harness 1/4] 리서치 에이전트 — 핵심 앵글 도출 중...');
  if (recentTopics.length > 0) {
    console.log(`   🚫 최근 ${recentTopics.length}개 주제 회피 지시 주입`);
  }
  const research = await callGemini(
    buildBlogResearchPrompt(formattedData, today, recentTopics),
    0.9,  // 창의적 앵글 발굴을 위해 높은 temperature
    4096
  );
  console.log('   ✅ 리서치 완료 — 3가지 앵글 도출');

  // Phase 2: 시니어 애널리스트 — 심층 분석 초안 작성
  console.log('📝 [Harness 2/4] 시니어 애널리스트 — 심층 분석 초안 작성 중...');
  const draft = await callGemini(
    buildBlogDraftPrompt(formattedData, today, research),
    0.8,
    8192  // 6000자+ 심층 분석
  );
  console.log('   ✅ 초안 완료');

  // Phase 3: 팩트체커 — 논리/수치 검증
  console.log('🔍 [Harness 3/4] 팩트체커 — 논리/수치 검증 중...');
  const verification = await callGemini(
    buildBlogVerifyPrompt(formattedData, draft),
    0.3,  // 팩트체크는 낮은 temperature
    4096
  );
  console.log('   ✅ 검증 완료');

  // Phase 4: 최종 에디터 — 피드백 반영 및 원고 완성
  console.log('✨ [Harness 4/4] 에디터 — 최종 원고 완성 중...');
  const finalArticle = await callGemini(
    buildBlogFinalPrompt(draft, verification),
    0.6,
    8192
  );
  console.log('   ✅ 최종 원고 완성');

  return finalArticle;
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

  // 첫 문단 추출 (폴백용)
  const lines = bodyMarkdown.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('>'));
  const firstPara = (lines[0] || '').replace(/\*\*/g, '').replace(/\*/g, '').trim();
  const fallbackExcerpt = firstPara.length > 155 ? firstPara.slice(0, 155) + '...' : firstPara;

  // AI 생성 excerpt 우선, 없으면 첣 문단 폴백 (인사말 방지)
  const excerpt = metadata.excerpt || fallbackExcerpt;

  const slug = metadata.slug || dateString;

  // 마크다운 → HTML
  const utmParams = 'utm_source=blogger&utm_medium=blog&utm_campaign=daily_report';
  const canonicalUrl = `https://econpedia.dedyn.io/blog/${slug}?${utmParams}`;
  const subscribeUrl = `https://econpedia.dedyn.io/#newsletter?${utmParams}`;
  const ctaHtml = `
    <br/><hr/><br/>
    <div style="background-color: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center;">
      <h3 style="margin-top: 0; color: #1e293b;">📊 더 깊은 경제 분석이 궁금하다면?</h3>
      <p style="color: #64748b;">EconPedia 본진에서 매일 아침 AI가 분석한 리포트를 받아보세요.</p>
      <div style="margin-top: 15px;">
        <a href="${canonicalUrl}" 
           style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-right: 10px;">
           EconPedia에서 전문 읽기 →
        </a>
        <a href="${subscribeUrl}" 
           style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
           📮 매일 아침 무료 구독하기
        </a>
      </div>
    </div>
  `;
  let coverImageHtml = '';
  try {
    const cardStatus = JSON.parse(await fs.readFile(path.join(ROOT, '.cardnews-status.json'), 'utf-8'));
    if (cardStatus.success && cardStatus.date) {
      const coverUrl = `https://econpedia.dedyn.io/cards/${cardStatus.date}/slide-1.png`;
      coverImageHtml = `<img src="${coverUrl}" alt="오늘의 카드뉴스" style="width:100%;max-width:1080px;border-radius:12px;margin-bottom:24px;" />\n`;
    }
  } catch {}

  const htmlContent = coverImageHtml + marked.parse(bodyMarkdown) + ctaHtml;

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

// ─── Gemini → SNS 스레드 콘텐츠 생성 ────────────────────
async function generateSNSThread(formattedData, title, canonicalUrl) {
  console.log('🧵 Gemini에 SNS 스레드 콘텐츠 생성 요청 중...');

  const prompt = `당신은 경제 전문 SNS 계정 운영자입니다.
아래 오늘의 시장 데이터와 블로그 제목을 바탕으로 바이럴되는 한국어 스레드를 작성하세요.

규칙:
- 6개 포스트로 구성 (JSON 배열 반환)
- 각 포스트는 반드시 450자 이내 (공백 포함, Threads 500자 제한 고려)
- 포스트 1: 강렬한 훅 — 오늘 시장의 핵심 한 문장 + 이모지. 마지막에 "🧵 1/6" 추가
- 포스트 2~5: 각각 주요 인사이트/수치 하나씩. 마지막에 "n/6" 추가
- 포스트 6: 마무리 인사이트 + CTA. 다음 URL 반드시 포함: ${canonicalUrl}
- 해시태그: 포스트 6에만 #경제 #투자 #EconPedia 추가
- 숫자와 퍼센트 적극 활용 (구체적 수치가 인게이지먼트 높음)

블로그 제목: ${title}

시장 데이터:
${formattedData.slice(0, 2000)}

JSON 배열만 반환하세요. 예시:
["포스트1 텍스트 🧵 1/6", "포스트2 텍스트 2/6", ...]`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.8 },
  });

  const text = response.text;
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('SNS 스레드 JSON 파싱 실패: ' + text.slice(0, 200));

  const posts = JSON.parse(match[0]);
  console.log(`✅ SNS 스레드 ${posts.length}개 포스트 생성 완료`);
  return posts;
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

    if (marketData.weatherData && marketData.weatherData.shouldPublishBlog === false) {
      console.log('😴 날씨가 평화로워 오늘 블로그 심층 분석은 발행하지 않습니다.');
      await saveBlogStatus(true, '평화로운 날씨로 블로그 발행 스킵', null);
      process.exit(0);
    }

    // 최근 블로그 주제 로드 (주제 다각화 엔진)
    const recentTopics = await loadRecentTopics(7);

    const blogMarkdown = await runBlogHarness(marketData.formatted, today, recentTopics);
    const result = await saveBlogPost(blogMarkdown, today);

    // ─── 외부 마케팅 파이프라인 연동 ───────────────────────
    const canonicalUrl = `https://econpedia.dedyn.io/blog/${result.slug}`;
    const externalLogs = [];
    
    // 1. Blogger (구글 검색 최적화 및 메인 수익 채널)
    try {
      const bloggerMsg = await publishToBlogger(result.title, result.htmlContent, result.tags);
      externalLogs.push(bloggerMsg);
    } catch (e) {
      externalLogs.push(`[Blogger] 실패: ${e.message}`);
    }

    // 2. 텔레그램 채널 알림 (TELEGRAM_BOT_TOKEN 설정 시에만 실행)
    if (process.env.TELEGRAM_BOT_TOKEN) {
      try {
        const tgMsg = await publishToTelegram(result.title, canonicalUrl);
        externalLogs.push(tgMsg);
      } catch (e) {
        externalLogs.push(`[Telegram] 실패: ${e.message}`);
      }
    }

    // 3. Threads / X(Twitter) 스레드 발행
    if (process.env.THREADS_ACCESS_TOKEN || process.env.X_API_KEY) {
      try {
        const posts = await generateSNSThread(marketData.formatted, result.title, canonicalUrl);

        // Threads (Meta)
        if (process.env.THREADS_ACCESS_TOKEN) {
          const threadsMsg = await publishToThreads(posts);
          externalLogs.push(threadsMsg);
        }

        // X(Twitter) — 레거시, X_API_KEY 있을 때만
        if (process.env.X_API_KEY) {
          const xMsg = await publishThreadToX(posts);
          externalLogs.push(xMsg);
        }
      } catch (e) {
        externalLogs.push(`[SNS 스레드] 실패: ${e.message}`);
      }
    }
    // 4. LinkedIn 게시 (LINKEDIN_ACCESS_TOKEN 설정 시에만 실행)
    if (process.env.LINKEDIN_ACCESS_TOKEN) {
      try {
        const liText = `${result.title}\n\n${result.excerpt}\n\n매일 아침 AI가 분석한 경제 리포트 → EconPedia`;
        const liMsg  = await publishToLinkedIn(liText, result.title, canonicalUrl);
        externalLogs.push(liMsg);
      } catch (e) {
        externalLogs.push(`[LinkedIn] 실패: ${e.message}`);
      }
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
