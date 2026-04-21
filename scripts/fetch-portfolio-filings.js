// scripts/fetch-portfolio-filings.js
// 투자자들의 최신 공시 데이터를 수집하거나 최신 Filing Date를 확인하는 스크립트

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const INVESTORS_PATH = path.join(ROOT, 'src', 'data', 'portfolio-investors.json');
const HOLDINGS_PATH = path.join(ROOT, '.portfolio-holdings.json');

// SEC EDGAR API User-Agent 규정 (회사명/이메일)
const SEC_HEADERS = {
  'User-Agent': 'EconPedia econpedia@dedyn.io',
  'Accept': 'application/json'
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function getDomainWithAI(companyName) {
  try {
    const prompt = `Find the official main website domain for the company/investor named "${companyName}".
Return ONLY the full domain name with extension (e.g., apple.com, ark-invest.com, nps.or.kr). Do not include https://, www, or any other text. If you cannot find it, return exactly "unknown".`;
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
    const prompt = `Find the ISIN (International Securities Identification Number) for the company/ETF "${companyName}" with ticker "${ticker}". 
If it's an investor/fund, find the ISIN for their most representative main ETF or stock if possible.
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

async function fetchSecLatestFilingDate(cik) {
  try {
    const paddedCik = cik.padStart(10, '0');
    const response = await fetch(`https://data.sec.gov/submissions/CIK${paddedCik}.json`, {
      headers: SEC_HEADERS
    });
    
    if (!response.ok) throw new Error(`SEC API Error: ${response.statusText}`);
    
    const data = await response.json();
    const filings = data.filings?.recent;
    
    if (!filings || !filings.form) return null;
    
    for (let i = 0; i < filings.form.length; i++) {
      if (filings.form[i] === '13F-HR' || filings.form[i] === '13F-HR/A') {
        return filings.filingDate[i];
      }
    }
    return null;
  } catch (e) {
    console.error(`⚠️ SEC Fetch Error for CIK ${cik}:`, e.message);
    return null;
  }
}

async function fetchDartNpsHoldings() {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ DART_API_KEY가 설정되지 않아 국민연금 공시를 가져올 수 없습니다.');
    return null;
  }
  
  try {
    // TODO: 실제 DART 국민연금 지분 공시 API 구현 필요
    console.warn('⚠️ DART 국민연금 공시 API 미구현 — 수집 생략');
    return null;
  } catch (e) {
    console.error(`⚠️ DART Fetch Error:`, e.message);
    return null;
  }
}

async function main() {
  try {
    const rawData = await fs.readFile(INVESTORS_PATH, 'utf8');
    const investors = JSON.parse(rawData);
    
    const holdings = {};
    let shouldUpdateManifest = false;

    console.log('📡 투자자 공시 데이터 수집 시작...');
    
    for (const inv of investors) {
      console.log(`- [${inv.category}] ${inv.name} 공시 확인 중...`);
      
      // 도메인이 없는 신규 투자자/회사일 경우 AI를 통해 자동 추가
      if (!inv.domain) {
        console.log(`  🔍 도메인 정보가 없어 AI로 검색 중...`);
        const domain = await getDomainWithAI(inv.name);
        if (domain) {
          inv.domain = domain;
          shouldUpdateManifest = true;
          console.log(`  ✅ 도메인 추가 완료: ${domain}`);
        } else {
          console.log(`  ⚠️ 도메인을 찾을 수 없음 (fallback 사용 예정)`);
        }
      }

      // ISIN 정보가 없는 경우 AI를 통해 자동 추가
      if (!inv.isin) {
        console.log(`  🔍 ISIN 정보가 없어 AI로 검색 중...`);
        const isin = await getIsinWithAI(inv.name, inv.ticker);
        if (isin) {
          inv.isin = isin;
          inv.tossUrl = `https://www.tossinvest.com/stocks/${isin}/order`;
          inv.tossDeepLink = `supertoss://stock/item?code=${isin}`;
          shouldUpdateManifest = true;
          console.log(`  ✅ ISIN 및 토스 링크 추가 완료: ${isin}`);
        } else {
          console.log(`  ⚠️ ISIN을 찾을 수 없음`);
        }
      }

      let latestDate = null;
      
      if (inv.cik) {
        latestDate = await fetchSecLatestFilingDate(inv.cik);
      } else if (inv.country === 'kr' && inv.investorCode === 'NPS') {
        latestDate = await fetchDartNpsHoldings();
      }
      
      // TODO: ARK Invest 일간 트레이드 피드 실제 API 연동 필요
      // (현재 SEC 13F는 분기 단위이므로 일간 감지는 별도 데이터 소스 필요)

      if (latestDate && latestDate !== inv.lastFilingDate) {
        console.log(`  🎉 신규 공시 발견! (${inv.lastFilingDate || '없음'} -> ${latestDate})`);
        inv.lastFilingDate = latestDate;
        shouldUpdateManifest = true;
        
        // 여기에 원래 XML 파싱 로직이나 API를 통한 보유 종목 수집 로직이 들어갑니다.
        // 현재는 Gemini가 프롬프트에서 자체적으로 지식을 활용하거나, 
        // 하네스에서 뉴스/웹 검색을 활용할 수 있도록 '신규 트리거'만 활성화합니다.
        holdings[inv.id] = {
          date: latestDate,
          eventTriggered: true,
          mockData: `최근 ${latestDate} 기준 13F 주요 포지션 변동`
        };
      } else {
        console.log(`  상태 변동 없음 (최근 공시: ${inv.lastFilingDate || '없음'})`);
      }
    }
    
    if (shouldUpdateManifest) {
      await fs.writeFile(INVESTORS_PATH, JSON.stringify(investors, null, 2), 'utf8');
      console.log('✅ 투자자 매니페스트(최신 공시일자) 업데이트 완료');
    }
    
    await fs.writeFile(HOLDINGS_PATH, JSON.stringify(holdings, null, 2), 'utf8');
    console.log(`✅ ${Object.keys(holdings).length}명의 신규 투자자 공시 트리거 저장 완료`);
    
  } catch (error) {
    console.error('❌ Error fetching portfolio filings:', error);
    process.exit(1);
  }
}

main();
