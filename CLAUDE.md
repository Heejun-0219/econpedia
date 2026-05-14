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

- **P0**: `api/server.js:94-121` — `POLLS_FILE`, `WALLETS_FILE` 미정의 → poll/wallet 데이터가 30초마다 디스크 저장 실패. 컨테이너 재시작 시 데이터 손실.
- **P0**: `src/components/TimeAttackLounge.astro:253` — Supabase `full_name` 저장형 XSS.
- **P0**: `/api/track`, `/api/analytics`, `/api/poll/*`, `/api/wallet-subscribe` — 인증/레이트리밋 없음.
- **P0**: `/api/og/wallet` — 요청당 Puppeteer 인스턴스 (DoS·OOM 위험).
- **P1**: `docker-entrypoint.sh`의 `while true; node…` 루프 + `restart: unless-stopped` 이중 supervisor.
- **P1**: `api/server.js:295,305` — fabricated `openRate`, `course_completions`.

자세한 진단: `claude/production-analysis-QAFfz` 브랜치 PR #5 본문 + `ops/improvement-loop/state/history/`의 머스크/멍거 critique 참조.

## Self-Improvement Loop

매주 자동 실행되는 진단·합성 루틴이 `ops/improvement-loop/`에 있음. 로컬에서:
```bash
npm run loop                  # 한 사이클: snapshot + 3 critique + synthesis
npm run loop:snapshot         # 무료 — LLM 호출 없음
```

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
