// node scripts/lib/analytics-summary.test.mjs
import assert from 'node:assert/strict';
import { computeAnalyticsSummary, isWhalePath } from './analytics-summary.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✓', name); };

const daily = {
  '2026-05-31': { pageviews: 100, bounces: 20, totalDwell: 6000, sessions: 50, scrollDepthSum: 4000, scrollSamples: 50, ctaClicks: 5, whale: { pageviews: 30, bounces: 5, totalDwell: 3600, sessions: 20, scrollDepthSum: 1600, scrollSamples: 20, ctaClicks: 3 } },
  '2026-05-30': { pageviews: 60, bounces: 10, totalDwell: 3000, sessions: 30, scrollDepthSum: 1500, scrollSamples: 30, ctaClicks: 2, whale: { pageviews: 10, bounces: 2, totalDwell: 1200, sessions: 8, scrollDepthSum: 480, scrollSamples: 8, ctaClicks: 1 } },
  '2026-04-01': { pageviews: 999, bounces: 0, totalDwell: 0, sessions: 999 }, // 윈도우 밖
};

t('7일 윈도우 집계 — 윈도우 밖 날짜 제외', () => {
  const s = computeAnalyticsSummary(daily, '2026-05-31', 7);
  assert.equal(s.pageviews, 160);
  assert.equal(s.sessions, 80);
  assert.equal(s.daysWithData, 2);
});

t('평균 체류 = totalDwell/sessions', () => {
  const s = computeAnalyticsSummary(daily, '2026-05-31', 7);
  assert.equal(s.avgSessionDurationSec, 112.5); // 9000/80
});

t('bounce rate = bounces/sessions', () => {
  const s = computeAnalyticsSummary(daily, '2026-05-31', 7);
  assert.equal(s.bounceRate, 0.375); // 30/80
});

t('whale 섹션 분리 집계', () => {
  const s = computeAnalyticsSummary(daily, '2026-05-31', 7);
  assert.equal(s.whale.pageviews, 40);
  assert.equal(s.whale.sessions, 28); // 20 + 8
  assert.equal(s.whale.avgDwellSec, round(4800 / 28)); // (3600+1200)/(20+8)
});

t('whaleAsSessionEntryPct — W1 게이트 metric (whale.sessions / sessions)', () => {
  const s = computeAnalyticsSummary(daily, '2026-05-31', 7);
  assert.equal(s.whaleAsSessionEntryPct, 0.35); // 28/80 = 0.35
  const empty = computeAnalyticsSummary({}, '2026-05-31', 7);
  assert.equal(empty.whaleAsSessionEntryPct, 0); // 0-division 안전
});

t('빈 데이터 — 0 division 안전', () => {
  const s = computeAnalyticsSummary({}, '2026-05-31', 7);
  assert.equal(s.avgSessionDurationSec, 0);
  assert.equal(s.bounceRate, 0);
  assert.equal(s.whale.avgDwellSec, 0);
  assert.equal(s.whale.bounceRate, 0);
  assert.equal(s.avgScrollDepthPct, 0);
  assert.equal(s.ctaClicks, 0);
});

t('whale.bounceRate — W3 wedge metric (whale.bounces / whale.sessions)', () => {
  const s = computeAnalyticsSummary(daily, '2026-05-31', 7);
  assert.equal(s.whale.bounceRate, 0.25); // (5+2)/(20+8) = 7/28
});

t('스크롤 깊이 평균 + CTA 클릭 집계', () => {
  const s = computeAnalyticsSummary(daily, '2026-05-31', 7);
  assert.equal(s.avgScrollDepthPct, round((4000 + 1500) / (50 + 30))); // 68.75
  assert.equal(s.ctaClicks, 7);
  assert.equal(s.whale.avgScrollDepthPct, round((1600 + 480) / (20 + 8))); // 74.3
  assert.equal(s.whale.ctaClicks, 4);
});

