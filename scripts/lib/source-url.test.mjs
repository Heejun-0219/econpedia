// node scripts/lib/source-url.test.mjs
// 소스 URL 빌더 단위 테스트 (외부 의존성 없음).
import assert from 'node:assert/strict';
import { secForm4Url, dartReceiptUrl, sourceLabel } from './source-url.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✓', name); };

t('SEC: 정상 cik+accession → accession-index URL', () => {
  assert.equal(
    secForm4Url('0000320193', '0001234567-26-000123'),
    'https://www.sec.gov/Archives/edgar/data/320193/000123456726000123/0001234567-26-000123-index.htm'
  );
});
t('SEC: cik 숫자형/패딩 없는 경우도 정규화', () => {
  assert.equal(
    secForm4Url('320193', '0001234567-26-000123'),
    'https://www.sec.gov/Archives/edgar/data/320193/000123456726000123/0001234567-26-000123-index.htm'
  );
});
t('SEC: 잘못된 accession 포맷 → null', () => {
  assert.equal(secForm4Url('320193', 'not-an-accession'), null);
  assert.equal(secForm4Url('320193', ''), null);
  assert.equal(secForm4Url('', '0001234567-26-000123'), null);
});
t('DART: 14자리 rcpNo → 뷰어 URL', () => {
  assert.equal(dartReceiptUrl('20260430000123'), 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260430000123');
});
t('DART: 잘못된 rcpNo → null', () => {
  assert.equal(dartReceiptUrl('123'), null);
  assert.equal(dartReceiptUrl('2026043000012X'), null);
  assert.equal(dartReceiptUrl(null), null);
});
t('label: 시장별 라벨', () => {
  assert.equal(sourceLabel('kr'), 'DART 전자공시 원문');
  assert.equal(sourceLabel('us'), 'SEC Form 4 원문');
});

console.log(`\n✅ source-url: ${pass} tests passed`);
