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
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.1, maxOutputTokens: 100 }
    });
    const isin = response.text?.trim().toUpperCase();
    if (!isin || isin === 'UNKNOWN' || isin.length !== 12) return null;
    return isin;
  } catch { return null; }
}

// ── SEC Form 4 XML 파싱 (기존 로직 재활용) ─────────────────
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

// ── SEC: 주요 기업 CIK 순회하며 최신 Form 4 스캔 ────────────
async function scanSecForm4(majorCiks) {
  console.log('\n🇺🇸 [SEC] 주요 기업 Form 4 스캔 시작...');
  const signals = [];
  const today = new Date().toISOString().split('T')[0];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7); // 최근 7일
  const cutoff = cutoffDate.toISOString().split('T')[0];

  const cikEntries = Object.entries(majorCiks);
  console.log(`  📊 스캔 대상: ${cikEntries.length}개 주요 기업`);

  for (const [cik, info] of cikEntries) {
    // 펀드/ETF CIK는 Form 4 대상이 아니므로 건너뜀
    if (['ARKK', 'RenTec', 'Scion'].includes(info.ticker)) continue;

    await sleep(120); // SEC rate limit: 10 req/sec
    try {
      const paddedCik = cik.padStart(10, '0');
      const res = await fetch(`https://data.sec.gov/submissions/CIK${paddedCik}.json`, { headers: SEC_HEADERS });
      if (!res.ok) continue;

      const data = await res.json();
      const f = data.filings?.recent;
      if (!f?.form) continue;

      // 최근 7일 내 Form 4 찾기
      for (let i = 0; i < Math.min(f.form.length, 20); i++) {
        if ((f.form[i] === '4' || f.form[i] === '4/A') && f.filingDate[i] >= cutoff) {
          const accession = f.accessionNumber[i];
          const fileDate = f.filingDate[i];

          await sleep(120);
          // XML 파싱
          const accNoDashes = accession.replace(/-/g, '');
          const idxRes = await fetch(
            `https://www.sec.gov/Archives/edgar/data/${cik}/${accNoDashes}/index.json`,
            { headers: SEC_HEADERS }
          );
          if (!idxRes.ok) continue;
          const idxData = await idxRes.json();
          const xmlFile = idxData.directory?.item?.find(f => f.name.endsWith('.xml') && !f.name.includes('primary_doc'));
          if (!xmlFile) continue;

          await sleep(120);
          const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accNoDashes}/${xmlFile.name}`;
          const xmlRes = await fetch(xmlUrl, { headers: { ...SEC_HEADERS, Accept: 'text/xml, */*' } });
          if (!xmlRes.ok) continue;

          const xml = await xmlRes.text();
          const parsed = parseSecForm4Xml(xml);
          if (!parsed || parsed.totalValue < 500000) continue; // $500K 이상만

          signals.push({
            id: `form4-${info.ticker.toLowerCase()}-${fileDate}`,
            type: 'insider',
            market: 'us',
            source: 'SEC Form 4',
            companyName: info.name,
            ticker: info.ticker,
            cik,
            person: parsed.person,
            direction: parsed.direction,
            amount: parsed.amount,
            totalValue: parsed.totalValue,
            date: fileDate,
            significance: calculateSignificance(parsed.totalValue, parsed.direction, parsed.person)
          });
          console.log(`  ✅ ${info.ticker} | ${parsed.person} | ${parsed.direction.toUpperCase()} | ${parsed.amount}`);
          break; // 기업당 최신 1건만
        }
      }
    } catch { /* skip */ }
  }

  console.log(`  🐋 SEC 시그널: ${signals.length}건`);
  return signals;
}

// ── DART: 한국 시장 전체 지분공시 스캔 ─────────────────────
async function scanDartInsider(majorCorpCodes) {
  console.log('\n🇰🇷 [DART] 한국 시장 지분공시 스캔 시작...');
  const signals = [];
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) { console.warn('  ⚠️ DART_API_KEY 미설정'); return signals; }

  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  const bgnDe = weekAgo.toISOString().split('T')[0].replace(/-/g, '');
  const endDe = today.toISOString().split('T')[0].replace(/-/g, '');

  try {
    // pblntf_ty=J: 지분공시
    const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${apiKey}&bgn_de=${bgnDe}&end_de=${endDe}&pblntf_ty=J&page_count=100`;
    const res = await fetch(url);
    if (!res.ok) return signals;
    const data = await res.json();
    if (data.status !== '000' || !data.list) { console.log('  ℹ️ 지분공시 없음'); return signals; }

    console.log(`  📊 최근 지분공시: ${data.total_count}건`);

    // 주요 기업 필터 + 임원/주요주주 보고서만
    const relevant = data.list.filter(item => {
      const isListed = item.corp_cls === 'Y' || item.corp_cls === 'K';
      const isInsider = item.report_nm?.includes('임원') || item.report_nm?.includes('주요주주');
      const isMajor = majorCorpCodes[item.corp_code];
      return isListed && isInsider && isMajor;
    });
    console.log(`  🎯 주요 기업 임원 거래: ${relevant.length}건`);

    // elestock API로 상세 데이터 조회
    for (const item of relevant.slice(0, 10)) { // 최대 10건
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
        const absStr = Math.abs(changeCount).toLocaleString('ko-KR');
        const amount = `${absStr}주 ${isBuy ? '취득' : '처분'}`;
        const info = majorCorpCodes[item.corp_code];

        signals.push({
          id: `dart-${info.ticker}-${rep.rcept_dt}`,
          type: 'insider',
          market: 'kr',
          source: 'DART 지분공시',
          companyName: info.name,
          ticker: info.ticker,
          corpCode: item.corp_code,
          person: person || '임원',
          direction: isBuy ? 'buy' : 'sell',
          amount,
          totalValue: Math.abs(changeCount), // 주식 수 기준
          date: rep.rcept_dt.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
          significance: calculateSignificance(Math.abs(changeCount) * 50000, isBuy ? 'buy' : 'sell', person) // 대략적 금액 추정
        });
        console.log(`  ✅ ${info.name} | ${person} | ${isBuy ? 'BUY' : 'SELL'} | ${amount}`);
      } catch { /* skip */ }
    }
  } catch (e) {
    console.error('DART Scan Error:', e.message);
  }

  return signals;
}

