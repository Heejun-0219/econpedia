---
description: 하루 3회 EconPedia 발전 사이클 — 시니어 팀 6-hat 검토(PM·TL·FE·BE inline + Security·DA sub-agent 조건부)로 1 액션 ship. /goal 결합 시 6 hat transcript 증거가 모두 surface 될 때까지 자가 지속.
---

EconPedia 의 시니어 엔지니어 1명이 (메타·토스증권 컬처) *조금씩 자주* 발전시키는 루틴. 한 사이클에 단 1개 액션, 무리하지 말 것.

> **자동화 핵심**: `/goal` (Claude Code v2.1.139+) 과 결합. 평가자는 transcript에 6-hat 증거가 모두 보여야 통과. 권장:
>
> ```text
> /goal "오늘의 /daily 사이클을 완결한다 — transcript에 [PM][TL][FE][BE] 4 hat 증거 + 조건부 [SEC][DA] sub-agent 결과(N/A 명시 포함) + 최종 [VERDICT] 가 surface 되고, PR 머지 또는 (e) PASS 결정 보고."
> ```
>
> 호출 빈도: **`/loop 8h /daily`** (하루 3회 — 09·17·01 KST).
>
> **최소 소요 시간**: 사이클 1개에 최소 20분. 5-10분 만에 끝났다면 hat 스킵 — 거의 항상 잘못.

## 팀 구성 (1인 시뮬레이션)

이 스킬은 1인 Claude가 6역할의 시니어 hat 을 순회하며 각 역할의 산출물을 transcript 에 surface 합니다.

| Hat | 형태 | 책무 |
|---|---|---|
| **[PM]** | inline | 북극성 정렬 · 가설 · KPI · 롤백 |
| **[TL]** | inline | 영향 범위 · 부수효과 · 분할 권고 |
| **[FE]** | inline (해당 시) | 접근성·모바일·다크모드·에러·로딩·i18n·XSS 7항목 |
| **[BE]** | inline (해당 시) | 빌드·API curl·외부 의존성·인프라·롤백 |
| **[SEC]** | sub-agent `security-reviewer` (조건부) | OWASP top10, 거절 조건 명시 |
| **[DA]** | sub-agent `data-validator` (조건부) | 가짜 지표·Whale 환각·KPI 정합성 |

각 hat 의 **거절 조건** 은 `/team` 스킬 정의를 따른다 (증거 없으면 다음 단계 BLOCK).

## 우선순위

1. **발전하는 프로덕션** — 알려진 P0/P1 픽스, 빌드 회귀 차단.
2. **보안** — `api/server.js`·`src/components/*.astro`·`/api/*` 라우트의 어제자 변경 회고.
3. **고객 가치 (growth)** — 북극성을 1mm라도 움직이는 작은 실험 1개. 30 LOC 이내.

위 순서로 위에서 아래. **단 1개 액션만** 수행.

## 절차

### 1단계. [PM] 후보 선정 + 가설 (~3-5분)

```bash
npm run loop:snapshot
```

산출물: `ops/improvement-loop/state/history/YYYY-MM-DD-snapshot.md`.

`[PM]` 마커로 transcript 출력:

- **지표 변화**: 어제 대비 1줄 (열린 PR, 빌드 상태, 신규 P0)
- **후보 카테고리**: (a) P0/P1 픽스 / (b) 보안 회고 / (c) Whale 환각 검증 / (d) growth 실험 / (e) PASS
- **북극성 정렬**: `wallet_authenticated_users` 와 어떻게 연결되는지 (직접/간접/무관)
- **가설**: 1문장. "…하면 …이 …될 것이다."
- **측정**: KPI · 임계값 · 측정창
- **롤백**: revert 1 커밋 / 환경변수 / 데이터 백업

**[PM] 거절 조건**: 가설이 측정 불가능하면 다음 단계 BLOCK. "측정 방법 없는 변경은 채택 금지" (CLAUDE.md).

### 2단계. [TL] 영향 범위 평가 (~2-3분)

`git grep` / `find` 로 영향 추정 후 `[TL]` 마커:

- **변경 예정 파일**: 목록 + 추정 LOC
- **호출 그래프**: 변경 함수가 다른 어디서 호출되는가
- **부수효과**: 빌드 시간, 캐시 무효화, 환경변수 의존
- **분할 권고**: 1 PR / 2 PR 분리 / spike 먼저
- **daily 규칙 통과 여부**: 1 파일 · ≤30 LOC

**[TL] 거절 조건**: 30 LOC 초과 또는 다파일 변경이 필요하면 → `/weekly` 로 이관 (`[TL] BLOCK — daily 규칙 초과`).

### 3단계. 변경 적용 (~5-10분)

- 브랜치: `claude/daily/<YYYY-MM-DD>-<slug>`
- 변경 → `npm run build` 통과
- 커밋 컨벤션: `fix(scope): ...` / `chore(security): ...` / `feat(growth): ...`

### 4단계. [FE] / [BE] hat — 변경 종류별 (~3-5분)

#### [FE] (`.astro` / `.css` / `src/components/*` / `src/layouts/*` / `src/pages/*` 변경 시)

7항목 체크리스트 — 각 항목 ✓/✗/N-A + 1줄 근거:

- [ ] **접근성**: aria-label / role / 시맨틱 HTML / 키보드 네비
- [ ] **모바일**: `@media (max-width: 640px)` 또는 flex 반응형
- [ ] **다크모드**: `var(--color-*)` 토큰 사용 (하드코드 색상 X)
- [ ] **에러 상태**: 외부 fetch 실패 시 UI
- [ ] **로딩 상태**: 비동기 로드 중 스켈레톤/스피너
- [ ] **i18n**: 한국어/영어 일관성
- [ ] **XSS**: innerHTML 미사용, textContent 또는 escape

