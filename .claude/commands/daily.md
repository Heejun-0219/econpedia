---
description: 하루 3회 EconPedia 발전 사이클 — 분석·기획·개발·보완·테스트·배포 6단계 게이트 통과 후 PR 머지. /goal과 함께 사용 시 6단계 transcript 증거가 모두 surface 될 때까지 자가 지속.
---

EconPedia를 *조금씩 자주* 발전시키는 루틴. 한 사이클에 단 1개 액션, 무리하지 말 것.

> **자동화 핵심**: `/goal` (Claude Code v2.1.139+) 과 결합. 평가자는 transcript에 6단계 증거가 모두 보여야 통과. 권장 호출:
>
> ```text
> /goal "오늘의 /daily 사이클을 완결한다 — transcript에 [분석][기획][개발][보완][테스트][배포] 6단계 증거가 각각 1줄 이상 surface 되고, 최종적으로 PR 머지 또는 (e) PASS 결정이 보고됨."
> ```
>
> 호출 빈도: **`/loop 8h /daily`** (하루 3회 — 09·17·01 KST 기준).
>
> **최소 소요 시간**: 사이클 1개에 최소 20분 이상. 3-5분 만에 끝났다면 단계를 스킵한 것 — 거의 항상 잘못이다.

## 필수 6단계 게이트 (스킵 금지)

각 단계는 **transcript에 1줄 이상 증거**가 남아야 다음 단계로 진행. PR 본문에는 각 단계 결과를 항목별로 명시.

| 단계 | 의미 | Transcript 증거 예시 |
|---|---|---|
| **[분석]** | 무엇이 문제인가, 왜 지금 고치는가 | "스냅샷 1줄 + CLAUDE.md 인용 + 영향 추정" |
| **[기획]** | 가설·측정 방법·위험·롤백 | "가설: …. 측정: 7일 후 KPI X. 위험: …. 롤백: revert 1 커밋." |
| **[개발]** | 코드 변경 | git diff 요약 또는 변경된 LOC + Edit/Write 결과 |
| **[보완]** | 셀프 리뷰 체크리스트 | aria/에러 상태/모바일/엣지케이스 항목별 ✓/N-A 보고 |
| **[테스트]** | 로컬 검증 | `npm run dev` + 실제 클릭/요청 (curl·DevTools) 출력. `npm run build` 만으로는 불충분. |
| **[배포]** | PR + CI + 머지 + 머지 후 sanity | PR URL + CI 결과 + merge sha + main에서 빌드 OK 재확인 |

## 우선순위

1. **발전하는 프로덕션** — 알려진 P0/P1 픽스, 빌드 회귀 차단.
2. **보안** — `api/server.js`·`src/components/*.astro`·`/api/*` 라우트 건드린 어제자 변경 회고.
3. **고객 가치 (growth)** — 북극성(`wallet_authenticated_users`)을 1mm라도 움직이는 **작은 실험 1개**. Whale Alert CTA, 페이지 카피 변경, UTM 트래킹 등 30 LOC 이내.

위 순서로 *위에서 아래로* 살피되, 한 사이클에 **단 1개 액션만** 수행. (a)~(c) 중 첫 번째 후보가 나오는 카테고리에서 멈춘다. fix 후보가 없으면 PASS 대신 **growth 실험** 시도.

## 절차

### 1단계. [분석] 상태 스냅샷 + 후보 식별 (~5분)

```bash
npm run loop:snapshot
```

산출물: `ops/improvement-loop/state/history/YYYY-MM-DD-snapshot.md`.

**Transcript 출력 필수**:
- 어제 대비 변화 1줄
- 오늘 후보 카테고리 (a/b/c/d) + 1줄 근거
- 영향 범위 추정 (파일 수·LOC·다른 라우트 영향)

### 2단계. [기획] 액션 1개 결정 + 가설·측정·위험·롤백 (~5분)

다음 순서로 후보를 찾는다. 첫 번째 해당하는 카테고리에서 멈춘다.

**(a) CLAUDE.md P0/P1 픽스 후보** — 1 파일, ≤ 30 LOC, 부수효과 없음, 검증 가능.
**(b) 어제자 보안 sensitive 변경 회고** — `api/server.js`, `src/components/*.astro`, `src/pages/api/*` OWASP top10 셀프 리뷰.
**(c) Whale Alert 환각 검증 (1건만)** — SEC/DART 원본 대조 + insider-case-history 화이트리스트 확인.
**(d) Growth 실험 1개 (≤30 LOC)** — 북극성 직결. PR 본문에 측정 방법 1줄 필수.
**(e) 아무것도 없으면 PASS** — 매일 무언가 *반드시* 하려는 강박은 금지.

**Transcript 출력 필수** (PR 본문에도 동일 항목):
- 가설: "…하면 …이 …될 것이다"
- 측정 방법: KPI · 기간 · 임계값
- 위험: 무엇이 깨질 수 있나
- 롤백 계획: revert 1 커밋 or 환경변수 토글

### 3단계. [개발] 변경 적용 (~5-10분)

- 작업 브랜치 생성: `claude/daily/<YYYY-MM-DD>-<short-slug>`
- 변경 → 빌드·문법 검증
- 커밋 컨벤션 준수: `fix(scope): ...` 또는 `chore(security): ...` 또는 `feat(growth): ...`

