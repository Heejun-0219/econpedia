---
description: 주 3회 EconPedia sprint 사이클 — 분석·기획·개발·보완·테스트·배포 6단계 게이트로 growth bet 1개 + defensive 1개를 완결. /goal과 함께 사용 시 6단계 transcript 증거가 모두 surface 될 때까지 자가 지속.
---

주 3회 (월·수·금 권장) EconPedia를 *방향성 있게* 발전시키는 routine. Sprint cadence.

> **핵심 원칙**: 매 weekly 사이클은 반드시 **growth bet 1개 + defensive 1개**를 모두 가진다. fix만 나오면 weekly는 실패다.
> 북극성: `wallet_authenticated_users` (현재 0, 90일 target 200). 사이클마다 이 숫자를 1mm라도 움직이는 실험이 1개는 있어야 함.

> **자동화 핵심**: `/goal` (Claude Code v2.1.139+) 과 결합. 평가자는 transcript에 6단계 게이트의 각 증거를 모두 봐야 통과. 권장 호출:
>
> ```text
> /goal "이번 /weekly 사이클을 완결한다 — Growth bet과 Defensive 양쪽에 대해 transcript에 [분석][기획][개발][보완][테스트][배포] 6단계 증거가 각각 1줄 이상 surface 되고, growth bet PR과 defensive deliverable PR(또는 결과 보고)이 모두 머지되며, 다음 /weekly 권장 시점이 명시됨."
> ```
>
> 호출 빈도: **`/loop 56h /weekly`** (주 3회 — 약 2.33일 간격, 월·수·금).
>
> **최소 소요 시간**: 사이클 1개에 **최소 60분 이상**. 분석·기획·개발·보완·테스트·배포 × 2개 deliverable (growth + defensive) 를 정성적으로 하는 데 60분 미만이라면 거의 항상 단계 스킵의 결과. 10-15분 만에 끝났다면 사용자에게 보고하고 멈춰서 다시 시작.

## 필수 6단계 게이트 (스킵 금지) — growth bet + defensive 각각 적용

각 deliverable(growth bet 1개, defensive 1개) 마다 다음 6단계가 transcript에 증거로 남아야 사이클 완결로 인정.

| 단계 | 의미 | Transcript 증거 예시 |
|---|---|---|
| **[분석]** | 지표·후보 식별·우선순위 | 스냅샷 1줄 + 후보 5개 표 + 채택 근거 |
| **[기획]** | 가설·측정·위험·롤백 | 가설 1문장, KPI + 임계값, 위험·롤백 1줄 |
| **[개발]** | 코드 변경 | git diff 요약 + 변경 LOC |
| **[보완]** | 셀프 리뷰 체크리스트 (`/daily` 와 동일 7항목) | 항목별 ✓/N-A 보고 |
| **[테스트]** | 로컬 실제 검증 | `npm run dev` + curl/브라우저 + 핵심 시나리오 출력. `npm run build` 만으로 불충분. |
| **[배포]** | PR + CI + 머지 + 머지 후 sanity | PR URL + CI 결과 + merge sha + main에서 빌드 OK |

## 우선순위 (재확인)

1. **고객 가치 (growth)** — 북극성을 움직이는 실험 1개를 *이번 주에 실제로 머지*한다. 조사·검토만 하고 끝내지 않는다.
2. **발전하는 프로덕션** — Self-improvement loop synthesis가 결정한 sprint deliverable 중 *defensive 1개*를 끝낸다 (P0/P1 픽스, 빌드 안정성 등).
3. **보안** — 지난 주 변경에서 OWASP 패턴 점검. 신규 결함은 CLAUDE.md에 기록.
4. **기술 도입 후보** — Whale Alert·분석·UX 강화를 위한 신기술 후보 1-2개 조사 → 결정은 사용자에게 위임. Slack 알림.

## 절차

### 1단계. Self-Improvement Cycle 실행 + Sprint Focus 확인 (~10-15분)

```bash
npm run loop
```

소요 ~4-7분, 비용 ~$1.5-3 (Claude Opus 4.7). 산출물:
- `ops/improvement-loop/state/history/YYYY-MM-DD-{musk,mckinsey,munger}.md`
- `ops/improvement-loop/state/history/YYYY-MM-DD-plan.md`

**동일 날짜의 plan.md 이미 존재** → loop을 다시 돌리지 말고 그것 사용 (비용 절감). 단, 24시간 이상 지난 plan은 새로 돌릴 것.

플랜의 다음 섹션을 사용자에게 *그대로 인용*하여 보여준다 (요약·각색 금지):
- "## Decision: This Cycle's Focus"
- "## Two-week Sprint Plan"의 1주차 deliverable
- "## Success criteria"의 KPI 목표