**[FE] 거절 조건**: 7항목 중 빈칸 1개 이상이면 BLOCK — 보완 후 재호출.

미해당이면 `[FE] N/A — 프론트엔드 변경 없음`.

#### [BE] (`api/server.js` / `scripts/*.js` / `astro.config.mjs` 변경 시)

- **빌드**: `npm run build` 결과 1줄
- **API curl**: `node api/server.js` + `curl` 로 변경 핸들러 실제 호출, 응답 transcript surface (예: `Request 1: HTTP 200, Request 6: HTTP 429`)
- **외부 의존성**: Yahoo/SEC/DART/Supabase/Resend/Telegram rate limit 대비
- **인프라 변경 금지 확인**: `docker-compose.yml`, `Dockerfile`, `nginx*`, `.github/workflows/*` 변경 시 즉시 멈춤

**[BE] 거절 조건**: API 변경인데 curl 결과 없음 → BLOCK.

미해당이면 `[BE] N/A`.

### 5단계. [SEC] / [DA] sub-agent — 조건부 (~3-5분)

#### [SEC] — 다음 중 변경 시 `Task(security-reviewer)` 호출:

- `api/server.js`
- `src/pages/api/*`
- `src/components/*.astro`
- `scripts/scan-*.js`, `scripts/generate-whale-*.js`
- `package*.json`

sub-agent 출력의 `[SEC]` 블록을 transcript 에 surface. `[SEC.verdict]` 가 **BLOCK** 이면 머지 금지 — 사용자에게 보고.

미해당이면 `[SEC] N/A — 보안 sensitive 파일 변경 없음`.

#### [DA] — 다음 중 변경 시 `Task(data-validator)` 호출:

- `scripts/generate-whale-*.js`, `scripts/scan-*.js`
- `src/pages/whale/*.astro`
- `api/server.js` 의 응답에 *노출되는 숫자* 변경
- `src/data/*.json`

sub-agent 출력의 `[DA]` 블록을 transcript 에 surface. `[DA.verdict]` 가 **BLOCK** 이면 머지 금지.

미해당이면 `[DA] N/A — 데이터/Whale 변경 없음`.

### 6단계. [VERDICT] + PR + 머지 (~3-5분)

`[VERDICT]` 마커로 종합 판정:

```
[VERDICT] PASS / NEEDS-FIX / BLOCK
- [PM] PASS|NEEDS-FIX|BLOCK
- [TL] ...
- [FE] ...
- [BE] ...
- [SEC] ...
- [DA] ...

권고: <1-2줄>
```

**PASS** 이면 진행:

1. `mcp__github__create_pull_request` 로 draft PR. 본문에 1-5단계 모든 hat 출력 + 6단계 verdict 인용.
2. `mcp__github__update_pull_request(draft: false)` 로 ready 전환.
3. `mcp__github__enable_pr_auto_merge(SQUASH)` 호출 (CI 진행 중) 또는 이미 clean 이면 `mcp__github__merge_pull_request(squash)` 직접.
4. 머지 후 `git fetch + checkout main + npm run build` 1회 재실행 → 빌드 OK 1줄 보고.

**NEEDS-FIX** 면 빠진 항목을 같은 사이클 안에서 채우고 [VERDICT] 재출력.

**BLOCK** 이면 멈추고 사용자에게 1줄 보고.

### 7단계. 보고 (~2분)

- 사이클 소요 시간 (분 단위)
- 6 hat 통과 표시 (`[PM]✓ [TL]✓ [FE]✓ [BE]✓ [SEC]✓|N/A [DA]✓|N/A`)
- PR URL + 머지 sha
- 다음 사이클 주목할 잠재 이슈

## 금지 사항

- **hat 중 하나라도 transcript 증거 없이 스킵** — 즉시 사용자에게 보고하고 멈춘다.
- **5-10분 만에 사이클 종료** — 거의 항상 hat 스킵. 최소 20분 이상이 정상.
- 1 파일 초과 / 30 LOC 초과 변경 → `[TL] BLOCK` 으로 `/weekly` 이관
- 새 페이지 *대량* 자동 생성 → 1개 단발 페이지는 (d)에서 허용
- 인프라 파일 변경 → 사용자 수동 검토
- 의존성 추가·업그레이드 → weekly에서만
- `data/insider-case-history.json` 자동 편집 → 절대 금지
- 머지 후 추가 작업 → 매일 1번만

## 자동화 권장

```text
# 옵션 A — 8시간마다 사이클 (하루 3회). 세션 살아 있을 때.
/loop 8h /daily

# 옵션 B — /goal과 결합. 6 hat 증거까지 자가 지속.
/goal "오늘의 /daily 사이클을 완결한다 — transcript에 [PM][TL][FE][BE] 4 hat 증거 + 조건부 [SEC][DA] sub-agent 결과(N/A 명시 포함) + 최종 [VERDICT] 가 surface 되고, PR 머지 또는 (e) PASS 결정 보고."

# 옵션 C — 두 가지 결합 (권장)
/loop 8h /daily
```

세션이 꺼져도 동작해야 하면 GitHub Actions cron 별도 작업.

## 비용

LLM 호출 합계 약 $1-3 (4 inline hat + sub-agent 1-2개 조건부). PASS 만이면 $0.3.
