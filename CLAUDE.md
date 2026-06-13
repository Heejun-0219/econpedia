# CLAUDE.md — EconPedia

이 파일은 Claude Code(또는 Claude API 기반 에이전트)가 이 저장소에서 작업할 때 알아둘 필수 컨텍스트입니다.

## 프로젝트 개요

EconPedia는 1인 운영 한·미 시장 분석 사이트. Astro static build + Nginx + 소규모 Node API (`api/server.js`) + Supabase Auth/DB + 매일 cron으로 돌아가는 AI 콘텐츠·내부자 거래(Whale Alert) 자동 발행 파이프라인. 도메인 `econpedia.dedyn.io`. 배포는 GHCR 이미지를 OCI VM에 SSH로 docker-compose pull.

## 주력 기능 (집중할 곳)

**🐋 Whale Alert (insider trading pipeline)** — `scripts/scan-whale-activity.js` (SEC Form 4 + DART) → `.whale-signals.json` → `scripts/generate-whale-analysis.js` (Claude/Gemini 분석 + 후행 가격 + 유사 사례 매칭) → `src/pages/whale/<slug>.astro` + Telegram 푸시.

이게 EconPedia의 진짜 product. 다른 자동 생성 콘텐츠(daily briefing, blog, card news)는 SEO 보조 수단이지 본질이 아님.

## 작업 시 원칙

1. **본질에 집중**: 110+ 자동 생성 페이지 vs Whale Alert 1개 — 후자에 10배 베팅. 새 기능을 추가하기 전에 *지울 수 있는가* 먼저 묻기.
2. **가짜 지표 절대 금지**: `api/server.js`에 fabricated `openRate`, `course_completions`, `rating` 같은 코드가 있음 → 발견 시 즉시 제거하거나 "예시" 라벨 명시. 사용자에게 노출되는 모든 숫자는 실측치이거나 명백한 disclaimer 필요.
3. **환각 방지**: AI가 생성하는 모든 콘텐츠(특히 Whale Alert)는 (a) 외부 공시 데이터, (b) 큐레이션된 화이트리스트(`data/insider-case-history.json`), (c) Yahoo Finance에서 직접 조회한 가격 — 셋 중 하나에 근거해야 함. "내재 지식" 인용 금지.
4. **인프라 변경은 신중히**: `docker-compose.yml`이 OCI 한 대에 올라가 있고 staging 없음. main 푸시 = prod. 큰 변경은 항상 PR + 수동 검증.

## 알려진 P0/P1 결함 (수정 우선순위)

> 2026-06-12 기준 (weekly cycle 2). Sprint Focus: Whale = The Product (W1 front door · W3 distribution · W5 compliance).

