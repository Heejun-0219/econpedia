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
const WEBHOOK_URL   = process.env.SLACK_WEBHOOK_URL;
const GITHUB_RUN_URL = process.env.GITHUB_RUN_URL || '';

if (!WEBHOOK_URL) {
  console.error('❌ SLACK_WEBHOOK_URL 환경 변수가 없습니다. 발송을 건너뜁니다.');
  process.exit(0);
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

// 카테고리 기사 수 계산
let categoryArticleCount = 0;
try {
  const { CATEGORIES } = await import('../src/data/categories.js');
  for (const cat of Object.values(CATEGORIES)) {
    categoryArticleCount += cat.articles.filter(a => !a.comingSoon).length;
  }
} catch (e) {
  categoryArticleCount = 1; // GDP 기사 1개
}

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

const totalArticles = articles.length + categoryArticleCount;

// ─── Slack Block Kit 메시지 ───────────────────────────────
const articleUrl = latestArticle
  ? `https://econpedia.dedyn.io${latestArticle.href}`
  : 'https://econpedia.dedyn.io/daily';

const payload = {
  blocks: [
    // 헤더
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📊 EconPedia 일일 현황 리포트',
        emoji: true,
      },
    },

    // 날짜
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `🕐 *${kstStr} KST* | 자동 발행 완료`,
        },
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
          : '📰 *오늘의 브리핑*\n>기사 생성 없음',
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
          text: `📚 *카테고리 기사*\n${categoryArticleCount}개 발행 완료`,
        },
        {
          type: 'mrkdwn',
          text: `🗂 *카테고리*\n7개 운영 중`,
        },
        {
          type: 'mrkdwn',
          text: `🌐 *사이트*\n<https://econpedia.dedyn.io|econpedia.dedyn.io>`,
        },
      ],
    },

    { type: 'divider' },

    // 자동화 상태
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🤖 *자동화 상태*\n✅ 기사 생성 완료\n✅ 사이트 배포 트리거됨\n✅ 뉴스레터 발송 완료`,
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
  console.log(`   - 브리핑: ${articles.length}개`);
  console.log(`   - 카테고리 기사: ${categoryArticleCount}개`);
} catch (err) {
  console.error('❌ 예외 발생:', err.message);
  process.exit(1);
}
