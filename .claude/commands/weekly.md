---
description: 주 3회 EconPedia sprint 사이클 — 시니어 팀 풀 패널(PM·TL·FE·BE inline + Security·DA 무조건 + Designer·QA 선택) 로 growth bet 1개 + defensive 1개 완결. /goal 결합 시 전 hat transcript 증거 surface 까지 자가 지속.
---

EconPedia 의 시니어 팀(메타 + 토스증권 컬처) 이 *방향성 있게* 발전시키는 sprint cadence. 주 3회.

> **핵심 원칙**: 매 weekly 사이클은 반드시 **growth bet 1개 + defensive 1개**. fix만 나오면 weekly 실패.
> 북극성: `wallet_authenticated_users` (현재 0, 90일 target 200).

> **자동화 핵심**: `/goal` (Claude Code v2.1.139+) 결합 시 전 hat transcript 증거가 모두 surface 될 때까지 자가 지속. 권장:
>
> ```text
> /goal "이번 /weekly 사이클을 완결한다 — Growth bet과 Defensive 양쪽에 대해 transcript에 [PM][TL][FE][BE][SEC][DA] 6 hat 증거 + 선택적 [Designer][QA] 가 각각 surface 되고, Growth PR + Defensive PR 모두 머지되며, 다음 /weekly 권장 시점 명시."
> ```
>
> 호출 빈도: **`/loop 56h /weekly`** (주 3회 — 약 2.33일, 월·수·금).
>
> **최소 소요 시간**: 사이클 1개에 **최소 60-90분**. growth + defensive 각각 풀 6 hat 검토를 거치는 데 60분 미만이면 거의 항상 hat 스킵.

## 팀 구성 (시니어 팀 풀 패널)

각 hat 의 책무·산출물은 `/team` 정의를 따른다. weekly 는 sub-agent 를 *무조건* 호출 (daily 는 조건부).

| Hat | 형태 | 호출 빈도 |
|---|---|---|
| **[PM]** | inline | 매 사이클 (growth + defensive 각각) |
| **[TL]** | inline | 매 사이클 |
| **[FE]** | inline (변경 시) | 변경 종류에 따라 |
| **[BE]** | inline (변경 시) | 변경 종류에 따라 |
| **[SEC]** | sub-agent `security-reviewer` | **무조건 1회 이상** (변경된 보안 sensitive 파일 0개여도 "N/A 사유" sub-agent 가 명시) |
| **[DA]** | sub-agent `data-validator` | **무조건 1회 이상** (Whale Alert 변경 없어도 KPI snapshot 정합성 검증) |
| **[Designer]** | sub-agent (예정, 현재는 inline) | growth bet 의 UI 변경 시 |
| **[QA]** | sub-agent (예정, 현재는 inline) | growth bet 의 새 기능 시 |

## 우선순위

1. **고객 가치 (growth)** — 북극성 1mm 라도 움직이는 실험 1개를 *이번 사이클*에 머지.
2. **발전하는 프로덕션** — Sprint deliverable 중 *defensive 1개* 끝낸다.
3. **보안** — 지난 사이클 OWASP 점검 (sub-agent 호출).
4. **기술 도입 후보** — Whale·분석·UX 강화 신기술 1-2개 조사 → 사용자 결정 → Slack 알림.

## 절차

### 1단계. Self-Improvement Cycle + Sprint Focus 확인 (~10-15분)

```bash
npm run loop
```

소요 ~4-7분, 비용 ~$1.5-3. 산출물:
- `ops/improvement-loop/state/history/YYYY-MM-DD-{musk,mckinsey,munger}.md`
- `ops/improvement-loop/state/history/YYYY-MM-DD-plan.md`

**동일 날짜 plan.md 존재** → 재실행 금지 (24h 초과 시에만 재돌림).

플랜의 다음 섹션을 *그대로 인용*:
- "## Decision: This Cycle's Focus"
- "## Two-week Sprint Plan" Week 1 deliverable
- "## Success criteria" KPI 목표

