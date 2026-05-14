// scripts/scan-whale-activity.js
// 미국(SEC) + 한국(DART) 전체 시장의 내부자/기관 돈 흐름을 자동 스캔
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import YahooFinance from 'yahoo-finance2';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const MAJOR_COMPANIES_PATH = path.join(ROOT, 'src', 'data', 'major-companies.json');
const SIGNALS_PATH = path.join(ROOT, '.whale-signals.json');

const SEC_HEADERS = { 'User-Agent': 'EconPedia econpedia@dedyn.io', 'Accept': 'application/json' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 환율 — 디스플레이용 근사 (정확한 환산이 필요한 경우 추후 외부 fetch로 대체 가능)
const USD_TO_KRW = 1450;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// SEC submissions API 결과 캐시 (CIK → { sicCode, sicDescription })
const sicCache = new Map();
async function fetchSecSic(cik) {
  if (!cik) return null;
  const padded = String(cik).padStart(10, '0');
  if (sicCache.has(padded)) return sicCache.get(padded);
  try {
    const res = await fetch(`https://data.sec.gov/submissions/CIK${padded}.json`, { headers: SEC_HEADERS });
    if (!res.ok) { sicCache.set(padded, null); return null; }
    const j = await res.json();
    const out = { sicCode: j.sic || null, sicDescription: j.sicDescription || null };
    sicCache.set(padded, out);
    return out;
  } catch {
    sicCache.set(padded, null);
    return null;
  }
}

// 한국 종목의 공시일 기준 종가 조회 (.KS → .KQ 폴백, 비영업일이면 가장 가까운 다음 영업일 종가)
async function getKrCloseOnDate(stockCode, ymdDash) {
  const period1 = new Date(ymdDash);
  if (Number.isNaN(period1.getTime())) return null;
  const period2 = new Date(period1.getTime() + 10 * 24 * 60 * 60 * 1000);
  const opts = { period1, period2, interval: '1d' };
  for (const suffix of ['.KS', '.KQ']) {
    try {
      const data = await yahooFinance.chart(`${stockCode}${suffix}`, opts);
      const quote = data?.quotes?.find(q => q.close);
      if (quote?.close) return quote.close;
    } catch { /* try next suffix */ }
  }
  return null;
}

// ── AI 유틸리티 ──────────────────────────────────────────
async function getIsinWithAI(companyName, ticker) {
  try {
    const prompt = `Find the ISIN (International Securities Identification Number) for "${companyName}" (ticker: ${ticker}). Return ONLY the 12-character ISIN code. If unknown, return "unknown".`;
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.1, maxOutputTokens: 100 }
    });
    const isin = response.text?.trim().toUpperCase();
    if (!isin || isin === 'UNKNOWN' || isin.length !== 12) return null;
    return isin;
  } catch { return null; }
}

// ── SEC Form 4 XML 파싱 ─────────────────────────────────
function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
  return m ? m[1].trim() : null;
}

function extractValueTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>\\s*<value>([^<]+)</value>\\s*</${tag}>`));
  return m ? m[1].trim() : null;
}

function parseSecForm4Xml(xml) {
  const reporterName = extractTag(xml, 'rptOwnerName') || '';
  const officerTitle = extractTag(xml, 'officerTitle') || '';
  const isDirector = extractTag(xml, 'isDirector') === '1';
  const isOfficer = extractTag(xml, 'isOfficer') === '1';
  const is10Pct = extractTag(xml, 'isTenPercentOwner') === '1';

  let role = officerTitle;
  if (!role) {
    if (isOfficer) role = 'Officer';
    else if (isDirector) role = 'Director';
    else if (is10Pct) role = '10%+ Shareholder';
  }

  const txBlocks = [];
  const re = /<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/g;
  let m;
  while ((m = re.exec(xml)) !== null) txBlocks.push(m[1]);

  const openMarket = [];
  for (const block of txBlocks) {
    const codingBlock = block.match(/<transactionCoding>([\s\S]*?)<\/transactionCoding>/)?.[1] || '';
    const code = extractTag(codingBlock, 'transactionCode') || '';
    if (code !== 'P' && code !== 'S') continue;

    const sharesStr = extractValueTag(block, 'transactionShares');
    const priceStr = extractValueTag(block, 'transactionPricePerShare');
    if (!sharesStr) continue;

    const shares = parseFloat(sharesStr.replace(/,/g, ''));
    const price = priceStr ? parseFloat(priceStr.replace(/,/g, '')) : 0;
    if (price === 0) continue;

    openMarket.push({ shares, price, value: shares * price, isBuy: code === 'P' });
  }

  if (!openMarket.length) return null;

  const buyTx = openMarket.filter(t => t.isBuy);
  const sellTx = openMarket.filter(t => !t.isBuy);
  const buyVal = buyTx.reduce((s, t) => s + t.value, 0);
  const sellVal = sellTx.reduce((s, t) => s + t.value, 0);
  const isBuy = buyVal >= sellVal;
  const totalUsd = isBuy ? buyVal : sellVal;
  const sideTx = isBuy ? buyTx : sellTx;
  const totalShares = sideTx.reduce((s, t) => s + t.shares, 0);
  const avgPrice = totalShares > 0 ? totalUsd / totalShares : null;

  return {
    direction: isBuy ? 'buy' : 'sell',
    person: [reporterName, role].filter(Boolean).join(' / '),
    shares: totalShares,
    pricePerShare: avgPrice,
    totalUsd
  };
}

// 한·미 통합 표시 — totalUsd 기준
function formatTotal(totalUsd) {
  const krw = totalUsd * USD_TO_KRW;
  const usdStr = totalUsd >= 1e9
    ? `$${(totalUsd / 1e9).toFixed(2)}B`
    : totalUsd >= 1e6
      ? `$${(totalUsd / 1e6).toFixed(2)}M`
      : totalUsd >= 1e3
        ? `$${Math.round(totalUsd / 1e3)}K`
        : `$${Math.round(totalUsd)}`;
  const krwStr = krw >= 1e12
    ? `${(krw / 1e12).toFixed(2)}조 원`
    : krw >= 1e8
      ? `${Math.round(krw / 1e8).toLocaleString('ko-KR')}억 원`
      : krw >= 1e4
        ? `${Math.round(krw / 1e4).toLocaleString('ko-KR')}만 원`
        : `${Math.round(krw).toLocaleString('ko-KR')} 원`;
  return { usdStr, krwStr, display: `${usdStr} (약 ${krwStr})` };
}

// ── SEC: 전체 시장 RSS 스캔 ──────────────────────────────
async function scanSecForm4(majorCiks) {
  console.log('\n🇺🇸 [SEC] 미국 전체 시장 Form 4 RSS 스캔 시작...');
  const signals = [];
  
  // RSS 피드에서 최근 300건 가져오기 (100건씩 3페이징)
  const targetEntries = [];
  for (let start = 0; start < 300; start += 100) {
    await sleep(200);
    const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&owner=include&start=${start}&count=100&output=atom`;
    const res = await fetch(url, { headers: { ...SEC_HEADERS, 'Accept': 'application/xml' } });
    if (!res.ok) {
      console.error('SEC RSS Fetch Error:', res.statusText);
      continue;
    }
    
    const text = await res.text();
    const entries = text.split('<entry>').slice(1);
    
    for (const entry of entries) {
      if (!entry.includes('<title>4 - ')) continue;
      if (!entry.includes('(Issuer)')) continue; // 회사 항목에서 CIK 추출

      const titleMatch = entry.match(/<title>4 - (.*?) \((.*?)\) \(.*?\)<\/title>/);
      const accMatch = entry.match(/<id>urn:tag:sec.gov,2008:accession-number=(.*?)<\/id>/);
      const fileDateMatch = entry.match(/<b>Filed:<\/b> (.*?) <b>/);

      if (titleMatch && accMatch) {
        targetEntries.push({
          companyName: titleMatch[1],
          cik: titleMatch[2],
          accession: accMatch[1],
          fileDate: fileDateMatch ? fileDateMatch[1] : new Date().toISOString().split('T')[0]
        });
      }
    }
  }

  console.log(`  📊 최근 RSS Form 4 공시: ${targetEntries.length}건 (Issuer 기준)`);

  for (const item of targetEntries) {
    await sleep(200); // SEC rate limit 준수
    try {
      const accNoDashes = item.accession.replace(/-/g, '');
      const cikNumber = parseInt(item.cik, 10).toString();
      const txtUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumber}/${accNoDashes}/${item.accession}.txt`;
      
      const txtRes = await fetch(txtUrl, { headers: SEC_HEADERS });
      if (!txtRes.ok) continue;
      
      const txtContent = await txtRes.text();
      if (!txtContent.includes('<XML>')) continue;
      
      const xml = txtContent.split('<XML>')[1].split('</XML>')[0];
      const parsed = parseSecForm4Xml(xml);
      if (!parsed) continue;

      // 노이즈 필터: $500,000 미만이고 C-Level이 아니면 스킵
      const personLower = parsed.person.toLowerCase();
      const isCLevel = personLower.includes('ceo') || personLower.includes('cfo') || personLower.includes('chief');
      if (parsed.totalUsd < 500000 && !isCLevel) continue;

      const isMajor = Object.keys(majorCiks).includes(item.cik.padStart(10, '0'));
      const tickerTag = extractTag(xml, 'issuerTradingSymbol') || item.companyName;

      // ETF/Fund 제외
      if (['ARKK', 'RENTEC', 'SCION'].includes(tickerTag.toUpperCase())) continue;

      let sigScore = calculateSignificance(parsed.totalUsd, parsed.direction, parsed.person);
      if (isMajor) sigScore += 20; // 메이저 기업 가산점

      // SEC 10 req/s 제한 보호 — 같은 루프 내 2회 호출 사이 간격
      await sleep(120);
      const sic = await fetchSecSic(item.cik);
      const totals = formatTotal(parsed.totalUsd);
      signals.push({
        id: `form4-${tickerTag.toLowerCase()}-${item.fileDate}-${item.accession}`,
        type: 'insider',
        market: 'us',
        source: 'SEC Form 4',
        companyName: item.companyName,
        ticker: tickerTag,
        cik: item.cik,
        person: parsed.person,
        direction: parsed.direction,
        shares: parsed.shares,
        pricePerShare: parsed.pricePerShare,
        currency: 'USD',
        totalUsd: parsed.totalUsd,
        totalKrw: parsed.totalUsd * USD_TO_KRW,
        amount: totals.display,
        amountUsd: totals.usdStr,
        amountKrw: totals.krwStr,
        sicCode: sic?.sicCode || null,
        sector: sic?.sicDescription || null,
        date: item.fileDate,
        significance: Math.min(sigScore, 100)
      });
      console.log(`  ✅ ${tickerTag} | ${parsed.person} | ${parsed.direction.toUpperCase()} | ${totals.display} ${isMajor ? '(🌟 MAJOR BONUS)' : ''}`);
      
    } catch (e) {
      // skip
    }
  }

  console.log(`  🐋 SEC 시그널 추출: ${signals.length}건`);
  return signals;
}

// ── DART: 한국 시장 전체 지분공시 스캔 ─────────────────────
async function scanDartInsider(majorCorpCodes) {
  console.log('\n🇰🇷 [DART] 한국 전체 시장 지분공시 스캔 시작...');
  const signals = [];
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) { console.warn('  ⚠️ DART_API_KEY 미설정'); return signals; }

  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  const bgnDe = weekAgo.toISOString().split('T')[0].replace(/-/g, '');
  const endDe = today.toISOString().split('T')[0].replace(/-/g, '');

  const majorByTicker = {};
  for (const [code, info] of Object.entries(majorCorpCodes)) {
    majorByTicker[info.ticker] = { ...info, originalCode: code };
  }

  try {
    const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${apiKey}&bgn_de=${bgnDe}&end_de=${endDe}&pblntf_ty=D&page_count=100`;
    const res = await fetch(url);
    if (!res.ok) return signals;
    const data = await res.json();
    if (data.status !== '000' || !data.list) { console.log('  ℹ️ 지분공시 없음'); return signals; }

    console.log(`  📊 최근 지분공시: ${data.total_count}건`);

    // 상장사(Y/K) + 임원/주요주주 보고서만 전체 필터링 (isMajor 제약 삭제)
    const relevant = data.list.filter(item => {
      const isListed = item.corp_cls === 'Y' || item.corp_cls === 'K';
      const isInsider = item.report_nm?.includes('임원') || item.report_nm?.includes('주요주주');
      return isListed && isInsider;
    });
    console.log(`  🎯 전체 시장 임원 거래: ${relevant.length}건`);

    // 상위 30건 정도만 상세 조회 (전체 다 하면 API Rate limit 초과 위험)
    for (const item of relevant.slice(0, 30)) {
      await sleep(200);
      try {
        const elUrl = `https://opendart.fss.or.kr/api/elestock.json?crtfc_key=${apiKey}&corp_code=${item.corp_code}&bgn_de=${bgnDe}&end_de=${endDe}`;
        const elRes = await fetch(elUrl);
        if (!elRes.ok) continue;
        const elData = await elRes.json();
        if (elData.status !== '000' || !elData.list?.length) continue;

        const sorted = [...elData.list].sort((a, b) => b.rcept_dt.localeCompare(a.rcept_dt));
        const rep = sorted[0];

        const changeCount = parseInt((rep.sp_stock_lmp_irds_cnt || '0').replace(/,/g, ''));
        if (changeCount === 0) continue;

        const isBuy = changeCount > 0;
        const person = [rep.repror, rep.isu_exctv_ofcps].filter(v => v && v !== '-').join(' / ');
        const shares = Math.abs(changeCount);

        // 공시일 종가로 정확한 KRW 거래 금액 산출 (실패 시 보수적 fallback)
        const dateDash = rep.rcept_dt.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
        const closeKrw = await getKrCloseOnDate(item.stock_code, dateDash);
        const pricePerShareKrw = closeKrw || 50_000; // fallback: 평균치 가정
        const totalKrw = shares * pricePerShareKrw;
        const totalUsd = totalKrw / USD_TO_KRW;

        // 노이즈 필터: 5억 원 미만이고 C레벨 아니면 스킵 (정확한 KRW 기준)
        const personLower = person.toLowerCase();
        const isCLevel = personLower.includes('대표이사') || personLower.includes('회장') || personLower.includes('사장');
        if (totalKrw < 500_000_000 && !isCLevel) continue;

        const isMajor = majorByTicker[item.stock_code];
        const totals = formatTotal(totalUsd);
        const amount = `${totals.display} · ${shares.toLocaleString('ko-KR')}주 ${isBuy ? '취득' : '처분'}${closeKrw ? '' : ' (단가 추정)'}`;

        // significance는 USD 기준으로 한·미 통일
        let sigScore = calculateSignificance(totalUsd, isBuy ? 'buy' : 'sell', person);
        if (isMajor) sigScore += 20;

        signals.push({
          id: `dart-${item.stock_code}-${rep.rcept_dt}`,
          type: 'insider',
          market: 'kr',
          source: 'DART 지분공시',
          companyName: item.corp_name,
          ticker: item.stock_code,
          corpCode: item.corp_code,
          person: person || '임원',
          direction: isBuy ? 'buy' : 'sell',
          shares,
          pricePerShare: pricePerShareKrw,
          priceSource: closeKrw ? 'yahoo_close' : 'estimate_50000_krw',
          currency: 'KRW',
          totalKrw,
          totalUsd,
          amount,
          amountUsd: totals.usdStr,
          amountKrw: totals.krwStr,
          sicCode: null,
          sector: isMajor?.sector || null,
          date: dateDash,
          significance: Math.min(sigScore, 100)
        });
        console.log(`  ✅ ${item.corp_name} | ${person} | ${isBuy ? 'BUY' : 'SELL'} | ${amount} ${isMajor ? '(🌟 MAJOR BONUS)' : ''}`);
      } catch { /* skip */ }
    }
  } catch (e) {
    console.error('DART Scan Error:', e.message);
  }

  console.log(`  🐋 DART 시그널 추출: ${signals.length}건`);
  return signals;
}