t('isWhalePath', () => {
  assert.equal(isWhalePath('/whale/whale-meta-2026-04-22/'), true);
  assert.equal(isWhalePath('/daily/x'), false);
  assert.equal(isWhalePath(null), false);
});

t('bySource 미전달 — sourceCounts 필드 생략 (backwards compat)', () => {
  const s = computeAnalyticsSummary(daily, '2026-05-31', 7);
  assert.equal('sourceCounts' in s, false);
});

t('bySource 전달 — 윈도우 내 일별 카운트 합산', () => {
  const bySource = {
    whale_tg: { '2026-05-31': 3, '2026-05-30': 2, '2026-04-01': 100 },  // 100은 윈도우 밖
    whale_rss: { '2026-05-31': 1 },
    whale_insider: { '2026-05-29': 5 },
  };
  const s = computeAnalyticsSummary(daily, '2026-05-31', 7, bySource);
  assert.deepEqual(s.sourceCounts, { whale_tg: 5, whale_rss: 1, whale_insider: 5 });
});

t('bySource 빈 카운트/비숫자 무시', () => {
  const bySource = {
    whale_tg: { '2026-05-31': 0, '2026-05-30': null, '2026-05-29': 'x' },
    whale_rss: { '2026-05-31': 3 },
  };
  const s = computeAnalyticsSummary(daily, '2026-05-31', 7, bySource);
  // whale_tg 합산 0 → 생략, whale_rss 만 노출
  assert.deepEqual(s.sourceCounts, { whale_rss: 3 });
});

t('bySource 14일 윈도우', () => {
  const bySource = {
    whale_tg: { '2026-05-31': 2, '2026-05-25': 3, '2026-05-10': 100 },  // 10일은 윈도우 밖
  };
  const s = computeAnalyticsSummary(daily, '2026-05-31', 14, bySource);
  assert.deepEqual(s.sourceCounts, { whale_tg: 5 });
});

t('sourceCounts top-N cap — 60종 → 50개만, count DESC', () => {
  // 60개 source 생성, count = 60..1 으로 식별 (whale_001 = 60, whale_060 = 1)
  const bySource = {};
  for (let i = 1; i <= 60; i++) {
    const src = 'whale_' + String(i).padStart(3, '0');
    bySource[src] = { '2026-05-31': 61 - i };  // 첫번째 = 60, 마지막 = 1
  }
  const s = computeAnalyticsSummary(daily, '2026-05-31', 7, bySource);
  const keys = Object.keys(s.sourceCounts);
  assert.equal(keys.length, 50, 'cap = 50');
  // top-1 = whale_001 (count 60), top-50 = whale_050 (count 11)
  assert.equal(s.sourceCounts['whale_001'], 60);
  assert.equal(s.sourceCounts['whale_050'], 11);
  // whale_051..060 (count 1..10) 은 잘려서 미포함
  assert.equal('whale_051' in s.sourceCounts, false);
  assert.equal('whale_060' in s.sourceCounts, false);
});

t('sourceCounts tie-break — 동일 count 시 source 키 사전순', () => {
  const bySource = {
    z_source: { '2026-05-31': 5 },
    a_source: { '2026-05-31': 5 },
    m_source: { '2026-05-31': 5 },
    high: { '2026-05-31': 10 },
  };
  const s = computeAnalyticsSummary(daily, '2026-05-31', 7, bySource);
  // 모두 ≤ 50 이므로 전부 노출, 단 입력 순서가 아닌 결정적 순서 (count DESC, src ASC)
  // Object 키 순서는 삽입 순서 — 검증은 첫 key 가 high (가장 큰 count) 인지로.
  const keys = Object.keys(s.sourceCounts);
  assert.equal(keys[0], 'high');  // count 10 → 1순위
  // 나머지 3개 (count 5) 는 a, m, z 순으로 삽입됐어야 함
  assert.deepEqual(keys.slice(1), ['a_source', 'm_source', 'z_source']);
});

function round(n, d = 1) { const f = 10 ** d; return Math.round(n * f) / f; }

console.log(`\n✅ analytics-summary: ${pass} tests passed`);
