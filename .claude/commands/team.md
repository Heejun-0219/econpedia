---
description: 시니어 팀(PM·TL·FE·BE inline hat + Security·DataAnalyst sub-agent) read-only 리뷰 — 현재 변경(staged/unstaged/PR diff)에 코드 변경 없이 6-hat 검토만. /daily·/weekly 본 사이클 진입 전 dry-run 으로 사용.
---

EconPedia 의 시니어 팀(메타 + 토스증권 페르소나) read-only 리뷰. **코드 변경 없음**. 현재 변경에 대해 6-hat 검토 결과만 transcript 에 남기고 종료.

> 용도: `/daily` 나 `/weekly` 의 본 사이클을 돌리기 전에 "이 변경 ship 해도 되는가" 를 가볍게 점검. 또는 PR 리뷰 패스 1회.
>
> 비용: $1-3 (sub-agent 2개 호출 + inline 4 hat). 5-15분.

## 절차

### 0단계. 검토 대상 결정 (~2분)

다음 우선순위로 결정:
1. 인자 `<PR번호>` 또는 `<branch명>` → 해당 PR/branch 의 `git diff main...HEAD`
2. 인자 없음 → 현재 작업 디렉토리의 staged + unstaged 변경
3. 둘 다 비어있으면 "검토할 변경 없음" 1줄 보고 후 종료

```bash
# 예시
git diff origin/main...HEAD --stat
git diff origin/main...HEAD -- <대상 파일>
```

`[scope]` 마커로 검토 대상 1줄 보고: 파일 수, 변경 LOC, 카테고리(api/whale/component/etc.).

### 1단계. PM hat (inline, ~2분)

**`[PM]` 마커로 다음을 transcript 에 출력**:

- **북극성 정렬**: 이 변경이 `wallet_authenticated_users` (0 → 200/90d) 에 어떻게 기여? (직접/간접/무관)
- **가설**: 1문장 (가능하면 PR 본문에서 인용)
- **측정**: KPI · 임계값 · 측정창
- **롤백**: revert 1 커밋 / 환경변수 토글 / 데이터 백업 여부

**거절 조건**: 가설이 PR 본문에 없으면 `[PM] NEEDS-FIX — PR 본문에 가설 1문장이 없음`.

### 2단계. TechLead hat (inline, ~2분)

**`[TL]` 마커**:

- **영향 범위**: 변경된 파일 + 다른 라우트/컴포넌트 호출 그래프 (grep 기반)
- **부수효과**: 빌드 / 다른 PR 머지 충돌 / DB 마이그레이션 / 환경변수 의존
- **분할 권고**: 1 PR 로 ship 가능 / 2개로 분리 권고 / spike 부터 권고
- **기술 부채 영향**: 새 abstraction 도입? 기존 패턴 일관성?

**거절 조건**: 영향 범위가 *transcript 에 명시되지 않은* 다른 파일에 미치는데 PR 에서 미언급이면 `[TL] NEEDS-FIX`.

### 3단계. FE hat (inline, ~3분)

`.astro`, `.css`, `src/components/*`, `src/layouts/*`, `src/pages/*` 가 변경됐을 때만 활성. 아니면 `[FE] N/A — 프론트엔드 변경 없음`.

**`[FE]` 마커** + 7항목 체크리스트:

- [ ] **접근성**: aria-label / role / 시맨틱 HTML / 키보드 네비게이션
- [ ] **모바일**: `@media (max-width: 640px)` 또는 flex 반응형
- [ ] **다크모드**: `var(--color-*)` 토큰 사용 (하드코드 색상 X)
- [ ] **에러 상태**: 외부 fetch 실패 시 UI 동작
- [ ] **로딩 상태**: 비동기 로드 중 스켈레톤/스피너
- [ ] **i18n**: 한국어/영어 일관성
- [ ] **XSS**: innerHTML 미사용, textContent / 템플릿 escape

각 항목 ✓/✗/N-A + 1줄 근거.

**거절 조건**: 빈 항목이 1개 이상이면 `[FE] BLOCK — 보완 후 재호출`.

### 4단계. BE/SRE hat (inline, ~3분)

`api/server.js`, `scripts/*.js`, `astro.config.mjs`, `docker*`, `nginx*` 변경 시 활성. 아니면 `[BE] N/A`.

**`[BE]` 마커**:

- **빌드**: `npm run build` 출력 (PR 본문 인용 가능)
- **API 변경**: 변경 핸들러를 `node api/server.js` + `curl` 로 실제 호출한 결과 (transcript surface)
- **외부 의존성**: Yahoo Finance / SEC EDGAR / DART / Supabase / Resend / Telegram — 새 호출 시 rate limit 대비
- **인프라**: docker-compose / nginx / GitHub Actions 변경이면 사용자 합의 필수 → 그렇지 않으면 무방
- **롤백 안전성**: in-memory 데이터 손실 위험 없는지

**거절 조건**: API 변경인데 curl 결과 없음 → `[BE] NEEDS-FIX`.

### 5단계. Security sub-agent (조건부, ~2분)

다음 중 하나라도 변경된 경우 `Task(security-reviewer)` 호출:

- `api/server.js`
- `src/pages/api/*`
- `src/components/*.astro`
- `scripts/scan-*.js`, `scripts/generate-whale-*.js`
- `package*.json` (의존성 변경)

미해당이면 `[SEC] N/A — 보안 sensitive 파일 변경 없음`.

sub-agent 출력은 `[SEC]` 블록 그대로 transcript 에 surface.

### 6단계. DataAnalyst sub-agent (조건부, ~2분)

다음 중 하나라도 변경된 경우 `Task(data-validator)` 호출:

- `scripts/generate-whale-*.js`, `scripts/scan-*.js`
- `src/pages/whale/*.astro`
- `api/server.js` 의 응답 body 에 노출되는 숫자가 변경됨
- `src/data/*.json`, `ops/improvement-loop/state/kpis.json`

미해당이면 `[DA] N/A — 데이터/Whale 변경 없음`.

### 7단계. 종합 판정 (~1분)

**`[VERDICT]` 마커**:

```
[VERDICT] PASS / NEEDS-FIX / BLOCK
- PM:   PASS|NEEDS-FIX|BLOCK
- TL:   ...
- FE:   ...
- BE:   ...
- SEC:  ...
- DA:   ...

권고: <1-2줄>
- PASS  → /daily 또는 /weekly 본 사이클에서 ship 가능
- NEEDS-FIX → 어떤 hat 의 어떤 항목을 채워야 ship 가능한지 명시
- BLOCK → 머지 금지. 사용자에게 1줄 보고.
```

## 사용 예시

```text
/team           # 현재 unstaged/staged 변경 검토
/team 19        # PR #19 검토 (read-only)
/team feature/x # branch feature/x 검토
```

## 금지 사항

- **코드 변경 금지** — read-only 도구만 사용. `Edit`/`Write` 호출 시 즉시 멈추고 사용자에게 보고.
- **새 PR 생성·머지 금지** — /team 은 리뷰만.
- **sub-agent 무조건 호출 금지** — 위 5/6 단계 조건에 해당될 때만. 비용 절감.

## 비용

LLM 합계 약 $1-3 (sub-agent 2개 호출 시). hat-only 면 $0.5.
