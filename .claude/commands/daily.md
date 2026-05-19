---
description: 매일 5-15분 EconPedia 발전 루틴 — 상태 점검 → P0/P1 픽스 1개 → draft PR + auto-merge 활성화. 새 기능 금지, 픽스만.
---

EconPedia를 매일 *조금씩* 발전시키는 루틴. 한 번에 하나만, 무리하지 말 것.

## 우선순위

1. **발전하는 프로덕션** (최우선) — 알려진 P0/P1 픽스, 빌드 회귀 차단, 빌드 안정성.
2. **보안** — `api/server.js`·`src/components/*.astro`·`/api/*` 라우트 건드린 어제자 변경 회고.
3. **고객 가치** — Whale Alert 본문의 환각 의심 케이스 1건 검증.

위 순서로 *위에서 아래로* 살피되, 한 사이클에 **단 1개 액션만** 수행.

## 절차

### 1단계. 상태 스냅샷 (무료, ~30초)

```bash
npm run loop:snapshot
```

산출물: `ops/improvement-loop/state/history/YYYY-MM-DD-snapshot.md`.

읽고 **지난 스냅샷 대비 의미 있는 변화 1줄**로 사용자에게 보고. 예: "어제 대비 P0 1건 신규, 빌드 OK, 열린 PR 2개."

### 2단계. 오늘의 액션 1개 결정

다음 순서로 후보를 찾는다. 첫 번째 해당하는 카테고리에서 멈춘다.

**(a) CLAUDE.md P0/P1 픽스 후보**
- `CLAUDE.md`의 "알려진 P0/P1 결함" 섹션을 읽고, 다음 조건 모두 만족하는 1건만 고른다:
  - 영향 범위: 1 파일, ≤ 30 LOC
  - 부수효과: 다른 라우트·컴포넌트에 안 미침
  - 검증 가능: `npm run build` 통과 + 가능하면 단위 검증
- 매칭되는 게 없으면 (b)로.

**(b) 어제자 보안 sensitive 변경 회고**
- `git log --since="36 hours ago" --name-only --pretty=format:` 로 변경 파일 추출.
- `api/server.js`, `src/components/*.astro`, `src/pages/api/*` 중 변경된 게 있으면 OWASP top10 패턴(XSS, auth bypass, injection, SSRF)으로 빠르게 self-review.
- 신규 결함 발견 → 같은 (a)의 조건 만족 시 픽스. 아니면 issue만 생성.
- 매칭되는 게 없으면 (c)로.

**(c) Whale Alert 환각 검증 (1건만)**
- `src/pages/whale/` 에서 어제(또는 가장 최근) 생성된 페이지 1개를 무작위로 선택.
- 본문의 핵심 주장 1-3개에 대해:
  - SEC Form 4 / DART 원본 데이터와 대조 (`.whale-signals.json` 또는 raw response)
  - `data/insider-case-history.json`에 *없는* 회사를 "유사 사례"로 인용했는지 확인
- 환각 1건 이상 발견 → 페이지 noindex 또는 본문 수정. 같은 (a) 조건 만족 시 PR.

**(d) 아무것도 없으면 PASS** — 매일 무언가 *반드시* 하려는 강박은 금지. "오늘은 클린"이라고 보고하고 종료.

### 3단계. 변경 적용

- 작업 브랜치 생성: `claude/daily/<YYYY-MM-DD>-<short-slug>`
- 변경 → `npm run build` 통과 확인
- 커밋 컨벤션 준수: `fix(scope): ...` 또는 `chore(security): ...`

### 4단계. Draft PR + auto-merge 활성화

1. `mcp__github__create_pull_request` 로 **draft PR** 생성. 본문에 다음 명시:
   - 어떤 P0/P1을 픽스했는지 (CLAUDE.md 인용)
   - 영향 범위 (변경 파일 수 + LOC)
   - 검증 방법 (`npm run build`, 수동 점검 항목)
2. PR 본문에 `<!-- AUTOMERGE: squash -->` 마커 포함.
3. CI 시작 후 `mcp__github__enable_pr_auto_merge` 호출 — `merge_method: "squash"`.
4. CI 통과 시 GitHub이 자동으로 ready 전환 + 머지 → main = prod 배포.
5. **CI가 통과하지 않은 상태로 무리하게 강제 머지 금지.** CI 실패 시 auto-merge가 해제되고 draft로 남는다.

### 5단계. 보고

사용자에게 다음을 1줄씩 보고하고 종료:
- 어떤 액션을 했는지 (또는 PASS인지)
- PR URL
- auto-merge 활성화 여부
- 다음 사이클(`/daily`)에서 주목할 잠재 이슈

## 금지 사항

- 새 기능 추가 (CLAUDE.md 원칙 1: "지울 수 있는가 먼저")
- 1 파일 초과 / 30 LOC 초과 변경 → 그건 `/weekly` 또는 사용자 합의 후
- `docker-compose.yml`, `Dockerfile`, `.github/workflows/*`, `nginx*` 등 인프라 파일 — 인프라는 항상 사용자 수동 검토
- 의존성 추가·업그레이드 — 위클리에서만
- `data/insider-case-history.json` 사람 큐레이션 데이터 — 절대 자동 편집 금지
- 머지 후 *추가* 작업 — 매일은 한 번만

## 자동화 권장

```text
/loop 24h /daily   # 매일 자동 실행 (Claude Code 세션이 열려있을 때만)
```

세션이 꺼져도 동작해야 하면 GitHub Actions cron으로 옮기되 그건 별개 작업. 지금은 사용자가 매일 클로드 코드 세션에서 `/daily`를 직접 호출하거나 `/loop 24h /daily` 사용.

## 비용

LLM 호출 합계 약 $0.1-0.3 (탐색 + 코드 작성). PASS면 $0.
