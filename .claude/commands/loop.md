---
description: Run one EconPedia self-improvement cycle (snapshot → 3 expert critiques → McKinsey synthesis)
---

EconPedia self-improvement loop를 한 사이클 실행합니다.

[프로세스]
1. `ops/improvement-loop/state/kpis.json`을 먼저 사람이 가능한 만큼 채워 주세요 (null 값들). 자동 수집 안 되는 값(Search Console, GA 등)은 직접 입력.
2. 환경변수 확인: `ANTHROPIC_API_KEY` 또는 `GEMINI_API_KEY` 중 하나는 설정되어 있어야 합니다.
3. 다음 명령으로 한 사이클 실행:

```bash
npm run loop
```

[수동 단계별 실행]
- `npm run loop:snapshot` — 프로덕션 상태만 캡처 (LLM 호출 없음, 무료)
- `npm run loop:critique -- --persona musk` — 한 페르소나만
- `npm run loop:synthesize` — 오늘자 critique 3개를 매킨지 플랜으로 합성
- `npm run loop:actionize` — 플랜을 GitHub 이슈 JSON으로 분해 (stdout)

[산출물]
- `ops/improvement-loop/state/history/YYYY-MM-DD-snapshot.md`
- `ops/improvement-loop/state/history/YYYY-MM-DD-musk.md` (및 mckinsey, munger)
- `ops/improvement-loop/state/history/YYYY-MM-DD-plan.md`

[다음 할 일]
사이클이 끝나면 today's `*-plan.md`의 "## Two-week Sprint Plan" 섹션을 함께 검토하고, "## Decision: This Cycle's Focus"가 합당한지 사용자에게 확인하세요. 동의하면 `npm run loop:actionize`로 이슈로 분해하고, `gh issue create`로 발행할지 묻습니다.

자동 GitHub Actions 주간 실행은 매주 월요일 22:00 UTC. 수동 트리거: Actions → "🔁 Self-Improvement Loop" → Run workflow.
