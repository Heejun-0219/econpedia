// scripts/scan-whale-activity.js
// 미국(SEC) + 한국(DART) 전체 시장의 내부자/기관 돈 흐름을 자동 스캔
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const MAJOR_COMPANIES_PATH = path.join(ROOT, 'src', 'data', 'major-companies.json');
const SIGNALS_PATH = path.join(ROOT, '.whale-signals.json');

const SEC_HEADERS = { 'User-Agent': 'EconPedia econpedia@dedyn.io', 'Accept': 'application/json' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ── AI 유틸리티 ──────────────────────────────────────────
async function getIsinWithAI(companyName, ticker) {
  try {
    const prompt = `Find the ISIN (International Securities Identification Number) for "${companyName}" (ticker: ${ticker}). Return ONLY the 12-character ISIN code. If unknown, return "unknown".`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-04-17',
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

  const buyVal = openMarket.filter(t => t.isBuy).reduce((s, t) => s + t.value, 0);
  const sellVal = openMarket.filter(t => !t.isBuy).reduce((s, t) => s + t.value, 0);
  const isBuy = buyVal >= sellVal;
  const totalVal = isBuy ? buyVal : sellVal;

  return {
    direction: isBuy ? 'buy' : 'sell',
    person: [reporterName, role].filter(Boolean).join(' / '),
    amount: formatUsd(totalVal),
    totalValue: totalVal
  };
}

function formatUsd(val) {
  const KRW = 1450;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B (약 ${Math.round(val * KRW / 1e8)}억 원)`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M (약 ${Math.round(val * KRW / 1e8)}억 원)`;
  if (val >= 1e3) return `$${Math.round(val / 1e3)}K (약 ${Math.round(val * KRW / 1e4)}만 원)`;
  return `$${Math.round(val)}`;
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
      if (parsed.totalValue < 500000 && !isCLevel) continue;

      const isMajor = Object.keys(majorCiks).includes(item.cik.padStart(10, '0'));
      const tickerTag = extractTag(xml, 'issuerTradingSymbol') || item.companyName;

      // ETF/Fund 제외
      if (['ARKK', 'RENTEC', 'SCION'].includes(tickerTag.toUpperCase())) continue;

      let sigScore = calculateSignificance(parsed.totalValue, parsed.direction, parsed.person);
      if (isMajor) sigScore += 20; // 메이저 기업 가산점

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
        amount: parsed.amount,
        totalValue: parsed.totalValue,
        date: item.fileDate,
        significance: Math.min(sigScore, 100)
      });
      console.log(`  ✅ ${tickerTag} | ${parsed.person} | ${parsed.direction.toUpperCase()} | ${parsed.amount} ${isMajor ? '(🌟 MAJOR BONUS)' : ''}`);
      
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
        
        // 노이즈 필터 적용 (주식 수 * 대략적 단가 5만원 가정 -> 7억 원 미만이고 C레벨 아니면 스킵)
        const personLower = person.toLowerCase();
        const isCLevel = personLower.includes('대표이사') || personLower.includes('회장') || personLower.includes('사장');
        const estimatedValue = Math.abs(changeCount) * 50000;
        if (estimatedValue < 500_000_000 && !isCLevel) continue;

        const isMajor = majorByTicker[item.stock_code];
        const absStr = Math.abs(changeCount).toLocaleString('ko-KR');
        const amount = `${absStr}주 ${isBuy ? '취득' : '처분'}`;

        let sigScore = calculateSignificance(estimatedValue, isBuy ? 'buy' : 'sell', person);
        if (isMajor) sigScore += 20; // 메이저 기업 가산점

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
          amount,
          totalValue: Math.abs(changeCount),
          date: rep.rcept_dt.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
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