// ── Significance 점수 계산 ────────────────────────────────
function calculateSignificance(totalValue, direction, person) {
  let score = 0;

  // 금액 기반 (0-50점)
  if (totalValue >= 100_000_000) score += 50;      // $100M+
  else if (totalValue >= 10_000_000) score += 40;  // $10M+
  else if (totalValue >= 5_000_000) score += 30;   // $5M+
  else if (totalValue >= 1_000_000) score += 20;   // $1M+
  else score += 10;

  // 매수는 매도보다 시그널 가치 높음 (0-20점)
  if (direction === 'buy') score += 20;
  else score += 10;

  // C-Level 보너스 (0-30점)
  const personLower = person.toLowerCase();
  if (personLower.includes('ceo') || personLower.includes('chief executive')) score += 30;
  else if (personLower.includes('cfo') || personLower.includes('coo') || personLower.includes('cto')) score += 25;
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

  // 1. SEC Form 4 스캔
  const secSignals = await scanSecForm4(usCiks);
  allSignals.push(...secSignals);

  // 2. DART 지분공시 스캔
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
  console.log(`\n🐋 스캔 완료: ${unique.length}건의 Whale Signal 저장됨`);
  if (unique.length > 0) {
    console.log('\n📊 Top 5 시그널:');
    unique.slice(0, 5).forEach((s, i) => {
      console.log(`  ${i + 1}. [${s.significance}점] ${s.ticker} | ${s.person} | ${s.direction.toUpperCase()} | ${s.amount}`);
    });
  }
}

main();