### 4단계. [보완] 셀프 리뷰 (스킵 금지, ~5분)

변경된 파일을 *다시 한 번* 읽고 다음 체크리스트를 transcript에 명시적으로 출력:

- [ ] **접근성**: 새 UI 요소에 적절한 `aria-label` / 시맨틱 HTML?
- [ ] **모바일**: 반응형 동작 확인 (CSS media query 또는 flex layout)
- [ ] **에러 상태**: 외부 API/DB 호출 실패 시 동작 명시?
- [ ] **엣지케이스**: 빈 값/null/undefined/극단값 처리?
- [ ] **i18n**: 한국어/영어 일관성?
- [ ] **보안**: 사용자 입력이 escape 되거나 whitelist 검증되는가?
- [ ] **로그**: 새 코드가 민감 정보를 stdout/에러 메시지에 노출하지 않는가?

해당 없는 항목은 "N/A — 이유" 로 명시. 무조건 ✓만 찍지 말 것.

### 5단계. [테스트] 로컬 검증 (스킵 금지, ~5분)

`npm run build` 통과는 **필요조건이지 충분조건이 아니다**. 다음 중 변경 종류에 맞는 검증을 *실제로 실행*하고 출력을 transcript에 surface:

| 변경 유형 | 최소 검증 |
|---|---|
| 프론트엔드 (`.astro`, `.css`, `.ts`) | `npm run dev` → 변경 페이지 1개 curl 또는 브라우저 액세스 → HTML 응답에 새 요소 포함 확인 |
| API (`api/server.js`) | `node api/server.js` 실행 → 변경 핸들러를 `curl` 로 요청 → 응답 JSON 확인 |
| 생성 스크립트 (`scripts/*.js`) | `node --check` 문법 + 가능하면 dry-run 모드 + 결과물 1개 검사 |
| 데이터 (`*.json`, `*.md`) | `jq .` 또는 `markdown-link-check` 동등 |

검증 *없이* PR을 ready 전환하지 말 것.

### 6단계. [배포] PR 생성 + ready + merge + post-merge sanity (~5분)

1. `mcp__github__create_pull_request` 로 **draft PR** 생성. 본문에 1-2단계 결과(가설·측정·위험·롤백 + 6단계 체크리스트) 명시.
2. PR 본문에 `<!-- AUTOMERGE: squash -->` 마커 포함.
3. `mcp__github__update_pull_request(draft: false)` 호출.
4. `mcp__github__enable_pr_auto_merge(SQUASH)` 또는 이미 clean이면 `mcp__github__merge_pull_request(squash)` 직접.
5. **머지 후**: main fetch → 로컬에 pull → `npm run build` 1회 재실행. 빌드 OK + 변경된 코드가 main HEAD에 반영됨을 1줄로 보고.

### 7단계. 보고 (~2분)

사용자에게 다음을 1줄씩 보고하고 종료:
- 사이클 소요 시간 (분 단위)
- 6단계 게이트 통과 여부 (분석 ✓ / 기획 ✓ / ... )
- PR URL + 머지 sha
- 다음 사이클(`/daily`)에서 주목할 잠재 이슈

## 금지 사항

- **6단계 게이트 중 하나라도 transcript 증거 없이 스킵** — 즉시 사용자에게 보고하고 멈춘다. 빠진 단계를 채워야 사이클 종료.
- **3-5분 만에 사이클 종료** — 거의 항상 단계 스킵의 결과. 최소 20분 이상이 정상.
- 1 파일 초과 / 30 LOC 초과 변경 → 그건 `/weekly` 또는 사용자 합의 후
- 새 페이지 *대량* 자동 생성 (예: 카드뉴스·daily-briefing 신규 카테고리) — 1개 정도의 단발 페이지는 (d)에서 허용
- `docker-compose.yml`, `Dockerfile`, `.github/workflows/*`, `nginx*` 등 인프라 파일 — 인프라는 항상 사용자 수동 검토
- 의존성 추가·업그레이드 — 위클리에서만
- `data/insider-case-history.json` 사람 큐레이션 데이터 — 절대 자동 편집 금지
- 머지 후 *추가* 작업 — 매일은 한 번만
- **측정 불가능한 변경** — (d) growth 실험은 PR에 측정 방법이 없으면 채택 금지

## 자동화 권장

```text
# 옵션 A — 8시간마다 사이클 (하루 3회). 세션 살아 있을 때.
/loop 8h /daily

# 옵션 B — /goal과 결합. 6단계 게이트 transcript 증거 + PR 머지/PASS까지 자가 지속.
/goal "오늘의 /daily 사이클을 완결한다 — transcript에 [분석][기획][개발][보완][테스트][배포] 6단계 증거가 각각 1줄 이상 surface 되고, 최종적으로 PR 머지 또는 (e) PASS 결정이 보고됨."

# 옵션 C — 두 가지 결합 (권장)
/loop 8h /daily
```

세션이 꺼져도 동작해야 하면 GitHub Actions cron으로 옮기되 그건 별개 작업.

## 비용

LLM 호출 합계 약 $0.3-1.0 (탐색 + 코드 작성 + 6단계 게이트 출력). PASS면 $0.1.
