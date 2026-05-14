---
description: 매일 아침 30초 — chief of staff가 어제→오늘 delta를 보고 오늘 단 하나의 1-action을 짚는다. Combine with `/loop 1d /daily` to make it a real daily habit.
---

EconPedia daily 루틴 1회 실행.

```bash
npm run loop:daily
```

[수행 내용]
1. 오늘 스냅샷 캡처 (`ops/improvement-loop/state/history/YYYY-MM-DD_HH-MM-snapshot.md`)
2. 12시간 이상 이전의 직전 스냅샷이 있으면 그것과 24h delta 계산
3. 가장 최근 합성 플랜(`*-plan.md`)을 컨텍스트로 로드 (없으면 "먼저 /improvement-cycle 1회 권장" 안내)
4. 최근 24h 커밋·닫힌 PR을 함께 본 chief of staff 페르소나가 1페이지 출력:
   - 막힘 (있을 때만)
   - 어제 → 오늘 (24h delta)
   - 합성 플랜 진척 1줄
   - **오늘 단 하나 (1-action)**

[모델·비용]
- `claude-sonnet-4-6` + effort=medium (daily 빈도라 Opus는 과함)
- 1회 ~$0.05 (Anthropic) / 무료 (`GEMINI_API_KEY` 폴백)
- 약 30-60초 소요

[Claude Code 루틴으로 매일]
```text
/loop 1d /daily
```

매일 같은 시간에 자동 호출. `1d` 인터벌은 KST 09:00 (00:00 UTC) 기준이 권장.

[출력물]
- `ops/improvement-loop/state/history/YYYY-MM-DD_HH-MM-daily.md`
- 마지막에 첨부된 JSON 블록(`today_one_action`, `tracking_kpi`, `tracking_kpi_target_eod`, `verify_at`)은 내일 daily가 자동으로 약속 vs 실제를 비교하는 데 사용됨.

[다음 할 일]
이 커맨드 결과의 "**오늘 단 하나 (1-action)**" 한 줄을 사용자에게 강조해 보여주고, 그 액션을 지금 바로 시작할지 물어보세요. 사용자가 "지금 시작"이라고 답하면 그 액션을 todo로 추가하고 첫 단계를 같이 실행합니다.