**검증**: Week 1 에 growth 항목 1개 이상 있는지. 전부 fix뿐이면 1.5단계가 강제 추가됨을 사용자에게 알림.

질문: **"이 Focus에 동의하나요?"** 동의 아니면 멈춤.

### 1.5단계. Growth Bet — 풀 6 hat (~30-40분)

**[PM]** — plan 의 growth deliverable 인용 또는 새 후보 3-5개 제시 (whale→wallet, telegram retention, SEO long-tail, 데이터 가치, 외부 distribution):

| 영역 | 가설 예시 |
|---|---|
| Whale → wallet conversion | "whale 페이지 하단 CTA가 wallet auth signup을 N% 만든다" |
| Whale → Telegram retention | "UTM 부착으로 CTR 측정 가능" |
| SEO long-tail | "sector aggregation 페이지가 검색 트래픽 N건/주" |
| 데이터 가치 | "6개월 follow-up 자동 업데이트로 재방문 N% ↑" |
| 외부 distribution | "공개 read-only API 또는 RSS feed 백링크 N개" |

사용자 선택 또는 디폴트(측정 명확 + LOC 작은 옵션) 채택. 가설·KPI·임계값·롤백 1pager.

**[TL]** — 영향 범위 + 분할 권고. ≤ 3 파일 / ≤ 100 LOC.

**구현** — 브랜치 `claude/weekly/<YYYY-MM-DD>-<growth-slug>`.

**[FE]** / **[BE]** — 변경 종류별 7항목 / API curl 검증 (`/team` 단계 3-4 와 동일).

**[SEC] (무조건)** — `Task(security-reviewer)`. growth 가 보안 sensitive 파일 미변경이어도 호출 — sub-agent 가 "N/A 사유" 자체를 transcript 에 명시.

**[DA] (무조건)** — `Task(data-validator)`. growth 가 Whale 미변경이어도 fabricated 지표 검사 + KPI snapshot 정합성.

**[Designer]** — growth 가 UI 변경(`.astro`, `.css`, 새 컴포넌트) 포함 시 inline hat 으로 추가:
- 토스 디자인 토큰(`var(--color-*)`, `--radius-*`, `--space-*`) 사용 여부
- 모바일 1차, 데스크탑 2차 우선순위
- copy 의 명확성·간결성 (한국어 권장)

**[QA]** — growth 가 *새 기능* 추가면 inline hat:
- 회귀 시나리오 3-5개
- 엣지케이스 (빈 값, 극단값, 동시성)
- 수동 테스트 결과 1줄

**[VERDICT]** + draft PR → ready → enable_pr_auto_merge → CI 통과 시 자동 머지 또는 직접 머지. 머지 후 main 빌드 재확인.

**금지**:
- "후보 제시만 + 다음 주 이관" — growth 는 *조사*가 아니라 *실행*.
- 어떤 hat 도 transcript 증거 없이 스킵.

### 2단계. Defensive — 풀 6 hat (~20-30분)

기본: 1단계 plan 의 defensive deliverable.

후보 없으면:
- (a) 지난 사이클 변경 보안 회고 (`api/server.js` / `src/pages/api/*` / `src/components/*.astro` / `scripts/scan-*.js` / `scripts/generate-whale-*.js` 변경분)
- (b) `/simplify` — 중복·과도 abstraction·죽은 코드 정리 PR (≤ 3 파일, ≤ 100 LOC)
- (c) CLAUDE.md P0/P1 잔여 1건

같은 6 hat 게이트 적용. **[SEC]** 는 이 경우 의무적으로 BLOCK / NEEDS-FIX 가 가능 → 통과시킨 결함은 PR 본문에 명시.

**완료 인정**: 머지된 PR URL 또는 "결함 0건 확인 + 리뷰 결과 transcript 보고" 둘 중 하나.

