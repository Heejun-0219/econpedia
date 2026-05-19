---
description: 주 3회 EconPedia sprint 사이클 — /improvement-cycle 실행, growth bet 1개 결정·실행, /simplify·/security-review, 기술 도입 후보 Slack 알림. /goal과 함께 사용 시 growth+defensive 머지까지 자가 지속.
---

주 3회 (월·수·금 권장) EconPedia를 *방향성 있게* 발전시키는 routine. Sprint cadence.

> **핵심 원칙**: 매 weekly 사이클은 반드시 **growth bet 1개 + defensive 1개**를 모두 가진다. fix만 나오면 weekly는 실패다.
> 북극성: `wallet_authenticated_users` (현재 0, 90일 target 200). 사이클마다 이 숫자를 1mm라도 움직이는 실험이 1개는 있어야 함.

> **자동화 핵심**: `/goal` (Claude Code v2.1.139+)과 결합하면 사이클이 완결(Growth bet PR 머지 + Defensive deliverable 결과 보고)될 때까지 사용자 입력 없이 자가 진행. 권장 호출:
>
> ```text
> /goal "이번 /weekly 사이클을 완결한다 — 1.5단계 Growth bet 옵션이 사용자에게 제시·선택·구현되어 PR이 머지됐고, Defensive deliverable 1개 결과(PR 머지 또는 보고)가 보고됐으며, 다음 /weekly 권장 시점이 명시됨."
> ```
>
> 호출 빈도: **`/loop 56h /weekly`** (주 3회 — 약 2.33일 간격, 월·수·금).

## 우선순위 (재확인)

1. **고객 가치 (growth)** — 북극성을 움직이는 실험 1개를 *이번 주에 실제로 머지*한다. 조사·검토만 하고 끝내지 않는다.
2. **발전하는 프로덕션** — Self-improvement loop synthesis가 결정한 sprint deliverable 중 *defensive 1개*를 끝낸다 (P0/P1 픽스, 빌드 안정성 등).
3. **보안** — 지난 주 변경에서 OWASP 패턴 점검. 신규 결함은 CLAUDE.md에 기록.
4. **기술 도입 후보** — Whale Alert·분석·UX 강화를 위한 신기술 후보 1-2개 조사 → 결정은 사용자에게 위임. Slack 알림.

## 절차

### 1단계. Self-Improvement Cycle 실행

```bash
npm run loop
```

소요 ~4-7분, 비용 ~$1.5-3 (Claude Opus 4.7). 산출물:
- `ops/improvement-loop/state/history/YYYY-MM-DD-{musk,mckinsey,munger}.md`
- `ops/improvement-loop/state/history/YYYY-MM-DD-plan.md`

플랜의 다음 섹션을 사용자에게 *그대로 인용*하여 보여준다 (요약·각색 금지):
- "## Decision: This Cycle's Focus"
- "## Two-week Sprint Plan"의 1주차 deliverable
- "## Success criteria"의 KPI 목표

**검증**: Week 1 deliverable에 *growth 항목*이 1개 이상 포함됐는지 확인. 전부 fix뿐이면 1.5단계가 강제 추가됨을 사용자에게 알린다.

사용자에게 1가지 질문: **"이 Focus에 동의하나요? (y/n + 수정 요청)"**

동의하지 않으면 여기서 멈추고 사용자 입력 대기.

### 1.5단계. Growth Bet 결정·실행 (필수, 스킵 금지)

이 단계는 **항상** 수행한다. 1단계 plan에 이미 growth deliverable이 있으면 그것을 실행, 없으면 새로 결정.

**(a) 후보 3-5개 제시** — 다음 영역에서 *이번 주 안에 머지 가능한* (≤ 3 파일, ≤ 100 LOC) 후보를 사용자에게 제시:

| 영역 | 가설 예시 |
|---|---|
| Whale → wallet conversion | "whale 페이지 하단 CTA가 wallet auth signup을 N% 만든다" |
| Whale → Telegram retention | "UTM 부착으로 CTR 측정 가능 → 카피 iteration 기반 마련" |
| SEO long-tail | "sector aggregation 페이지가 검색 트래픽 N건/주 만든다" |
| 데이터 가치 | "6개월 follow-up 자동 업데이트로 재방문 N% ↑" |
| 외부 distribution | "공개 read-only API 또는 RSS feed가 백링크 N개 만든다" |

