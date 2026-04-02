// scripts/send-slack-status.js
// EconPedia 프로젝트 현황을 슬랙으로 발송 (Incoming Webhook)
//
// 필요한 환경 변수:
//   SLACK_WEBHOOK_URL  - Slack Incoming Webhook URL
//   GITHUB_RUN_URL     - GitHub Actions 실행 URL (자동 주입)

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── 환경 변수 검증 ─────────────────────────────────────
const WEBHOOK_URL    = process.env.SLACK_WEBHOOK_URL;
const GITHUB_RUN_URL = process.env.GITHUB_RUN_URL || '';

if (!WEBHOOK_URL) {
  console.error('❌ SLACK_WEBHOOK_URL 환경 변수가 없습니다. 발송을 건너뜁니다.');
  process.exit(0);
}

// ─── 유틸: 상태 파일 읽기 헬퍼 ───────────────────────────
function readStatusFile(filename) {
  try {
    return JSON.parse(readFileSync(join(ROOT, filename), 'utf-8'));
  } catch {
    return { success: null, message: '상태 파일 없음' };
  }
}

function statusLine(status, successMsg, failMsg, unknownMsg) {
  if (status.success === true)  return successMsg(status);
  if (status.success === false) return failMsg(status);
  return unknownMsg;
}

// ─── 데이터 수집 ─────────────────────────────────────────
let articles = [];
let latestArticle = null;

try {
  articles = JSON.parse(
    readFileSync(join(ROOT, 'src/data/daily-articles.json'), 'utf-8')
  );
  latestArticle = articles[0];
} catch (e) {
  console.warn('⚠️  daily-articles.json 읽기 실패:', e.message);
}

// 카테고리 기사 수
let categoryArticleCount = 0;
try {
  const { CATEGORIES } = await import('../src/data/categories.js');
  for (const cat of Object.values(CATEGORIES)) {
    categoryArticleCount += cat.articles.filter(a => !a.comingSoon).length;
  }
} catch {
  categoryArticleCount = 1;
}

// 블로그 기사 수
let blogArticles = [];
try {
  blogArticles = JSON.parse(
    readFileSync(join(ROOT, 'src/data/blog-articles.json'), 'utf-8')
  );
} catch { /* no blog yet */ }

// ─── 각 파이프라인 실제 결과 읽기 ─────────────────────────
const newsletterStatus = readStatusFile('.newsletter-status.json');
const cardNewsStatus   = readStatusFile('.cardnews-status.json');
const blogStatus       = readStatusFile('.blog-status.json');

console.log('📋 상태 파일 로드:');
console.log('   뉴스레터:', newsletterStatus);
console.log('   카드뉴스:', cardNewsStatus);
console.log('   블로그:',   blogStatus);

const newsletterLine = statusLine(
  newsletterStatus,
  s => `✅ 뉴스레터 발송 완료 (${s.message})`,
  s => `❌ 뉴스레터 발송 실패 — ${s.message}`,
  '⚠️ 뉴스레터 상태 미확인',
);

const cardNewsLine = statusLine(
  cardNewsStatus,
  s => `✅ 카드뉴스 생성 완료 (${s.slideCount || 5}장)`,
  s => `❌ 카드뉴스 생성 실패 — ${s.message}`,
  '⚠️ 카드뉴스 상태 미확인',
);

const blogLine = statusLine(
  blogStatus,
  s => `✅ 블로그 포스트 발행 (${s.slug})`,
  s => `❌ 블로그 포스트 실패 — ${s.message}`,
  '⚠️ 블로그 상태 미확인',
);

// ─── 날짜/시간 ───────────────────────────────────────────
const now = new Date();
const kstStr = now.toLocaleString('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// ─── Slack Block Kit 메시지 ───────────────────────────────
const articleUrl = latestArticle
  ? `https://econpedia.dedyn.io${latestArticle.href}`
  : 'https://econpedia.dedyn.io/daily';

const allOk = latestArticle
  && newsletterStatus.success
  && cardNewsStatus.success
  && blogStatus.success;
const headerEmoji = allOk ? '✅' : '⚠️';

const payload = {
  blocks: [
    // 헤더
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${headerEmoji} EconPedia 일일 현황 리포트`,
        emoji: true,
      },
    },

    // 날짜
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `🕐 *${kstStr} KST*` },
      ],
    },

    { type: 'divider' },

    // 오늘의 브리핑
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: latestArticle
          ? `📰 *오늘의 브리핑*\n>${latestArticle.title}\n>${latestArticle.excerpt}`
          : '📰 *오늘의 브리핑*\n>❌ 기사 생성 없음 또는 실패',
      },
      ...(latestArticle
        ? {
            accessory: {
              type: 'button',
              text: { type: 'plain_text', text: '전문 읽기 →', emoji: true },
              url: articleUrl,
              action_id: 'read_article',
            },
          }
        : {}),
    },

    { type: 'divider' },

    // 누적 현황
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `📈 *누적 브리핑*\n${articles.length}개 발행`,
        },
        {
          type: 'mrkdwn',
          text: `📚 *카테고리 기사*\n${categoryArticleCount}개 발행`,
        },
        {
          type: 'mrkdwn',
          text: `📝 *블로그 포스트*\n${blogArticles.length}개 발행`,
        },
        {
          type: 'mrkdwn',
          text: `🌐 *사이트*\n<https://econpedia.dedyn.io|econpedia.dedyn.io>`,
        },
      ],
    },

    { type: 'divider' },

    // 자동화 상태 — 모든 파이프라인 실제 결과 반영
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `🤖 *자동화 상태*`,
          latestArticle ? `✅ 기사 생성 완료` : `❌ 기사 생성 실패`,
          cardNewsLine,
          blogLine,
          `✅ 사이트 배포 트리거됨`,
          newsletterLine,
        ].join('\n'),
      },
      ...(GITHUB_RUN_URL
        ? {
            accessory: {
              type: 'button',
              text: { type: 'plain_text', text: '🔍 Actions 로그', emoji: true },
              url: GITHUB_RUN_URL,
              action_id: 'view_actions',
            },
          }
        : {}),
    },

    // 푸터
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '🤖 _EconPedia AI Publisher가 자동으로 발송한 메시지입니다_',
        },
      ],
    },
  ],
};

// ─── 슬랙 발송 ────────────────────────────────────────────
console.log(`💬 슬랙 현황 리포트 발송 중...`);

try {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await res.text();

  if (!res.ok || text !== 'ok') {
    console.error(`❌ 슬랙 발송 실패 (${res.status}): ${text}`);
    process.exit(1);
  }

  console.log('✅ 슬랙 현황 리포트 발송 완료!');
} catch (err) {
  console.error('❌ 예외 발생:', err.message);
  process.exit(1);
}