### 3단계. 기술 도입 후보 조사 (~5-10분)

다음 영역 중 *현재 sprint Focus 와 직접 연결되는* 1-2개:

| 영역 | 트리거 |
|---|---|
| 공시 데이터 정확도 | Whale false positive 의심, 신규 데이터 소스 |
| LLM 비용·품질 | 모델 가격·기능 변동 |
| 데이터 시각화 | Whale engagement 하락 |
| 사용자 engagement | poll·comment·newsletter 정체 |
| 운영 안정성 | container 재시작·OOM·build 실패 증가 |

각 후보: 무엇 (이름·링크), 왜 지금, 도입 비용, 위험.

**산출물**: `ops/improvement-loop/state/history/YYYY-MM-DD-tech-radar.md`. **커밋 필수**.

### 4단계. Slack 알림 (~2분)

3단계 산출물을 Slack 으로. `SLACK_WEBHOOK_URL` 없으면 "미설정 — 알림 생략" 1줄 보고.

후보 0개 → 발송 금지. 3개 이상 → 가장 중요 2개만. 단정 금지.

### 5단계. Daily backlog 동기화 (~5분)

오늘 plan.md "Two-week Sprint Plan" 의 다음 7일 deliverable → CLAUDE.md P0/P1 섹션 또는 GitHub Issues 반영. 1 파일 변경 PR (daily 규칙).

### 6단계. 보고 (~3분)

- 사이클 소요 시간 (분 단위) — **최소 60분 권장**
- This cycle's Focus (1줄)
- **Growth bet hat 통과**: `[PM]✓ [TL]✓ [FE]✓ [BE]✓ [SEC]✓ [DA]✓ [Designer]✓|N/A [QA]✓|N/A` + PR URL + 머지 sha
- **Defensive hat 통과**: 동일 형식 + PR URL or 결과 보고
- Sprint 1주차 deliverable 진행 현황
- Slack 알림 결과
- 다음 `/weekly` 시점 (56h 후)

## 자동화 권장

```text
# 옵션 A — 56시간마다 사이클 (주 3회). 세션 살아 있을 때.
/loop 56h /weekly

# 옵션 B — /goal과 결합. 전 hat 증거 + 2 PR 머지까지 자가 지속.
/goal "이번 /weekly 사이클을 완결한다 — Growth bet과 Defensive 양쪽에 대해 transcript에 [PM][TL][FE][BE][SEC][DA] 6 hat 증거 + 선택적 [Designer][QA] 가 각각 surface 되고, Growth PR + Defensive PR 모두 머지되며, 다음 /weekly 권장 시점 명시."

# 옵션 C — 두 가지 결합 (권장)
/loop 56h /weekly
```

병행: `.github/workflows/improvement-loop.yml` 매주 월 22:00 UTC `npm run loop`. 동일 날짜 plan.md 있으면 1단계 스킵.

## 금지 사항

- **어떤 hat 도 transcript 증거 없이 스킵** — 즉시 보고하고 멈춤.
- **60분 미만 사이클** — 거의 항상 hat 스킵.
- **Growth bet 스킵** — 사용자가 명시적으로 "이번 주는 growth 없이 fix만" 동의했을 때만.
- 큰 리팩토링 (≥ 3 파일 / 100 LOC) — sprint deliverable 로 분해 후 daily 처리.
- 인프라 변경 — 사용자 합의 후 수동.
- 의존성 메이저 업그레이드 — 별도 PR + 사용자 검토.
- 기술 도입 *결정* — Claude 는 후보 제안만. 사용자 결정.
- **PR 을 draft 로 두고 auto-merge 미활성** — draft → ready → enable_pr_auto_merge(SQUASH) 기본.

## 비용

LLM 합계 약 $5-12 (improvement-cycle $1.5-3 + 6 hat × 2 deliverable + sub-agent 호출 + tech-radar). 풀 패널(Designer/QA 포함) 시 $8-15.
