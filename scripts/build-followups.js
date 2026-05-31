// scripts/build-followups.js
// G1 데이터 무결성 — Whale Alert 후행 가격(D+N) 영속화 + 백필 스케줄 잡.
//
// 문제: 후행 가격(D+30/90/180/365)이 생성 시점에 개별 .astro 페이지에 구워져
//       영속 저장이 없었음. 생성 당시 "미도래"였던 구간은 영원히 채워지지 않았음.
// 해결: 이 스크립트가 whale-analyses.json 매니페스트를 순회하며 Yahoo Finance에서
//       후행 가격을 조회해 src/data/whale-followups.json 에 슬러그 단위로 영속 저장.
//       이미 도래한 구간만 채우고, 미도래 구간은 null로 명시. idempotent —
//       매 cron 실행마다 새로 도래한 구간을 채워 넣는다 (G1이 요구하는 백필 잡).
//
// 사용:
//   node scripts/build-followups.js              # 전체 백필
//   node scripts/build-followups.js --missing    # 미도래/미수집 구간만 갱신
//   node scripts/build-followups.js --dry-run    # 파일 미기록, 통계만 출력
//
// 출력 스키마(src/data/whale-followups.json):
//   { _generatedAt, _note, coverage:{...}, followups: { <slug>: {...} } }

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const ANALYSES_JSON_PATH = path.join(ROOT, 'src', 'data', 'whale-analyses.json');
const FOLLOWUPS_JSON_PATH = path.join(ROOT, 'src', 'data', 'whale-followups.json');

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HORIZONS = { d30: 30, d90: 90, d180: 180, d365: 365 };
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 거래일 ±7일 이내 종가만 인정

function yahooSymbolsFor(entry) {
  if (entry.market === 'kr') return [`${entry.ticker}.KS`, `${entry.ticker}.KQ`];
  return [entry.ticker];
}

async function fetchQuotes(entry) {
  const baseDate = new Date(entry.date);
  if (Number.isNaN(baseDate.getTime())) return null;
  const today = new Date();
  const farthest = new Date(baseDate);
  farthest.setDate(farthest.getDate() + 400);
  const period2 = farthest > today ? today : farthest;
  if (period2 <= baseDate) return null;

  let transientError = false;
  for (const sym of yahooSymbolsFor(entry)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await yahooFinance.chart(sym, { period1: baseDate, period2, interval: '1d' });
        const quotes = (res?.quotes || []).filter((q) => q.close);
        if (quotes.length) return { symbol: sym, baseDate, quotes };
        break; // 정상 응답이나 데이터 없음 — 다음 심볼로(재시도 무의미)
      } catch {
        transientError = true; // 예외 = 일시 장애 가능성 → 백오프 후 재시도
        await sleep(300 * (attempt + 1));
      }
    }
  }
  // transientError면 기존 good 데이터를 덮어쓰지 않도록 호출부에 신호
  return transientError ? { transientError: true } : null;
}

function closestQuote(quotes, targetMs) {
  let best = null;
  let bestDiff = Infinity;
  for (const q of quotes) {
    const diff = Math.abs(q.date.getTime() - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = q;
    }
  }
  return bestDiff <= WINDOW_MS ? best : null;
}

function computeFollowup(entry, fetched) {
  const { baseDate, quotes, symbol } = fetched;
  const base = closestQuote(quotes, baseDate.getTime());
  if (!base) return { status: 'no_base', symbol, horizons: emptyHorizons() };

  const now = Date.now();
  const horizons = {};
  for (const [label, days] of Object.entries(HORIZONS)) {
    const target = baseDate.getTime() + days * 24 * 60 * 60 * 1000;
    if (target > now) {
      horizons[label] = null; // 미도래 — 향후 백필
      continue;
    }
    const q = closestQuote(quotes, target);
    if (!q) {
      horizons[label] = null; // 도래했으나 가격 미확보
      continue;
    }
    const pct = ((q.close - base.close) / base.close) * 100;
    horizons[label] = {
      date: q.date.toISOString().split('T')[0],
      close: parseFloat(q.close.toFixed(2)),
      pct: parseFloat(pct.toFixed(2)),
    };
  }
  return {
    status: 'ok',
    symbol,
    basePrice: parseFloat(base.close.toFixed(2)),
    baseDate: base.date.toISOString().split('T')[0],
    horizons,
  };
}

function emptyHorizons() {
  return { d30: null, d90: null, d180: null, d365: null };
}

// 도래했어야 하는 구간 수(분모) — 커버리지 분모. 오늘 기준 base+days <= today
function dueHorizonCount(entry, nowMs) {
  const base = new Date(entry.date).getTime();
  if (Number.isNaN(base)) return 0;
  let due = 0;
  for (const days of Object.values(HORIZONS)) {
    if (base + days * 24 * 60 * 60 * 1000 <= nowMs) due += 1;
  }
  return due;
}

