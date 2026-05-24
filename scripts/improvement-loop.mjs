#!/usr/bin/env node
// scripts/improvement-loop.mjs
// EconPedia self-improvement loop orchestrator.
//
// Phases:
//   snapshot   — gather production state (KPIs, code stats, git log, recent issues)
//   critique   — run each persona (musk, mckinsey, munger) over the snapshot
//   synthesize — fold the 3 critiques into one McKinsey-grade plan
//   actionize  — break the plan into GitHub issues (JSON output; piped to gh CLI in CI)
//   all        — snapshot → critique × 3 → synthesize (default)
//
// Usage:
//   node scripts/improvement-loop.mjs                          # full cycle, writes to ops/improvement-loop/state/history/
//   node scripts/improvement-loop.mjs --phase critique --persona musk
//   node scripts/improvement-loop.mjs --phase synthesize
//   node scripts/improvement-loop.mjs --phase actionize        # emits JSON on stdout
//
// Models:
//   - Default: claude-opus-4-7 with adaptive thinking + effort=high (critique) / xhigh (synthesize)
//   - Fallback: Gemini via @google/genai if ANTHROPIC_API_KEY not set but GEMINI_API_KEY is
//
// Prompt caching:
//   - The production snapshot is the largest stable block per cycle → 5-min ephemeral cache breakpoint
//   - Persona prompt is the second-most stable (per persona) → second breakpoint
//   - The phase-specific instruction is the volatile suffix (uncached)

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const LOOP_DIR = path.join(ROOT, 'ops', 'improvement-loop');
const STATE_DIR = path.join(LOOP_DIR, 'state');
const HISTORY_DIR = path.join(STATE_DIR, 'history');
const PERSONAS_DIR = path.join(LOOP_DIR, 'personas');
const PROMPTS_DIR = path.join(LOOP_DIR, 'prompts');

const PERSONAS = ['musk', 'mckinsey', 'munger'];

// Filename-safe timestamp: YYYY-MM-DD_HH-MM (UTC). Same date supports many runs/day.
function stamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}`;
}

// Find the most recent file in HISTORY_DIR matching a suffix (e.g. '-plan.md', '-musk.md').
// Used so phase=synthesize/actionize picks up the latest artifacts regardless of which run produced them.
async function latestHistoryFile(suffix) {
  try {
    const files = (await fs.readdir(HISTORY_DIR))
      .filter(f => f.endsWith(suffix))
      .sort();
    return files.length ? path.join(HISTORY_DIR, files[files.length - 1]) : null;
  } catch { return null; }
}

// ─── CLI args ───────────────────────────────────────────────
function parseArgs(argv) {
  const out = { phase: 'all', persona: null, dryRun: false, cycle: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--phase') out.phase = argv[++i];
    else if (a === '--persona') out.persona = argv[++i];
    else if (a === '--cycle') out.cycle = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: improvement-loop.mjs [--phase all|snapshot|critique|synthesize|actionize] [--persona musk|mckinsey|munger] [--cycle N] [--dry-run]`);
      process.exit(0);
    }
  }
  return out;
}

// ─── LLM wrapper (Anthropic preferred, Gemini fallback) ─────
async function callLLM({ system, user, effort = 'high', maxTokens = 8000, cachePoints = [], model = 'claude-opus-4-7' }) {
  if (process.env.ANTHROPIC_API_KEY) return callAnthropic({ system, user, effort, maxTokens, cachePoints, model });
  if (process.env.GEMINI_API_KEY) return callGemini({ system, user, maxTokens });
  throw new Error('Neither ANTHROPIC_API_KEY nor GEMINI_API_KEY set.');
}

async function callAnthropic({ system, user, effort, maxTokens, cachePoints, model }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();

  // Build system as an array of cacheable text blocks. cachePoints is an array of indices
  // after which a cache_control breakpoint is placed (max 4 total in the request).
  const systemBlocks = system.map((text, i) => {
    const block = { type: 'text', text };
    if (cachePoints.includes(i)) block.cache_control = { type: 'ephemeral' };
    return block;
  });

  // Sonnet 4.6 supports adaptive thinking + effort; Haiku 4.5 errors on effort/max.
  const isSonnetOrOpus = /^(claude-opus|claude-sonnet)-/.test(model);
  const requestParams = {
    model,
    max_tokens: maxTokens,
    system: systemBlocks,
    messages: [{ role: 'user', content: user }],
  };
  if (isSonnetOrOpus) {
    requestParams.thinking = { type: 'adaptive' };
    requestParams.output_config = { effort };
  }
  const stream = client.messages.stream(requestParams);

  const message = await stream.finalMessage();
  const text = message.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');
  const usage = message.usage;
  return {
    text,
    provider: 'anthropic',
    model: message.model,
    usage: {
      input: usage.input_tokens,
      output: usage.output_tokens,
      cache_read: usage.cache_read_input_tokens ?? 0,
      cache_write: usage.cache_creation_input_tokens ?? 0,
    },
  };
}

