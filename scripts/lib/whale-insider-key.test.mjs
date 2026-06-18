// node scripts/lib/whale-insider-key.test.mjs
import assert from 'node:assert/strict';
import { normPersonKey, displayPersonName } from './whale-insider-key.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✓', name); };

t('영문 이름 + 역할 prefix → lowercase 영숫자만', () => {
  assert.equal(normPersonKey('JOHN A. SMITH / CEO'), 'johnasmith');
  assert.equal(normPersonKey('John Smith / Director'), 'johnsmith');
});

t('한글 이름 + 역할 → 한글 보존', () => {
  assert.equal(normPersonKey('김기호 / 대표이사 사장'), '김기호');
  assert.equal(normPersonKey('이재용 / 회장'), '이재용');
});

t('한영 혼합 + 특수문자 제거', () => {
  assert.equal(normPersonKey('Smith, John A. / CFO'), 'smithjohna');
  assert.equal(normPersonKey('홍-길_동 (鄭) / President'), '홍길동');
});

t('slash 없음 — 전체 사용', () => {
  assert.equal(normPersonKey('JANE DOE'), 'janedoe');
  assert.equal(normPersonKey('박지원'), '박지원');
});

t('null/undefined/빈 문자열 → 빈 문자열', () => {
  assert.equal(normPersonKey(null), '');
  assert.equal(normPersonKey(undefined), '');
  assert.equal(normPersonKey(''), '');
  assert.equal(normPersonKey('   '), '');
});

t('이모지/구두점 제거', () => {
  assert.equal(normPersonKey('🚀 Elon Musk / CEO'), 'elonmusk');
  assert.equal(normPersonKey('O\'Brien, Pat / Director'), 'obrienpat');
});

t('숫자 보존 (corp 명 등)', () => {
  assert.equal(normPersonKey('CGC III Sponsor LLC / Chairman'), 'cgciiisponsorllc');
});

t('동일 인물 케이스 차이 정규화 — track-record 매칭 시나리오', () => {
  const a = normPersonKey('Cyr Michael / CEO');
  const b = normPersonKey('CYR MICHAEL / President & CEO');
  const c = normPersonKey('cyr michael');
  assert.equal(a, b);
  assert.equal(a, c);
});

t('displayPersonName — 원본 케이스 유지, 역할만 제거', () => {
  assert.equal(displayPersonName('JOHN A. SMITH / CEO'), 'JOHN A. SMITH');
  assert.equal(displayPersonName('김기호 / 대표이사 사장'), '김기호');
  assert.equal(displayPersonName('  Jane Doe  '), 'Jane Doe');
  assert.equal(displayPersonName(null), '');
});

t('비-ASCII 영숫자 (예: 일본/중국 한자) 제거 — 한글만 보존', () => {
  // 한글 외 CJK 문자는 제거 — 의도된 동작 (DART/SEC 데이터는 한·영만)
  assert.equal(normPersonKey('王偉 / Chairman'), '');
  assert.equal(normPersonKey('Tanaka 田中 太郎'), 'tanaka');
});

console.log(`\n✅ whale-insider-key: ${pass} tests passed`);