각 후보에는 (i) 1주 안 가능 여부, (ii) 검증 가능한 KPI 1개, (iii) 변경 범위 추정을 명시.

**(b) 사용자가 1개 선택** — 사용자가 옵션 1개를 고르거나 직접 제안.

**(c) 즉시 구현 → draft PR → ready 전환 → auto-merge 활성화** — 사용자가 골랐으면 그 자리에서 구현 시작. PR 생성(draft) 직후 `mcp__github__update_pull_request(draft: false)` 로 ready 전환 → `mcp__github__enable_pr_auto_merge(SQUASH)` 호출. 이미 CI clean이면 `mcp__github__merge_pull_request(squash)` 직접.

**금지**: "후보만 제시하고 다음 주로 미루기" — growth는 *조사*가 아니라 *실행*이다. 적어도 측정 인프라(UTM, console.log, KPI 필드 추가)라도 머지한다.

### 2단계. 지난 주 회고 (보안 + 단순화)

```bash
git log --since="7 days ago" --pretty=format:"%h %s" --no-merges
git diff --stat HEAD~7..HEAD -- 'src/**' 'api/**' 'scripts/**'
```

**(a) 보안 회고**
- 지난 주 변경된 파일 중 `api/server.js`, `src/pages/api/*`, `src/components/*.astro`, `scripts/scan-*.js`, `scripts/generate-whale-*.js` 가 포함되어 있으면 `/security-review` 슬래시 호출 또는 동등한 검토 수행.
- 발견된 신규 결함 → `CLAUDE.md`의 P0/P1 목록 *업데이트* PR 생성 (이건 1 파일 작은 변경이므로 daily 규칙 적용 — draft PR → `update_pull_request(draft: false)` → `enable_pr_auto_merge(SQUASH)` 호출).

**(b) `/simplify` 적용 후보 1개**
- 지난 주 머지된 PR 중 중복 코드·과도한 추상화·죽은 코드가 들어간 곳 1개를 찾는다.
- 정리 PR 1개 생성. 영향 범위는 daily보다 클 수 있음 (≤ 3 파일, ≤ 100 LOC). draft → `update_pull_request(draft: false)` → `enable_pr_auto_merge(SQUASH)` 호출 → CI 통과 시 자동 머지.

### 3단계. 기술 도입 후보 조사 (1-2개)

다음 영역 중 *현재 sprint의 Focus와 직접 연결되는* 1-2개에 한해 조사:

| 영역 | 트리거 |
|---|---|
| **공시 데이터 정확도** | Whale Alert에서 false positive가 의심되거나, 새 데이터 소스(예: 한국 거래소, 미국 OTC) 누락 의심 |
| **LLM 비용·품질** | 모델 가격·신규 기능 변동, 환각 케이스 증가 |
| **데이터 시각화** | Whale Alert 페이지 engagement (체류 시간·CTR) 하락, 또는 단순 표·텍스트 한계 |
| **사용자 engagement** | poll·comment·newsletter 지표 정체, 신규 UX 패턴 적용 가능성 |
| **운영 안정성** | container 재시작·OOM·build 실패 증가 |

**조사 방법**: 웹 검색으로 최근 4주 내 발표·릴리즈 위주. 각 후보에 대해:
- **무엇** (이름·링크)
- **왜 지금** (현재 sprint Focus 또는 알려진 결함과의 연결)
- **도입 비용** (개발 시간·런타임 비용·인프라 영향)
- **위험** (lock-in, 의존성 추가, 보안 면적 증가)

**산출물**: `ops/improvement-loop/state/history/YYYY-MM-DD-tech-radar.md`로 저장.

### 4단계. Slack 알림 (기술 도입 후보 한정)

3단계의 산출물을 요약하여 Slack으로 보낸다. **환경 변수 `SLACK_WEBHOOK_URL` 필수.**

