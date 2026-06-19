// node scripts/lib/iso-week.test.mjs
import assert from 'node:assert/strict';
import { isoWeekKey, isoWeekParts, isoWeekMonday } from './iso-week.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✓', name); };

// 알려진 ISO week (NIST / Wikipedia reference dates).
t('2026-01-01 (목) → 2026-W01', () => {
  assert.equal(isoWeekKey('2026-01-01'), '2026-W01');
});

t('2026-01-04 (일) → 2026-W01 (Jan 4 always in W01)', () => {
  assert.equal(isoWeekKey('2026-01-04'), '2026-W01');
});

t('2026-01-05 (월) → 2026-W02', () => {
  assert.equal(isoWeekKey('2026-01-05'), '2026-W02');
});

t('2026-05-30 (토) → 2026-W22', () => {
  assert.equal(isoWeekKey('2026-05-30'), '2026-W22');
});

t('2026-04-22 (수) → 2026-W17', () => {
  assert.equal(isoWeekKey('2026-04-22'), '2026-W17');
});

t('연말 cross-over: 2025-12-29 (월) → 2026-W01 (W22 of prev year 불가)', () => {
  assert.equal(isoWeekKey('2025-12-29'), '2026-W01');
});

t('연초 cross-over: 2026-12-31 (목) → 2026-W53 또는 그 다음해', () => {
  // 2026-12-31 is Thursday → ISO 2026-W53 (long year).
  assert.equal(isoWeekKey('2026-12-31'), '2026-W53');
});

t('null / undefined / 빈 문자열 → null', () => {
  assert.equal(isoWeekKey(null), null);
  assert.equal(isoWeekKey(undefined), null);
  assert.equal(isoWeekKey(''), null);
});

t('잘못된 형식 → null', () => {
  assert.equal(isoWeekKey('not-a-date'), null);
  assert.equal(isoWeekKey('2026/05/30'), null);
});

t('ISO datetime prefix 만 사용 (시간 무시)', () => {
  assert.equal(isoWeekKey('2026-05-30T23:59:59Z'), '2026-W22');
});

t('isoWeekParts 반환 객체 형태', () => {
  const p = isoWeekParts('2026-05-30');
  assert.deepEqual(p, { year: 2026, week: 22 });
});

t('isoWeekMonday: 2026-W22 의 월요일 = 2026-05-25', () => {
  const mon = isoWeekMonday(2026, 22);
  assert.equal(mon.toISOString(), '2026-05-25T00:00:00.000Z');
});

t('isoWeekMonday: 2026-W01 의 월요일 = 2025-12-29', () => {
  const mon = isoWeekMonday(2026, 1);
  assert.equal(mon.toISOString(), '2025-12-29T00:00:00.000Z');
});

t('round-trip: isoWeekMonday + 0..6 일 모두 같은 isoWeekKey', () => {
  const mon = isoWeekMonday(2026, 22);
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setUTCDate(mon.getUTCDate() + i);
    const ymd = d.toISOString().slice(0, 10);
    assert.equal(isoWeekKey(ymd), '2026-W' + String(22).padStart(2, '0'),
      'day +' + i + ' (' + ymd + ') should still be W22');
  }
});

console.log('\n✅ iso-week: ' + pass + ' tests passed');
