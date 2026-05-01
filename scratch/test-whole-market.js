import fs from 'fs/promises';
import dotenv from 'dotenv';
dotenv.config();

const SEC_HEADERS = { 'User-Agent': 'EconPedia econpedia@dedyn.io', 'Accept': 'application/json' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
  return m ? m[1].trim() : null;
}
function extractValueTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>\\s*<value>([^<]+)</value>\\s*</${tag}>`));
  return m ? m[1].trim() : null;
}
function formatUsd(val) {
  const KRW = 1450;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B (약 ${Math.round(val * KRW / 1e8)}억 원)`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M (약 ${Math.round(val * KRW / 1e8)}억 원)`;
  if (val >= 1e3) return `$${Math.round(val / 1e3)}K (약 ${Math.round(val * KRW / 1e4)}만 원)`;
  return `$${Math.round(val)}`;
}

function parseSecForm4Xml(xml) {
  const reporterName = extractTag(xml, 'rptOwnerName') || '';
  const officerTitle = extractTag(xml, 'officerTitle') || '';
  let role = officerTitle;
  if (!role) {
    if (extractTag(xml, 'isOfficer') === '1') role = 'Officer';
    else if (extractTag(xml, 'isDirector') === '1') role = 'Director';
    else if (extractTag(xml, 'isTenPercentOwner') === '1') role = '10%+ Shareholder';
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
  return { direction: isBuy ? 'buy' : 'sell', person: [reporterName, role].filter(Boolean).join(' / '), amount: formatUsd(totalVal), totalValue: totalVal };
}

function calculateSignificance(totalValue, direction, person) {
  let score = 0;
  if (totalValue >= 100_000_000) score += 50;
  else if (totalValue >= 10_000_000) score += 40;
  else if (totalValue >= 5_000_000) score += 30;
  else if (totalValue >= 1_000_000) score += 20;
  else score += 10;
  if (direction === 'buy') score += 20;
  else score += 10;
  const personLower = person.toLowerCase();
  if (personLower.includes('ceo') || personLower.includes('chief executive')) score += 30;
  else if (personLower.includes('cfo') || personLower.includes('coo')) score += 25;
  else if (personLower.includes('president') || personLower.includes('부회장') || personLower.includes('사장')) score += 20;
  else if (personLower.includes('director') || personLower.includes('이사')) score += 15;
  else if (personLower.includes('10%')) score += 10;
  return Math.min(score, 100);
}

async function scanSecForm4(majorCiks) {
  console.log('\n🇺🇸 [SEC] 미국 전체 시장 Form 4 RSS 스캔 시작...');
  const url = 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&owner=include&start=0&count=100&output=atom';
  const res = await fetch(url, { headers: { ...SEC_HEADERS, 'Accept': 'application/xml' } });
  const text = await res.text();
  const entries = text.split('<entry>').slice(1);
  const targetEntries = [];
  for (const entry of entries) {
    if (!entry.includes('<title>4 - ')) continue;
    if (!entry.includes('(Issuer)')) continue;
    const titleMatch = entry.match(/<title>4 - (.*?) \((.*?)\) \(.*?\)<\/title>/);
    const accMatch = entry.match(/<id>urn:tag:sec.gov,2008:accession-number=(.*?)<\/id>/);
    if (titleMatch && accMatch) targetEntries.push({ companyName: titleMatch[1], cik: titleMatch[2], accession: accMatch[1] });
  }
  console.log(`  📊 최근 RSS Form 4 공시: ${targetEntries.length}건 (Issuer 기준)`);
  
  for (const item of targetEntries.slice(0, 10)) {
    await sleep(200);
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
      
      const personLower = parsed.person.toLowerCase();
      const isCLevel = personLower.includes('ceo') || personLower.includes('cfo') || personLower.includes('chief');
      if (parsed.totalValue < 1000000 && !isCLevel) continue;
      
      const isMajor = Object.keys(majorCiks).includes(item.cik.padStart(10, '0'));
      const tickerTag = extractTag(xml, 'issuerTradingSymbol') || item.companyName;
      let sigScore = calculateSignificance(parsed.totalValue, parsed.direction, parsed.person);
      if (isMajor) sigScore += 20;
      console.log(`  ✅ ${tickerTag} | ${parsed.person} | ${parsed.direction.toUpperCase()} | ${parsed.amount} ${isMajor ? '(🌟 MAJOR)' : ''}`);
    } catch(e) { console.error(e) }
  }
}

async function scanDartInsider(majorCorpCodes) {
  console.log('\n🇰🇷 [DART] 한국 전체 시장 지분공시 스캔 시작...');
  const apiKey = process.env.DART_API_KEY;
  const bgnDe = new Date(Date.now() - 7*86400000).toISOString().split('T')[0].replace(/-/g, '');
  const endDe = new Date().toISOString().split('T')[0].replace(/-/g, '');
  
  const majorByTicker = {};
  for (const [code, info] of Object.entries(majorCorpCodes)) majorByTicker[info.ticker] = { ...info };

  const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${apiKey}&bgn_de=${bgnDe}&end_de=${endDe}&pblntf_ty=D&page_count=100`;
  const res = await fetch(url);
  const data = await res.json();
  const relevant = (data.list || []).filter(item => {
    return (item.corp_cls === 'Y' || item.corp_cls === 'K') && (item.report_nm?.includes('임원') || item.report_nm?.includes('주요주주'));
  });
  console.log(`  📊 최근 시장 전체 임원 거래: ${relevant.length}건`);
  
  for (const item of relevant.slice(0, 10)) {
    await sleep(200);
    try {
      const elUrl = `https://opendart.fss.or.kr/api/elestock.json?crtfc_key=${apiKey}&corp_code=${item.corp_code}&bgn_de=${bgnDe}&end_de=${endDe}`;
      const elRes = await fetch(elUrl);
      const elData = await elRes.json();
      if (elData.status !== '000' || !elData.list?.length) continue;
      
      const rep = elData.list.sort((a, b) => b.rcept_dt.localeCompare(a.rcept_dt))[0];
      const changeCount = parseInt((rep.sp_stock_lmp_irds_cnt || '0').replace(/,/g, ''));
      if (changeCount === 0) continue;
      
      const isBuy = changeCount > 0;
      const person = [rep.repror, rep.isu_exctv_ofcps].filter(v => v && v !== '-').join(' / ');
      
      const personLower = person.toLowerCase();
      const isCLevel = personLower.includes('대표이사') || personLower.includes('회장') || personLower.includes('사장');
      const estimatedValue = Math.abs(changeCount) * 50000;
      if (estimatedValue < 500_000_000 && !isCLevel) continue;
      
      const isMajor = majorByTicker[item.stock_code];
      const amount = `${Math.abs(changeCount).toLocaleString('ko-KR')}주 ${isBuy ? '취득' : '처분'}`;
      let sigScore = calculateSignificance(estimatedValue, isBuy ? 'buy' : 'sell', person);
      if (isMajor) sigScore += 20;
      
      console.log(`  ✅ ${item.corp_name} | ${person} | ${isBuy ? 'BUY' : 'SELL'} | ${amount} ${isMajor ? '(🌟 MAJOR)' : ''}`);
    } catch(e) {}
  }
}

async function main() {
  const majorData = JSON.parse(await fs.readFile('src/data/major-companies.json', 'utf8'));
  await scanSecForm4(majorData.us || {});
  await scanDartInsider(majorData.kr || {});
}
main();
