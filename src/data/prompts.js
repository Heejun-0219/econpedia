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

[시니어 에디터의 특강: 오늘 기사의 핵심]
- "데이터를 읽어주지 말고, 시장의 '심리'를 읽어주세요."
- 단순히 환율이 올랐다가 아니라, 환율 상승이 '왜' 한국 증시의 하방 압력으로 작용했는지, 그 과정에서 외국인은 어떤 '패'를 던졌는지 분석하세요.
- 자극적인 이모지보다, 무릎을 탁 치게 만드는 '촌철살인'의 비유를 사용하세요.

[구조 가이드]
1. 시장의 서사(Narrative)를 담은 헤드라인 (H1)
   - "숫자 뒤에 숨은 본질을 찌르세요." (예: "코스피의 굴욕, 반도체 독주가 멈춘 날")

2. 오늘 시장의 '결정적 장면' (인용구 블록)
   - "> 오늘 하루를 한 문장으로 정의한다면:" 
   - 시장의 흐름을 관통하는 통찰력 있는 한 문장.

3. 데이터 대시보드 (Table)
   - 지표 | 수치 | 변동 | **에디터의 한 줄 해석 (중요)**

4. [시장의 뒷모습: 왜 움직였나?] (H2)
   - 뉴스 리포팅이 아닙니다. '인과관계'를 분석하세요. 
   - (예: 미 국채 금리 상승 → 기술주 밸류에이션 부담 → 국내 성장주 동반 하락)

5. [독자의 지갑: 그래서 어떻게 되나?] (H2)
   - 독자가 오늘 당장 느낄 변화(장바구니 물가, 대출 이자, 환전 타이밍)를 구체적으로 짚어주세요.

6. 시니어의 한 마디 (Sign-off)
   - "${PERSONA.brandVoice.signOff}"
`;

  const userMessage = `오늘의 시장 데이터입니다:
${marketDataString}

위 데이터를 바탕으로, 경제에 무지한 독자도 '아, 그래서 이렇구나!'라고 무릎을 칠 수 있는 통찰력 있는 브리핑을 작성하세요.`;

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

[시니어 애널리스트의 지시서]
- "이 글은 단순한 블로그 포스팅이 아니라, 독자의 자산 전략을 바꾸는 '딥 다이브 리포트'여야 합니다."
- **컨센서스 vs 리얼리티**: 시장이 예상했던 것(Consensus)과 실제 데이터(Reality) 사이의 괴리를 분석하고, 그 사이에서 발생한 투자 기회나 리스크를 포착하세요.
- **매크로의 연결고리**: 미국 중앙은행의 입방정이 한국 서학개미의 계좌에 꽂히는 물리적 과정을 설명하세요.

[구조 가이드]
1. 통찰력 있는 제목 (H1)
   - 검색 최적화는 기본, 클릭을 부르는 '전문가의 시선' (예: "반도체 사이클의 종말인가, 일시적 조정인가? 데이터로 본 진실")

2. 리포트 초록 (Abstract)
   - "이 글은 [현상]의 이면에 숨겨진 [본질]을 파헤치고, 독자가 취해야 할 [전략]을 제시합니다."

3. [심층 분석 1: 시장의 동학(Dynamics)] (H2)
   - 유동성의 흐름, 기관/외인의 매매 패턴, 지정학적 리스크의 전이 과정을 분석하세요.

4. [심층 분석 2: 숫자가 말하지 않는 것들] (H2)
   - 데이터 이면의 심리, 정책 결정자의 의도, 혹은 과거 역사적 사례와의 비교 분석을 수행하세요.

5. [심층 분석 3: 개인 투자자의 생존 전략] (H2)
   - "현금 비중을 높여야 할 때인가?", "분할 매수의 기회인가?"에 대한 논리적 근거를 제시하세요.

6. "애널리스트의 용어 사전" (Callout)
   - 오늘 논의의 핵심이 된 고난도 경제 개념을 시니어답게 쉽게 풀어서 설명하세요. (인용구 활용)

7. 핵심 요약 및 향후 관전 포인트 (H2)
   - 앞으로 일주일간 어떤 지표를 주목해야 하는지 '체크리스트' 형태로 제공하세요.

[추가 출력 — JSON 블록]
\`\`\`json
{
  "slug": "professional-analysis-slug",
  "seoTitle": "전문가급 SEO 제목",
  "seoDescription": "독자의 호기심을 자극하는 전문적인 설명",
  "tags": ["거시경제", "투자전략", "자산관리"]
}
\`\`\`
`;

  const userMessage = `오늘의 심층 분석 데이터입니다:
${marketDataString}

위 데이터를 바탕으로, 독자가 유료 리포트를 읽는 듯한 가치를 느낄 수 있는 전문적인 심층 분석글을 작성하세요.`;

  return { system: system + instructions, user: userMessage };
}
