// node scripts/lib/xml-escape.test.mjs
import assert from 'node:assert/strict';
import { xmlEscape } from './xml-escape.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✓', name); };

// 5개 XML 예약 문자 — RSS reader 가 보는 외부 인용 표면. 회귀 = W5 위반.
t('ampersand → &amp;', () => {
  assert.equal(xmlEscape('AT&T'), 'AT&amp;T');
});

t('less-than → &lt;', () => {
  assert.equal(xmlEscape('a<b'), 'a&lt;b');
});

t('greater-than → &gt;', () => {
  assert.equal(xmlEscape('a>b'), 'a&gt;b');
});

t('double-quote → &quot;', () => {
  assert.equal(xmlEscape('say "hi"'), 'say &quot;hi&quot;');
});

t('single-quote → &apos;', () => {
  assert.equal(xmlEscape("it's"), 'it&apos;s');
});

// 순서 의존성 — & 가 가장 먼저 escape 되어야 다른 entity 가 이중 escape 되지 않는다.
t('ordering: 사전 escape 된 &amp; 가 &amp;amp; 로 이중되지 않게 — 첫 & 만 변환', () => {
  // 입력 "&amp;" 는 일반 텍스트이므로 모든 & 가 escape 되어야 한다.
  // 즉 "&amp;" → "&amp;amp;" 가 정확한 결과 (idempotent 아니다 — 의도된 동작).
  assert.equal(xmlEscape('&amp;'), '&amp;amp;');
});

t('5개 예약문자 동시 등장 — 모두 변환', () => {
  assert.equal(
    xmlEscape(`a&b<c>d"e'f`),
    'a&amp;b&lt;c&gt;d&quot;e&apos;f'
  );
});

// XSS / injection 시나리오 — RSS reader 가 일부 HTML 을 렌더할 수 있는 환경에서
// 외부 input 의 <script> 가 escape 되는지 확인 (반드시 PASS).
t('XSS payload: <script>alert(1)</script> 가 inert text 로', () => {
  assert.equal(
    xmlEscape('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;'
  );
});

// null / undefined / 비-string 입력 안전성 — 호출처에서 null 가드 생략 가능.
t('null → 빈 문자열', () => {
  assert.equal(xmlEscape(null), '');
});

t('undefined → 빈 문자열', () => {
  assert.equal(xmlEscape(undefined), '');
});

t('number 입력 → string 변환 후 escape (예약문자 없음)', () => {
  assert.equal(xmlEscape(12345), '12345');
});

t('빈 문자열 → 빈 문자열', () => {
  assert.equal(xmlEscape(''), '');
});

// 한·영 혼용 (Whale Alert 실제 데이터 패턴) — non-ASCII 통과.
t('한국어 + 영문 + 숫자 혼용 통과 (예약문자 없음)', () => {
  assert.equal(
    xmlEscape('메타 2인자의 15억 원어치 주식 매도 (META)'),
    '메타 2인자의 15억 원어치 주식 매도 (META)'
  );
});

// 실제 RSS item 시나리오 — title 에 인용부호 + 회사명에 & 포함된 경우.
t('실데이터 패턴: 회사명 + 인용 + 직책 — 정확히 escape', () => {
  assert.equal(
    xmlEscape(`AT&T의 "John O'Brien" CEO 매수`),
    'AT&amp;T의 &quot;John O&apos;Brien&quot; CEO 매수'
  );
});

console.log(`\n✅ xml-escape: ${pass} tests passed`);
