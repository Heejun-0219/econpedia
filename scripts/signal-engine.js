// scripts/signal-engine.js
// EconPedia 2.0 — Signal Engine
//
// 시장 데이터를 분석하여 "경제 날씨"를 판정하고,
// 발행 여부 + 콘텐츠 깊이 + 지갑 영향을 결정하는 핵심 모듈.
//
// 토스 원칙: "보내지 않으면 사용자가 손해를 보는가?"
//            아니라면, 보내지 않는다.

// ─── 날씨 판정 임계값 ───────────────────────────
const THRESHOLDS = {
  storm:  3.0, // 주요 지수 ±3% 이상
  rain:   1.5, // 주요 지수 ±1.5% 이상, 또는 환율 ±1% 이상
  cloudy: 0.5, // 주요 지수 ±0.5% 이상
  // sunny: 그 이하 (평온한 시장)
};

const THRESHOLDS_CURRENCY = {
  storm:  2.0,
  rain:   1.0,
  cloudy: 0.3,
};

// ─── 날씨별 설정 ───────────────────────────────
const WEATHER_CONFIG = {
  sunny: {
    label: '맑음',
    emoji: '☀️',
    color: '#34d399', // Emerald 400
    shouldPublishArticle: false,
    shouldPublishCardNews: false,
    shouldPublishBlog: false,
    contentDepth: 'skip',
    headline: '특별히 걱정할 일 없는 하루예요',
  },
  cloudy: {
    label: '흐림',
    emoji: '☁️',
    color: '#94a3b8', // Slate 400
    shouldPublishArticle: true,
    shouldPublishCardNews: false,
    shouldPublishBlog: false,
    contentDepth: 'calm',
    headline: '살짝 움직임이 있지만 걱정할 수준은 아니에요',
  },
  rain: {
    label: '비',
    emoji: '🌧️',
    color: '#3b82f6', // Blue 500
    shouldPublishArticle: true,
    shouldPublishCardNews: true,
    shouldPublishBlog: false,
    contentDepth: 'alert',
    headline: '시장이 출렁이고 있어요. 체크해볼 게 있어요',
  },
  storm: {
    label: '폭풍',
    emoji: '🌩️',
    color: '#ef4444', // Red 500
    shouldPublishArticle: true,
    shouldPublishCardNews: true,
    shouldPublishBlog: true,
    contentDepth: 'deep',
    headline: '시장에 큰 변화가 생겼습니다. 대응이 필요해요',
  },
};

// ─── 날씨 결정 로직 ─────────────────────────────
function determineWeather(marketData) {
  let severity = 'sunny';
  let signals = [];

  const checks = [
    { key: 'sp500',   label: 'S&P 500',  data: marketData.sp500,   type: 'index' },
    { key: 'nasdaq',  label: 'NASDAQ',   data: marketData.nasdaq,  type: 'index' },
    { key: 'kospi',   label: 'KOSPI',    data: marketData.kospi,   type: 'index' },
    { key: 'bitcoin', label: 'Bitcoin',  data: marketData.bitcoin, type: 'index' },
    { key: 'krw',     label: 'USD/KRW',  data: marketData.krw,     type: 'currency' },
    { key: 'oil',     label: 'WTI Oil',  data: marketData.oil,     type: 'index' },
  ];

  for (const { label, data, type } of checks) {
    const absChange = Math.abs(data.changePercent);
    
    const thresholds = type === 'currency' ? THRESHOLDS_CURRENCY : THRESHOLDS;

    if (absChange >= thresholds.storm) {
      severity = 'storm';
      signals.push({ severity: 'storm', source: label, change: data.changePercent, message: `${label} 급변동 ${data.changePercent.toFixed(2)}%` });
    } else if (absChange >= thresholds.rain && severity !== 'storm') {
      severity = 'rain';
      signals.push({ severity: 'rain', source: label, change: data.changePercent, message: `${label} ${data.changePercent > 0 ? '상승' : '하락'} ${data.changePercent.toFixed(2)}%` });
    } else if (absChange >= thresholds.cloudy && severity === 'sunny') {
      severity = 'cloudy';
      signals.push({ severity: 'cloudy', source: label, change: data.changePercent, message: `${label} 소폭 변동 ${data.changePercent.toFixed(2)}%` });
    }
  }

  const config = WEATHER_CONFIG[severity];
  
  // 시그널이 있으면 헤드라인 업데이트 (가장 큰 변동 기준)
  let headline = config.headline;
  if (signals.length > 0) {
    const topSignal = signals.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
    headline = `${topSignal.message} — ${config.headline}`;
  }

  return {
    weather: severity,
    signals,
    ...config,
    headline,
  };
}

