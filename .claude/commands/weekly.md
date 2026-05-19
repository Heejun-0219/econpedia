---
description: 매주 30-60분 EconPedia sprint 회고·합성 → /improvement-cycle 실행, /simplify, /security-review, 기술 도입 후보 Slack 알림.
---

매주 한 번. EconPedia를 *방향성 있게* 발전시키는 routine. Sprint cadence.

## 우선순위 (재확인)

1. **발전하는 프로덕션** — Self-improvement loop synthesis가 결정한 "This Cycle's Focus"가 합당한지 검증, sprint backlog 1개 끝내기.
2. **보안** — 지난 주 변경에서 OWASP 패턴 점검.
3. **고객 가치 + 기술 도입** — Whale Alert·분석·UX 강화를 위한 신기술 후보 1-2개 조사 → 결정은 사용자에게 위임. *Slack 알림 발송.*

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

사용자에게 1가지 질문: **"이 Focus에 동의하나요? (y/n + 수정 요청)"**

동의하지 않으면 여기서 멈추고 사용자 입력 대기.

### 2단계. 지난 주 회고 (보안 + 단순화)

```bash
git log --since="7 days ago" --pretty=format:"%h %s" --no-merges
git diff --stat HEAD~7..HEAD -- 'src/**' 'api/**' 'scripts/**'
```

**(a) 보안 회고**
- 지난 주 변경된 파일 중 `api/server.js`, `src/pages/api/*`, `src/components/*.astro`, `scripts/scan-*.js`, `scripts/generate-whale-*.js` 가 포함되어 있으면 `/security-review` 슬래시 호출 또는 동등한 검토 수행.
- 발견된 신규 결함 → `CLAUDE.md`의 P0/P1 목록 *업데이트* PR 생성 (이건 1 파일 작은 변경이므로 daily 규칙 적용 — draft PR + auto-merge).

**(b) `/simplify` 적용 후보 1개**
- 지난 주 머지된 PR 중 중복 코드·과도한 추상화·죽은 코드가 들어간 곳 1개를 찾는다.
- 정리 PR 1개 생성. 영향 범위는 daily보다 클 수 있음 (≤ 3 파일, ≤ 100 LOC). draft → CI 통과 후 auto-merge.

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
- Sprint 1주차 deliverable 목록
- 머지된/생성된 PR URL
- 기술 도입 후보 슬랙 알림 결과 (발송됨 / 후보 없음 / SLACK_WEBHOOK_URL 미설정)
- 다음 `/weekly` 권장 시점

## 자동화 권장

```text
/loop 7d /weekly
```

병행: `.github/workflows/improvement-loop.yml` 도 매주 월요일 22:00 UTC에 `npm run loop`을 실행한다. 둘 중 하나가 cycle을 돌리면 나머지는 *그날* 스킵해야 함 — 동일 날짜의 plan.md가 이미 있으면 1단계를 생략하고 그 plan을 그대로 사용.

## 금지 사항

- 큰 리팩토링 (≥ 3 파일 / 100 LOC) — sprint 1주차 deliverable로 분해 후 daily가 처리
- 인프라 변경 (`docker-compose.yml`, `Dockerfile`, `nginx*`, `.github/workflows/*`) — 항상 사용자 합의 후 수동
- 의존성 메이저 업그레이드 — 별도 PR + 사용자 검토
- 기술 도입 *결정* — Claude는 후보를 제안만. 사용자가 결정.

## 비용

LLM 합계 약 $2-5 (improvement-cycle $1.5-3 + simplify·security-review·tech-radar $0.5-2).