**검증**: Week 1 deliverable에 *growth 항목*이 1개 이상 포함됐는지 확인. 전부 fix뿐이면 1.5단계가 강제 추가됨을 사용자에게 알린다.

사용자에게 1가지 질문: **"이 Focus에 동의하나요? (y/n + 수정 요청)"**

동의하지 않으면 여기서 멈추고 사용자 입력 대기.

### 1.5단계. Growth Bet 6단계 게이트 통과 (필수, ~25-35분)

**[분석]** — 1단계 plan의 growth deliverable, 또는 plan에 없으면 새로 후보 3-5개 제시:

| 영역 | 가설 예시 |
|---|---|
| Whale → wallet conversion | "whale 페이지 하단 CTA가 wallet auth signup을 N% 만든다" |
| Whale → Telegram retention | "UTM 부착으로 CTR 측정 가능 → 카피 iteration 기반 마련" |
| SEO long-tail | "sector aggregation 페이지가 검색 트래픽 N건/주 만든다" |
| 데이터 가치 | "6개월 follow-up 자동 업데이트로 재방문 N% ↑" |
| 외부 distribution | "공개 read-only API 또는 RSS feed가 백링크 N개 만든다" |

각 후보에는 (i) 1주 안 가능 여부, (ii) 검증 가능한 KPI 1개, (iii) 변경 범위 추정.

사용자가 1개 선택 (제시 후 답이 없으면 가장 측정 명확하고 LOC 작은 옵션을 디폴트로 채택, 이유를 transcript에 보고).

**[기획]** — PR 본문에 들어갈 가설·측정·위험·롤백을 transcript에 1번 출력.

**[개발]** — 작업 브랜치 `claude/growth/<YYYY-MM-DD>-<slug>` 생성 → 구현. 최대 3 파일, 100 LOC.

**[보완]** — 셀프 리뷰 7항목 체크리스트(접근성·모바일·에러상태·엣지케이스·i18n·보안·로그) 항목별 ✓/N-A 보고.

**[테스트]** — `npm run dev` 띄우고 변경 페이지/엔드포인트에 실제 접근. UI 변경이면 curl 또는 dev server 로그로 새 요소 노출 확인. 데이터/API 변경이면 변경 핸들러에 curl. **`npm run build` 만으로는 통과 인정 안 함.**

**[배포]** — draft PR 생성 → `update_pull_request(draft: false)` → `enable_pr_auto_merge(SQUASH)` → CI 통과 후 자동 머지(또는 이미 clean이면 `merge_pull_request` 직접). 머지 후 main fetch + `npm run build` 1회 → 빌드 OK 1줄 보고.

**금지**:
- "후보만 제시하고 다음 주로 미루기" — growth는 *조사*가 아니라 *실행*이다.
- 6단계 중 하나라도 transcript 증거 없이 스킵.
- 10분 이내 growth bet 완료 보고 — 거의 항상 [테스트]/[보완] 스킵.

### 2단계. Defensive 1개 6단계 게이트 통과 (~15-20분)

기본 후보: 1단계 plan의 defensive deliverable. 없으면 다음 중:

**(a) 보안 회고**
- 지난 사이클 변경된 파일 중 `api/server.js`, `src/pages/api/*`, `src/components/*.astro`, `scripts/scan-*.js`, `scripts/generate-whale-*.js` 가 포함되어 있으면 `/security-review` 또는 동등한 OWASP top10 셀프 리뷰 수행.
- 발견된 신규 결함 → 1 파일 픽스 (daily 규칙 적용).

**(b) `/simplify` 적용 후보 1개**
- 지난 사이클 머지된 PR 중 중복 코드·과도한 추상화·죽은 코드가 들어간 곳 1개.
- 정리 PR (≤ 3 파일, ≤ 100 LOC).

**(c) CLAUDE.md P0/P1 잔여 항목 1개** — daily에서 못 잡은 P0/P1 1건.

선택한 항목에 대해 **6단계 게이트 동일 적용** (분석·기획·개발·보완·테스트·배포). PR 본문에도 6단계 결과 명시.

**완료 인정 조건**: 머지된 PR URL 또는 "결함 0건 확인 + 리뷰 결과 transcript 보고" 둘 중 하나.

### 3단계. 기술 도입 후보 조사 (1-2개, ~5-10분)

다음 영역 중 *현재 sprint의 Focus와 직접 연결되는* 1-2개에 한해 조사:

