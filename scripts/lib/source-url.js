// scripts/lib/source-url.js
// G1 데이터 무결성 — 공시 원문 검증가능 소스 URL 빌더 (순수 함수, 단위 테스트 대상).
//
// 모든 whale 페이지는 SEC Form 4 accession 또는 DART 접수(rcpNo) 원문으로 추적 가능해야 한다.
// (Compliance/UX/SRE critique: 0/61 페이지 소스링크 = 감사추적 없음 = 증권법·신뢰 리스크)

// SEC EDGAR Form 4 filing index 페이지 (사람이 열람 가능한 공시 원문 인덱스).
//   cik: "0000320193" 또는 "320193" 등 — 숫자만 추출해 사용
//   accession: "0001234567-26-000123" (대시 포함)
export function secForm4Url(cik, accession) {
  const cikNum = String(cik ?? '').replace(/\D/g, '').replace(/^0+/, '');
  const acc = String(accession ?? '').trim();
  if (!cikNum || !/^\d{10}-\d{2}-\d{6}$/.test(acc)) return null;
  const accNoDashes = acc.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNoDashes}/${acc}-index.htm`;
}

// DART 공시 접수번호(rcpNo) 원문 뷰어 URL.
//   rceptNo: 14자리 숫자 문자열 (예: "20260430000123")
export function dartReceiptUrl(rceptNo) {
  const r = String(rceptNo ?? '').trim();
  if (!/^\d{14}$/.test(r)) return null;
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r}`;
}

// 라벨 — 소스 종류별 표시 텍스트
export function sourceLabel(market) {
  return market === 'kr' ? 'DART 전자공시 원문' : 'SEC Form 4 원문';
}
