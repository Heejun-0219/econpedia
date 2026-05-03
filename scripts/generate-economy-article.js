// scripts/generate-economy-article.js
// EconPedia 경제 사전 시리즈 자동 생성 파이프라인
// categories.js에서 comingSoon: true인 기사를 찾아 AI로 생성

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { marked } from 'marked';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MAX_ARTICLES_PER_RUN = 1; // 1회에 1편씩 (품질 유지)

// categories.js에서 아직 생성되지 않은 기사 목록 추출
async function getNextArticle() {
  const { CATEGORIES } = await import('../src/data/categories.js');
  
  for (const [catKey, cat] of Object.entries(CATEGORIES)) {
    for (const article of cat.articles) {
      if (!article.comingSoon) continue;
      
      // 이미 파일이 존재하는지 확인
      const hrefParts = article.href.split('/').filter(Boolean); // ['economy', 'basics', 'what-is-gdp']
      const filePath = path.join(ROOT, 'src', 'pages', ...hrefParts) + '.astro';
      
      try {
        await fs.access(filePath);
        continue; // 파일 존재 → 이미 생성됨
      } catch {
        // 파일 없음 → 생성 대상
        return {
          category: cat,
          catKey,
          article,
          filePath,
          hrefParts,
        };
      }
    }
  }
  
  return null; // 모든 기사가 이미 생성됨
}

async function generateArticleContent(target) {
  const { category, article } = target;
  
  const prompt = `당신은 EconPedia의 경제 교육 전문 에디터 "이코노"입니다.
아래 주제에 대해 경제를 처음 접하는 20~30대 직장인을 대상으로 한 **심층 교육 기사**를 작성해주세요.

## 기사 정보
- 제목: ${article.title}
- 카테고리: ${category.title}
- 설명: ${article.excerpt}
- 예상 읽기 시간: ${article.readingTime}

## 작성 원칙
1. **비유와 실생활 예시**를 적극 활용하세요. 추상적 개념을 구체적 상황으로 번역하세요.
2. **"한 줄 요약" 섹션**으로 시작하세요 (💡 핵심 용어 정의 포함).
3. **"왜 알아야 할까?"** 섹션에서 이 개념이 독자의 일상/투자에 미치는 영향을 설명하세요.
4. 본론에서 **핵심 개념 → 작동 원리 → 실전 활용** 순서로 전개하세요.
5. **"정리: 기억해야 할 3가지"** 로 마무리하세요.
6. 관련된 다른 경제 용어가 나오면 "/economy/" 경로로 내부 링크를 걸어주세요.
7. 마크다운(h2, h3, blockquote, ul, ol, strong)을 사용하되, h1은 사용하지 마세요.
8. 독자에게 말하듯 친근하고 쉬운 문체로 작성하세요. "~합니다" 체를 사용하세요.
9. 최소 1,500자, 최대 3,000자로 작성하세요.
10. HTML 태그는 절대 사용하지 마세요. 순수 마크다운만 사용하세요.

마크다운 본문만 출력하세요. 제목(h1)은 포함하지 마세요.`;

  console.log(`   📝 [초안 작성 중...]`);
  const draftResponse = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.6, maxOutputTokens: 8192 },
  });
  const draftText = draftResponse.text;

  console.log(`   🕵️‍♂️ [수석 에디터 QC 중...]`);
  const qcPrompt = `당신은 EconPedia의 수석 에디터(데스크)입니다.
아래는 주니어 에디터가 작성한 경제 백과사전 기사의 초안입니다.
당신의 임무는 이 초안을 검수하고, 완벽하게 다듬어진 최종본을 마크다운으로 반환하는 것입니다.

[검수 기준]
1. 거슬리는 메타 발언 제거: "본 기사는 AI가 작성했습니다", "주의사항", "면책조항", "마무리하며", "결론적으로" 같은 상투적이거나 AI 특유의 꼬리말/머리말을 완벽하게 삭제하세요. 면책 조항은 사이트 하단에 이미 있으므로 본문에 중복해서 넣을 필요가 전혀 없습니다.
2. 문체 통일: 독자에게 직접 이야기하듯 친근하고 매끄러운 "~합니다", "~해요" 체를 유지하되, 교과서처럼 딱딱하고 기계적인 느낌이 나지 않도록 자연스럽게 윤문하세요.
3. 가독성 극대화: 문장이 불필요하게 길면 나누고, 핵심 내용이 눈에 잘 띄도록 소제목(h2, h3)과 볼드체(**)를 적절히 활용하세요.
4. 순수 마크다운: HTML 태그는 절대 사용하지 마세요. 제목(h1)도 본문에 포함하지 마세요.

[초안 기사]
${draftText}

초안의 장점과 지식은 100% 유지하되, 위의 검수 기준을 엄격하게 적용하여 완전히 다듬어진 최종 마크다운 본문만 출력해주세요.`;

  const finalResponse = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [{ role: 'user', parts: [{ text: qcPrompt }] }],
    config: { temperature: 0.4, maxOutputTokens: 8192 },
  });

  return finalResponse.text;
}

