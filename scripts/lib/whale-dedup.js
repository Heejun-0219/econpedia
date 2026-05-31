// scripts/lib/whale-dedup.js
// G1 데이터 무결성 — 거래일(transaction date) 기반 dedup.
//
// 문제: scan이 공시일(SEC fileDate / DART rcept_dt)을 signal.date로 써서, 같은 거래가
//       다른 날 RSS에 다시 잡히면(filing drift) 다른 date → dedup 실패 → 중복 페이지(#84 사례).
// 해결: SEC Form 4 XML의 <transactionDate>를 파싱해 거래일을 date로 사용. dedup 키도 거래일 기반.

// Form 4 XML에서 모든 nonDerivative 거래일(YYYY-MM-DD)을 추출.
export function extractForm4TransactionDates(xml) {
  const dates = [];
  const re = /<transactionDate>\s*<value>\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*<\/value>\s*<\/transactionDate>/g;
  let m;
  while ((m = re.exec(String(xml || ''))) !== null) dates.push(m[1]);
  return dates;
}

// 대표 거래일 선택 — 가장 최근 거래일(같은 필링 내 여러 거래 시). 없으면 fallback(공시일).
export function pickTransactionDate(xml, fallbackDate) {
  const dates = extractForm4TransactionDates(xml);
  if (!dates.length) return fallbackDate || null;
  return dates.sort().slice(-1)[0]; // ISO 문자열은 사전식 정렬 = 시간순
}

// dedup 키 — 거래일 기반. 같은 종목·같은 거래일 = 같은 거래로 간주(filing drift 흡수).
export function dedupKey(signal) {
  return `${signal.ticker}|${signal.date}`;
}
