# EconPedia Self-Improvement Loop

> 완벽하지 않지만 매주 발전해나가는 팀을 만드는 루틴.

## 개요

매주 한 사이클:

1. **Snapshot** — 프로덕션 상태(KPI · 코드 메트릭 · git log · 열린 PR·이슈)를 캡처
2. **Critique × 3** — 머스크 · 매킨지 파트너 · 찰리 멍거 페르소나가 같은 스냅샷을 각자 lens로 냉철하게 평가
3. **Synthesize** — 매킨지급 합성 플랜 (Lever × Impact × Effort matrix, 2주 sprint, KPI 델타 목표, Cut list)
4. **Actionize** *(옵션)* — 플랜을 GitHub Issues로 분해
5. **Measure** — 다음 사이클 시작 시 직전 sprint의 약속이 얼마나 지켜졌는지 평가

## 디렉토리

```
ops/improvement-loop/
├── personas/             # 페르소나 system prompts
│   ├── musk.md
│   ├── mckinsey.md
│   └── munger.md
├── prompts/              # 단계별 user-message 템플릿
│   ├── critique.md
│   ├── synthesize.md
│   └── actionize.md
├── state/
│   ├── goals.json        # OKR — 매 사이클이 이 목표 대비 평가됨
│   ├── kpis.json         # 현재 KPI 값 (사람이 주기적으로 채움)
│   └── history/          # 사이클별 산출물 — YYYY-MM-DD-{snapshot,persona,plan}.md
└── README.md             # 이 파일
```

## Phase 종류

| Phase | 빈도 권장 | 비용 | 시간 | 용도 |
|---|---|---|---|---|
| `snapshot` | 시간/일 단위 | $0 | 1초 | 프로덕션 상태 캡처만. LLM 호출 없음. |
| `daily` | **매일** | ~$0.05 (Sonnet 4.6) | 30-60초 | Chief of staff가 어제→오늘 delta + 오늘의 1-action |
| `critique` × 3 | 주 1회 | ~$0.5-1.5 | 1-2분 × 3 | 머스크·매킨지·멍거 페르소나 평가 |
| `synthesize` | 주 1회 | ~$0.8-1.5 | 1-2분 | 매킨지급 합성 플랜 + 2주 sprint |
| `actionize` | 주 1회 | ~$0.3 | 30초 | 플랜 → GitHub Issues JSON |
| `all` (default) | 주 1회 | ~$1.5-3.0 | 4-7분 | snapshot + critique × 3 (병렬) + synthesize |

## 실행 방법

### 0. 사전 준비

```bash
# 둘 중 하나는 필수
export ANTHROPIC_API_KEY=sk-ant-...   # 권장 (claude-opus-4-7 + adaptive thinking + prompt caching)
export GEMINI_API_KEY=...             # 폴백 (기존 .env에 있으면 자동 사용)
```

`ops/improvement-loop/state/kpis.json`의 `null` 필드를 사람이 가능한 만큼 채워 두면 평가 정확도가 올라갑니다.

### 1. 로컬 한 사이클

```bash
npm run loop
```

내부적으로 `node scripts/improvement-loop.mjs`. 약 4-7분 소요 (Claude Opus 4.7, snapshot + 3 critique 병렬 + synthesize).

### 2. 단계별 실행

```bash
npm run loop:snapshot                          # 무료 — LLM 호출 없음
npm run loop:critique -- --persona musk        # 1개 페르소나만
npm run loop:critique -- --persona mckinsey
npm run loop:critique -- --persona munger
npm run loop:synthesize                        # 오늘자 3개 critique을 매킨지 플랜으로 합성
npm run loop:actionize                         # 플랜을 GitHub 이슈 JSON으로 stdout 출력
```

### 3. GitHub Actions 주간 실행

매주 월요일 22:00 UTC = 화요일 07:00 KST 자동 실행 (`.github/workflows/improvement-loop.yml`).
필요한 Secrets:
- `ANTHROPIC_API_KEY` (또는 `GEMINI_API_KEY`)
- `SLACK_WEBHOOK` *(옵션)* — 합성 플랜 헤더를 Slack에 알림

수동 트리거: Actions → "🔁 Self-Improvement Loop" → Run workflow → `open_issues=true`로 설정하면 actionize 단계까지 실행하고 이슈를 자동 발행합니다.

## 비용 (Claude Opus 4.7 기준)

- **Snapshot**: $0 (LLM 호출 없음)
- **Critique × 3**: 약 $0.5-1.5 (페르소나 + 스냅샷 prompt caching으로 2회차부터 cache_read 90% 할인)
- **Synthesize**: 약 $0.8-1.5 (effort=xhigh, 더 깊은 사고)
- **합계 1 사이클**: 약 $1.5-3.0

`GEMINI_API_KEY` 폴백 사용 시 사실상 무료(spending cap 내).

## 페르소나 설계 의도

