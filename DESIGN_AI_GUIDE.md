# EconPedia Design AI Guide: Production Architecture & Development Environment

이 문서는 웹사이트 디자인 AI(또는 프론트엔드 개발 AI)가 **EconPedia(경제 백과/뉴스 서비스)** 프로젝트의 구조를 빠르게 파악하고, 프로덕션 환경을 깨뜨리지 않으면서 UI/UX를 수정할 수 있도록 작성된 가이드입니다.

## 1. 기술 스택 (Tech Stack)

*   **웹 프레임워크:** [Astro](https://astro.build/) (Static Site Generation - 정적 사이트 생성 방식)
*   **UI 컴포넌트:** Astro 컴포넌트 (`.astro`), 필요시 React (`.jsx`) 혼용
*   **스타일링 (CSS):** **Vanilla CSS** (TailwindCSS 등 유틸리티 클래스 기반 프레임워크를 사용하지 않고 순수 CSS를 사용 중입니다.)
*   **백엔드/API:** Node.js (Express) 기반 커스텀 API 서버 (`/api` 폴더) + Supabase
*   **프로덕션 웹 서버:** Nginx
*   **인프라/배포:** Docker, Docker Compose, GitHub Actions를 통한 자동화 배포 (CI/CD)

## 2. 주요 디렉터리 구조 및 UI 수정 포인트

디자인/레이아웃 수정 시 주로 다루게 될 폴더는 `econpedia/src/` 아래에 있습니다.

```text
econpedia/
├── src/
│   ├── pages/         # 라우팅되는 실제 페이지들 (예: index.astro, wallet.astro, about.astro)
│   ├── components/    # 재사용 가능한 UI 컴포넌트 (예: Icon.astro, TradeCTA.astro, MarketTicker.jsx)
│   ├── layouts/       # 공통 페이지 레이아웃 (예: BaseLayout.astro, ArticleLayout.astro)
│   ├── styles/        # 전역 CSS 스타일 시트 (global.css, home-redesign.css)
│   └── data/          # 로컬 더미 데이터 및 설정값 (JSON, JS)
├── public/            # 정적 에셋 (이미지, 파비콘, 로고 등. 런타임에 직접 서빙됨)
└── api/               # 백엔드 API 로직 (프론트엔드 디자인 수정 시 건드릴 필요 없음)
```

### UI/UX 디자인 수정 지침 (Design AI를 위한 규칙)
1.  **스타일 수정 방식:** Tailwind가 설정되어 있지 않습니다. 스타일은 주로 `src/styles/global.css`에서 전역적으로 관리하거나, 각 `.astro` 파일 내의 `<style>` 태그를 이용해 컴포넌트 스코프(Scoped CSS)로 적용하세요.
2.  **컴포넌트 설계:** 새로운 UI 컴포넌트가 필요하다면 `src/components/`에 `.astro` 형식으로 만드는 것을 기본으로 합니다. 복잡한 상태 관리가 필요한 경우에만 React(`.jsx`)를 사용하세요.
3.  **정적 페이지(SSG) 고려:** Astro는 기본적으로 빌드 시점에 HTML을 생성합니다. 브라우저에서 실행되어야 하는 동적인 JS 로직(예: 모달 닫기, 스크롤 이벤트, 브라우저 API 호출 등)은 `.astro` 파일 안의 `<script>` 태그 내부에 작성하거나 `DOMContentLoaded` 이벤트를 활용하세요.

## 3. 프로덕션 아키텍처 및 배포 흐름

UI 컴포넌트가 추가되거나 빌드 방식이 변경될 때 프로덕션 환경이 어떻게 구성되어 있는지 이해해야 서버가 망가지는 것을 방지할 수 있습니다.

*   **멀티 스테이지 Docker 빌드 (`Dockerfile`):**
    *   **Stage 1:** `npm run build`를 실행하여 Astro 프로젝트를 `dist/` 폴더에 정적 HTML/CSS/JS 파일로 컴파일합니다.
    *   **Stage 2:** Nginx 이미지 위에 빌드된 `dist/` 파일을 복사하고, Node.js를 설치하여 `/api` 폴더의 서버를 구동할 준비를 합니다.
*   **런타임 환경 (`docker-compose.yml` & `nginx.conf`):**
    *   `nginx` 서비스와 `api` 서비스 컨테이너가 실행됩니다.
    *   Nginx는 `443/80` 포트로 들어오는 트래픽을 받아, 일반적인 웹 페이지와 정적 에셋은 직접 서빙(캐싱)하고, `/api/` 경로나 일부 동적 라우팅은 내부 Node.js API 컨테이너로 리버스 프록시(Reverse Proxy)합니다.
*   **CI/CD (`.github/workflows/deploy.yml`):**
    *   `main` 브랜치에 코드가 푸시되면 GitHub Actions가 새 Docker 이미지를 빌드해 GHCR에 올리고, 원격 OCI (Oracle Cloud) 서버에 접속하여 자동으로 컨테이너를 재시작합니다.

### ⚠️ 디자인 AI 주의사항
*   **라우팅 및 리버스 프록시 보호:** Nginx에서 리버스 프록시로 사용 중인 `/api/...` 경로나 설정 파일(`.env`, `nginx.conf`, `Dockerfile`)을 임의로 변경하지 마세요. UI와 무관한 시스템 설정입니다.
*   **빌드 에러 방지:** 배포가 자동화되어 있으므로, 존재하지 않는 파일을 `import` 하거나 TypeScript/문법 에러가 발생하면 빌드가 실패하여 전체 파이프라인이 멈춥니다. 코드 수정 후 논리적 결함이 없는지 반드시 확인하세요.

## 4. 로컬 테스트 방법

새로운 디자인이나 UI를 개발하고 테스트하려면 아래 명령어를 사용합니다.

```bash
# 디렉터리 이동
cd econpedia

# 개발 서버 실행
npm run dev
# 기본적으로 http://localhost:4321 에서 접속 가능합니다.
```
