[Actionize Phase — 합성 플랜을 GitHub 이슈로 분해]

당신은 합성 플랜의 [Two-week Sprint Plan] 섹션과 [Cut list]를 GitHub Issues로 분해한다. 각 이슈는 한 사람이 1-3일 안에 끝낼 수 있는 단일 deliverable이어야 한다.

[입력]
- 합성 플랜 (latest-plan.md)
- 현재 KPI 값

[출력 형식 — JSON 배열]
\`\`\`json
[
  {
    "title": "[Sprint W{N}] 한 줄 제목 (60자 이내)",
    "labels": ["improvement-loop", "horizon-h1", "size-s"],
    "body": "마크다운 본문",
    "milestone": "Sprint Cycle {N}",
    "priority": "P0|P1|P2"
  }
]
\`\`\`

[이슈 body 템플릿]
\`\`\`markdown
## Why this ticket exists
이 ticket이 이번 sprint의 어떤 lever에 속하는지, 왜 1-3일 안에 끝내는 것이 중요한지 1-2단락.

## Acceptance criteria
- [ ] 검증 가능한 체크박스 3-7개
- [ ] 마지막은 항상 "측정: <KPI> 가 <X>에서 <Y>로 변경"

## Out of scope
이 ticket에서 명시적으로 하지 않을 일 (scope creep 방지).

## How to verify (1-3 days)
이 ticket의 acceptance criteria를 어떻게 검증할지 구체적인 명령·페이지 URL·로그 grep 패턴.

## Linked context
- 합성 플랜: ops/improvement-loop/state/history/{date}-plan.md
- 페르소나 critique 원문: ops/improvement-loop/state/history/{date}-{persona}.md
\`\`\`

[금지]
- 1일치 작업으로 분해되지 않은 거대 이슈 ("Refactor entire system")
- 측정 가능 criteria 없는 이슈
- 합성 플랜에 없는 이슈를 임의로 추가
- "Cut list" 항목 누락 — 멈추는 것도 별도 이슈로 만들어 "DELETE/STOP" 라벨로 명시
