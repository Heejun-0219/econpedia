# Team Retro — 2026-06-20 (첫 회고)

지난 14일(2026-06-06 ~ 2026-06-20) 머지된 60개 PR 을 회고. 회고 자체는 사상 첫 사이클이므로 다음 회고(2026-07-04)에서 본 회고가 잡은 후보가 실제로 효과를 냈는지 측정한다.

## 1단계. [RETRO.data] — PR 카테고리 분포 (14일치)

| 카테고리 | PR 수 | 대표 PR |
|---|---|---|
| `fix(whale/W5)` DART/EDGAR 출처 backfill (daily) | 35 | #182, #178, #176, #175, #174, #173, #172, #170, #169, #168, #166, #162, #161, #160, #156, #155, #150, #149, #148, #144, #143, #142, #139, #135, #134, #133, #132, #131, #130, #129, #128, #126, #124, #122, #121, #120, #119 |
| `chore(loop)` snapshot artifact | 6 | #177, #171, #167, #163, #151, #123 |
| `feat(growth/W3)` distribution wedge | 8 | #164, #158, #152, #145, #140, #136, #125, #110 |
| `feat(reliability/W2)` polling/idempotency | 3 | #146, #141, #137 |
| `refactor(defensive/W6)` cap·정규화 | 4 | #179, #165, #157, #153 |
| `docs(weekly)` tech-radar | 4 | #154, #147, #138, #127 |

대표 PR 의 hat 결과 (PR 본문에서 추출):

| PR # | 제목 | PM | TL | FE | BE | SEC | DA | follow-up |
|---|---|---|---|---|---|---|---|---|
| #182 | W5 backfill (성우전자 DART) | PASS | PASS | PASS (7/7) | N/A | N/A | N/A | — |
| #179 | 정defensive sourceCounts top-N=50 cap | PASS | PASS | N/A | PASS | sub PASS | sub PASS | — |
| #164 | growth /whale/week archive | PASS | PASS | PASS | PASS | sub PASS | sub PASS | — |
| #158 | growth Article rich-result + OG meta | PASS | PASS | PASS | N/A | sub PASS | sub PASS | — |
| #157 | defensive insider-key 단일 소스화 | PASS | PASS | PASS | PASS | sub PASS | sub PASS | (#152 의 잠재 drift 사전 차단) |
| #152 | growth WhaleFollow insider-related + 홈 pill | PASS | PASS | PASS | N/A | sub PASS | sub PASS | (#157 refactor 유도) |
| #146 | reliability SEC scan 15min polling | PASS | PASS | N/A | PASS | sub **NEEDS-FIX→FIXED** (timeout-minutes) | sub **NEEDS-FIX→FIXED** (cross-runner duplicate) | — |
| #145 | growth Related Whale Alerts | PASS | PASS | PASS | N/A | sub PASS | sub PASS | — |
| #136 | growth multi-channel CTA + UTM | PASS | PASS | PASS | PASS | sub PASS | sub PASS | (#140 wallet pill 추가) |

## 2단계. 패턴 분석

### [RETRO.hats]

