// ISO 8601 week computation — single source of truth.
// Thursday-anchored: a week's year = the year of Thursday in that week.
// 사용처: src/pages/whale/index.astro, src/pages/whale/week/[week].astro.
// 두 곳에서 동일 결과를 내야 archive pill 키와 동적 라우트 키가 일치 (broken link 방지).

/** YYYY-MM-DD 또는 ISO datetime 문자열 → {year, week} 또는 null. */
export function isoWeekParts(dateStr) {
  const d = new Date(String(dateStr || '').slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(d.getUTCFullYear() + '-01-01T00:00:00Z');
  const dayOffset = (d.getTime() - yearStart.getTime()) / 86400000;
  const week = Math.ceil((dayOffset + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/** YYYY-MM-DD → "YYYY-Www" (예: "2026-05-30" → "2026-W22") 또는 null. */
export function isoWeekKey(dateStr) {
  const parts = isoWeekParts(dateStr);
  if (!parts) return null;
  return parts.year + '-W' + String(parts.week).padStart(2, '0');
}

/** ISO year+week → 그 주의 월요일 00:00 UTC Date. */
export function isoWeekMonday(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}
