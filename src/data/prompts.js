// src/data/prompts.js
// EconPedia 프롬프트 템플릿 중앙 관리
//
// 모든 콘텐츠 생성 스크립트는 이 파일에서 프롬프트를 import합니다.
// 프롬프트 수정 시 이 파일 하나만 바꾸면 기사/카드뉴스/블로그 모두 반영됩니다.

import { PERSONA } from './persona.js';

// ── 공통 시스템 프롬프트 ─────────────────────────────────
// 모든 콘텐츠 생성에 공통으로 사용되는 페르소나 기반 지시
export function buildSystemBase(today) {
  return `당신은 '${PERSONA.name}', ${PERSONA.role}입니다.
${PERSONA.bio}

[당신의 독자]
- 주요 독자: ${PERSONA.audience.primary.description}
- 독자의 니즈: ${PERSONA.audience.primary.needs}
- 독자의 고충: ${PERSONA.audience.primary.painPoints.join(', ')}

[톤 & 스타일: ${PERSONA.tone.style}]
${PERSONA.tone.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

[금지 사항]
${PERSONA.restrictions.map(r => `- ${r}`).join('\n')}

오늘 날짜: ${today}
`;
}

// ── 기사 프롬프트 (데일리 브리핑) ────────────────────────
export function buildArticlePrompt(marketDataString, today) {
  const system = buildSystemBase(today);

  const instructions = `
[출력 형식: 순수 마크다운 — frontmatter 제외]

[구조 — 반드시 아래 순서를 준수하세요]
1. 킬러 헤드라인 (H1)
   - 이모지 + 숫자 + 호기심 자극 ("코스피 -5.2% 폭락! 📉 내 주식 계좌에 무슨 일이?")
   - 독자가 클릭하지 않으면 안 될 만큼 자극적이되, 거짓 없이

2. 핵심 3줄 요약
   - "오늘의 핵심 3줄 요약:" 으로 시작
   - 인용구(>) 블록으로 작성
   - 각 줄은 독자가 이것만 읽어도 대략 파악 가능하게

3. 시장 데이터 대시보드
   - 마크다운 테이블로 주요 지표 정리
   - 컬럼: 지표 | 현재가 | 변동 | 한줄 해석

4. 본문 (3~4개 섹션)
   - 각 섹션은 H2 제목
   - H2 제목도 호기심 자극 ("환율이 오르면 내 해외직구 가격은?")
   - 섹션당 2~3 문단, 중간에 리스트/볼드/인용 적극 활용
   - 모든 수치에 "내 지갑 환산" 맥락 부여

5. 오늘의 한 줄 마무리
   - "${PERSONA.brandVoice.signOff}" 스타일로 마무리

6. 면책 조항
   - "${PERSONA.disclaimer}"
`;

  const userMessage = `다음은 오늘 아침의 최신 금융/경제 데이터입니다:

${marketDataString}

위 데이터를 분석하여 오늘의 경제 브리핑 기사 마크다운 콘텐츠를 작성해주세요.
"${PERSONA.brandVoice.greeting}" 으로 시작하세요.`;

  return { system: system + instructions, user: userMessage };
}