async function loadJson(p, fallback) {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const missingOnly = args.includes('--missing');

  const analyses = await loadJson(ANALYSES_JSON_PATH, []);
  if (!Array.isArray(analyses) || !analyses.length) {
    console.error('❌ whale-analyses.json 비어있음');
    process.exit(1);
  }
  const existing = await loadJson(FOLLOWUPS_JSON_PATH, { followups: {} });
  const followups = existing.followups || {};

  const nowMs = Date.now();
  let fetchedCount = 0;
  let skipped = 0;

  for (const entry of analyses) {
    const prev = followups[entry.slug];
    // --missing: 이미 모든 도래 구간이 채워졌으면 스킵
    if (missingOnly && prev && prev.status === 'ok') {
      const due = dueHorizonCount(entry, nowMs);
      const filled = Object.values(prev.horizons || {}).filter(Boolean).length;
      if (filled >= due) {
        skipped += 1;
        continue;
      }
    }

    const fetched = await fetchQuotes(entry);
    // 일시 장애(transientError) 또는 데이터 없음 → 기존 good('ok'+basePrice) 데이터는 절대 덮어쓰지 않음.
    if (!fetched || fetched.transientError || !fetched.quotes) {
      const transient = Boolean(fetched && fetched.transientError);
      if (prev && prev.status === 'ok' && prev.basePrice != null) {
        // 기존 good 데이터 보존 — 마지막 시도 실패 마커만 기록
        followups[entry.slug] = { ...prev, lastFetchFailedAt: new Date(nowMs).toISOString(), lastFetchTransient: transient };
        console.log(`  ↩️  ${entry.slug} (${entry.ticker}) — ${transient ? '일시장애' : '데이터없음'}, 기존 good 데이터 보존`);
      } else {
        followups[entry.slug] = {
          ...(prev || {}),
          ticker: entry.ticker,
          market: entry.market,
          status: transient ? (prev?.status || 'fetch_error') : 'no_data',
          horizons: prev?.horizons || emptyHorizons(),
          fetchedAt: new Date(nowMs).toISOString(),
        };
        console.log(`  ⚠️  ${entry.slug} (${entry.ticker}) — ${transient ? '일시장애(이력없음)' : '가격 데이터 없음'}`);
      }
      await sleep(150);
      continue;
    }
    const fu = computeFollowup(entry, fetched);
    followups[entry.slug] = {
      ticker: entry.ticker,
      market: entry.market,
      isBuy: entry.isBuy,
      person: entry.person,
      baseDate: fu.baseDate || entry.date,
      basePrice: fu.basePrice ?? null,
      symbol: fu.symbol,
      status: fu.status,
      horizons: fu.horizons,
      fetchedAt: new Date(nowMs).toISOString(),
    };
    const filled = Object.values(fu.horizons).filter(Boolean).length;
    const due = dueHorizonCount(entry, nowMs);
    console.log(`  ✅ ${entry.slug} (${fu.symbol}) base ${fu.basePrice ?? '—'} · ${filled}/${due} 도래구간 채움`);
    fetchedCount += 1;
    await sleep(150);
  }

  // 커버리지 통계
  let totalDue = 0;
  let totalFilled = 0;
  let okEntries = 0;
  for (const entry of analyses) {
    const due = dueHorizonCount(entry, nowMs);
    totalDue += due;
    const fu = followups[entry.slug];
    if (fu && fu.status === 'ok') {
      okEntries += 1;
      totalFilled += Object.values(fu.horizons || {}).filter(Boolean).length;
    }
  }
  const coverage = {
    entries: analyses.length,
    entriesWithBasePrice: okEntries,
    dueHorizons: totalDue,
    filledHorizons: totalFilled,
    coverageRatio: totalDue ? parseFloat((totalFilled / totalDue).toFixed(4)) : 1,
  };

  const out = {
    _generatedAt: new Date(nowMs).toISOString(),
    _note:
      '후행 가격(D+N)은 매니페스트 date(공시일) 기준 raw 종가 변동률(시장평균 미보정). ' +
      '미도래 구간은 null이며 cron 백필로 채워짐. 기준일 ±7일 이내 종가만 인정.',
    coverage,
    followups,
  };

  console.log('\n📊 커버리지:', JSON.stringify(coverage));
  console.log(`   조회 ${fetchedCount}건, 스킵 ${skipped}건`);

  if (dryRun) {
    console.log('🟡 --dry-run: 파일 미기록');
    return;
  }
  await fs.writeFile(FOLLOWUPS_JSON_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`💾 저장: ${path.relative(ROOT, FOLLOWUPS_JSON_PATH)}`);
}

main();
