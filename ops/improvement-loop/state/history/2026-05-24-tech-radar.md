# Tech Radar — 2026-05-24

Sprint focus: Resend whale 구독자 소스 태깅 + KPI write-back 픽스

---

## 1. Resend Tags API — whale 구독자 세그먼트 (★ 채택 완료)

**무엇**: Resend contacts API의 `tags` 필드로 whale 페이지 구독자에게 `{ name: 'whale' }` 태그 부여.

**왜 지금**: WhaleFollow 컴포넌트(PR #68) 도입 이후 whale 유입 구독자가 존재하지만 식별 불가. whale→email→wallet 전환율 측정 불가 상태.

**도입 비용**: `addContact` 함수에 `tags` 파라미터 추가, 422 graceful degradation 포함 ~20 LOC. 이번 PR에 포함.

**위험**: Resend Free plan에서 tags 미지원 시 422 → 재시도로 graceful degradation 처리됨. 데이터 손실 없음.

**결과**: 이번 sprint에 완료. Resend 대시보드에서 whale 세그먼트 필터링 가능.

---

## 2. improvement-loop kpis.json write-back (★ 채택 완료)

**무엇**: `runSnapshot()` 실행 후 `kpis.json` 파일을 runtime 실측값으로 갱신. 기존에는 snapshot markdown에만 기록되고 kpis.json은 stale 상태 유지.

**왜 지금**: `whale_alert_pages` 38 (실제 49), `wallet_authenticated_users` 항상 null — 북극성 KPI가 매 사이클 stale baseline에서 시작. improvement-loop의 critique/synthesis 품질 저하.

**도입 비용**: `runSnapshot()` 내 3 LOC 추가. 이번 PR에 포함.

**위험**: Supabase 연결 실패 시 wallet_authenticated_users는 kpis.json 기존값(null)을 보존 — 데이터 손실 없음. wallet 값이 null인 경우 다음 성공적 Supabase 조회 시 자동 갱신됨.

---

## 3. Supabase Edge Functions — poll/wallet 영구 저장 (다음 sprint 후보)

**무엇**: api/server.js의 in-memory + 파일 기반 polls/wallets를 Supabase 테이블로 이관. CLAUDE.md P1 잔존 항목.

**왜 지금**: PR #69로 atomic write 적용됐으나 SIGKILL 시 30초 이내 변경분 유실 위험 잔존. wallet_authenticated_users north star 달성을 위해 데이터 신뢰도가 중요.

**도입 비용**: Supabase `polls` 테이블 마이그레이션 SQL + server.js 리팩터 ~100 LOC. 별도 sprint 1개 분량.

**위험**: Supabase 지연 시 poll 응답 latency 증가. Read cache 레이어 필요.

---

## 기각 후보 (이번 sprint 범위 아님)

| 후보 | 기각 이유 |
|---|---|
| Resend Free → Pro 업그레이드 | graceful degradation으로 Free에서도 동작. 비용 대비 우선순위 낮음 |
| whale 6개월 follow-up 자동화 | 측정 인프라(funnel 태깅) 먼저 완성 후 고려 |
| Public RSS feed | north star 직접 연결 약함. 3순위 |
