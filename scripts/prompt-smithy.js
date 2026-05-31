// scripts/prompt-smithy.js — Meta-Automation Track B (MVP, dry-run 진단)
//
// 프롬프트 파일을 품질 점수 기반으로 매주 1건 자가 rewrite.
// 품질 신호: (a) 사용자 reject 비율, (b) QC 통과율, (c) 후행 CTR/체류, (d) critique reject rate.
// MVP 정책: 위 신호 대부분이 G3 측정에 의존 → 측정 부재 시 "G3 선행" 진단. 자동 rewrite는 측정 정착 후.
// 가드: pause.flag, 주 1건 change budget, 컴플라이언스 락(critique high-severity 프롬프트 변경 차단).
//
// 사용: node scripts/prompt-smithy.js [--dry-run]
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const REPORTS = path.join(ROOT, 'ops/meta-automation/reports');
const PAUSE_LOCAL = path.join(ROOT, 'ops/meta-automation/pause.flag');
const PAUSE_WS = '/Users/kimheejune/ad-maker/ops/meta-automation/pause.flag';
const KPIS = path.join(ROOT, 'ops/improvement-loop/state/kpis.json');

// 진화 대상 프롬프트 자산
const PROMPT_ASSETS = [
  'src/data/prompts.js',
  'ops/improvement-loop/prompts/critique.md',
  'ops/improvement-loop/prompts/synthesize.md',
];

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }
async function loadJson(p, fb) { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fb; } }

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (await exists(PAUSE_LOCAL) || await exists(PAUSE_WS)) {
    console.log('⏸️  pause.flag 존재 — Prompt Smithy 중단');
    return;
  }

  const present = [];
  for (const a of PROMPT_ASSETS) if (await exists(path.join(ROOT, a))) present.push(a);

  const kpis = await loadJson(KPIS, {});
  const ctr = kpis?.telegram?.whale_telegram_ctr;
  const dwell = kpis?.traffic?.avg_session_duration_sec;
  const haveQualitySignal = (ctr != null && ctr !== 0) || (dwell != null && dwell !== 0);

  let decision;
  if (!haveQualitySignal) {
    decision = {
      action: 'NO_CHANGE',
      reason:
        '프롬프트 품질 신호(후행 CTR·체류)가 G3 측정에 의존하는데 모두 null. blind rewrite는 출력 일관성·신뢰(법칙 #6) 위험. ' +
        'G3 정착 후 최약 프롬프트 1개 선정 → 페르소나 rewrite → LLM judge 승률 70%+ 채택 파이프라인 가동.',
      blockedOn: 'G3-measurement',
      assetsTracked: present,
    };
  } else {
    decision = {
      action: 'PROPOSE',
      candidate: present[0],
      basis: { ctr, dwell },
      proposal: '최약 프롬프트 rewrite 후보 — old vs new N=10 출력 비교 + blind LLM judge 필요(MVP: 후보 식별까지).',
    };
  }

  const report = {
    track: 'prompt-smithy',
    generatedAt: new Date().toISOString(),
    changeBudget: '1/week',
    guards: { pauseFlag: false, complianceLock: 'critique high-severity 프롬프트 변경 차단' },
    decision,
  };

  console.log('✍️  Prompt Smithy:', JSON.stringify(decision));
  if (dryRun) { console.log('🟡 dry-run: 리포트 미기록'); return; }
  await fs.mkdir(REPORTS, { recursive: true });
  const fname = `prompt-smithy-${report.generatedAt.slice(0, 10)}.json`;
  await fs.writeFile(path.join(REPORTS, fname), JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`💾 ${path.relative(ROOT, path.join(REPORTS, fname))}`);
}

main();
