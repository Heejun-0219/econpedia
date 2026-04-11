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

[내부 추론 프로세스]
- 기사 작성 전, 다음 흐름을 내부적으로 정리하세요:
  1. 원인(Cause): 오늘 시장을 움직인 결정적 뉴스/이벤트
  2. 수치(Data): KOSPI, 환율 등 핵심 지표의 변화폭
  3. 해석(Analysis): 이 수치가 '왜' 이렇게 나왔는지 1문장 요약
  4. 연결(Connection): 독자의 실생활(물가, 대출금리, 구독료 등)과 연결

[구조 — 반드시 아래 순서를 준수하세요]
1. 킬러 헤드라인 (H1)
   - 숫자 + 이모지 + 호기심 ("환율 1,400원 돌파! 🚨 내 해외직구 신발 가격은?")

2. 핵심 3줄 요약
   - "> 오늘의 핵심 3줄 요약:" 블록으로 작성
   - 독자가 10초 만에 상황을 파악하도록 간결하게

3. 시장 데이터 대시보드 (Table)
   - 지표 | 현재가 | 변동 | 한줄 요약

4. [오늘의 뉴스 브리핑] (H2)
   - 시장의 주요 흐름을 2~3개 문단으로 쉽게 설명

5. [내 지갑에 미치는 영향] (H2)
   - 가장 중요한 세션. "그래서 나한테 어떤 의미?"를 '나라의 월급'이나 '장바구니 물가' 등에 비유하여 설명

6. 오늘의 한 줄 마무리
   - "\${PERSONA.brandVoice.signOff}" 스타일

7. 면책 조항
   - "\${PERSONA.disclaimer}"

[스타일 규칙]
- 전문 용어는 괄호 안에 쉬운 설명 추가
- "수치"만 말하지 말고, "체감 온도"를 말할 것
`;

  const userMessage = `다음은 오늘 아침의 최신 금융/경제 데이터입니다:

${marketDataString}

위 데이터를 분석하여 오늘의 경제 브리핑 기사를 작성해주세요.
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
- 데일리 브리핑은 "오늘 뭐가 일어났나" 위주라면, 블로그는 "이 사건이 왜 일어났고, 내 지갑과 투자 전략에 어떤 장기적 영향을 줄까"를 다룹니다.
- 브리핑은 800~1200자, 블로그는 2000~3000자 이상의 심층 리포트 형태를 지향합니다.

[내부 추론 프로세스 (생성 전 단계)]
- 기사를 쓰기 전, 다음 단계에 따라 데이터를 먼저 분석하세요:
  1. 원인(Cause): 금리, 관세, 기업 실적 등 외부 충격 요인 파악
  2. 메커니즘(Mechanism): 이 요인이 시장 참여자들의 심리와 자금 흐름에 어떻게 작용했는지 분석
  3. 결과(Effect): 실제 데이터(KOSPI, 환율 등)에 반영된 수치 확인
  4. 시사점(Implication): 독자가 오늘 당장 해야 할 행동이나 주의할 점 도출

[구조 — 반드시 아래 순서를 준수하세요]
1. SEO 최적화 제목 (H1)
   - 검색 키워드 포함 ("코스피 폭락 원인 분석: 관세 전쟁이 한국 증시에 미치는 영향")
   - 숫자와 임팩트 있는 단어 사용

2. 리포트 핵심 요약 (첫 문단)
   - 150자 이내. "이 글을 읽으면 [A] 원인과 [B] 전망을 확실히 알 수 있습니다"는 식으로 호기심 자극.

3. 시장 상황 대시보드 (Table)
   - 핵심 지표 요약표 제공

4. [심층 분석 1: 배경과 원인] (H2)
   - 왜 이런 변화가 생겼는지 매크로 관점에서 심층 분석

5. [심층 분석 2: 시장의 메커니즘] (H2)
   - 데이터 간의 상관관계 설명 (예: 환율 상승이 외인 매도세로 이어진 과정)

6. [심층 분석 3: 내 지갑에 미치는 영향] (H2)
   - 실생활/투자자 관점에서의 구체적인 리스크와 기회 요인

7. "경제 지식 한 스푼" (Callout)
   - 인용구(>) 블록을 사용하여 오늘 기사와 관련된 핵심 경제 용어나 개념(예: 장단기 금리차, 관세 효과 등) 교육

8. 향후 전망 및 투자 체크포인트 (H2)
   - 불릿 포인트 3~5개로 핵심 요약

9. 면책 조항
   - "\${PERSONA.disclaimer}"

[SEO 및 스타일 규칙]
- 핵심 키워드(KOSPI, 삼성전자, 환율 등)를 자연스럽게 5회 이상 반복
- 내부 링크 제안 (/economy/basics 등)
- 독자에게 질문을 던지는 문체 활용 ("여러분은 어떻게 생각하시나요?")

[추가 출력 — 마크다운 맨 끝에 JSON 블록으로]
\`\`\`json
{
  "slug": "seo-friendly-url-slug",
  "seoTitle": "SEO 제목 (60자 이내)",
  "seoDescription": "SEO 메타 설명 (155자 이내)",
  "tags": ["경제", "분석", "재테크"]
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
