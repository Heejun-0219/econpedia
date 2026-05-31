// scripts/lib/analytics-summary.js
// G3 측정 — 일별 analytics 버킷에서 무PII 7일 집계를 계산하는 순수 함수.
// api/server.js의 GET /api/analytics/summary 와 improvement-loop snapshot이 공유.
//
// daily 스키마: { 'YYYY-MM-DD': { pageviews, bounces, totalDwell, sessions,
//                                 whale?: { pageviews, totalDwell, sessions } } }

function round(n, d = 1) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

// refDateStr: 'YYYY-MM-DD' 기준일(포함). days: 윈도우 길이.
export function computeAnalyticsSummary(daily, refDateStr, days = 7) {
  const map = daily || {};
  const ref = new Date(`${refDateStr}T00:00:00Z`);
  const wanted = new Set();
  for (let i = 0; i < days; i++) {
    const d = new Date(ref);
    d.setUTCDate(d.getUTCDate() - i);
    wanted.add(d.toISOString().slice(0, 10));
  }

  const acc = { pageviews: 0, bounces: 0, totalDwell: 0, sessions: 0, scrollDepthSum: 0, scrollSamples: 0, ctaClicks: 0 };
  const whaleAcc = { pageviews: 0, totalDwell: 0, sessions: 0, scrollDepthSum: 0, scrollSamples: 0, ctaClicks: 0 };
  let daysWithData = 0;

  for (const [date, v] of Object.entries(map)) {
    if (!wanted.has(date) || !v) continue;
    daysWithData += 1;
    acc.pageviews += v.pageviews || 0;
    acc.bounces += v.bounces || 0;
    acc.totalDwell += v.totalDwell || 0;
    acc.sessions += v.sessions || 0;
    acc.scrollDepthSum += v.scrollDepthSum || 0;
    acc.scrollSamples += v.scrollSamples || 0;
    acc.ctaClicks += v.ctaClicks || 0;
    if (v.whale) {
      whaleAcc.pageviews += v.whale.pageviews || 0;
      whaleAcc.totalDwell += v.whale.totalDwell || 0;
      whaleAcc.sessions += v.whale.sessions || 0;
      whaleAcc.scrollDepthSum += v.whale.scrollDepthSum || 0;
      whaleAcc.scrollSamples += v.whale.scrollSamples || 0;
      whaleAcc.ctaClicks += v.whale.ctaClicks || 0;
    }
  }

  return {
    windowDays: days,
    daysWithData,
    pageviews: acc.pageviews,
    sessions: acc.sessions,
    dailyVisitors7dAvg: round(acc.sessions / days),
    avgSessionDurationSec: acc.sessions > 0 ? round(acc.totalDwell / acc.sessions) : 0,
    bounceRate: acc.sessions > 0 ? round(acc.bounces / acc.sessions, 3) : 0,
    avgScrollDepthPct: acc.scrollSamples > 0 ? round(acc.scrollDepthSum / acc.scrollSamples) : 0,
    ctaClicks: acc.ctaClicks,
    whale: {
      pageviews: whaleAcc.pageviews,
      dailyVisitors7dAvg: round(whaleAcc.sessions / days),
      avgDwellSec: whaleAcc.sessions > 0 ? round(whaleAcc.totalDwell / whaleAcc.sessions) : 0,
      avgScrollDepthPct: whaleAcc.scrollSamples > 0 ? round(whaleAcc.scrollDepthSum / whaleAcc.scrollSamples) : 0,
      ctaClicks: whaleAcc.ctaClicks,
    },
  };
}

// dwell/pageview 이벤트를 일별 버킷에 누적 (api/server.js 핸들러가 사용). 순수 — bucket을 변형해 반환.
export function isWhalePath(p) {
  return typeof p === 'string' && p.startsWith('/whale/');
}
