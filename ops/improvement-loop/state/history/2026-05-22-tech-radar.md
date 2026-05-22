# EconPedia Tech Radar — 2026-05-22

이번 사이클 Focus: sticky_footer CTA 전환 측정 + API 보안 헤더 강화

---

## 후보 1: sticky_footer UTM → Supabase 전환 파이프라인

**무엇**: `utm_medium=sticky_footer` 로 /wallet 에 랜딩한 사용자가 실제로 Google OAuth 완료했는지 추적. 현재 `scripts/improvement-loop.mjs` snapshot은 `user_settings` row count만 수집하고 UTM source별 분해는 없다. Supabase `user_settings` 에 `utm_source`, `utm_medium` 컬럼을 추가하고 PR #56 의 `SIGNED_IN` 이벤트 핸들러에서 기록하면 sticky_footer vs tradecta vs banner 전환율 비교가 가능해진다.

**왜 지금**: sticky_footer CTA가 이번 sprint에 배포됐지만, 어느 CTA 타입이 실제 wallet 가입을 만드는지 데이터가 없다. `user_settings` 테이블은 이미 존재하고 PR #54/#56이 row 생성 로직을 구현했다. utm 컬럼 추가는 마이그레이션 1줄 + JS 5줄.

**도입 비용**: 2-3시간. Supabase 대시보드에서 `user_settings` 테이블에 `utm_source TEXT`, `utm_medium TEXT` 컬럼 추가(nullable). `/wallet`의 SIGNED_IN 핸들러에서 `sessionStorage`의 utm 파라미터 읽어 upsert. `scripts/improvement-loop.mjs` snapshot에서 채널별 카운트 추가.

**위험**: Supabase 스키마 변경은 prod에 직접 적용 → staging 없는 구조상 신중. nullable 컬럼 추가는 기존 rows에 영향 없어 안전.

**결정 필요 시점**: 다음 sprint 1순위. sticky_footer가 배포됐으니 측정 파이프라인이 없으면 growth bet 효과 검증 불가.

---

## 후보 2: Helmet.js → Node.js HTTP 보안 헤더 미들웨어 표준화

**무엇**: `api/server.js`는 현재 순수 Node.js `http.createServer`로 구현됐고, 보안 헤더를 `sendJSON()`에 직접 하드코딩했다. [Helmet.js](https://helmetjs.github.io/)는 Express 또는 Node HTTP 서버용 보안 헤더 미들웨어로, OWASP 권고 헤더 15종을 관리한다. 추후 헤더 추가·수정 시 중앙 관리.

**왜 지금**: 이번 sprint에 6개 헤더를 직접 추가했다. 더 추가되면 `sendJSON` 관리가 복잡해진다. Helmet은 `npm install helmet` + 3줄로 적용.

**도입 비용**: 1시간. 의존성 추가(~30KB), `createServer` 핸들러에 helmet 적용. 단, `api/server.js`가 Express 없이 순수 Node HTTP 사용 중 → Helmet을 순수 Node에 쓰려면 `helmet(req, res, cb)` 방식으로 래핑 필요(지원은 되나 Express 전용보다 복잡).

**위험**: Express 없는 환경에서 Helmet 적용은 사례가 적음. 기존 CORS 헤더와 Helmet의 헤더가 충돌할 가능성 존재. 이번 sprint에서 직접 추가한 6개 헤더가 이미 실용적 커버리지를 달성했으므로 도입 필요성이 낮아짐.

**결정 필요 시점**: api/server.js가 Express로 마이그레이션될 때. 현재 투자 대비 효과 낮음.

---

*조사 방법: 코드베이스 분석 (`api/server.js`, `src/pages/wallet.astro`, `scripts/improvement-loop.mjs`, PR #54/#56 diff) + Helmet.js 공식 문서. 선정 기준: 이번 사이클 sprint(sticky_footer CTA + API 보안 강화)와 직접 연결, LOC 최소, 인프라 변경 최소.*
