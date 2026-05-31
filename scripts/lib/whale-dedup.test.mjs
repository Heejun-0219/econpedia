// node scripts/lib/whale-dedup.test.mjs
import assert from 'node:assert/strict';
import { extractForm4TransactionDates, pickTransactionDate, dedupKey } from './whale-dedup.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✓', name); };

const xml = `
<nonDerivativeTransaction>
  <transactionDate><value>2026-05-21</value></transactionDate>
  <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
</nonDerivativeTransaction>
<nonDerivativeTransaction>
  <transactionDate><value>2026-05-20</value></transactionDate>
  <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
</nonDerivativeTransaction>`;

t('거래일 전부 추출', () => {
  assert.deepEqual(extractForm4TransactionDates(xml), ['2026-05-21', '2026-05-20']);
});

t('대표 거래일 = 가장 최근', () => {
  assert.equal(pickTransactionDate(xml, '2026-05-25'), '2026-05-21');
});

t('거래일 없으면 fallback(공시일)', () => {
  assert.equal(pickTransactionDate('<noDate/>', '2026-05-25'), '2026-05-25');
  assert.equal(pickTransactionDate('', null), null);
});

t('filing drift 흡수: 같은 거래·다른 공시일 → 같은 dedup 키', () => {
  // CGCT 실제 사례: 05-23/05-25 두 공시지만 거래일은 동일해야 함
  const a = { ticker: 'CGCT', date: pickTransactionDate(xml, '2026-05-23') };
  const b = { ticker: 'CGCT', date: pickTransactionDate(xml, '2026-05-25') };
  assert.equal(dedupKey(a), dedupKey(b)); // 거래일 기반이므로 동일 → 중복 제거됨
});

t('다른 거래일은 다른 키 (META 분할매도 보존)', () => {
  const a = { ticker: 'META', date: '2026-04-22' };
  const b = { ticker: 'META', date: '2026-04-29' };
  assert.notEqual(dedupKey(a), dedupKey(b));
});

console.log(`\n✅ whale-dedup: ${pass} tests passed`);