| 영역 | 트리거 |
|---|---|
| **공시 데이터 정확도** | Whale Alert false positive 의심, 새 데이터 소스 누락 의심 |
| **LLM 비용·품질** | 모델 가격·신규 기능 변동, 환각 케이스 증가 |
| **데이터 시각화** | Whale Alert engagement 하락, 표·텍스트 한계 |
| **사용자 engagement** | poll·comment·newsletter 정체 |
| **운영 안정성** | container 재시작·OOM·build 실패 증가 |

각 후보: 무엇 (이름·링크), 왜 지금, 도입 비용, 위험.

**산출물**: `ops/improvement-loop/state/history/YYYY-MM-DD-tech-radar.md`. **커밋 필수** (untracked 상태로 두지 말 것).

### 4단계. Slack 알림 (~2분)

3단계 산출물을 요약하여 Slack으로. 환경변수 `SLACK_WEBHOOK_URL` 없으면 "미설정 — 알림 생략" 1줄 보고하고 통과.

`NOTIFY_TEXT` 권장 포맷:
```
🛠️ EconPedia 주간 기술 도입 후보 (YYYY-MM-DD)

후보 1: <이름>
- 왜: <한 줄>
- 비용/위험: <한 줄>
- 결정 필요 시점: <YYYY-MM-DD 또는 N/A>
```

**금지**: 후보 0개면 발송 금지. 후보 ≥3개면 가장 중요한 2개만. 단정 금지.

### 5단계. Daily backlog 동기화 (~5분)

오늘의 plan.md "Two-week Sprint Plan"에서 다음 7일 내 deliverable이 있으면 CLAUDE.md의 P0/P1 섹션 또는 GitHub Issues에 반영. 1 파일 변경 PR (daily 규칙).

### 6단계. 보고 (~3분)

사용자에게 다음을 명시적으로 보고하고 종료:
- 사이클 소요 시간 (분 단위) — **최소 60분 권장**, 미달이면 스킵 의심 표시
- This cycle's Focus (1줄)
- **Growth bet 6단계 통과 표시** ([분석] ✓ [기획] ✓ [개발] ✓ [보완] ✓ [테스트] ✓ [배포] ✓) + PR URL + 머지 sha
- **Defensive 6단계 통과 표시** + PR URL or 결과 보고
- Sprint 1주차 deliverable 진행 현황
- 기술 도입 후보 Slack 알림 결과
- 다음 `/weekly` 권장 시점 (56h 후)

## 자동화 권장

```text
# 옵션 A — 56시간마다 사이클 (주 3회). 세션 살아 있을 때.
/loop 56h /weekly

# 옵션 B — /goal과 결합. 6단계 × 2 deliverable transcript 증거까지 자가 지속.
/goal "이번 /weekly 사이클을 완결한다 — Growth bet과 Defensive 양쪽에 대해 transcript에 [분석][기획][개발][보완][테스트][배포] 6단계 증거가 각각 1줄 이상 surface 되고, growth bet PR과 defensive deliverable PR(또는 결과 보고)이 모두 머지되며, 다음 /weekly 권장 시점이 명시됨."

# 옵션 C — 두 가지 결합 (권장)
/loop 56h /weekly
```

병행: `.github/workflows/improvement-loop.yml` 도 매주 월요일 22:00 UTC에 `npm run loop`을 실행한다. 동일 날짜의 plan.md가 이미 있으면 1단계를 생략하고 그 plan을 그대로 사용 (중복 비용 방지).

## 금지 사항

- **6단계 게이트 중 하나라도 transcript 증거 없이 스킵** — 즉시 사용자에게 보고하고 멈춘다.
- **60분 미만 사이클** — 거의 항상 단계 스킵. 10-15분에 완결됐다면 다시 시작.
- **Growth bet 스킵** — 1.5단계는 fix-only weekly를 만들지 않기 위해 강제. 사용자가 명시적으로 "이번 주는 growth 없이 fix만" 동의했을 때만 생략.
- 큰 리팩토링 (≥ 3 파일 / 100 LOC) — sprint 1주차 deliverable로 분해 후 daily가 처리
- 인프라 변경 (`docker-compose.yml`, `Dockerfile`, `nginx*`, `.github/workflows/*`) — 항상 사용자 합의 후 수동
- 의존성 메이저 업그레이드 — 별도 PR + 사용자 검토
- 기술 도입 *결정* — Claude는 후보를 제안만. 사용자가 결정.
- **PR을 draft로 두고 auto-merge 미활성** — weekly가 만드는 모든 PR은 draft → ready 전환 → `enable_pr_auto_merge(SQUASH)` 호출이 기본.

## 비용

LLM 합계 약 $3-7 (improvement-cycle $1.5-3 + 6단계 × 2 deliverable + simplify·security-review·tech-radar $1.5-4).
