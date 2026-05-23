# Tech Radar — 2026-05-23

Sprint focus: whale→wallet 전환 퍼널 강화 + API 보안 하드닝

---

## 1. Resend 이메일 태그/세그먼트 API (★ 채택 검토)

**무엇**: Resend v3 Contacts API의 `tags` 필드 — 구독자를 whale, wallet, telegram 등 소스별로 세분화.

**왜 지금**: WhaleFollow 컴포넌트(PR #68) 도입으로 whale 유입 구독자가 생긴다. 현재 모든 구독자가 동일 audience에 섞여 "whale 유입 → wallet 전환율"을 측정할 수 없다.

**도입 비용**: `addContact` 함수에 `tags: ['whale']` 파라미터 추가, ~5 LOC. Resend Pro 플랜 필요 여부 확인 필요 (현재 Free는 태그 미지원 가능).

**위험**: Resend 플랜 업그레이드 비용 (Free → Pro $20/월). 대안: `first_name`에 `whale_` prefix로 수동 세그먼트.

---

## 2. Supabase Edge Functions — poll/wallet 영구 저장 (★ 다음 sprint 검토)

**무엇**: `api/server.js`의 in-memory + 파일 기반 polls/wallets 데이터를 Supabase 테이블로 완전 이관. 현재 P1 잔존 항목.

**왜 지금**: PR #69로 파일 기록 무결성은 개선됐지만 SIGKILL 시 30초 이내 변경분 유실 위험은 여전히 존재. wallet_authenticated_users north star 달성을 위해 데이터 신뢰도가 중요해짐.

**도입 비용**: Supabase `polls` 테이블 마이그레이션 SQL + server.js poll read/write 리팩터 (~100 LOC). 별도 sprint 1개 분량.

**위험**: Supabase 지연 시 poll 응답 latency 증가 (현재 in-memory는 즉시). Read cache 레이어 필요.

---

## 기각 후보 (이번 sprint 범위 아님)

| 후보 | 기각 이유 |
|---|---|
| LLM 모델 업그레이드 (Opus 4.7) | improvement-loop 비용 증가. 현재 API 키 없어 측정 불가 |
| Chart.js → Observable Plot | 현재 WhaleChart 충분히 작동. 교체 비용 대비 가치 낮음 |
| RSS Feed 자동 생성 | 백링크 전략이나 north star 직접 연결 약함. 3순위 |
