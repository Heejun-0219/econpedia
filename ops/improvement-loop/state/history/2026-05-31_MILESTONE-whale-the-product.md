# 🐋 MILESTONE 기획 — "Whale Alert = The Product (Wedge → First Revenue)"

> 승인: 사용자(2026-05-31), 7-페르소나 냉철 critique 후. 운영주체: 시니어 월가 펀드 + 시니어 메타 팀.
> 이전 마일스톤(Whale Alert Evidence Engine)은 이 마일스톤의 토대로 closed.

## 0. 왜 이 pivot인가 (냉철한 현실)

| 지표 | 현재 실측 | 의미 |
|---|---|---|
| 일평균 방문 | 8명 | 사업이 아니라 프로토타입 |
| 체류 | 27.4s | 얕음 |
| whale 페이지 방문 | 0 | 도착한 8명조차 제품에 안 닿음 |
| 수익 / 유료유저 | 0 / 0 | 검증된 수요 없음 |
| 콘텐츠 | generic 91 vs whale 62 | 본질에 분산 |
| 기존 north-star | wallet 200/90일 → **0** | 허영·조기스케일 목표 |

7명 중 6명 합의: **Whale 집중 YES, hard-delete NO, 허영/조기스케일 목표 폐기.**

## 1. 비전 (큰 그림)

**EconPedia = 한·미 리테일을 위한 "검증가능한 내부자 시그널" 단일 제품.**
모든 알럿은 (a) 공시 원문 링크, (b) 실제 트랙레코드(D+N 성과·승률), (c) 유사사례 결과로 뒷받침된다. 유저가 이미 있는 곳(Telegram)으로 전달하고, 사라지면 아쉬워할 사람들이 돈을 낸다. 모트는 공개 SEC 데이터가 아니라 **시간이 쌓는 검증 트랙레코드 데이터셋 + 배포 채널**.

## 2. 큰 Goal (90일, 대담하되 정직)

> **0 → 첫 매출 · 0 → 주간 리텐션 코호트 · 8 → 유의미한 활성 구독으로 wedge를 증명한다.**

North Star: **Weekly Retained Signal Users(WRSU)** 0 → **30** (PMF 신호).
Secondary: **첫 매출 이벤트** 0 → **1** (1-way-door, 컨펌 후).

| Bold Target (90d) | 현재 | 목표 |
|---|---|---|
| 첫 매출 이벤트 | 0 | 1 (1-way-door) |
| WRSU(주간 리텐션) | 0 | 30 |
| Telegram 7일 활성 구독 | 측정시작 | 100 |
| 신규 알럿 source-verified | 100%(#88) | 100% 유지 |
| 실 트랙레코드 Tier-1 렌더 | 0 | ≥1 |
| whale 세션 진입점 비율 | 0 | ≥50% |

대담함은 *숫자*가 아니라 **보트 태우기(generic 공장 끄고 단일 제품 베팅) + 품질 바(모든 알럿 검증)**에 있다.

## 3. 게이트 (W1–W6) & 로드맵

### W1 — Focus & Front Door  [실행 시작]
generic 생성기 OFF · 91페이지 noindex(가역) · 홈/네비/메타 Whale화.
- 측정: whale 세션 진입점 ≥50%, 홈 → whale CTR.
- 가역: noindex·redirect, hard-delete 금지.

### W2 — Evidence That Bites  [토대 구축됨 — Evidence Engine]
모든 신규 알럿 source-verified(#88) + 트랙레코드/유사사례 렌더. **킬러 아티팩트: 실 D+90/365 트랙레코드를 가진 Tier-1 insider 1명 공개.**
- 의존: 데이터 누적(빌더 #86 준비됨). 기존 페이지 provenance는 W5.

### W3 — Distribution & Wedge  [실사용자 필요]
Telegram 1차 채널화 + 주간 리텐션 측정(G3 라이브로 가능). WRSU≥30, PMF '매우 아쉬움'≥40%.
- 그로스: 친구초대 슬롯(바이럴), 푸시 타이밍 튜닝(Pipeline Tuner).

### W4 — First Revenue  [1-way-door, 컨펌 후]
첫 유료(Econ-Pro 베타, Stripe/Toss test→live) 또는 AdSense accrual(증빙). 첫-달러 우선.

### W5 — Compliance & Trust Moat  [실행]
provenance 100%(기존 페이지 포함) + disclaimer + 'win rate/따라가기' 톤다운 + 다크패턴 0. 금융 시그널 제품 생존 조건(Compliance 페르소나 high-severity).

### W6 — Reliability & Self-Evolution  [인프라 구축됨]
단일제품 의존 대비 파이프라인 reliability·graceful degradation(빈 사이트 방지) + 메타자동화 Whale 튜닝 + 주간 audit 4주.

## 4. 실행 순서 (다음 사이클들)

1. **W1 즉시(가역, 승인됨):** ① generic cron OFF, ② 비-whale noindex, ③ 홈 Whale화.
2. **W5 병행:** 기존 페이지 provenance 보강(무결성상 정확 백필만), disclaimer/톤다운.
3. **W3 측정:** WRSU·Telegram 구독 측정 라인 완성(G3 위에). 친구초대 슬롯.
4. **W2:** 데이터 누적 관찰 → 첫 Tier-1 렌더 트리거.
5. **W4:** 수익 surface 설계 → **사용자 컨펌** → test→live.

## 5. 성공 정의 (이 마일스톤 완료)
- 첫 매출 이벤트 ≥1(증빙) **또는** WRSU≥30 + Telegram 활성≥100 동시 달성, **그리고**
- 신규 알럿 source-verified 100% 유지 + ≥1 Tier-1 실 트랙레코드 렌더, **그리고**
- 다음 마일스톤(Scale-Up: 1000 구독 + MRR) 명명.

## 6. 1-way-door (사용자 컨펌 필요)
수익화 실행(가격·결제 통합·AdSense 활성), 도메인 변경(현재 비권장·유지 결정), 비가역 삭제(noindex로 대체 결정).