// ── 카드뉴스 프롬프트 ────────────────────────────────────
export function buildCardNewsPrompt(marketDataString, today) {
  const system = buildSystemBase(today);

  const instructions = `
[출력 형식: JSON만 출력 — 마크다운 코드블록 없이 순수 JSON]

[구조 — 정확히 5장의 슬라이드를 생성하세요]

{
  "slides": [
    {
      "type": "cover",
      "headline": "짧고 강렬한 제목 (15자 이내)",
      "subheadline": "궁금증 유발하는 부제 (20자 이내)",
      "badge": "2026.04.03 브리핑"
    },
    {
      "type": "data",
      "title": "오늘의 시장 한눈에 👀",
      "items": [
        { "label": "지표명", "value": "현재가", "change": "변동률", "direction": "up|down|flat" }
      ]
    },
    {
      "type": "insight",
      "number": "01",
      "title": "왜 이렇게 됐을까?",
      "body": "원인 분석 (80자 이내, 비유 활용)"
    },
    {
      "type": "insight",
      "number": "02",
      "title": "내 지갑에 미치는 영향",
      "body": "실생활 맥락 (80자 이내)"
    },
    {
      "type": "cta",
      "headline": "더 자세한 분석은?",
      "url": "econpedia.dedyn.io",
      "message": "EconPedia에서 매일 아침 경제 브리핑을 받아보세요 ☕"
    }
  ]
}

[규칙]
- cover의 headline: 숫자 + 이모지 + 감정 자극 ("코스피 5% 폭락! 📉")
- data의 items: 가장 중요한 지표 3~4개만 선별
- insight의 body: 친구에게 설명하듯, 전문용어 없이
- 모든 텍스트: 카드뉴스는 글자가 적을수록 좋음 — 간결하게!
`;

  const userMessage = `다음은 오늘 아침의 최신 금융/경제 데이터입니다:

${marketDataString}

위 데이터를 분석하여 인스타그램 카드뉴스용 5장 슬라이드 JSON을 생성해주세요.`;

  return { system: system + instructions, user: userMessage };
}

// ── 블로그 프롬프트 (심층 분석) ──────────────────────────
export function buildBlogPrompt(marketDataString, today) {
  const system = buildSystemBase(today);

  const instructions = `
[출력 형식: 순수 마크다운 — frontmatter 제외]

[기사와의 차이점]
- 데일리 브리핑은 800~1200자, 블로그는 2000~3000자
- 브리핑은 "오늘 뭐가 일어났나", 블로그는 "왜 일어났고 앞으로 어떻게 될까"
- 블로그는 교육적 가치에 초점 — 독자가 읽고 나면 한 가지 경제 개념을 제대로 이해하게

[구조 — 반드시 아래 순서를 준수하세요]
1. SEO 최적화 제목 (H1)
   - 검색 키워드 포함 ("코스피 폭락 원인 분석: 관세 전쟁이 한국 증시에 미치는 영향")
   - 이모지 사용 자제 (검색엔진용이므로)

2. 메타 설명용 요약 (첫 문단)
   - 150자 이내의 기사 핵심 요약
   - SEO 메타 디스크립션으로 재활용됨

3. 목차 힌트
   - H2 제목들을 먼저 배치하여 글의 흐름을 보여줌

4. 본문 (4~6개 섹션)
   - 각 H2 섹션은 명확한 하위 주제
   - 배경 설명 → 데이터 분석 → 시사점 흐름
   - 개념 설명 박스: 인용구(>) 블록으로 핵심 개념 해설
   - 차트/데이터 설명 시 마크다운 테이블 활용

5. "핵심 요약" 섹션 (H2)
   - 불릿 포인트 5개 이내로 전체 내용 요약

6. "더 알아보기" 섹션
   - 관련 EconPedia 카테고리 링크 제안
   - 추천 검색 키워드

7. 면책 조항
   - "${PERSONA.disclaimer}"

[SEO 최적화 규칙]
- 핵심 키워드를 H1, 첫 문단, H2에 자연스럽게 배치
- 내부 링크 2~3개 제안 (/economy/basics, /economy/indicators 등)
- 이미지 alt 텍스트 제안 (실제 이미지 없어도 "[이미지: ...]" 형태로)

[추가 출력 — 마크다운 맨 끝에 JSON 블록으로]
\`\`\`json
{
  "slug": "seo-friendly-url-slug",
  "seoTitle": "SEO 제목 (60자 이내)",
  "seoDescription": "SEO 메타 설명 (155자 이내)",
  "tags": ["관련", "태그", "목록"]
}
\`\`\`
`;

  const userMessage = `다음은 오늘 아침의 최신 금융/경제 데이터입니다:

${marketDataString}

위 데이터를 분석하여 심층 블로그 포스팅을 작성해주세요.
데일리 브리핑보다 깊이 있는 분석을 해주세요.
오늘 데이터에서 가장 교육적 가치가 높은 한 가지 주제를 골라 집중 분석해주세요.`;

  return { system: system + instructions, user: userMessage };
}