```bash
test -n "$SLACK_WEBHOOK_URL" || { echo "SLACK_WEBHOOK_URL 미설정 — 알림 생략"; exit 0; }

curl -fsS -X POST -H 'Content-Type: application/json' \
  --data "$(jq -n --arg text "$NOTIFY_TEXT" '{text:$text}')" \
  "$SLACK_WEBHOOK_URL"
```

`NOTIFY_TEXT` 권장 포맷 (한국어):
```
🛠️ EconPedia 주간 기술 도입 후보 (YYYY-MM-DD)

후보 1: <이름>
- 왜: <한 줄>
- 비용/위험: <한 줄>
- 결정 필요 시점: <YYYY-MM-DD 또는 N/A>

후보 2: ...

전체 노트: ops/improvement-loop/state/history/YYYY-MM-DD-tech-radar.md
```

**금지 사항**:
- 후보 0개면 알림 발송 금지 (노이즈).
- 후보 3개 이상이면 가장 중요한 2개만. 나머지는 노트에만 남김.
- "이거 도입하세요" 같은 단정 금지 — 항상 사용자 결정으로 위임.

### 5단계. Daily backlog 동기화

오늘의 plan.md "Two-week Sprint Plan"에서 다음 7일 내 1-3일짜리 deliverable이 있으면, *각각을 `/daily`가 1주일 안에 픽업할 수 있도록* CLAUDE.md의 P0/P1 섹션 또는 GitHub Issues에 반영.

- 작은 backlog 1개 추가 = 1 파일 변경 PR (daily 규칙 적용).

### 6단계. 보고

사용자에게 다음을 보고하고 종료:
- This cycle's Focus (1줄)
- **Growth bet 실행 결과** — 어떤 가설을 어떻게 측정 가능하게 머지했는지 (1줄)
- Defensive deliverable 결과 (1줄)
- Sprint 1주차 deliverable 진행 현황
- 머지된/생성된 PR URL + **auto-merge 활성화 여부**
- 기술 도입 후보 슬랙 알림 결과 (발송됨 / 후보 없음 / SLACK_WEBHOOK_URL 미설정)
- 다음 `/weekly` 권장 시점

## 자동화 권장

```text
# 옵션 A — 56시간마다 사이클 (주 3회). 세션 살아 있을 때.
/loop 56h /weekly

# 옵션 B — /goal과 결합. 사이클이 growth bet PR 머지 + defensive 결과 보고까지 자가 지속.
/goal "이번 /weekly 사이클을 완결한다 — 1.5단계 Growth bet 옵션이 사용자에게 제시·선택·구현되어 PR이 머지됐고, Defensive deliverable 1개 결과(PR 머지 또는 보고)가 보고됐으며, 다음 /weekly 권장 시점이 명시됨."

# 옵션 C — 두 가지 결합 (권장)
/loop 56h /weekly
```

병행: `.github/workflows/improvement-loop.yml` 도 매주 월요일 22:00 UTC에 `npm run loop`을 실행한다. 동일 날짜의 plan.md가 이미 있으면 1단계를 생략하고 그 plan을 그대로 사용 (중복 비용 방지).

## 금지 사항

- **Growth bet 스킵** — 1.5단계는 fix-only weekly를 만들지 않기 위해 강제. 사용자가 명시적으로 "이번 주는 growth 없이 fix만" 동의했을 때만 생략.
- 큰 리팩토링 (≥ 3 파일 / 100 LOC) — sprint 1주차 deliverable로 분해 후 daily가 처리
- 인프라 변경 (`docker-compose.yml`, `Dockerfile`, `nginx*`, `.github/workflows/*`) — 항상 사용자 합의 후 수동
- 의존성 메이저 업그레이드 — 별도 PR + 사용자 검토
- 기술 도입 *결정* — Claude는 후보를 제안만. 사용자가 결정.
- **PR을 draft로 두고 auto-merge 미활성** — weekly가 만드는 모든 PR은 CI 시작 직후 `enable_pr_auto_merge(squash)` 호출이 기본. 사용자가 명시적으로 "수동 검토 필요" 표시 시에만 보류.

## 비용

LLM 합계 약 $2-5 (improvement-cycle $1.5-3 + simplify·security-review·tech-radar $0.5-2).