- **P1 잔존 (완화됨)**: `api/server.js` in-memory poll/wallet 데이터 — PR #69로 atomic write 적용, SIGKILL 시 30초 이내 변경분 유실 위험은 잔존. Supabase 직접 저장 전환 권고 (다음 sprint 후보).
- **관찰**: `src/pages/wallet.astro` gasoline 타격감 계산에 `* 0.5` 추산 계수 — Opinet 출처 주석 추가 완료.
- **다음 growth 검증 단계 (W3, tech-radar 2026-06-12 항목 1)**: 머지된 `/whale/rss.xml` (PR #125) 을 IFTTT/RSSHub aggregator 에 등록 → 14 일 referrer 1건 이상 측정. *사용자 직접 행동* (10분), 코드 0. 측정 후 다음 weekly 의 KPI delta 평가.
- **다음 growth 우선순위 (W3 distribution wedge, 미실행)**: Telegram `/invite` 친구 초대 슬롯 + referral UTM (tech-radar 2026-06-10 항목 1). 1-1.5 sprint, *사용자 컨펌 후* 착수 (incentive 설계 결합).
- **다음 defensive 우선순위 (W1/W2 reliability)**: SEC EDGAR polling 주기 단축 (16h cron → 15분 polling, tech-radar 2026-06-10/2026-06-12 항목 2). scan/analyze 분리 + idempotency 가드 선행. backend-only, 사용자 결정 불필요. **다음 weekly 후보**.
- **잔존 W5/W2 compliance**: 일부 슬러그 페이지가 출처 라벨만 있고 클릭 가능 EDGAR/DART URL 없음. PR #113/#115/#116/#117/#118/#119/#120/#121/#122/#124/#126 누적 backfill — 11/62 진척, **48/62 잔존**. 다음 defensive 후보 (RSS distribution 보충 채널).
- **장기 P1**: Supabase Edge Functions poll/wallet 영구 저장 전환 (별도 sprint 1개 분량).

**해결 완료 항목** (참고용):
- ~~/whale/rss.xml 외부 distribution 채널 부재~~ → PR #125 (Astro static endpoint, 50 latest items, BaseLayout `<link rel="alternate">` 전역)
- ~~snapshot whale_alert_pages 카운터 drift (62 vs 60 vs 61)~~ → PR #111 (manifest-based count + index 제외)
- ~~pre-pivot orphan `whale-20260423-MXF.astro` 검색 인덱스 노출~~ → PR #111 (noindex)
- ~~홈에 actual whale signal 카드 surface 없음~~ → PR #110 (latest 3, hero 직하)
- ~~P0: `POLLS_FILE`/`WALLETS_FILE` 미정의~~ → PR #18
- ~~P0: TimeAttackLounge `full_name` XSS~~ → HTML escaping 적용
- ~~P0: `/api/track`, `/api/analytics`, `/api/poll/*`, `/api/wallet-subscribe` 레이트리밋 없음~~ → PR #30, #36
- ~~P0: `/api/og/wallet` Puppeteer 인스턴스 per request~~ → PR #33 (싱글턴 + 동시 상한)
- ~~P1: `docker-entrypoint.sh` 이중 supervisor~~ → PR #37 (지수 백오프)
- ~~P1: fabricated `openRate`/`course_completions`/`rating`~~ → PR #21 (완전 제거)
- ~~P1: `parseBody` 크기 제한 없음 + DELETE /api/subscribe rate limit 누락~~ → PR #69
- ~~P1: flushStats 비원자적 파일 쓰기~~ → PR #69 (atomicWriteJSON)

## Self-Improvement Loop

진단·합성 루틴이 `ops/improvement-loop/`에 있음. 로컬에서:
```bash
npm run loop:snapshot         # 무료 — LLM 호출 없음. 시간/일 단위 가능
npm run loop:daily            # 매일 — Sonnet 4.6, chief of staff가 오늘의 1-action ($0.05)
npm run loop                  # 주간 — Opus 4.7로 풀 사이클: snapshot + 3 critique + synthesis (~$1.5-3.0)
```

Claude Code routine 권장:
- `/loop 1d /daily` — 매일 09:00 KST 자동 호출
- `/loop 7d /improvement-cycle` — 주간 풀 사이클

자세한 사용법: `ops/improvement-loop/README.md`.

산출물(`ops/improvement-loop/state/history/`)을 작업 시작 전에 읽으면 현재 우선순위 파악에 도움됨.

## 개발 명령

```bash
npm install         # 의존성 설치
npm run dev         # localhost:4321
npm run build       # ./dist 정적 빌드 (≈ 110 pages, ~6s)
npm run preview     # 빌드 결과 로컬 프리뷰
```

빌드 실패 = 배포 차단. CI는 `.github/workflows/ci.yml` — 현재 lint·test 없음. 변경 후 항상 `npm run build` 확인.

## 환경 변수 (.env)

- `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` — 빌드 ARG로도 들어감 (이미지에 박힘)
- `RESEND_API_KEY`, `RESEND_AUDIENCE_ID` — 뉴스레터
- `GEMINI_API_KEY` — 콘텐츠 생성 + improvement-loop 폴백
- `ANTHROPIC_API_KEY` — improvement-loop 1차 사용 (있으면 prompt caching)
- `DART_API_KEY` — 한국 공시 스캔
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_OWNER_ID`
- `BLOGGER_*` — 외부 자동 발행

## 커밋 컨벤션

- `feat(scope): ...` 신규 기능
- `fix(scope): ...` 버그 수정
- `chore(loop): ...` improvement-loop가 만드는 자동 커밋
- `docs: ...` 문서만

PR은 항상 draft로 시작. CI 통과 후 ready로 전환. main에 직접 푸시 금지.
