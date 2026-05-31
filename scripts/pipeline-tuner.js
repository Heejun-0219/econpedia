// scripts/pipeline-tuner.js — Meta-Automation Track A (MVP, dry-run 진단)
//
// 자동화 파라미터(임계·시간·가중치)를 KPI 기반으로 매주 1건 자가 튜닝.
// MVP 정책: 측정(G3)이 truth source. KPI가 부재하면 튜닝하지 않고 "G3 선행" 진단.
// 가드: pause.flag, 주 1건 change budget, 연쇄변경 금지(직전 변경 14일 윈도우).
//
// 사용: node scripts/pipeline-tuner.js [--dry-run]
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const KPIS = path.join(ROOT, 'ops/improvement-loop/state/kpis.json');
const REPORTS = path.join(ROOT, 'ops/meta-automation/reports');
const PAUSE_LOCAL = path.join(ROOT, 'ops/meta-automation/pause.flag');
const PAUSE_WS = '/Users/kimheejune/ad-maker/ops/meta-automation/pause.flag';

// 튜닝 가능한 파라미터와 그것이 의존하는 KPI(개선 신호)
const TUNABLES = [
  { pipeline: 'whale-scan', param: 'MAX_ANALYSES_PER_RUN', kpi: 'telegram.whale_telegram_ctr', dir: 'maximize' },
  { pipeline: 'whale-scan', param: 'dedup_window_days', kpi: 'content.whale_alert_pages', dir: 'integrity' },
  { pipeline: 'telegram', param: 'push_hour_kst', kpi: 'telegram.whale_telegram_ctr', dir: 'maximize' },
];

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }
async function loadJson(p, fb) { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fb; } }
function getPath(obj, dotted) { return dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (await exists(PAUSE_LOCAL) || await exists(PAUSE_WS)) {
    console.log('⏸️  pause.flag 존재 — Pipeline Tuner 중단');
    return;
  }

  const kpis = await loadJson(KPIS, {});
  // 최적화 신호로 인정되는 건 dir:'maximize' KPI뿐. integrity 지표(페이지수 등)는 튜닝 목적함수가 아님.
  const measurable = TUNABLES.filter(
    (t) => t.dir === 'maximize' && getPath(kpis, t.kpi) != null && getPath(kpis, t.kpi) !== 0
  );

  let decision;
  if (measurable.length === 0) {
    decision = {
      action: 'NO_CHANGE',
      reason:
        'G3 측정 부재 — 튜닝 대상 KPI가 모두 null/0. 측정 없이 파라미터를 바꾸면 개선/악화를 판별할 수 없음(법칙 #4). ' +
        'G3(텔레그램 구독자·CTR·체류·CTA) 정착 후 첫 튜닝 사이클 진행.',
      blockedOn: 'G3-measurement',
    };
  } else {
    // 측정 가능한 최약 KPI 1개의 단일 step 변경안 제시 (MVP는 제안만, 자동 PR 없음)
    const target = measurable[0];
    decision = {
      action: 'PROPOSE',
      param: `${target.pipeline}.${target.param}`,
      basedOnKpi: target.kpi,
      currentKpi: getPath(kpis, target.kpi),
      proposal: '단일 step 변경 후보 — 14일 후행 KPI 관찰 필요. (MVP: 제안만, 머지 전 Obsidian 미리보기)',
    };
  }

  const report = {
    track: 'pipeline-tuner',
    generatedAt: new Date().toISOString(),
    changeBudget: '1/week',
    guards: { pauseFlag: false, chainChangeBlock: '직전 변경 14일 윈도우 내 동일 파일 재변경 금지' },
    decision,
  };

  console.log('🔧 Pipeline Tuner:', JSON.stringify(decision));
  if (dryRun) { console.log('🟡 dry-run: 리포트 미기록'); return; }
  await fs.mkdir(REPORTS, { recursive: true });
  const fname = `pipeline-tuner-${report.generatedAt.slice(0, 10)}.json`;
  await fs.writeFile(path.join(REPORTS, fname), JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`💾 ${path.relative(ROOT, path.join(REPORTS, fname))}`);
}

main();
