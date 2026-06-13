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

function round(n, d = 1) { const f = 10 ** d; return Math.round(n * f) / f; }

console.log(`\n✅ analytics-summary: ${pass} tests passed`);
