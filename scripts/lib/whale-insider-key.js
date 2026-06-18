// scripts/lib/whale-insider-key.js
// W6 reliability — insider person 문자열 정규화 단일 소스.
// 동일 인물(역할/직책 prefix 변형 포함) 매칭에 사용 — track-record 빌더와
// Astro WhaleFollow 컴포넌트가 *반드시* 동일 결과를 내야 cross-trade 그룹핑이 일관.
//
// 규칙:
//   1. "이름 / 역할" 형식의 슬래시 앞부분만 사용 (역할 prefix 제거)
//   2. lowercase (영문 케이스 차이 무시)
//   3. 영숫자·한글 외 모든 문자 제거 (구두점·공백·이모지 제외)
//
// 예:
//   "JOHN A. SMITH / CEO"  → "johnasmith"
//   "Smith, John A. / CFO" → "smithjohna"
//   "김기호 / 대표이사 사장" → "김기호"
//   "  " → ""

export function normPersonKey(person) {
  return String(person || '')
    .split('/')[0]
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, '')
    .trim();
}

// 화면 표시용 이름 (역할 prefix 제거, 원본 케이스 유지)
export function displayPersonName(person) {
  return String(person || '').split('/')[0].trim();
}