async function callGemini({ system, user, maxTokens }) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const sys = Array.isArray(system) ? system.join('\n\n') : system;
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [{ role: 'user', parts: [{ text: `${sys}\n\n${user}` }] }],
    config: { temperature: 0.7, maxOutputTokens: maxTokens },
  });
  return {
    text: response.text || '',
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    usage: { input: null, output: null, cache_read: 0, cache_write: 0 },
  };
}

// ─── Snapshot collection ─────────────────────────────────────
function safeExec(cmd) {
  try { return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}

async function buildSnapshot() {
  const kpis = JSON.parse(await fs.readFile(path.join(STATE_DIR, 'kpis.json'), 'utf8'));
  const goals = JSON.parse(await fs.readFile(path.join(STATE_DIR, 'goals.json'), 'utf8'));

  // Code stats
  const totalFiles = parseInt(safeExec(`find src api scripts -type f \\( -name "*.js" -o -name "*.mjs" -o -name "*.astro" -o -name "*.ts" \\) | wc -l`) || '0', 10);
  const astroPages = parseInt(safeExec(`find src/pages -name "*.astro" | wc -l`) || '0', 10);
  const whalePages = parseInt(safeExec(`find src/pages/whale -name "*.astro" 2>/dev/null | wc -l`) || '0', 10);
  const dailyPages = parseInt(safeExec(`find src/pages/daily -name "*.astro" 2>/dev/null | wc -l`) || '0', 10);
  const blogPages = parseInt(safeExec(`find src/pages/blog -name "*.astro" 2>/dev/null | wc -l`) || '0', 10);

  // Git
  const branch = safeExec('git rev-parse --abbrev-ref HEAD');
  const last20Commits = safeExec('git log -20 --pretty=format:"%h %ad %s" --date=short');
  const commitCount30d = parseInt(safeExec('git log --since=30.days --oneline | wc -l') || '0', 10);
  const lastCommitDate = safeExec('git log -1 --pretty=format:"%ad" --date=short');

  // Build size if dist exists
  const distSize = safeExec(`du -sk dist 2>/dev/null | cut -f1`) || null;

  // Open PRs / recent issues (best-effort via gh)
  const ghIssues = safeExec('gh issue list --state open --limit 20 --json number,title,labels 2>/dev/null') || '[]';
  const ghPrs = safeExec('gh pr list --state open --limit 10 --json number,title,isDraft 2>/dev/null') || '[]';

  // wallet_authenticated_users — Supabase user_settings row count (anon key, RLS 허용 시)
  let walletAuthUsers = kpis.engagement?.wallet_authenticated_users ?? null;
  try {
    const sbUrl = process.env.PUBLIC_SUPABASE_URL;
    const sbKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
    if (sbUrl && sbKey && !sbUrl.includes('dummy')) {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(sbUrl, sbKey);
      const { count, error } = await sb.from('user_settings').select('*', { count: 'exact', head: true });
      if (!error && count !== null) walletAuthUsers = count;
    }
  } catch {}

  // Past synthesis plan (if any) — pick the most recent across all dates
  let latestPlan = null;
  const planPath = await latestHistoryFile('-plan.md');
  if (planPath) latestPlan = await fs.readFile(planPath, 'utf8');

  const snapshot = {
    timestamp: new Date().toISOString(),
    branch,
    code: {
      totalSourceFiles: totalFiles,
      astroPages,
      whalePages,
      dailyBriefingPages: dailyPages,
      blogPages,
      distSizeKb: distSize ? parseInt(distSize, 10) : null,
    },
    git: {
      commitCount30d,
      lastCommitDate,
      recentCommits: last20Commits.split('\n'),
    },
    github: {
      openIssues: JSON.parse(ghIssues),
      openPRs: JSON.parse(ghPrs),
    },
    kpis: {
      ...kpis,
      content: { ...kpis.content, whale_alert_pages: whalePages },
      engagement: { ...kpis.engagement, wallet_authenticated_users: walletAuthUsers },
      _lastUpdated: new Date().toISOString().slice(0, 10),
    },
    goals,
    latestPlanExists: Boolean(latestPlan),
  };

  return { snapshot, latestPlan };
}

function snapshotToMarkdown(snapshot) {
  const lines = [];
  lines.push(`# EconPedia Production Snapshot — ${snapshot.timestamp}`);
  lines.push(`\nBranch: ${snapshot.branch}`);
  lines.push(`\n## Codebase`);
  lines.push(`- Source files: ${snapshot.code.totalSourceFiles}`);
  lines.push(`- Astro pages (total): ${snapshot.code.astroPages}`);
  lines.push(`  - whale: ${snapshot.code.whalePages}, daily: ${snapshot.code.dailyBriefingPages}, blog: ${snapshot.code.blogPages}`);
  lines.push(`- Last build dist size: ${snapshot.code.distSizeKb ? snapshot.code.distSizeKb + ' KB' : 'not built'}`);

  lines.push(`\n## Git`);
  lines.push(`- Commits in last 30d: ${snapshot.git.commitCount30d}`);
  lines.push(`- Last commit: ${snapshot.git.lastCommitDate}`);
  lines.push(`- Recent 20 commits:`);
  for (const c of snapshot.git.recentCommits) lines.push(`  - ${c}`);

  lines.push(`\n## GitHub`);
  lines.push(`- Open issues: ${snapshot.github.openIssues.length}`);
  for (const i of snapshot.github.openIssues.slice(0, 10)) lines.push(`  - #${i.number}: ${i.title}`);
  lines.push(`- Open PRs: ${snapshot.github.openPRs.length}`);
  for (const p of snapshot.github.openPRs.slice(0, 5)) lines.push(`  - #${p.number}: ${p.title}${p.isDraft ? ' (draft)' : ''}`);

  lines.push(`\n## KPIs (current)`);
  lines.push('```json');
  lines.push(JSON.stringify(snapshot.kpis, null, 2));
  lines.push('```');

  lines.push(`\n## Goals / OKRs`);
  lines.push('```json');
  lines.push(JSON.stringify(snapshot.goals, null, 2));
  lines.push('```');

  return lines.join('\n');
}

// ─── Phases ─────────────────────────────────────────────────
async function runSnapshot({ writeFile = true } = {}) {
  console.error('[snapshot] gathering production state…');
  const { snapshot, latestPlan } = await buildSnapshot();
  const md = snapshotToMarkdown(snapshot);
  if (writeFile) {
    const ts = stamp();
    await fs.writeFile(path.join(HISTORY_DIR, `${ts}-snapshot.md`), md, 'utf8');
    console.error(`[snapshot] wrote history/${ts}-snapshot.md`);
    // kpis.json을 최신 실측값으로 갱신 (whale_alert_pages, wallet_authenticated_users 등 누적)
    await fs.writeFile(path.join(STATE_DIR, 'kpis.json'), JSON.stringify(snapshot.kpis, null, 2) + '\n', 'utf8');
    console.error('[snapshot] updated kpis.json with live values');
  }
  return { snapshot, snapshotMd: md, latestPlan };
}

async function runCritique({ persona, snapshotMd, latestPlan }) {
  if (!PERSONAS.includes(persona)) throw new Error(`Unknown persona: ${persona}`);
  console.error(`[critique:${persona}] running…`);

  const personaPrompt = await fs.readFile(path.join(PERSONAS_DIR, `${persona}.md`), 'utf8');
  const critiquePrompt = await fs.readFile(path.join(PROMPTS_DIR, 'critique.md'), 'utf8');

  // system: persona (cached) then critique-phase template (cached after snapshot)
  // user: snapshot + (optional) prior-plan retrospective
  const system = [personaPrompt, critiquePrompt];
  const user = [
    `[Production Snapshot]\n${snapshotMd}`,
    latestPlan ? `\n[Previous Cycle's Plan — evaluate fairly which promises were kept]\n${latestPlan}` : '',
    `\n[당신의 임무]\n위 [Persona] 섹션에 정의된 인물의 시선과 출력 형식으로 EconPedia를 평가하라.`,
  ].join('\n');

  const result = await callLLM({
    system,
    user,
    effort: 'high',
    maxTokens: 6000,
    cachePoints: [0, 1], // cache persona + critique template
  });

  const ts = stamp();
  const file = path.join(HISTORY_DIR, `${ts}-${persona}.md`);
  await fs.writeFile(file, `# ${persona} critique — ${ts}\n\n_provider: ${result.provider} (${result.model}) · cache_read: ${result.usage.cache_read} tokens_\n\n---\n\n${result.text}\n`, 'utf8');
  console.error(`[critique:${persona}] wrote ${path.basename(file)} (in=${result.usage.input}, out=${result.usage.output}, cache_read=${result.usage.cache_read})`);
  return result.text;
}

async function runSynthesize({ snapshotMd, critiques, latestPlan }) {
  console.error('[synthesize] folding 3 critiques into McKinsey plan…');
  const mckinseyPersona = await fs.readFile(path.join(PERSONAS_DIR, 'mckinsey.md'), 'utf8');
  const synthPrompt = await fs.readFile(path.join(PROMPTS_DIR, 'synthesize.md'), 'utf8');

  const system = [mckinseyPersona, synthPrompt];
  const critiquesBlock = Object.entries(critiques)
    .map(([k, v]) => `\n### ${k} critique\n${v}`)
    .join('\n');
  const user = [
    `[Production Snapshot]\n${snapshotMd}`,
    `\n[Critiques]\n${critiquesBlock}`,
    latestPlan ? `\n[Previous Cycle Plan]\n${latestPlan}` : '\n[Previous Cycle Plan]\n(none — this is cycle #1)',
    `\n위 합성 지침을 따라 매킨지급 합성 플랜을 작성하라.`,
  ].join('\n');

  const result = await callLLM({
    system,
    user,
    effort: 'xhigh',
    maxTokens: 10000,
    cachePoints: [0, 1],
  });

  const ts = stamp();
  const file = path.join(HISTORY_DIR, `${ts}-plan.md`);
  await fs.writeFile(file, `# Synthesis plan — ${ts}\n\n_provider: ${result.provider} (${result.model}) · cache_read: ${result.usage.cache_read} tokens_\n\n---\n\n${result.text}\n`, 'utf8');
  console.error(`[synthesize] wrote ${path.basename(file)} (in=${result.usage.input}, out=${result.usage.output}, cache_read=${result.usage.cache_read})`);
  return result.text;
}

// ─── Daily phase — chief of staff routine ─────────────────────
async function runDaily({ snapshotMd, latestPlan }) {
  console.error('[daily] picking today\'s 1-action…');
  const personaPrompt = await fs.readFile(path.join(PERSONAS_DIR, 'daily-partner.md'), 'utf8');
  const dailyPrompt = await fs.readFile(path.join(PROMPTS_DIR, 'daily.md'), 'utf8');

  // Pull yesterday's snapshot for delta comparison
  let yesterdaySnapshot = null;
  try {
    const all = (await fs.readdir(HISTORY_DIR)).filter(f => f.endsWith('-snapshot.md')).sort();
    // Pick the snapshot from at least 12h ago — ignore today's earlier snapshots
    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
    for (const f of all.reverse()) {
      const m = f.match(/^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})-snapshot\.md$/);
      if (!m) continue;
      const [date, hm] = m[1].split('_');
      const t = new Date(`${date}T${hm.replace('-', ':')}:00Z`).getTime();
      if (t < cutoff) {
        yesterdaySnapshot = await fs.readFile(path.join(HISTORY_DIR, f), 'utf8');
        break;
      }
    }
  } catch {}

  // Last 24h git log + recently closed PRs/issues
  const last24hCommits = safeExec('git log --since=24.hours --pretty=format:"%h %ad %s" --date=short') || '(none in last 24h)';
  const recentlyClosedPRs = safeExec('gh pr list --state closed --limit 5 --search "closed:>=' + new Date(Date.now() - 24 * 3600 * 1000).toISOString().split('T')[0] + '" --json number,title 2>/dev/null') || '[]';

  const system = [personaPrompt, dailyPrompt];
  const user = [
    `[오늘 스냅샷]\n${snapshotMd}`,
    yesterdaySnapshot ? `\n[어제(또는 직전) 스냅샷 — delta 계산용]\n${yesterdaySnapshot}` : `\n[어제 스냅샷 없음 — 첫 daily 실행이거나 12h 내 직전 스냅샷 부재]`,
    `\n[최근 24h 커밋]\n${last24hCommits}`,
    `\n[최근 24h 닫힌 PR]\n${recentlyClosedPRs}`,
    latestPlan ? `\n[가장 최근 합성 플랜 — 이번 sprint의 약속]\n${latestPlan}` : '\n[합성 플랜 없음 — 먼저 `/improvement-cycle` 1회 실행 권장]',
    `\n위 자료만 사용해 페르소나 출력 형식대로 오늘의 1-action을 출력하라.`,
  ].join('\n');

  const result = await callLLM({
    system,
    user,
    effort: 'medium',
    maxTokens: 2500,
    cachePoints: [0, 1],
    model: 'claude-sonnet-4-6', // cheaper for daily cadence
  });

  const ts = stamp();
  const file = path.join(HISTORY_DIR, `${ts}-daily.md`);
  await fs.writeFile(file, `# Daily — ${ts}\n\n_provider: ${result.provider} (${result.model}) · cache_read: ${result.usage.cache_read} tokens_\n\n---\n\n${result.text}\n`, 'utf8');
  console.error(`[daily] wrote ${path.basename(file)} (in=${result.usage.input}, out=${result.usage.output}, cache_read=${result.usage.cache_read})`);
  // Echo to stdout so a Claude Code slash command can render it immediately
  console.log(result.text);
  return result.text;
}