// ── Significance 점수 계산 ────────────────────────────────
function calculateSignificance(totalValue, direction, person) {
  let score = 0;

  // 금액 기반 (0-50점) - 가중치 약간 상향
  if (totalValue >= 50_000_000) score += 50;       // $50M+
  else if (totalValue >= 10_000_000) score += 40;  // $10M+
  else if (totalValue >= 5_000_000) score += 30;   // $5M+
  else if (totalValue >= 1_000_000) score += 20;   // $1M+
  else score += 10;

  // 매수는 매도보다 시그널 가치 높음 (0-20점)
  if (direction === 'buy') score += 20;
  else score += 10;

  // C-Level 보너스 (0-30점)
  const personLower = person.toLowerCase();
  if (personLower.includes('ceo') || personLower.includes('chief executive') || personLower.includes('대표이사')) score += 30;
  else if (personLower.includes('cfo') || personLower.includes('coo') || personLower.includes('cto') || personLower.includes('회장')) score += 25;
  else if (personLower.includes('president') || personLower.includes('부회장') || personLower.includes('사장')) score += 20;
  else if (personLower.includes('director') || personLower.includes('이사')) score += 15;
  else if (personLower.includes('10%')) score += 10;

  return Math.min(score, 100);
}

// ── 메인 ──────────────────────────────────────────────────
async function main() {
  console.log('🐋 Whale Alert — 전체 시장 돈 흐름 스캐닝 시작...');

  const majorData = JSON.parse(await fs.readFile(MAJOR_COMPANIES_PATH, 'utf8'));
  const usCiks = majorData.us || {};
  const krCorpCodes = majorData.kr || {};

  const allSignals = [];

  // 1. SEC Form 4 전체 시장 스캔
  const secSignals = await scanSecForm4(usCiks);
  allSignals.push(...secSignals);

  // 2. DART 지분공시 전체 시장 스캔
  const dartSignals = await scanDartInsider(krCorpCodes);
  allSignals.push(...dartSignals);

  // 중요도순 정렬
  allSignals.sort((a, b) => b.significance - a.significance);

  // 중복 제거 (같은 종목+같은 날짜)
  const seen = new Set();
  const unique = allSignals.filter(s => {
    const key = `${s.ticker}-${s.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await fs.writeFile(SIGNALS_PATH, JSON.stringify(unique, null, 2), 'utf8');
  console.log(`\n🐋 스캔 완료: ${unique.length}건의 Whale Signal 저장됨 (최상위 필터 통과분)`);
  if (unique.length > 0) {
    console.log('\n📊 Top 5 시그널:');
    unique.slice(0, 5).forEach((s, i) => {
      console.log(`  ${i + 1}. [${s.significance}점] ${s.ticker} | ${s.person} | ${s.direction.toUpperCase()} | ${s.amount}`);
    });
  }
}

main();
