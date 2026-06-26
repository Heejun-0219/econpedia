import type { APIRoute } from 'astro';
import analyses from '../../data/whale-analyses.json';
// W5/W6 (cycle 8) — XML special-char escaping 은 scripts/lib/xml-escape.js 단일 소스
// (14 unit tests, RSS reader 신뢰성 회귀 방지). 추가 feed endpoint 도 동일 import.
import { xmlEscape } from '../../../scripts/lib/xml-escape.js';

const SITE = 'https://econpedia.dedyn.io';
const FEED_URL = `${SITE}/whale/rss.xml`;

function pubDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD. Treat as 00:00 KST → UTC.
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return new Date().toUTCString();
  return d.toUTCString();
}

export const GET: APIRoute = () => {
  const items = (analyses as Array<{
    slug: string;
    title: string;
    excerpt: string;
    date: string;
    ticker: string;
    companyName: string;
    market: string;
    isBuy: boolean;
    person: string;
    amount: string;
  }>)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 50);

  const lastBuild = items.length > 0 ? pubDate(items[0].date) : new Date().toUTCString();

  const itemsXml = items
    .map((a) => {
      const link = `${SITE}/whale/${a.slug}`;
      const market = a.market === 'us' ? 'US' : 'KR';
      const dir = a.isBuy ? '매수' : '매도';
      const desc = `[${market} · ${dir}] ${a.companyName} (${a.ticker}) — ${a.person}, ${a.amount}. ${a.excerpt}`;
      return `    <item>
      <title>${xmlEscape(a.title)}</title>
      <link>${xmlEscape(link)}</link>
      <guid isPermaLink="true">${xmlEscape(link)}</guid>
      <pubDate>${pubDate(a.date)}</pubDate>
      <category>${xmlEscape(market)}</category>
      <description>${xmlEscape(desc)}</description>
    </item>`;
    })
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>EconPedia · Whale Alert</title>
    <link>${SITE}/whale</link>
    <atom:link href="${FEED_URL}" rel="self" type="application/rss+xml" />
    <description>미국·한국 시장의 내부자·기관 자금 흐름. 공시(SEC Form 4 / DART)에 근거한 자동 스캔 시그널.</description>
    <language>ko-KR</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <ttl>60</ttl>
${itemsXml}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
    },
  });
};
