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

> 2026-06-20 기준 (weekly cycle 7 종료). Sprint Focus: Whale = The Product (W1 front door · W2 reliability · W3 distribution · W5 compliance · W6 reliability self-evolution).

- **P1 잔존 (완화됨)**: `api/server.js` in-memory poll/wallet 데이터 — PR #69로 atomic write 적용, SIGKILL 시 30초 이내 변경분 유실 위험은 잔존. Supabase 직접 저장 전환 권고 (다음 sprint 후보).
- **관찰**: `src/pages/wallet.astro` gasoline 타격감 계산에 `* 0.5` 추산 계수 — Opinet 출처 주석 추가 완료.
- **W3 distribution 측정 (PR #136 + PR #145 + PR #152 + PR #164 + PR #180 후속, PR #153 + PR #179 enabler)**: 14일 후 `GET /api/analytics/summary?window=14` 의 `sourceCounts` 확인. (a) `whale_tg`+`whale_rss`+`whale_tg_home`+`whale_rss_home` 합산 ≥ 12건 = 외부 distribution 가설 확인, (b) `whale_related`+`whale_insider` ≥ 7건 = 내부 discovery 가설 확인, (c) `whale_wallet` ≥ 1건 = wallet conversion funnel 시작, (d) `whale_weekly` (PR #164) ≥ 1건 = 주간 아카이브 indexed, (e) `whale_insider_idx` (PR #180) ≥ 1건 = 인물 hub indexed (≥ 3건 = 개별 페이지 채택 신호). 미달 시 카드 위치·copy pivot.
- **W2 polling 모니터링 (PR #146 후속)**: 24-48h 동안 워크플로 timeout-minutes 14 hit 빈도 및 동일 ticker 시간당 push burst 빈도 측정. burst ≥ 1 시 push-rate guardrail (tech-radar 2026-06-13 cycle4 항목 1) 채택. cycle 7 시점: ~6일 경과, 추가 데이터 후 cycle 8-9 weekly 재평가.
- **다음 growth 후보 (W2 evidence + W1 SEO)**: `/whale/insider/<key>` 개별 인물 페이지 (cycle 5 radar #2 의 정식 본). PR #180 의 `whale_insider_idx` UTM ≥ 3건 + Tier-1 정의 사용자 합의 후 채택. 약 cycle 9-10 (2026-07-05 전후).
- **다음 defensive 우선순위 (W6 reliability self-evolution)**: Workflow queue depth alerting (≥ 3 queued 시 OWNER Telegram, tech-radar 2026-06-13 cycle4 항목 2). PR #146 의 7-14일 timeout 빈도 데이터 후 임계 결정.
- **다음 growth 우선순위 (W3 distribution wedge, 미실행)**: Telegram `/invite` 친구 초대 슬롯 + referral UTM (tech-radar 2026-06-10 항목 1). 1-1.5 sprint, *사용자 컨펌 후* 착수 (incentive 설계 결합). PR #152 + #153 + #164 + #180 의 KPI 평가 결과에 따라 우선순위 조정.
- **장기 W2 evidence — Tier-1 insider track record render**: OKR O2.KR2 (`tier1_rendered = 0, target = 1`). 6개월+ followup 데이터 누적 + Tier-1 정의 사용자 합의 필요. *사용자 결정 대기*. tech-radar 2026-06-13 cycle4 항목 3 + 2026-06-14 cycle5 항목 2 + 2026-06-20 cycle7 항목 1 (`whale_insider_idx` 신호로 demand 검증).
- **장기 P1**: Supabase Edge Functions poll/wallet 영구 저장 전환 (별도 sprint 1개 분량).

**해결 완료 항목** (참고용):
- ~~잔존 W5/W2 compliance — 일부 슬러그 페이지 출처 plain-text~~ → PR #113–#207 누적 backfill, **61/61 provenance 100%** (PR #207 최종, 2026-06-21). `whale-20260423-MXF.astro` pre-pivot orphan 은 PR #111 로 noindex 처리.
- ~~`/whale/insider/` 인물 인덱스 hub 부재 — Tier-1 demand check 불가능~~ → PR #180 (`/whale/insider/` Astro static, 58 insider × 60 UTM 링크, `whale_insider_idx` 신규)
- ~~`sourceCounts` unbounded growth 위험~~ → PR #179 (top-N=50 cap, count DESC + 사전순 tie-break, 15 tests passed)
- ~~`/whale/week/<YYYY-Www>/` 주간 아카이브 부재 — SEO long-tail 미캡처~~ → PR #164 (6주 정적 페이지 + index hero pill, `whale_weekly` 신규 UTM)
- ~~ISO week 계산 다중 소스화 — drift 위험~~ → PR #165 (`scripts/lib/iso-week.js` 단일 소스 + 14 unit tests)
- ~~/api/analytics/summary 에 UTM source 별 카운트 노출 부재 — W3 KPI 검증 불가능~~ → PR #153 (`computeAnalyticsSummary` bySource 인자 + `?window=N` 1≤N≤90 + 13 tests passed)
- ~~WhaleFollow insider-related slot + 홈 hero 외부 채널 pill 부재 — W3 distribution surface 한정~~ → PR #152 (whale_insider/whale_tg_home/whale_rss_home UTM source 3종 추가, retroactive 60+ 페이지 + 홈)
- ~~SEC scan cron 24h → 15min polling + cross-runner 멱등성~~ → PR #146 (cron `*/15 * * * *` + `timeout-minutes: 14` + analyze 단계 slug-gate)
- ~~Whale 페이지 하단 내부 Related 링크 부재 (세션 깊이 / 내부 SEO)~~ → PR #145 (WhaleFollow.astro 단일 수정으로 17개 페이지 retroactive + 향후 generate 자동 포함, `whale_related` UTM 추적)
- ~~Whale 페이지 multi-channel 구독 보조 CTA 부재~~ → PR #136 (WhaleFollow.astro 단일 수정으로 63개 페이지 retroactive, Telegram·RSS pill 칩 + `/api/track` UTM 클릭 추적)
- ~~Whale 페이지 wallet 연동 보조 CTA 부재~~ → PR #140 (WhaleFollow alt pill 줄에 💼 지갑 연동 → 즉시 노출)
- ~~SEC fetch 실패 accession 영구 손실 위험~~ → PR #141 (negative-cache TTL 30분)
- ~~SEC scan polling 단축 전제 조건 (idempotency 가드)~~ → PR #137 (`.seen-accessions.json` FIFO 2000 캐시, fail-open, atomic write)
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
