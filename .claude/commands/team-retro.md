---
description: 격주 스킬 회고 ritual — 지난 14일 PR 의 hat 결과·sub-agent 호출 비용·머지 후 발견 결함을 분석해 1-3개 skill 개선 PR 제안. 코드가 아니라 *코드를 만드는 팀* 을 발전시킨다.
---

EconPedia 시니어 팀의 *회고 미팅(retrospective)*. /daily, /weekly 가 프로덕션을 발전시킨다면 /team-retro 는 그 두 스킬 자체를 발전시킨다.

> 호출 빈도: **격주 토요일 17:00 KST** 권장.
> 자동화: `/loop 14d /team-retro` 또는 GitHub Actions cron.
> 비용: 약 $3-7/회 (PR diff 다수 + 분석 + 1 PR 작성).
> 소요: 60-90분.

## 절차

### 1단계. [데이터 수집] 지난 14일 PR 목록 (~10분)

```bash
git log --since="14 days ago" --pretty=format:"%h %ad %s" --date=short --no-merges | head -50
```

또는 GitHub MCP:
```
mcp__github__list_pull_requests(state=closed, sort=updated, direction=desc, perPage=30)
```

각 PR 에 대해 transcript 에 추출:
- PR 번호 + 제목 + 머지 일자
- hat 결과 (PR 본문에서 추출): `[PM]/[TL]/[FE]/[BE]/[SEC]/[DA]` 의 PASS/NEEDS-FIX/BLOCK/N-A
- sub-agent 호출 여부 + 결과
- 머지 후 follow-up PR 존재 여부 (revert, fix, "PR #N 보완" 키워드)

`[RETRO.data]` 마커로 표 정리:

```
| PR # | 제목 | PM | TL | FE | BE | SEC | DA | follow-up |
|---|---|---|---|---|---|---|---|---|
| #19 | UTM tracking | PASS | PASS | N-A | PASS | N-A | N-A | - |
| #22 | Whale CTA | PASS | PASS | PASS | N-A | N-A | N-A | #25 (funnel 보완) |
| ... | | | | | | | | |
```

### 2단계. [패턴 분석] 4 카테고리 (~15-20분)

#### A. Hat-level 분석 — `[RETRO.hats]`
- 어떤 hat 이 NEEDS-FIX 비율 ≥30%인가? → 거절 조건이 너무 빡빡 vs 결함이 실제로 많음
- 어떤 hat 이 항상 PASS 인가? → 거절 조건이 너무 느슨할 가능성
- 어떤 hat 이 자주 N/A 인가? → 트리거 정의가 코드베이스와 어긋났을 수도

#### B. Sub-agent 비용/효용 — `[RETRO.subagents]`
- `security-reviewer` / `data-validator` 호출 횟수
- BLOCK 판정 비율 → 너무 낮으면 트리거 과도, 너무 높으면 미작동
- 호출당 비용 vs 잡아낸 결함 가치

#### C. Gate 갭 (가장 중요) — `[RETRO.gap]`
- 머지 후 발견된 결함 list (revert / follow-up fix / 사용자 비판 / 본 retro 에서 발견)
- 그 결함이 어떤 hat 이 catch 했어야 했는가
- 그 hat 의 체크리스트에 무엇이 빠졌는가

#### D. 시간 budget 정확도 — `[RETRO.time]`
- /daily 실제 평균 소요 vs 선언된 ≥20분
- /weekly 실제 평균 vs 선언된 ≥60분
- 단축됐다면 자동화 vs 스킵

### 3단계. [개선 후보] 1-3개 (~15분)

각 후보는 `[RETRO.candidate-N]` 마커로 다음 형식:

