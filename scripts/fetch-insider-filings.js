// scripts/fetch-insider-filings.js
// SEC Form 4 (미국) + DART 임원 소유보고서 (한국) 실시간 수집 및 파싱

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const COMPANIES_PATH = path.join(ROOT, 'src', 'data', 'insider-companies.json');
const INSIDER_TRIGGERS_PATH = path.join(ROOT, '.insider-triggers.json');

const SEC_HEADERS = {
  'User-Agent': 'EconPedia econpedia@dedyn.io',
  'Accept': 'application/json'
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function getDomainWithAI(companyName) {
  try {
    const prompt = `Find the official main website domain for the company named "${companyName}".
Return ONLY the full domain name with extension (e.g., apple.com, tesla.com, samsung.com). Do not include https://, www, or any other text. If you cannot find it, return exactly "unknown".`;
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.1, maxOutputTokens: 500 }
    });
    const domain = response.text?.trim().toLowerCase();
    if (!domain || domain === 'unknown' || domain.includes(' ') || !domain.includes('.')) return null;
    return domain;
  } catch (e) {
    console.error('AI Domain Fetch Error:', e);
    return null;
  }
}

async function getIsinWithAI(companyName, ticker) {
  try {
    const prompt = `Find the ISIN (International Securities Identification Number) for the company "${companyName}" with ticker "${ticker}".
Return ONLY the 12-character ISIN code (e.g., US67066G1040, KR7005930003). If you cannot find it, return exactly "unknown".`;
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.1, maxOutputTokens: 2000 }
    });
    const isin = response.text?.trim().toUpperCase();
    if (!isin || isin === 'UNKNOWN' || isin.length !== 12) return null;
    return isin;
  } catch (e) {
    console.error('AI ISIN Fetch Error:', e);
    return null;
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── SEC: 최신 Form 4 공시 메타데이터 수집 ────────────────────────
async function fetchSecLatestForm4(cik) {
  try {
    const paddedCik = cik.padStart(10, '0');
    const res = await fetch(`https://data.sec.gov/submissions/CIK${paddedCik}.json`, {
      headers: SEC_HEADERS
    });
    if (!res.ok) return null;

    const data = await res.json();
    const f = data.filings?.recent;
    if (!f?.form) return null;

    for (let i = 0; i < f.form.length; i++) {
      if (f.form[i] === '4' || f.form[i] === '4/A') {
        return {
          date: f.filingDate[i],
          accessionNumber: f.accessionNumber[i],
          primaryDocument: f.primaryDocument[i],
          cik: parseInt(cik)
        };
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ── SEC: Form 4 XML 파싱 ──────────────────────────────────────
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
  const isDirector   = extractTag(xml, 'isDirector') === '1';
  const isOfficer    = extractTag(xml, 'isOfficer') === '1';
  const is10Pct      = extractTag(xml, 'isTenPercentOwner') === '1';

  let role = officerTitle;
  if (!role) {
    if (isOfficer)        role = 'Officer';
    else if (isDirector)  role = 'Director';
    else if (is10Pct)     role = '10%+ Shareholder';
  }

  // 비파생 거래 블록 추출
  const txBlocks = [];
  const re = /<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/g;
  let m;
  while ((m = re.exec(xml)) !== null) txBlocks.push(m[1]);

  const openMarket = [];
  for (const block of txBlocks) {
    const codingBlock = block.match(/<transactionCoding>([\s\S]*?)<\/transactionCoding>/)?.[1] || '';
    const code = extractTag(codingBlock, 'transactionCode') || '';
    if (code !== 'P' && code !== 'S') continue; // 장내 매수(P)/매도(S)만

    const sharesStr = extractValueTag(block, 'transactionShares');
    const priceStr  = extractValueTag(block, 'transactionPricePerShare');
    if (!sharesStr) continue;

    const shares = parseFloat(sharesStr.replace(/,/g, ''));
    const price  = priceStr ? parseFloat(priceStr.replace(/,/g, '')) : 0;
    if (price === 0) continue; // 무상취득·자동부여 등 제외

    // transactionCode P=장내매수, S=장내매도 → isBuy 판정
    openMarket.push({ shares, price, value: shares * price, isBuy: code === 'P' });
  }

  if (!openMarket.length) return null;

  const buyVal  = openMarket.filter(t =>  t.isBuy).reduce((s, t) => s + t.value, 0);
  const sellVal = openMarket.filter(t => !t.isBuy).reduce((s, t) => s + t.value, 0);
  const isBuy   = buyVal >= sellVal;
  const totalVal = isBuy ? buyVal : sellVal;

  return {
    type:   isBuy ? 'buy' : 'sell',
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

async function fetchAndParseSecForm4(filing) {
  try {
    const { cik, accessionNumber, primaryDocument } = filing;
    const accNoDashes = accessionNumber.replace(/-/g, '');
    // xslF345X06/ 뷰어 접두사 제거
    const cleanDoc = primaryDocument.replace(/^xslF345X06\//, '');
    const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accNoDashes}/${cleanDoc}`;

    const res = await fetch(url, {
      headers: { ...SEC_HEADERS, Accept: 'text/xml, application/xml, */*' }
    });
    if (!res.ok) return null;

    const xml = await res.text();
    return parseSecForm4Xml(xml);
  } catch (e) {
    console.error(`  ⚠️ Form 4 XML 파싱 오류:`, e.message);
    return null;
  }
}

// ── DART: 임원·주요주주 소유보고서 수집 및 파싱 ────────────────
async function fetchDartInsiderFilings(corp_code) {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    console.warn(`  ⚠️ DART_API_KEY 미설정`);
    return null;
  }

  try {
    const today = new Date();
    const endDe = today.toISOString().split('T')[0].replace(/-/g, '');
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);
    const bgnDe = oneYearAgo.toISOString().split('T')[0].replace(/-/g, '');

    const url = `https://opendart.fss.or.kr/api/elestock.json?crtfc_key=${apiKey}&corp_code=${corp_code}&bgn_de=${bgnDe}&end_de=${endDe}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (data.status !== '000' || !data.list?.length) return null;

    // 날짜 내림차순 정렬 후 최신 날짜 추출
    const sorted = [...data.list].sort((a, b) => b.rcept_dt.localeCompare(a.rcept_dt));
    const latestDate = sorted[0].rcept_dt; // "YYYY-MM-DD"

    // 같은 날짜 중 변동량이 가장 큰 보고를 대표 거래로 선택
    const sameDay = sorted.filter(r => r.rcept_dt === latestDate);
    const representative = sameDay.sort((a, b) => {
      const aAbs = Math.abs(parseInt((a.sp_stock_lmp_irds_cnt || '0').replace(/,/g, '')));
      const bAbs = Math.abs(parseInt((b.sp_stock_lmp_irds_cnt || '0').replace(/,/g, '')));
      return bAbs - aAbs;
    })[0];

    return { date: latestDate, dartData: representative };
  } catch (e) {
    console.error(`  ⚠️ DART API 오류:`, e.message);
    return null;
  }
}

function parseDartInsiderData(dartData) {
  try {
    const person = [dartData.repror, dartData.isu_exctv_ofcps]
      .filter(v => v && v !== '-').join(' / ');

    const changeCount = parseInt((dartData.sp_stock_lmp_irds_cnt || '0').replace(/,/g, ''));
    if (changeCount === 0) return null;

    const isBuy  = changeCount > 0;
    const absStr = Math.abs(changeCount).toLocaleString('ko-KR');
    const amount = `${absStr}주 ${isBuy ? '취득' : '처분'}`;

    return { type: isBuy ? 'buy' : 'sell', person: person || '임원', amount, changeCount };
  } catch (e) {
    return null;
  }
}

// ── 메인 ──────────────────────────────────────────────────────
async function main() {
  try {
    const companies = JSON.parse(await fs.readFile(COMPANIES_PATH, 'utf8'));
    const triggers = {};
    let shouldUpdateManifest = false;

    console.log('📡 내부자 거래 공시 감지 시작...\n');

    for (const comp of companies) {
      console.log(`[${comp.country.toUpperCase()}] ${comp.name} 확인 중...`);
      
      // 도메인이 없는 신규 회사일 경우 AI를 통해 자동 추가
      if (!comp.domain) {
        console.log(`  🔍 도메인 정보가 없어 AI로 검색 중...`);
        const domain = await getDomainWithAI(comp.name);
        if (domain) {
          comp.domain = domain;
          shouldUpdateManifest = true;
          console.log(`  ✅ 도메인 추가 완료: ${domain}`);
        } else {
          console.log(`  ⚠️ 도메인을 찾을 수 없음 (fallback 사용 예정)`);
        }
      }

      // ISIN 정보가 없는 경우 AI를 통해 자동 추가
      if (!comp.isin) {
        console.log(`  🔍 ISIN 정보가 없어 AI로 검색 중...`);
        const isin = await getIsinWithAI(comp.name, comp.ticker);
        if (isin) {
          comp.isin = isin;
          comp.tossUrl = `https://www.tossinvest.com/stocks/${isin}/order`;
          comp.tossDeepLink = `supertoss://stock/item?code=${isin}`;
          shouldUpdateManifest = true;
          console.log(`  ✅ ISIN 및 토스 링크 추가 완료: ${isin}`);
        } else {
          console.log(`  ⚠️ ISIN을 찾을 수 없음`);
        }
      }

      let latestDate = null;
      let parsedData = null;

      if (comp.country === 'us') {
        await sleep(150); // SEC: 10 req/sec 제한
        const filing = await fetchSecLatestForm4(comp.cik);
        if (!filing) { console.log('  SEC API 응답 없음\n'); continue; }

        latestDate = filing.date;
        if (latestDate !== comp.lastFilingDate) {
          console.log(`  🚨 신규 Form 4 감지 (${latestDate}) — XML 파싱 중...`);
          await sleep(150);
          parsedData = await fetchAndParseSecForm4(filing);
          // 파싱 결과 무관하게 lastFilingDate 업데이트 (재처리 방지)
          comp.lastFilingDate = latestDate;
          shouldUpdateManifest = true;
          if (parsedData) {
            console.log(`  ✅ ${parsedData.person} | ${parsedData.type.toUpperCase()} | ${parsedData.amount}`);
          } else {
            console.log(`  ℹ️ 유의미한 장내 거래 없음 (스톡옵션·자동부여만 존재) — 건너뜀`);
            latestDate = null; // 트리거만 저장 안 함
          }
        } else {
          console.log(`  변동 없음 (마지막: ${comp.lastFilingDate || '없음'})`);
        }

      } else if (comp.country === 'kr') {
        const dartResult = await fetchDartInsiderFilings(comp.corp_code);
        if (!dartResult) { console.log('  DART 공시 없음\n'); continue; }

        latestDate = dartResult.date;
        if (latestDate !== comp.lastFilingDate) {
          console.log(`  🚨 신규 DART 공시 감지 (${latestDate}) — 파싱 중...`);
          parsedData = parseDartInsiderData(dartResult.dartData);
          // 파싱 결과 무관하게 lastFilingDate 업데이트 (재처리 방지)
          comp.lastFilingDate = latestDate;
          shouldUpdateManifest = true;
          if (parsedData) {
            console.log(`  ✅ ${parsedData.person} | ${parsedData.type.toUpperCase()} | ${parsedData.amount}`);
          } else {
            console.log(`  ℹ️ 변동 수량 0 — 건너뜀`);
            latestDate = null; // 트리거만 저장 안 함
          }
        } else {
          console.log(`  변동 없음 (마지막: ${comp.lastFilingDate || '없음'})`);
        }
      }

      if (latestDate && parsedData) {
        const { totalValue: _, ...triggerFields } = parsedData; // totalValue 제외
        triggers[comp.id] = { date: latestDate, ...triggerFields };
      }
      console.log();
    }

    if (shouldUpdateManifest) {
      await fs.writeFile(COMPANIES_PATH, JSON.stringify(companies, null, 2), 'utf8');
      console.log('✅ 기업 매니페스트 업데이트 완료');
    }

    await fs.writeFile(INSIDER_TRIGGERS_PATH, JSON.stringify(triggers, null, 2), 'utf8');
    console.log(`\n✅ ${Object.keys(triggers).length}건 트리거 저장 완료`);

  } catch (error) {
    console.error('❌ 오류:', error);
    process.exit(1);
  }
}

main();