| 페르소나 | Lens | 잘 잡는 결함 |
|---|---|---|
| **머스크** | First principles, "지울 것을 먼저" | 불필요한 복잡도, 본질이 아닌 일에 시간 쓰는 것, 가짜 지표 |
| **매킨지** | Pyramid principle, Lever × Impact × Effort | 우선순위 부재, 정량화 부재, 분산 |
| **멍거** | Inversion, "show me the incentive" | 인센티브 비뚤어짐, 인지편향, 장기 catastrophic risk |

3명이 *공통으로* 짚는 결함은 진짜 결함. 1명만 짚으면 그 lens가 정말 맞는지 다시 본다 (synthesize에서 판단).

## Prompt Caching 전략

`scripts/improvement-loop.mjs`는 다음 두 곳에 `cache_control: { type: 'ephemeral' }` breakpoint를 둠:

1. **Persona prompt** (가장 stable) — 같은 페르소나의 critique 호출 사이에서 재사용
2. **Critique/synthesize 템플릿** (사이클 내 stable) — 사이클 한 번 안에서 재사용

스냅샷은 매 사이클마다 다르므로 캐싱하지 않고 user message에 배치 — 캐시 prefix를 깨뜨리지 않기 위함.

캐시 히트율 확인: 각 critique 산출물 헤더에 `cache_read: NNN tokens`가 기록됨. 0이면 silent invalidator 의심.

## Claude Code 루틴(`/loop` 스킬)으로 자동화

Claude Code의 built-in `/loop`은 슬래시 커맨드를 일정 주기로 반복 호출합니다. 이 저장소는 4개 커맨드를 제공:

| 커맨드 | 목적 | 소요·비용 |
|---|---|---|
| `/snapshot` | 프로덕션 상태만 캡처 (KPI·git·이슈) | ~30초, $0 |
| `/improvement-cycle` | snapshot + critique × 3 + synthesize | ~5분, ~$1.5-3 |
| `/daily` | 상태 점검 → P0/P1 픽스 1개 → draft PR + auto-merge | 5-15분, ~$0.1-0.3 |
| `/weekly` | improvement-cycle + 보안 회고 + 기술 도입 후보 Slack 알림 | 30-60분, ~$2-5 |

권장 조합:

```text
/loop 1h /snapshot                # 활성 sprint 동안 KPI 변화 모니터링
/loop 24h /daily                  # 매일 P0/P1 1건 자동 픽스 (draft PR + auto-merge)
/loop 7d /weekly                  # 매주 sprint 회고 + 기술 레이더 (GitHub Actions와 중복 가능)
```

`/daily`·`/weekly`의 세부 규약은 각각 `.claude/commands/daily.md`, `.claude/commands/weekly.md` 참조.

⚠️ `/loop`은 Claude Code 세션이 열려있는 동안만 동작합니다. 세션이 꺼져도 자동으로 계속 돌게 하려면 `.github/workflows/improvement-loop.yml`(GitHub Actions cron)에 의존하세요. 둘은 보완 관계입니다.

## 사이클 종료 후 사람이 할 일

1. `state/history/YYYY-MM-DD-plan.md`의 **"## Decision: This Cycle's Focus"** 가 합당한가 검토.
2. **"## Two-week Sprint Plan"**의 daily deliverable이 실제로 1-3일 작업으로 분해되었는가 확인.
3. **"## Success criteria"**의 KPI 목표를 `state/kpis.json`의 target 필드에 반영.
4. *(옵션)* `npm run loop:actionize | jq` 로 이슈 JSON 미리 보고, OK면 GitHub Actions에서 `open_issues=true` 트리거.

## 다음 사이클 시작 시 — Retrospective

`scripts/improvement-loop.mjs`는 자동으로 `history/` 폴더의 가장 최근 `*-plan.md`를 다음 사이클의 critique·synthesize 단계에 컨텍스트로 넣습니다. 페르소나들이 "지난 sprint가 지켜졌는지" 를 비판해야 합니다 — 매킨지 페르소나는 특히 약속 vs 결과를 정직하게 평가하도록 프롬프트가 설계됨.

## 한계

- KPI 자동 수집은 git/파일시스템 메트릭만 가능. Search Console, GA, Resend, Telegram CTR 등은 수동 입력 필요.
- 페르소나 출력 품질은 모델 의존성. Gemini 폴백 사용 시 prompt caching이 비활성화되며 톤이 다소 부드러워짐.
- 합성 플랜이 매번 "이거 하나만 하자"고 결정했음에도 사람이 분산하면 루프는 의미 없음. **결정한 lever만 한다**는 약속을 사람이 지켜야 함.

## 라이선스 & 책임

이 루프의 산출물은 AI 평가입니다. 합성 플랜의 권고를 그대로 따르기 전, 본인의 판단으로 한 번 더 검증하세요. 페르소나는 의도적으로 외교적 표현을 제거했기 때문에 *문체에 휘둘리지 말고 논리만* 평가하세요.