- **PM/TL**: 9/9 PASS — 모든 PR 본문에 가설+측정+롤백+영향범위가 있다. 거절 조건 작동 중. *하지만* PASS 만 나오면 거절 조건이 거의 검사를 안 한다는 신호일 수도 — 다음 회고에서 NEEDS-FIX 비율 추적 필요.
- **FE**: W5 backfill 35건의 `[FE] PASS (7/7)` 가 거의 *템플릿 복붙* — `<a>` 1줄 추가에 7항목 체크리스트는 tautology. (모바일 ✓ "기존 `<p>` flex 흐름 유지", 다크모드 ✓ "새 색상 하드코드 없음", 에러 ✓ "외부 fetch 없음" 등). 실제 결함 발견 0건.
- **BE**: 대부분 N/A 또는 빌드 확인 1줄. `[BE] curl 결과` 가 필요한 PR (#146) 은 curl 결과 명시되어 있다 — 적절.
- **SEC sub-agent**: 호출된 9 PR 중 8 PASS, 1 NEEDS-FIX (#146). NEEDS-FIX 가 *동일 PR 안에서 fix* 로 surface → sub-agent 가 작동했음. /weekly 의 무조건 호출 규칙이 실제로 결함을 1건 catch — ROI 정당화.
- **DA sub-agent**: 호출된 9 PR 중 8 PASS, 1 NEEDS-FIX (#146 cross-runner duplicate push) — 동일 패턴. fabricated 지표 검사 + KPI snapshot 정합성도 매 PR 0건 — 가짜 지표 재발 0.

### [RETRO.subagents]

- security-reviewer: 9회 호출, NEEDS-FIX 1회 (11%). 비용 ~$0.5 × 9 = $4.5/14d. catch 1건의 가치 = workflow timeout 누적으로 queue buildup 차단. 정당화 OK.
- data-validator: 9회 호출, NEEDS-FIX 1회 (11%). 비용 ~$0.5 × 9 = $4.5/14d. catch 1건 가치 = cross-runner duplicate Telegram push 차단. OK.
- 두 sub-agent 모두 /weekly 의 무조건 호출 규칙이 정당화됨. 다음 회고에서 NEEDS-FIX 비율 < 5% 면 조건부로 강등 고려.

### [RETRO.gap] (가장 중요)

- **머지 후 발견 결함**: 0건 (revert 0, "보완" follow-up 1건 #157 — 사전 계획 refactor 였음).
- **잠재 갭 1**: W5 backfill 의 [FE] 7-item 체크리스트가 mechanical → 진짜 결함 (예: 새 backfill 이 실수로 `<p>` 닫는 태그를 깨뜨림) 을 catch 할 능력 미확인. 14일 0건이라 위험도 낮음.
- **잠재 갭 2 (가장 큰 우려)**: 4개 growth PR (#136 06-13, #145 06-13, #152 06-14, #164 06-19) 이 14일 KPI window 를 열어둔 채 새 growth bet 가 계속 머지됨. KPI evaluation 시점 (~2026-06-27 ~ 06-28) 이 도래해도 *evaluate 강제 규칙이 없음*. 결과: 측정 안 된 실험이 쌓이면 어느 wedge 가 실제로 작동했는지 판단 불가 → CLAUDE.md *"측정 방법 없는 변경 채택 금지"* 원칙 위반 위험.
- **잠재 갭 3**: CLAUDE.md 의 "잔존 W5/W2 compliance" 가 1/day 페이스. 37/62 잔존 → 37일 소요. daily 사이클이 W5 한 가지에 *기본 옵션*화 되어 다른 선택지(보안 회고, growth d-옵션) 가 사실상 dormant.

### [RETRO.time]

- /daily 실제 평균 소요 (W5 backfill): 추정 8-12분. daily.md 의 *"최소 20분"* 미달. 이유: 1 LOC 변경 + 정적 페이지 + 7-item FE 체크 mechanical 처리.
- /weekly: 사이클 5 (#152+#153+#154) ≈ 60-75분으로 추정 — 선언 budget 준수.

## 3단계. 개선 후보

### [RETRO.candidate-1] W5 backfill fast-path (daily 효율화)

- **영역**: 구조 + [FE]
- **데이터 근거**: 14일 중 35건이 W5 backfill = 전체 PR 의 58%. 모두 `[FE] PASS (7/7)` 가 같은 7줄 tautology. 머지 후 결함 0건이지만, hat 의 *실제 가드 가치* = 0.
- **가설**: `/daily` 에 "**W5 backfill fast-path**" 명시 — diff 가 (a) 단일 `src/pages/whale/whale-*.astro` 파일 + (b) ≤ 2 LOC 추가 + (c) 추가된 텍스트가 `EDGAR` 또는 `DART` 문자열 포함이면 7-item FE 체크리스트를 **3-item shortcut** 으로 축소: ① 링크 텍스트에 `EDGAR ↗` 또는 `DART ↗` 명시 ② `rel="noopener noreferrer nofollow"` 포함 ③ 빌드 PASS. fast-path 자격 *미충족* 시 7-item 풀체크 유지.
- **patch** (`.claude/commands/daily.md` 79-95줄, `[FE]` 섹션에 fast-path 분기 추가):
  ```diff
  #### [FE] (`.astro` / `.css` / `src/components/*` / `src/layouts/*` / `src/pages/*` 변경 시)

  +**Fast-path** (W5 backfill 전용): diff 가 모두 다음을 만족하면 3-item shortcut 적용 — ① 단일 `src/pages/whale/whale-*.astro` 파일 ② ≤ 2 LOC 추가 ③ 추가 텍스트가 `EDGAR ↗` 또는 `DART ↗` 포함. shortcut 항목:
  +- [ ] 링크 텍스트: `EDGAR ↗` / `DART ↗` 명시
  +- [ ] `rel="noopener noreferrer nofollow"` 포함
  +- [ ] `npm run build` PASS
  +
  +Fast-path 자격 미충족 시 아래 7항목 풀체크로 fallback.
  +
   7항목 체크리스트 — 각 항목 ✓/✗/N-A + 1줄 근거:
  ```
- **예상 효과**: 다음 14일 W5 backfill 사이클당 5-7분 절감 → 25분 → 18분 평균. 절감된 시간 = 다음 사이클 candidate (다른 카테고리 d/e 또는 growth wedge) 검토 여유. 결함 catch 비율 변화 0 (현재 7-item 으로도 0건).
- **위험**: fast-path 가 미래 backfill PR 이 실수로 layout 깨뜨리는 경우 catch 미스 → ≤2 LOC + 단일 hunk 조건이 safety. 실수로 50 LOC 변경하면 자동 fallback.
- **비용 변화**: 사이클당 -$0.05 (FE inline 토큰 감소). 14일 -$1.75.

### [RETRO.candidate-2] /weekly 의 [PM] 사전조건 — 만료된 KPI window 우선 평가

- **영역**: [PM] (시간축)
- **데이터 근거**: cycle 4-5 (#136, #145, #152, #164) 가 14일 KPI window 4개를 동시에 열었음. CLAUDE.md 의 "W3 distribution 측정" 항목에 임계값(`whale_tg+whale_rss+... ≥ 12`, `whale_related+whale_insider ≥ 7`, `whale_wallet ≥ 1`) 까지 명시되어 있으나, *measure 강제 규칙* 이 weekly skill 에 없음. cycle 6-7 에서 #164 (whale_weekly) 가 또 KPI window 를 열었음 → 5개 누적.
- **가설**: `/weekly` 1.5단계 [PM] 진입 전에 **만료 KPI evaluation 사전조건** 추가 — `GET /api/analytics/summary?window=14` 결과를 fetch 해 14일 이상 경과한 UTM source 의 카운트를 transcript 에 surface. 임계값 달성/미달성 1줄 보고 → 미달 source 에 대해 "copy/위치 pivot" 또는 "dormant 채택" 결정을 *새 growth bet 보다 우선*. 만료 windows ≥ 2 일 때 새 growth bet *연기*.
- **patch** (`.claude/commands/weekly.md` 1.5단계 [PM] 앞에 새 sub-step):
  ```diff
   ### 1.5단계. Growth Bet — 풀 6 hat (~30-40분)

  +**[PM] 사전조건 (KPI evaluation gate)**: 새 growth bet 제안 *전*, `GET /api/analytics/summary?window=14` 호출 → 응답의 `sourceCounts` 중 14일 이상 경과한 UTM source 들을 transcript 에 surface. CLAUDE.md "W3 distribution 측정" 임계값과 대조해 1줄 평가 보고:
  +- "✓ 가설 확인: source A, B" → CLAUDE.md backlog "해결 완료" 로 이동
  +- "✗ 가설 미달: source C" → 본 사이클 *defensive* 슬롯에 copy/위치 pivot 또는 dormant 채택을 우선 candidate 화
  +- 만료 source ≥ 2 + 미평가 → 본 사이클 새 growth bet 연기, evaluation 사이클로 전환
  +
  +**[PM]** — plan 의 growth deliverable 인용 또는 새 후보 3-5개 제시 …
  ```
- **예상 효과**: 다음 2주 cycle 의 KPI feedback loop 강제 작동. 측정 0건 으로 누적되는 실험을 차단. CLAUDE.md "측정 방법 없는 변경 채택 금지" 원칙 본격 강제.
- **위험**: weekly 사이클 시간 +5-10분. evaluation 결과가 "이미 평가됨" 만 반복되면 부담만 증가 → 14일 미경과 source 는 자동 skip 으로 완화.
- **비용 변화**: 사이클당 +$0.1 (analytics fetch + 평가 추론). 주 3회 × 14일 = 6 사이클 = +$0.6 / 14d.

### [RETRO.candidate-3] /weekly 보고에 sub-agent NEEDS-FIX 카운터

- **영역**: [SEC] + [DA] observability
- **데이터 근거**: sub-agent 호출 9/9 가 transcript 에 있으나 *NEEDS-FIX 누적 카운트* 가 retroactive 추출 노력 들었음. 다음 회고가 "sub-agent ROI" 를 재평가하려면 이 데이터가 머지 시점에 명시 surface 되어야 함.
- **가설**: `/weekly` 6단계 보고 templated line 1개 추가 — `[sub-agent impact] SEC: PASS×N / NEEDS-FIX×M / BLOCK×K, DA: 동일`. 4 사이클 누적 후 NEEDS-FIX×0 이면 다음 회고에서 *조건부 강등* candidate 자동 surface.
- **patch** (`.claude/commands/weekly.md` 6단계 보고):
  ```diff
   ### 6단계. 보고 (~3분)

   - 사이클 소요 시간 (분 단위) — **최소 60분 권장**
   - This cycle's Focus (1줄)
   - **Growth bet hat 통과**: …
   - **Defensive hat 통과**: …
  +- **[sub-agent impact]**: `SEC: PASS×N / NEEDS-FIX×M / BLOCK×K` + `DA: 동일`. NEEDS-FIX 가 있으면 1줄 사유 인용.
   - Sprint 1주차 deliverable 진행 현황
  ```
- **예상 효과**: 다음 /team-retro (2026-07-04) 가 sub-agent ROI 를 즉시 평가 가능 — retroactive PR 본문 grep 없이. 4 사이클 누적 데이터 → 조건부 강등 결정 근거.
- **위험**: 최소 — pure observability 1줄 추가.
- **비용 변화**: 0 (inline 보고).

## 4단계. 사용자 확인 요청

위 candidate-1·2·3 중 1-3개 선택 또는 추가 의견. **/team-retro 의 4단계 금지 조항** 에 따라 사용자 confirm 없이 5단계(skill .md 변경 PR) 진입하지 않는다.

본 history 파일은 user 확인 여부와 무관하게 우선 커밋 — 다음 회고 (2026-07-04) 의 진화 기록 입력으로 쓰임.

## 다음 회고: 2026-07-04 (14일 후)

본 회고가 채택한 candidate 의 가설이 실제로 맞았는지 측정. 측정 지표:
- **candidate-1 채택 시**: W5 backfill 사이클 평균 소요 시간 변화 (전: 8-12분 → 목표: 6-8분), 풀체크 fallback 발생 비율.
- **candidate-2 채택 시**: KPI window evaluation 실제 실행 회수 (현: 0 → 목표: ≥ 2), pivot/dormant 결정 회수.
- **candidate-3 채택 시**: weekly 보고에 [sub-agent impact] 줄 누적 카운터 (4 cycle × 2 sub-agent = 8 데이터포인트).
