// node scripts/lib/analytics-summary.test.mjs
import assert from 'node:assert/strict';
import { computeAnalyticsSummary, isWhalePath } from './analytics-summary.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✓', name); };

const daily = {
  '2026-05-31': { pageviews: 100, bounces: 20, totalDwell: 6000, sessions: 50, whale: { pageviews: 30, totalDwell: 3600, sessions: 20 } },
  '2026-05-30': { pageviews: 60, bounces: 10, totalDwell: 3000, sessions: 30, whale: { pageviews: 10, totalDwell: 1200, sessions: 8 } },
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
  assert.equal(s.whale.avgDwellSec, round(4800 / 28)); // (3600+1200)/(20+8)
});

t('빈 데이터 — 0 division 안전', () => {
  const s = computeAnalyticsSummary({}, '2026-05-31', 7);
  assert.equal(s.avgSessionDurationSec, 0);
  assert.equal(s.bounceRate, 0);
  assert.equal(s.whale.avgDwellSec, 0);
});

t('isWhalePath', () => {
  assert.equal(isWhalePath('/whale/whale-meta-2026-04-22/'), true);
  assert.equal(isWhalePath('/daily/x'), false);
  assert.equal(isWhalePath(null), false);
});

function round(n, d = 1) { const f = 10 ** d; return Math.round(n * f) / f; }

console.log(`\n✅ analytics-summary: ${pass} tests passed`);
