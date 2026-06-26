// W5/W6 (cycle 8, 2026-06-26) — XML special-char escaping 단일 소스.
// `/whale/rss.xml` 가 SEC/DART + AI 요약 텍스트(untrusted) 를 syndicated feed 로
// 외부 RSS 리더에 노출하므로 5개 XML 예약 문자 (&, <, >, ", ') 가 정확히 escape 되어야
// 한다. 회귀 시 RSS reader 측 파서 오류 또는 인접 시그널의 신뢰성 훼손 → W5 compliance 위반.
//
// 호환성: ECMA-376 XML 1.0 spec. null/undefined/non-string 입력은 빈 문자열 반환
// (호출처에서 별도 null 가드 불필요).
//
// 사용처: src/pages/whale/rss.xml.ts. 추가 endpoint (예: 향후 sitemap-news.xml) 가
// 생기면 동일 소스 import.
export function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