// ─── 지갑 영향 계산 (₩ 단위) ───────────────────────
export function calculateWalletImpact(marketData) {
  const impacts = [];

  // 1. KRW -> 해외여행/직구 체감
  const krwChange = marketData.krw.changePercent;
  const exchangeImpact = Math.round(10000 * (krwChange / 100)); // ₩ 기준
  impacts.push({
    category: 'travel',
    emoji: '✈️',
    label: '해외여행·직구',
    change: exchangeImpact,
    sentiment: Math.abs(krwChange) < 0.1 ? 'neutral' : (krwChange > 0 ? 'negative' : 'positive'),
    message: Math.abs(krwChange) < 0.1 
      ? '환율이 안정적이에요' 
      : (krwChange > 0 ? `100만원 환전 시 ${Math.abs(exchangeImpact).toLocaleString()}원 더 비싸졌어요` : `100만원 환전 시 ${Math.abs(exchangeImpact).toLocaleString()}원 아꼈어요`),
  });

  // 2. KOSPI -> 국내 주식 투자 체감
  const kospiChange = marketData.kospi.changePercent;
  const stockImpact = Math.round(10_000_000 * (kospiChange / 100));
  impacts.push({
    category: 'investment',
    emoji: '📊',
    label: '국내 주식·투자',
    change: stockImpact,
    sentiment: Math.abs(kospiChange) < 0.3 ? 'neutral' : (kospiChange > 0 ? 'positive' : 'negative'),
    message: Math.abs(kospiChange) < 0.3
      ? '국내 시장이 조용해요'
      : (kospiChange > 0 ? `1천만원 투자 기준 약 ${Math.abs(stockImpact).toLocaleString()}원 올랐어요` : `1천만원 투자 기준 약 ${Math.abs(stockImpact).toLocaleString()}원 빠졌어요`),
  });

  // 3. 비트코인 -> 코인 투자 체감
  const btcChange = marketData.bitcoin.changePercent;
  const btcImpact = Math.round(1_000_000 * (btcChange / 100));
  impacts.push({
    category: 'crypto',
    emoji: '₿',
    label: '비트코인·코인',
    change: btcImpact,
    sentiment: Math.abs(btcChange) < 1.0 ? 'neutral' : (btcChange > 0 ? 'positive' : 'negative'),
    message: Math.abs(btcChange) < 1.0
      ? '가상자산 시장이 횡보 중이에요'
      : (btcChange > 0 ? `100만원 투자 기준 약 ${Math.abs(btcImpact).toLocaleString()}원 올랐어요` : `100만원 투자 기준 약 ${Math.abs(btcImpact).toLocaleString()}원 빠졌어요`),
  });

  // 4. S&P 500 -> 미국 주식/ETF 투자 체감
  const spChange = marketData.sp500.changePercent;
  const usStockImpact = Math.round(5_000_000 * ((spChange + krwChange) / 100));
  const totalUSChange = spChange + krwChange;
  impacts.push({
    category: 'us_stock',
    emoji: '🇺🇸',
    label: '미국 주식·ETF',
    change: usStockImpact,
    sentiment: Math.abs(totalUSChange) < 0.5 ? 'neutral' : (totalUSChange > 0 ? 'positive' : 'negative'),
    message: Math.abs(totalUSChange) < 0.5
      ? '미국 시장 변화가 작아요'
      : (totalUSChange > 0 ? `500만원 투자 기준 약 ${Math.abs(usStockImpact).toLocaleString()}원 올랐어요 (환율 포함)` : `500만원 투자 기준 약 ${Math.abs(usStockImpact).toLocaleString()}원 빠졌어요 (환율 포함)`),
  });

  // 5. 기준금리 -> 주택담보대출 이자 체감
  const rateChange = marketData.baseRate ? marketData.baseRate.change : 0;
  const monthlyInterestChange = Math.round((300_000_000 * (rateChange / 100)) / 12);
  impacts.push({
    category: 'housing',
    emoji: '🏠',
    label: '주거비·대출이자',
    change: monthlyInterestChange,
    sentiment: rateChange === 0 ? 'neutral' : (rateChange > 0 ? 'negative' : 'positive'),
    message: rateChange === 0
      ? '대출 금리에 변화가 없어요 😌'
      : (rateChange > 0 ? `3억원 대출 기준, 월 이자가 약 ${Math.abs(monthlyInterestChange).toLocaleString()}원 늘었어요` : `3억원 대출 기준, 월 이자가 약 ${Math.abs(monthlyInterestChange).toLocaleString()}원 줄었어요`),
  });

  // 6. 소비자물가지수(CPI) -> 장바구니 체감
  const cpiChange = marketData.cpi ? marketData.cpi.changePercent : 0;
  const groceryImpact = Math.round(800_000 * (cpiChange / 100));
  impacts.push({
    category: 'grocery',
    emoji: '🛒',
    label: '장바구니·물가',
    change: groceryImpact,
    sentiment: Math.abs(cpiChange) < 0.1 ? 'neutral' : (cpiChange > 0 ? 'negative' : 'positive'),
    message: Math.abs(cpiChange) < 0.1
      ? '물가가 안정권이에요'
      : (cpiChange > 0 ? `월 식비 80만원 기준, 체감 물가가 ${Math.abs(groceryImpact).toLocaleString()}원 올랐어요` : `월 식비 80만원 기준, 체감 물가가 ${Math.abs(groceryImpact).toLocaleString()}원 내렸어요`),
  });

  // 7. 유가(WTI) -> 주유비 체감
  const oilChange = marketData.oil ? marketData.oil.changePercent : 0;
  const gasImpact = Math.round(50_000 * (oilChange / 100) * 0.5);
  impacts.push({
    category: 'gasoline',
    emoji: '⛽',
    label: '주유비·기름값',
    change: gasImpact,
    sentiment: Math.abs(oilChange) < 0.5 ? 'neutral' : (oilChange > 0 ? 'negative' : 'positive'),
    message: Math.abs(oilChange) < 0.5
      ? '기름값 변동이 거의 없어요'
      : (oilChange > 0 ? `주유 5만원 할 때 약 ${Math.abs(gasImpact).toLocaleString()}원 올랐어요` : `주유 5만원 할 때 약 ${Math.abs(gasImpact).toLocaleString()}원 내렸어요`),
  });

  return impacts;
}