async function runActionize({ plan }) {
  console.error('[actionize] decomposing plan into GitHub issues…');
  const actPrompt = await fs.readFile(path.join(PROMPTS_DIR, 'actionize.md'), 'utf8');
  const result = await callLLM({
    system: [actPrompt],
    user: `[Synthesis Plan]\n${plan}\n\n위 지침을 따라 sprint를 GitHub issues로 분해한 JSON 배열만 출력하라. 다른 텍스트 금지.`,
    effort: 'high',
    maxTokens: 6000,
    cachePoints: [0],
  });
  // Extract JSON block
  const m = result.text.match(/```json\s*([\s\S]+?)\s*```/) || result.text.match(/(\[[\s\S]+\])/);
  const json = m ? m[1] : result.text;
  let parsed;
  try { parsed = JSON.parse(json); }
  catch (e) {
    console.error('[actionize] WARNING: model output did not parse as JSON. Raw text follows.');
    process.stdout.write(result.text);
    return null;
  }
  process.stdout.write(JSON.stringify(parsed, null, 2));
  console.error(`[actionize] emitted ${parsed.length} issues (in=${result.usage.input}, out=${result.usage.output})`);
  return parsed;
}

// ─── main ───────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);

  if (args.phase === 'snapshot') {
    await runSnapshot();
    return;
  }

  const { snapshotMd, latestPlan } = await runSnapshot();

  if (args.phase === 'daily') {
    await runDaily({ snapshotMd, latestPlan });
    return;
  }

  if (args.phase === 'critique') {
    if (!args.persona) throw new Error('--persona required for --phase critique');
    await runCritique({ persona: args.persona, snapshotMd, latestPlan });
    return;
  }

  if (args.phase === 'synthesize') {
    const critiques = {};
    for (const p of PERSONAS) {
      const f = await latestHistoryFile(`-${p}.md`);
      if (!f) { console.error(`[synthesize] no ${p} critique in history — run --phase critique --persona ${p} first`); process.exit(1); }
      critiques[p] = await fs.readFile(f, 'utf8');
    }
    await runSynthesize({ snapshotMd, critiques, latestPlan });
    return;
  }

  if (args.phase === 'actionize') {
    const planPath = await latestHistoryFile('-plan.md');
    if (!planPath) { console.error('[actionize] no plan in history — run --phase synthesize first'); process.exit(1); }
    const plan = await fs.readFile(planPath, 'utf8');
    await runActionize({ plan });
    return;
  }

  // phase === 'all' (default): snapshot → 3 critiques (parallel) → synthesize
  const critiques = {};
  await Promise.all(PERSONAS.map(async p => {
    critiques[p] = await runCritique({ persona: p, snapshotMd, latestPlan });
  }));
  await runSynthesize({ snapshotMd, critiques, latestPlan });
  console.error('\n[loop] cycle complete. See ops/improvement-loop/state/history/ for outputs.');
}

main().catch(err => {
  console.error('[loop] FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