```
[RETRO.candidate-1]
- 영역: [PM/TL/FE/BE/SEC/DA/구조] 중 1개
- 데이터 근거: "PR #X, #Y, #Z 에서 [FE] 다크모드가 모두 미검증으로 머지됨"
- 가설: "체크리스트에 '다크모드 시각 스크린샷 1장 요구' 추가 시 NEEDS-FIX 비율 N% ↓ / 실제 결함 발견율 ↑"
- patch: .claude/commands/<file>.md 또는 .claude/agents/<file>.md 의 구체 줄 수정 (diff 형식)
- 예상 효과: 다음 2주 cycle 의 어떤 지표가 어떻게 움직이나
- 위험: 거짓 양성 ↑ 또는 비용 ↑ 가능성
- 비용 변화: 사이클당 $±N
```

**금지**: "전체 리팩토링" 또는 "새 hat 추가" 같은 큰 변경 → 별도 사용자 결정 필요. /team-retro 는 *작은 진화* 만.

### 4단계. [사용자 확인] (~10분)

후보 1-3개를 transcript 에 명시적으로 제시 → 사용자가 1-3개 선택. 동의 없으면 멈춤 + history 에만 기록.

### 5단계. [구현] 1 PR (~15-20분)

선택된 candidate 를 `.claude/commands/*.md` 또는 `.claude/agents/*.md` 에 적용. 1 PR 로 묶음 (≤ 3 파일, ≤ 200 LOC).

PR 본문 필수 항목:
- 1단계 데이터 테이블 인용
- 2단계 패턴 분석 surface
- 3단계 채택된 candidate 의 가설·patch·예상 효과
- 다음 2주 cycle 에서 측정할 지표 1-2개

### 6단계. [배포] draft → ready → merge (~5분)

`mcp__github__create_pull_request` (draft) → `update_pull_request(draft: false)` → CI 통과 후 `merge_pull_request(squash)` 또는 `enable_pr_auto_merge(SQUASH)`. 머지 후 main 빌드 재확인.

### 7단계. [기록] history 저장

`ops/improvement-loop/state/history/YYYY-MM-DD-team-retro.md` 에 다음 커밋:

```markdown
# Team Retro — YYYY-MM-DD

## 분석한 PR (14일치)
<표>

## 발견 패턴
<RETRO.hats / subagents / gap / time 인용>

## 채택된 candidate
- candidate-N: <요약> → PR #M

## 다음 retro: YYYY-MM-DD (14일 후)
```

이 파일은 다음 retro 의 *진화 기록* 으로 쓰임 — 과거 candidate 의 가설이 실제로 맞았는지 측정.

## /goal 권장

```text
/goal "이번 /team-retro 사이클을 완결한다 — transcript 에 [RETRO.data] 표 +
[RETRO.hats][RETRO.subagents][RETRO.gap][RETRO.time] 4 카테고리 분석 +
1-3개 [RETRO.candidate-N] 후보 + 사용자 confirm + skill .md 변경 PR 머지 +
history/team-retro.md 커밋."
```

## 자동화 권장

```text
# 옵션 A — 격주 자동 호출
/loop 14d /team-retro

# 옵션 B — /goal 결합
/loop 14d /team-retro
# 각 호출 안에서 위 /goal 조건이 자동 적용
```

GitHub Actions cron 으로 옮길 시 `.github/workflows/team-retro.yml` 별도 작업.

## 금지 사항

- **같은 cycle 안에서 프로덕션 코드 변경** — 회고는 *skill 변경만*. 프로덕션은 /daily, /weekly 의 일.
- **후보 0개로 끝내기** — 데이터 분석은 항상 1개 이상 개선 후보를 도출. "다 잘 됐어요" 는 안일함의 신호.
- **새 hat 또는 새 sub-agent 추가** — 큰 변경은 사용자 직접 합의 (별도 ad-hoc 작업).
- **사용자 미확인 자동 적용** — 4단계 사용자 confirm 없이 5단계 진입 금지.

## 비용

LLM 합계 약 $3-7 (PR diff 다수 + 분석 + PR 1개 작성). 격주 = $6-14/월.