// ─── 전체 시그널 분석 (메인 함수) ─────────────────────
export function analyzeSignals(marketData) {
  const weather = determineWeather(marketData);
  const walletImpacts = calculateWalletImpact(marketData);

  return {
    ...weather,
    walletImpacts,
    // 프롬프트에서 사용할 요약 문자열
    walletSummary: walletImpacts
      .map(w => `${w.emoji} ${w.label}: ${w.message}`)
      .join('\n'),
    timestamp: new Date().toISOString(),
  };
}

// ─── CLI 테스트 모드 ─────────────────────────────────
if (process.argv.includes('--test')) {
  console.log('🧪 Signal Engine 테스트 실행\n');

  const testCases = [
    {
      name: '☀️ 맑은 날 (모든 지표 안정)',
      data: {
        sp500: { price: 7022, change: 10, changePercent: 0.14 },
        nasdaq: { price: 24016, change: 50, changePercent: 0.21 },
        kospi: { price: 6091, change: 15, changePercent: 0.25 },
        bitcoin: { price: 75021, change: 200, changePercent: 0.27 },
        krw: { price: 1475, change: 1, changePercent: 0.07 },
        oil: { price: 80, change: 0, changePercent: 0.01 },
        baseRate: { price: 3.50, change: 0, changePercent: 0 },
        cpi: { price: 114.2, change: 0, changePercent: 0 },
      },
    },
    {
      name: '☁️ 흐린 날 (소폭 변동)',
      data: {
        sp500: { price: 7022, change: 56, changePercent: 0.80 },
        nasdaq: { price: 24016, change: 380, changePercent: 1.59 },
        kospi: { price: 6091, change: -61, changePercent: -1.00 },
        bitcoin: { price: 75021, change: 750, changePercent: 1.00 },
        krw: { price: 1475, change: 4.3, changePercent: 0.29 },
        oil: { price: 82, change: 2, changePercent: 2.50 },
        baseRate: { price: 3.50, change: 0, changePercent: 0 },
        cpi: { price: 114.2, change: 0, changePercent: 0 },
      },
    },
    {
      name: '🌧️ 비오는 날 (환율 급변동, 유가 폭등)',
      data: {
        sp500: { price: 7022, change: -70, changePercent: -1.00 },
        nasdaq: { price: 24016, change: -400, changePercent: -1.67 },
        kospi: { price: 6091, change: -120, changePercent: -1.97 },
        bitcoin: { price: 75021, change: -1500, changePercent: -2.00 },
        krw: { price: 1475, change: 18, changePercent: 1.22 },
        oil: { price: 85, change: 5, changePercent: 6.25 },
        baseRate: { price: 3.50, change: 0, changePercent: 0 },
        cpi: { price: 114.2, change: 0, changePercent: 0 },
      },
    },
    {
      name: '🌩️ 폭풍 (시장 급락, 금리/물가 발표)',
      data: {
        sp500: { price: 7022, change: -280, changePercent: -3.99 },
        nasdaq: { price: 24016, change: -960, changePercent: -4.00 },
        kospi: { price: 6091, change: -270, changePercent: -4.43 },
        bitcoin: { price: 75021, change: -5200, changePercent: -6.93 },
        krw: { price: 1475, change: 35, changePercent: 2.37 },
        oil: { price: 70, change: -10, changePercent: -12.5 },
        baseRate: { price: 3.75, change: 0.25, changePercent: 7.14 },
        cpi: { price: 115.0, change: 0.8, changePercent: 0.70 },
      },
    },
  ];

  for (const tc of testCases) {
    console.log(`\n━━━ ${tc.name} ━━━`);
    const result = analyzeSignals(tc.data);
    console.log(`날씨: ${result.emoji} ${result.label}`);
    console.log(`헤드라인: ${result.headline}`);
    console.log(`발행: 기사=${result.shouldPublishArticle}, 카드뉴스=${result.shouldPublishCardNews}, 블로그=${result.shouldPublishBlog}`);
    console.log(`콘텐츠 깊이: ${result.contentDepth}`);
    console.log(`\n💰 지갑 영향:`);
    for (const w of result.walletImpacts) {
      console.log(`  ${w.emoji} ${w.label}: ${w.message}`);
    }
  }

  console.log('\n✅ 테스트 완료');
}