async function saveArticlePage(target, markdownContent) {
  const { category, article, filePath, hrefParts } = target;
  
  const htmlContent = marked.parse(markdownContent);
  const safeTitle = article.title.replace(/"/g, "'");
  const safeExcerpt = article.excerpt.replace(/"/g, "'");
  const categorySlug = hrefParts[1]; // 'basics', 'investment', etc.

  // 같은 카테고리의 다른 기사들을 관련 기사로 설정
  const relatedArticles = category.articles
    .filter(a => a.href !== article.href)
    .slice(0, 5)
    .map(a => ({
      title: a.title,
      category: category.title,
      href: a.href,
    }));

  const relatedJson = JSON.stringify(relatedArticles, null, 2)
    .replace(/"/g, "'"); // Astro 호환

  const astroComponent = `---
import ArticleLayout from '../../../layouts/ArticleLayout.astro';

const relatedArticles = ${JSON.stringify(relatedArticles, null, 2)};
---

<ArticleLayout 
  title="${safeTitle}"
  description="${safeExcerpt}"
  category="${category.title}"
  categoryHref="/economy/${categorySlug}"
  readingTime="${article.readingTime}"
  publishDate="${new Date().toISOString().split('T')[0].replace(/-/g, '.')}"
  author="EconPedia AI · 이코노"
  relatedArticles={relatedArticles}
>

${htmlContent}

</ArticleLayout>
`;

  // 디렉토리 생성
  const dirPath = path.dirname(filePath);
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(filePath, astroComponent, 'utf8');
  console.log(`✅ 경제 사전 기사 저장: ${filePath}`);
}

// categories.js에서 comingSoon 플래그 제거
async function markAsPublished(target) {
  const categoriesPath = path.join(ROOT, 'src', 'data', 'categories.js');
  let content = await fs.readFile(categoriesPath, 'utf8');
  
  // 해당 기사의 comingSoon: true를 제거
  // href로 정확하게 찾아서 해당 블록의 comingSoon만 제거
  const hrefStr = `href: '${target.article.href}'`;
  const idx = content.indexOf(hrefStr);
  if (idx !== -1) {
    // href 이후 가장 가까운 comingSoon: true를 제거
    const afterHref = content.substring(idx);
    const comingSoonMatch = afterHref.match(/,?\s*comingSoon:\s*true/);
    if (comingSoonMatch) {
      const pos = idx + comingSoonMatch.index;
      content = content.substring(0, pos) + content.substring(pos + comingSoonMatch[0].length);
      await fs.writeFile(categoriesPath, content, 'utf8');
      console.log(`✅ categories.js 업데이트: ${target.article.href} comingSoon 제거`);
    }
  }
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set');
    process.exit(1);
  }

  let generated = 0;

  for (let i = 0; i < MAX_ARTICLES_PER_RUN; i++) {
    const target = await getNextArticle();
    if (!target) {
      console.log('ℹ️ 모든 경제 사전 기사가 이미 생성되었습니다.');
      break;
    }

    console.log(`\n📘 [${target.category.title}] "${target.article.title}" 생성 중...`);
    
    try {
      const markdown = await generateArticleContent(target);
      await saveArticlePage(target, markdown);
      await markAsPublished(target);
      generated++;
      console.log(`✅ 생성 완료 (${generated}/${MAX_ARTICLES_PER_RUN})\n`);
    } catch (e) {
      console.error(`❌ 기사 생성 실패: ${e.message}`);
      // Slack 알림
      const webhookUrl = process.env.SLACK_WEBHOOK_URL;
      if (webhookUrl) {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 *경제 사전 기사 생성 실패*\n\n*기사:* ${target.article.title}\n*에러:* ${e.message}`,
          }),
        }).catch(() => {});
      }
    }
  }

  if (generated > 0) {
    console.log(`\n🚀 경제 사전 파이프라인 완료: ${generated}편 생성`);
  }
}

main();
