// scripts/snapshot-delta.js
// G3 측정 — 매일 KPI 스냅샷 델타를 history에 기록하는 잡.
//
// prompt.md G3: "A daily script writes the snapshot delta to ops/improvement-loop/state/history."
// 동작: 프로덕션 /api/analytics/summary(무PII) + kpis.json을 읽어 측정 가능한 KPI를 수집,
//       시계열 파일(state/kpi-timeseries.json)에 오늘 항목을 append하고, 직전 항목 대비
//       델타 마크다운을 history/YYYY-MM-DD_kpi-delta.md 에 기록. 하루 1항목(idempotent).
//
// 사용: node scripts/snapshot-delta.js [--dry-run] [--date YYYY-MM-DD]

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const STATE = path.join(ROOT, 'ops/improvement-loop/state');
const KPIS = path.join(STATE, 'kpis.json');
const TIMESERIES = path.join(STATE, 'kpi-timeseries.json');
const HISTORY = path.join(STATE, 'history');

const SITE = process.env.SITE_URL || 'https://econpedia.dedyn.io';

// 추적 메트릭: [라벨, 추출함수]
const METRICS = [
  ['daily_visitors_7d_avg', (s) => s.summary?.dailyVisitors7dAvg],
  ['avg_session_duration_sec', (s) => s.summary?.avgSessionDurationSec],
  ['bounce_rate', (s) => s.summary?.bounceRate],
  ['pageviews_7d', (s) => s.summary?.pageviews],
  ['sessions_7d', (s) => s.summary?.sessions],
  ['whale_daily_visitors_7d_avg', (s) => s.summary?.whale?.dailyVisitors7dAvg],
  ['whale_avg_dwell_sec', (s) => s.summary?.whale?.avgDwellSec],
];

async function loadJson(p, fb) { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fb; } }

function fmtDelta(prev, cur) {
  if (typeof cur !== 'number') return '—';
  if (typeof prev !== 'number') return `${cur} (신규)`;
  const d = cur - prev;
  const sign = d > 0 ? '+' : '';
  const pct = prev !== 0 ? ` (${sign}${((d / Math.abs(prev)) * 100).toFixed(1)}%)` : '';
  return `${cur} ${sign}${d.toFixed(2)}${pct}`;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dateIdx = args.indexOf('--date');
  const today = dateIdx >= 0 ? args[dateIdx + 1] : new Date().toISOString().slice(0, 10);

  // 프로덕션 무PII summary fetch (실패 시 kpis.json fallback)
  let summary = null;
  try {
    const res = await fetch(`${SITE}/api/analytics/summary`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) summary = await res.json();
  } catch {}
  const kpis = await loadJson(KPIS, {});
  if (!summary) {
    // fallback: kpis.json의 traffic 값으로 최소 시계열 유지
    summary = { summary: {
      dailyVisitors7dAvg: kpis.traffic?.daily_visitors_7d_avg,
      avgSessionDurationSec: kpis.traffic?.avg_session_duration_sec,
      bounceRate: kpis.traffic?.bounce_rate,
      pageviews: null, sessions: null, whale: {},
    } };
  }

  const entry = { date: today, capturedAt: new Date().toISOString(), source: summary?.success ? 'prod_summary' : 'kpis_fallback', values: {} };
  for (const [label, fn] of METRICS) entry.values[label] = fn(summary) ?? null;

  const ts = await loadJson(TIMESERIES, { _description: 'G3 일일 KPI 시계열(무PII). snapshot-delta.js가 매일 append.', entries: [] });
  const prevEntry = ts.entries.length ? ts.entries[ts.entries.length - 1] : null;
  // 같은 날짜 항목이 있으면 교체(idempotent)
  ts.entries = ts.entries.filter((e) => e.date !== today);
  ts.entries.push(entry);

  // 델타 마크다운
  const lines = [
    `# KPI Snapshot Delta — ${today}`,
    '',
    `> source: ${entry.source} · capturedAt ${entry.capturedAt}`,
    prevEntry ? `> 직전: ${prevEntry.date}` : '> 직전 항목 없음(최초)',
    '',
    '| metric | value | Δ vs prev |',
    '|---|---|---|',
    ...METRICS.map(([label]) => `| ${label} | ${entry.values[label] ?? '—'} | ${fmtDelta(prevEntry?.values?.[label], entry.values[label])} |`),
  ];
  const md = lines.join('\n') + '\n';

  console.log(md);
  if (dryRun) { console.log('🟡 dry-run: 미기록'); return; }

  await fs.mkdir(HISTORY, { recursive: true });
  await fs.writeFile(TIMESERIES, JSON.stringify(ts, null, 2) + '\n', 'utf8');
  await fs.writeFile(path.join(HISTORY, `${today}_kpi-delta.md`), md, 'utf8');
  console.log(`💾 timeseries(${ts.entries.length} entries) + history/${today}_kpi-delta.md`);
}

main();
