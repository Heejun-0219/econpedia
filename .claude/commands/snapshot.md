---
description: Free production-state snapshot (no LLM calls). Light enough to loop frequently, e.g. `/loop 1h /snapshot`.
---

EconPedia 프로덕션 상태 스냅샷 1개를 캡처합니다. LLM 호출 없음 (무료).

```bash
npm run loop:snapshot
```

산출물: `ops/improvement-loop/state/history/YYYY-MM-DD-snapshot.md`

수집되는 것:
- 코드베이스 메트릭 (파일 수, Astro 페이지 분류)
- Git: 최근 30일 커밋 수, 최근 20개 커밋
- GitHub: 열린 이슈/PR (gh CLI 사용 가능 시)
- `state/kpis.json`, `state/goals.json` 현재 값

이후 할 일:
1. 같은 날짜 스냅샷이 이미 있으면 *덮어씁니다* — 그 점에 유의.
2. 스냅샷을 읽고 *지난번 대비* 어떤 KPI/카운트가 의미 있게 움직였는지 한 줄로 보고합니다.
3. 의미 있는 변화가 있으면 사용자에게 `/improvement-cycle`을 권합니다. 아니면 조용히 종료.

루프 사용 권장 주기:
- `/loop 1h /snapshot` — 활성 sprint 기간 KPI 추이 체크
- `/loop 6h /snapshot` — 평상시
- `/loop 7d /improvement-cycle` — 풀 사이클 (LLM 비용 발생)
