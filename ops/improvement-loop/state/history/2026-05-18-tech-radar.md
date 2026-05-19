# EconPedia Tech Radar — 2026-05-18

이번 사이클 Focus: 신뢰 기반 회복 (운영 안정성 + LLM 비용)

---

## 후보 1: node-persist — polls/wallets 영속화

**무엇**: 파일시스템 기반 경량 key-value store (JSON). npm weekly ~50k

**왜 지금**: P0 버그 — `POLLS_FILE`/`WALLETS_FILE` 미정의로 컨테이너 재시작 시 polls/wallets 데이터 소실.
현재 fix 방향은 단순 상수 추가(PATH 정의)이지만, node-persist는 원자적 write + 초기화 단순화 가능.

**도입 비용**: 개발 2-3시간. 런타임 비용 없음. 의존성 1개 추가.

**위험**: 분산 환경 미지원 (OCI VM 1대 → 문제 없음). 대용량 데이터 부적합 (현재 데이터 소량 → 문제 없음).

**결정 필요 시점**: P0 fix PR 검토 시 — 단순 상수 추가 vs node-persist 중 선택.

---

## 후보 2: Claude Sonnet 4.6 prompt caching (1시간 TTL)

**무엇**: Anthropic Claude API의 prompt cache TTL을 5분 → 1시간으로 연장. 캐시 hit 시 입력 토큰 90% 절감.

**왜 지금**: improvement-loop 비용 $0.5-3/cycle. Whale Alert 분석 생성 시 동일 시스템 프롬프트 반복 사용.
현재 `scripts/improvement-loop.mjs`에 ephemeral cache 구현됨 — TTL 연장만으로 비용 절감.

**도입 비용**: 개발 30분 (API 파라미터 변경). 런타임 비용 캐시 write +25% 증가, 이후 hit 시 -90%.

**위험**: API 키 미설정 시 fallback 없음 (현재도 동일). Anthropic 모델 lock-in (수용 가능).

**결정 필요 시점**: ANTHROPIC_API_KEY 환경변수 설정 후 즉시 적용 가능 (N/A — 선행조건 먼저).

---

*조사 방법: 웹 검색 (2026-04-01 ~ 2026-05-18). 후보 선정 기준: 이번 사이클 Focus(신뢰 기반 회복)와 직접 연결.*
