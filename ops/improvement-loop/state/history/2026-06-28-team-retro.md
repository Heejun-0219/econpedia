# Team Retro — 2026-06-28 (cadence 보호 no-op #3/3)

진짜 retro 는 2026-06-20, 다음 진짜는 2026-07-04 (6일 후). 본 호출은 14일 cadence 위반 #3 — `/team-retro` auto-trigger 중첩 누적 3회. 신규 PR 생성 없음.

## 7일 윈도우 데이터 (참고)

- **W3 UTM proliferation 폭증**: 2026-06-22 → 2026-06-28 7일간 `feat(growth/W3)` 15건, 신규 UTM source **18종** 신설 (`whale_home_latest/more`, `whale_index_card`, `whale_hero_primary/wallet`, `whale_rss_idx/feed`, `whale_wallet_idx`, `whale_postsub_wlt`, `whale_week_entry`, `whale_insider_entry/back`, `whale_nav_top/bot`, `whale_footer`, `whale_bot_tg`, `wallet_nav_top/bot`).
- **단일 24h burst (06-28)**: #234·#236·#238·#239·#240·#241 = 6 W3 PR / 1일 + #242 W5 fix.
- **누적 UTM source 총 ~50종 추정** (PR #179 top-N=50 cap 임계 도달). `GET /api/analytics/summary?window=14` 평가 0회 — *모두 측정 미실행*.
- **`</script>` literal escape**: 06-27 no-op 의 sub-pattern 추적 — 7일간 +0 (#218·#219·#220·#222 가 24h burst 였음). 누적 ≥ 3 임계 충족 (4건). candidate-4 활성화.

## 신규 패턴 강도 평가

### [RETRO.gap-intensified] W3 UTM proliferation rate vs evaluation rate

- **proliferation rate**: 15 신설 / 7일 = 2.1 신설/일
- **evaluation rate**: 0 / 7일 (CLAUDE.md 임계값 5개 그대로 미평가)
- **위험**: top-N=50 cap 에 도달 → 평가 안 된 신설이 기존 source 를 LRU 로 밀어낼 가능성. *측정 가설* 이 데이터 손실로 검증 불가능해질 수 있음.
- 본 패턴은 06-20 candidate-2 (KPI evaluation gate) 가 *예측* 한 정확한 사례. 일주일 만에 가설 검증 완료 — 채택 ROI 극대.

### [RETRO.candidate-4-ready] `</script>` escape mechanical pattern

- 4 PR (#218 BaseLayout / #219 xml-escape / #220 WhaleChart / #222 wallet) 모두 동일 형태 — `<script>` 내부 JSON literal 의 `</script>` 시퀀스 차단.
- security-reviewer agent 의 mechanical sweep 패턴: 1 PR 발견 시 **전체 set:html / JSON-LD emit 사이트** 동시 sweep 권고 lint 가능.
- 4건 burst 의 `cycle 8` 발견 → cycle 9 에 추가 site 가 발견되면 candidate-4 정식화.

## 결정 대기 (재게시 #3 — 8일째)

2026-06-20 후보 1-3 미확인:
1. **W5 backfill fast-path** — **STATUS: 무효화**. W5 backfill 61/61 완료 (PR #207, 06-21). 본 candidate archived.
2. **KPI evaluation gate** — **STATUS: 채택 시급도 ↑↑↑**. 위 [RETRO.gap-intensified] 가 가설 검증. cycle 9 weekly 진입 전 채택 강력 권고.
3. **Sub-agent NEEDS-FIX 카운터** — STATUS: pending. cost = 0, observability gain. trivial.

신규:
4. **(preview) security-reviewer sweep mode** — `</script>` escape 패턴 발견 시 전체 set:html / JSON-LD 사이트 sweep 요구. 정식 후보화는 2026-07-04 (진짜 retro) 에서 cycle 9 추가 발견 여부 확인 후.

## 다음 retro: 2026-07-04 (6일 후, 진짜 14일 cadence)

- W3 distribution 14일 KPI 첫 평가 (CLAUDE.md 임계 5개 대조) — *intensified, 더 못 미룸*
- candidate 2·3 사용자 confirm 결정 (candidate-1 archive 후 결정 부담 ↓)
- candidate-4 정식 surface 여부 결정
- cadence violation 횟수 (3 누적) → `.claude/commands/team-retro.md` cadence guard candidate 검토

## Cadence 위반 진단 (3회 누적)

위반 호출 ≥ 3 임계 도달. 2026-07-04 진짜 retro 의 [RETRO.candidate-N] 1번 슬롯에 *cadence guard candidate* 자동 포함 권고:
- `.claude/commands/team-retro.md` 1단계 진입 전 `history/*-team-retro.md` mtime 체크 → 14일 미경과 시 cadence-no-op mode 로 자동 진입 (본 파일 형식). LLM 토큰 ≈ 80% 절감.
