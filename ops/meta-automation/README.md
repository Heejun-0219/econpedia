# Meta-Automation — Pipeline Tuner + Prompt Smithy

자동화·프롬프트가 KPI를 truth source로 매주 자가 진화하는 메타 시스템.
설계 출처: `memory/project_meta_automation.md`. self-audit critique 결과를 입력으로 재활용.

## 두 트랙

| 트랙 | 스크립트 | 대상 | 빈도 | change budget |
|---|---|---|---|---|
| A — Pipeline Tuner | `scripts/pipeline-tuner.js` | 자동화 파라미터(임계·시간·가중치) | 일요일 23:00 KST | 주 1건 |
| B — Prompt Smithy | `scripts/prompt-smithy.js` | 프롬프트 파일 | 토요일 23:00 KST | 주 1건 |

## MVP 상태 (2026-05-31)

두 스크립트는 **dry-run 진단 MVP**다. KPI 측정(G3)이 truth source인데 현재
`kpis.json`이 대부분 null이라 의미 있는 튜닝 신호가 없다. 따라서 MVP는:

1. pause.flag / change-budget / 연쇄변경 금지 가드를 먼저 평가
2. 측정 가능한 최약 신호를 식별 — 없으면 **"측정 부재 → 튜닝 불가, G3 선행"** 으로 정직하게 진단
3. 튜닝 후보가 있으면 단일 step 변경안을 dry-run 리포트로 출력 (자동 PR은 측정 정착 후)

> self-audit(2026-W22) Musk/McKinsey critique ACCEPT: "측정 없이 튜너부터 만들지 말 것".
> 그래서 MVP는 스스로 G3 미충족을 진단하고 멈추도록 설계됨 — 빈 스캐폴딩이 아니라 게이트.

## Kill-switch

- 저장소 로컬: `ops/meta-automation/pause.flag`
- 워크스페이스: `/Users/kimheejune/ad-maker/ops/meta-automation/pause.flag`

둘 중 하나라도 존재하면 두 트랙 모두 즉시 중단.

## 롤백

14일 후행 KPI 윈도우에서 기준 KPI 5%+ 하락 시 직전 버전 자동 revert (측정 정착 후 활성).

## 사용

```bash
node scripts/pipeline-tuner.js --dry-run
node scripts/prompt-smithy.js --dry-run
```
