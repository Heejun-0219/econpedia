// scripts/build-track-record.js
// G2 트랙레코드 — insider/entity별 매매 전적을 자동 계산.
//
// 입력: src/data/whale-analyses.json (매니페스트) + src/data/whale-followups.json (D+N 후행가격)
// 출력: src/data/whale-track-record.json
//   { _generatedAt, summary:{...}, insiders: [ { key, name, trades, winRateD90, winRateD365,
//     avgReturn:{d30,d90,d180,d365}, tier1, sampleSlugs } ] }
//
// 승률 정의(방향 인지): 매수는 이후 상승(pct>0)이 win, 매도는 이후 하락(pct<0)이 win(손실 회피).
// Tier-1: D+90 표본 n>=5 AND D+90 승률>=65%.  (표본 부족 시 tier1=false, 충분한 이력 누적 전까지 비공개)
//
// 사용: node scripts/build-track-record.js [--dry-run]

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
// 엔티티 정규화 — person 문자열의 이름 부분(역할 앞)만 사용.
// scripts/lib/whale-insider-key.js 에서 단일 소스 공유 (Astro WhaleFollow 컴포넌트와 동일 결과).
import { normPersonKey as normKey } from './lib/whale-insider-key.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const ANALYSES_PATH = path.join(ROOT, 'src', 'data', 'whale-analyses.json');
const FOLLOWUPS_PATH = path.join(ROOT, 'src', 'data', 'whale-followups.json');
const OUT_PATH = path.join(ROOT, 'src', 'data', 'whale-track-record.json');

const TIER1_MIN_N = 5;
const TIER1_MIN_WINRATE = 0.65;

function displayName(person) {
  return String(person || '').split('/')[0].trim() || '(미상)';
}

async function loadJson(p, fallback) {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function mean(nums) {
  const v = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n));
  if (!v.length) return null;
  return parseFloat((v.reduce((s, n) => s + n, 0) / v.length).toFixed(2));
}

// 방향 인지 win 판정: buy → pct>0, sell → pct<0
function isWin(isBuy, pct) {
  if (typeof pct !== 'number') return null;
  return isBuy ? pct > 0 : pct < 0;
}

function winRate(wins) {
  const decided = wins.filter((w) => w === true || w === false);
  if (!decided.length) return null;
  const w = decided.filter((x) => x === true).length;
  return { n: decided.length, rate: parseFloat((w / decided.length).toFixed(3)) };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const analyses = await loadJson(ANALYSES_PATH, []);
  const fuDoc = await loadJson(FOLLOWUPS_PATH, { followups: {} });
  const followups = fuDoc.followups || {};

  const groups = new Map();
  for (const a of analyses) {
    const key = normKey(a.person);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { key, name: displayName(a.person), entries: [] });
    groups.get(key).entries.push(a);
  }

  const insiders = [];
  for (const g of groups.values()) {
    const horizonPct = { d30: [], d90: [], d180: [], d365: [] };
    const winsD90 = [];
    const winsD365 = [];
    const sampleSlugs = [];
    let buyCount = 0;
    let sellCount = 0;

    for (const e of g.entries) {
      sampleSlugs.push(e.slug);
      if (e.isBuy) buyCount += 1;
      else sellCount += 1;
      const fu = followups[e.slug];
      if (!fu || fu.status !== 'ok') continue;
      const h = fu.horizons || {};
      for (const label of ['d30', 'd90', 'd180', 'd365']) {
        if (h[label] && typeof h[label].pct === 'number') horizonPct[label].push(h[label].pct);
      }
      if (h.d90 && typeof h.d90.pct === 'number') winsD90.push(isWin(e.isBuy, h.d90.pct));
      if (h.d365 && typeof h.d365.pct === 'number') winsD365.push(isWin(e.isBuy, h.d365.pct));
    }

    const wr90 = winRate(winsD90);
    const wr365 = winRate(winsD365);
    const tier1 = !!(wr90 && wr90.n >= TIER1_MIN_N && wr90.rate >= TIER1_MIN_WINRATE);

    insiders.push({
      key: g.key,
      name: g.name,
      trades: g.entries.length,
      buys: buyCount,
      sells: sellCount,
      winRateD90: wr90, // { n, rate } | null
      winRateD365: wr365,
      avgReturn: {
        d30: mean(horizonPct.d30),
        d90: mean(horizonPct.d90),
        d180: mean(horizonPct.d180),
        d365: mean(horizonPct.d365),
      },
      d90HistoryCount: winsD90.length,
      tier1,
      sampleSlugs,
    });
  }

  insiders.sort((a, b) => b.trades - a.trades || (b.d90HistoryCount - a.d90HistoryCount));

  const withD90 = insiders.filter((i) => i.d90HistoryCount > 0);
  const summary = {
    totalInsiders: insiders.length,
    insidersWith5PlusTrades: insiders.filter((i) => i.trades >= 5).length,
    insidersWithD90History: withD90.length,
    tier1Count: insiders.filter((i) => i.tier1).length,
    // G2 게이트 기준: 30명 이상이 각 5+ 거래 & D+90 이력
    gateTarget: { insidersWith5PlusTradesAndD90: 30, current: insiders.filter((i) => i.trades >= 5 && i.d90HistoryCount >= 5).length },
  };

  const out = {
    _generatedAt: new Date().toISOString(),
    _note:
      '승률은 방향 인지(매수=이후 상승 win, 매도=이후 하락 win). 모든 수익률은 raw 종가 변동률(시장평균 미보정). ' +
      `Tier-1 = D+90 표본 n>=${TIER1_MIN_N} & 승률>=${TIER1_MIN_WINRATE}. 표본 부족 insider는 비공개 권장.`,
    summary,
    insiders,
  };

  console.log('📊 트랙레코드 요약:', JSON.stringify(summary));
  console.log('   2+ 거래 insider:', insiders.filter((i) => i.trades >= 2).map((i) => `${i.name}(${i.trades})`).join(', ') || '없음');
  if (dryRun) {
    console.log('🟡 --dry-run: 파일 미기록');
    return;
  }
  await fs.writeFile(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`💾 저장: ${path.relative(ROOT, OUT_PATH)}`);
}

main();
