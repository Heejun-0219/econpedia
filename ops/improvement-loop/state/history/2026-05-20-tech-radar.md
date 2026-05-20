# EconPedia Tech Radar — 2026-05-20

이번 사이클 Focus: Whale → wallet 퍼널 전환 + Puppeteer OOM 방어

---

## 후보 1: @vercel/og (Satori + resvg) — Puppeteer 대체 OG 이미지 생성

**무엇**: HTML/CSS → PNG 변환을 Headless Chrome 없이 순수 JS(Satori) + Rust(resvg)로 처리.
npm weekly ~300k. Vercel, Astro, Cloudflare Workers에서 공식 사용.

**왜 지금**: Puppeteer 싱글턴 패턴으로 OOM 위험을 줄였지만, 브라우저 프로세스 자체(~200MB)가 상주한다.
OCI VM 메모리가 제한된 1인 운영 환경에서 장기적으로 컨테이너 재시작 위험이 남는다.
`@vercel/og`는 메모리 ~5-10MB, 응답 ~100ms, Puppeteer 대비 20-50배 빠름.

**도입 비용**: 개발 2-3시간. `puppeteer` 의존성 제거 가능. OG 템플릿을 JSX 스타일로 재작성 필요.
런타임 비용 없음. 한글 폰트 `Pretendard` 미리 로딩 필요 (~500KB 1회).

**위험**: JSX 렌더러가 복잡한 CSS(gradient, clip-path)를 지원하지 않을 수 있음. 현재 OG 템플릿 복잡도 검증 필요.
기존 `Cache-Control: immutable` 캐시 정책은 그대로 유지 가능.

**결정 필요 시점**: Puppeteer 싱글턴 안정화 확인 후 (다음 사이클). 지금 당장은 선행조건 먼저.

---

## 후보 2: Supabase Realtime → 브라우저 push 알림 (wallet activation)

**무엇**: Supabase의 Postgres Changes + Broadcast 기능으로, 새 whale signal 발행 시
로그인한 wallet 유저 브라우저에 Web Push Notification 전송.

**왜 지금**: 현재 whale → wallet 퍼널은 CTA 클릭에 의존함 (수동). 로그인 유지 유저에게
알림을 직접 push하면 재방문율을 높여 `wallet_authenticated_users` 활성화 촉진.
Supabase Realtime은 이미 `TimeAttackLounge`에서 사용 중 → 추가 SDK 불필요.

**도입 비용**: 개발 3-4시간. 브라우저 Notification API permission request 로직 추가.
Service Worker 등록 필요 (Astro static build에서 가능). Supabase 요금 변동 없음.

**위험**: Safari iOS의 Web Push 지원 불완전 (iOS 16.4+ 에서만 가능). 퍼미션 거부율 높을 수 있음.
Supabase Realtime concurrent connection 무료 플랜 제한(500 connections) 확인 필요.

**결정 필요 시점**: wallet_authenticated_users 실측값 확보 후 (퍼널 분석 선행). 현재 north star = 0 상태에서 push 알림 최적화는 시기상조. 50명 이상이 된 뒤 도입.

---

*조사 방법: 코드베이스 분석 + 공식 문서 참조. 후보 선정 기준: 이번 사이클 Focus(Whale→wallet 퍼널 + Puppeteer 안정화)와 직접 연결.*
