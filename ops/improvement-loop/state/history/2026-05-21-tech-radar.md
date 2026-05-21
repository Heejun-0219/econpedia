# EconPedia Tech Radar — 2026-05-21

이번 사이클 Focus: whale→wallet 퍼널 전환율 측정 + `wallet_authenticated_users` 실측 파이프라인

---

## 후보 1: Supabase 직접 쿼리 — snapshot.mjs KPI 연동

**무엇**: `scripts/improvement-loop.mjs`의 snapshot 함수에서 Supabase `user_settings` 테이블 row count를 직접 조회하여 `kpis.json`의 `wallet_authenticated_users`를 null→실측값으로 채운다. `api/server.js`의 `/api/stats`가 이미 동일한 쿼리(`from('user_settings').select('*', { count: 'exact', head: true })`)를 구현하고 있어 패턴 검증 완료.

**왜 지금**: 북극성 지표가 3주째 null. snapshot이 실행될 때마다 자동으로 채워지면 개선 루프의 모든 critique가 실측 데이터 기반으로 바뀐다. `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`가 이미 `.env`에 있고 `@supabase/supabase-js`도 설치됨 → 추가 의존성 없음.

**도입 비용**: 개발 1-2시간. `improvement-loop.mjs` snapshot 함수에 ~15 LOC 추가. Supabase anon key는 `user_settings` RLS 정책이 service role을 요구할 경우 `SUPABASE_SERVICE_ROLE_KEY` 추가 필요(신규 env 변수 1개).

**위험**: Supabase RLS가 anon key로 count를 허용하지 않으면 0이 반환됨. `head: true` 쿼리는 RLS를 우회하지 않으므로 service role key 또는 별도 RPC 함수 필요 가능성 50%.

**결정 필요 시점**: 다음 sprint 1순위. wallet_authenticated_users가 null인 한 퍼널 최적화 의사결정이 불가능. 지금 바로 도입해야 함.

---

## 후보 2: Plausible Analytics (self-host) — whale→wallet 퍼널 이벤트 추적

**무엇**: 경량 오픈소스 웹 애널리틱스. Plausible의 `goal` 기능으로 커스텀 이벤트(`whale_cta_click`, `wallet_signup_start`, `wallet_signup_complete`)를 추적하면 whale 페이지별 CTA 전환율을 정확히 측정할 수 있다. GDPR 준수, 쿠키 없음, 스크립트 ~1KB.

**왜 지금**: TradeCTA를 34개 whale 페이지에 추가했지만 실제 클릭율·전환율을 측정할 수단이 없다. `utm_source=whale&utm_medium=tradecta` UTM은 GA 없이는 추적 불가. Plausible self-host는 OCI VM에 Docker 컨테이너로 추가 가능(기존 docker-compose.yml 확장).

**도입 비용**: 개발 4-6시간. OCI VM에 Plausible Docker 컨테이너 추가, `docker-compose.yml` 수정, whale 페이지 JS에 이벤트 훅 추가. Plausible Community Edition 무료(셀프호스트). OCI VM 추가 메모리 ~200MB.

**위험**: OCI VM이 1대뿐이므로 메모리 압박 시 컨테이너 경합 가능. 프로덕션 `docker-compose.yml` 수정 = prod 변경 → 사용자 합의 필수. `wallet_authenticated_users` = 0인 지금 설치보다 100명 이상이 된 뒤가 더 ROI 높음.

**결정 필요 시점**: `wallet_authenticated_users` ≥ 50명 이후. 현재는 후보 1(Supabase 직접 쿼리)로 북극성 측정 먼저.

---

*조사 방법: 코드베이스 분석 (`api/server.js`, `scripts/improvement-loop.mjs`, `src/components/TradeCTA.astro`) + 공식 문서 참조. 선정 기준: 이번 사이클 Focus(whale→wallet KPI 측정)와 직접 연결되고 LOC·인프라 변경 최소인 순서.*
