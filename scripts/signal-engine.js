// scripts/signal-engine.js
// EconPedia 2.0 — Signal Engine
//
// 시장 데이터를 분석하여 "경제 날씨"를 판정하고,
// 발행 여부 + 콘텐츠 깊이 + 지갑 영향을 결정하는 핵심 모듈.
//
// 토스 원칙: "보내지 않으면 사용자가 손해를 보는가?"
//            아니라면, 보내지 않는다.

// ─── 날씨 판정 임계값 ────────────────────────────────
const THRESHOLDS = {
  // 🌩️ stormy: 긴급 발행 (심층 분석)
  stormy: {
    indexChange: 3.0,    // 주요 지수 ±3% 이상
    currencyChange: 2.0, // 환율 ±2% 이상
  },
  // 🌧️ rainy: 중요 발행 (브리핑 + 행동 가이드)
  rainy: {
    indexChange: 1.5,    // 주요 지수 ±1.5%
    currencyChange: 1.0, // 환율 ±1%
  },
  // ☁️ cloudy: 간단 발행 (3줄 요약 + 지갑 카드)
  cloudy: {
    indexChange: 0.5,    // 주요 지수 ±0.5%
    currencyChange: 0.3, // 환율 ±0.3%
  },
  // ☀️ sunny: 미발행 ("오늘은 평화로운 날이에요")
};

// ─── 경제 날씨 판정 ──────────────────────────────────
export function determineWeather(marketData) {
  const signals = [];

  const checks = [
    { key: 'sp500',   label: 'S&P 500',  data: marketData.sp500,   type: 'index' },
    { key: 'nasdaq',  label: 'NASDAQ',   data: marketData.nasdaq,  type: 'index' },
    { key: 'kospi',   label: 'KOSPI',    data: marketData.kospi,   type: 'index' },
    { key: 'bitcoin', label: 'Bitcoin',  data: marketData.bitcoin, type: 'index' },
    { key: 'krw',     label: 'USD/KRW',  data: marketData.krw,     type: 'currency' },
    { key: 'oil',     label: 'WTI Oil',  data: marketData.oil,     type: 'index' },
  ];

  for (const { key, label, data, type } of checks) {
    const absChange = Math.abs(data.changePercent);
    const thresholdKey = type === 'currency' ? 'currencyChange' : 'indexChange';

    if (absChange >= THRESHOLDS.stormy[thresholdKey]) {
      signals.push({
        severity: 'stormy',
        source: label,
        change: data.changePercent,
        message: `${label} ${data.changePercent > 0 ? '급등' : '급락'} ${data.changePercent.toFixed(2)}%`,
      });
    } else if (absChange >= THRESHOLDS.rainy[thresholdKey]) {
      signals.push({
        severity: 'rainy',
        source: label,
        change: data.changePercent,
        message: `${label} ${data.changePercent > 0 ? '상승' : '하락'} ${data.changePercent.toFixed(2)}%`,
      });
    } else if (absChange >= THRESHOLDS.cloudy[thresholdKey]) {
      signals.push({
        severity: 'cloudy',
        source: label,
        change: data.changePercent,
        message: `${label} 소폭 변동 ${data.changePercent.toFixed(2)}%`,
      });
    }
  }

  // 가장 심각한 시그널로 최종 날씨 결정
  const severityOrder = ['stormy', 'rainy', 'cloudy'];
  let finalWeather = 'sunny';
  for (const severity of severityOrder) {
    if (signals.some(s => s.severity === severity)) {
      finalWeather = severity;
      break;
    }
  }

  return {
    weather: finalWeather,
    signals,
    ...getWeatherMeta(finalWeather, signals),
  };
}

// ─── 날씨별 메타데이터 ───────────────────────────────
function getWeatherMeta(weather, signals) {
  const meta = {
    sunny: {
      emoji: '☀️',
      label: '맑음',
      headline: '특별히 걱정할 일 없는 하루예요',
      shouldPublishArticle: false,
      shouldPublishCardNews: false,
      shouldPublishBlog: false,
      contentDepth: 'skip',           // 발행하지 않음
      color: '#34d399',               // 초록
    },
    cloudy: {
      emoji: '☁️',
      label: '흐림',
      headline: '살짝 움직임이 있지만 걱정할 수준은 아니에요',
      shouldPublishArticle: true,
      shouldPublishCardNews: true,
      shouldPublishBlog: false,
      contentDepth: 'calm',           // 3줄 요약 + 지갑 카드
      color: '#94a3b8',               // 회색
    },
    rainy: {
      emoji: '🌧️',
      label: '비',
      headline: '시장이 출렁이고 있어요. 체크해볼 게 있어요',
      shouldPublishArticle: true,
      shouldPublishCardNews: true,
      shouldPublishBlog: true,
      contentDepth: 'alert',          // 브리핑 + 행동 가이드
      color: '#3b82f6',               // 파랑
    },
    stormy: {
      emoji: '🌩️',
      label: '폭풍',
      headline: '시장에 큰 변동이 있어요. 꼭 확인하세요',
      shouldPublishArticle: true,
      shouldPublishCardNews: true,
      shouldPublishBlog: true,
      contentDepth: 'storm',          // 심층 분석
      color: '#ef4444',               // 빨강
    },
  };

  const m = meta[weather];
  // stormy/rainy일 때 가장 심각한 시그널의 원인을 헤드라인에 반영
  if ((weather === 'stormy' || weather === 'rainy') && signals.length > 0) {
    const topSignal = signals[0];
    m.headline = topSignal.message + ' — ' + m.headline;
  }

  return m;
}

// ─── 지갑 영향 계산기 ────────────────────────────────
// 경제 지표를 "내 지갑"의 ₩ 단위로 번역합니다.
export function calculateWalletImpact(marketData) {
  const impacts = [];

  // 1. 환율 → 해외여행/해외직구 환산
  const krwChange = marketData.krw.changePercent;
  const krwPrice = marketData.krw.price;
  // 100만원 환전 기준 영향
  const exchangeImpact = Math.round(10000 * (krwChange / 100)); // ₩ 기준
  if (Math.abs(krwChange) > 0.1) {
    impacts.push({
      category: 'travel',
      emoji: '✈️',
      label: '해외여행·직구',
      change: exchangeImpact,
      sentiment: krwChange > 0 ? 'negative' : 'positive', // 원화 약세 = 해외 비용 증가
      message: krwChange > 0
        ? `100만원 환전 시 ${Math.abs(exchangeImpact).toLocaleString()}원 더 비싸졌어요`
        : `100만원 환전 시 ${Math.abs(exchangeImpact).toLocaleString()}원 아꼈어요`,
    });
  }

  // 2. KOSPI → 국내 주식 투자 체감
  const kospiChange = marketData.kospi.changePercent;
  // 1000만원 투자 기준
  const stockImpact = Math.round(10_000_000 * (kospiChange / 100));
  if (Math.abs(kospiChange) > 0.3) {
    impacts.push({
      category: 'investment',
      emoji: '📊',
      label: '국내 주식',
      change: stockImpact,
      sentiment: kospiChange > 0 ? 'positive' : 'negative',
      message: kospiChange > 0
        ? `1천만원 투자 기준 약 ${Math.abs(stockImpact).toLocaleString()}원 올랐어요`
        : `1천만원 투자 기준 약 ${Math.abs(stockImpact).toLocaleString()}원 빠졌어요`,
    });
  }

  // 3. 비트코인 → 코인 투자 체감
  const btcChange = marketData.bitcoin.changePercent;
  const btcImpact = Math.round(1_000_000 * (btcChange / 100)); // 100만원 투자 기준
  if (Math.abs(btcChange) > 1.0) {
    impacts.push({
      category: 'crypto',
      emoji: '₿',
      label: '비트코인',
      change: btcImpact,
      sentiment: btcChange > 0 ? 'positive' : 'negative',
      message: btcChange > 0
        ? `100만원 투자 기준 약 ${Math.abs(btcImpact).toLocaleString()}원 올랐어요`
        : `100만원 투자 기준 약 ${Math.abs(btcImpact).toLocaleString()}원 빠졌어요`,
    });
  }

  // 4. S&P 500 → 미국 주식/ETF 투자 체감
  const spChange = marketData.sp500.changePercent;
  // 환율 효과 포함: 미국 주식은 환율 × 수익률
  const usStockImpact = Math.round(5_000_000 * ((spChange + krwChange) / 100));
  if (Math.abs(spChange) > 0.5 || Math.abs(krwChange) > 0.3) {
    const totalChange = spChange + krwChange;
    impacts.push({
      category: 'us_stock',
      emoji: '🇺🇸',
      label: '미국 주식·ETF',
      change: usStockImpact,
      sentiment: totalChange > 0 ? 'positive' : 'negative',
      message: totalChange > 0
        ? `500만원 투자 기준 약 ${Math.abs(usStockImpact).toLocaleString()}원 올랐어요 (환율 효과 포함)`
        : `500만원 투자 기준 약 ${Math.abs(usStockImpact).toLocaleString()}원 빠졌어요 (환율 효과 포함)`,
    });
  }

  // 5. 기준금리 → 주택담보대출 이자 체감
  if (marketData.baseRate && marketData.baseRate.change !== 0) {
    const rateChange = marketData.baseRate.change;
    // 3억원 대출 기준, 월 이자 변동액 계산
    const monthlyInterestChange = Math.round((300_000_000 * (rateChange / 100)) / 12);
    impacts.push({
      category: 'housing',
      emoji: '🏠',
      label: '주거비 (대출이자)',
      change: monthlyInterestChange,
      sentiment: rateChange > 0 ? 'negative' : 'positive', // 금리 인상은 주거비 증가 (부정적)
      message: rateChange > 0
        ? `3억원 대출 기준, 이번 달 이자가 약 ${Math.abs(monthlyInterestChange).toLocaleString()}원 늘었어요`
        : `3억원 대출 기준, 이번 달 이자가 약 ${Math.abs(monthlyInterestChange).toLocaleString()}원 줄었어요`,
    });
  }

  // 6. 소비자물가지수(CPI) → 장바구니 체감
  if (marketData.cpi && Math.abs(marketData.cpi.changePercent) > 0.1) {
    const cpiChange = marketData.cpi.changePercent;
    // 월 식비 80만원 기준
    const groceryImpact = Math.round(800_000 * (cpiChange / 100));
    impacts.push({
      category: 'grocery',
      emoji: '🛒',
      label: '장바구니',
      change: groceryImpact,
      sentiment: cpiChange > 0 ? 'negative' : 'positive',
      message: cpiChange > 0
        ? `월 식비 80만원 기준, 체감 물가가 ${Math.abs(groceryImpact).toLocaleString()}원 올랐어요`
        : `월 식비 80만원 기준, 체감 물가가 ${Math.abs(groceryImpact).toLocaleString()}원 내렸어요`,
    });
  }

  // 7. 유가(WTI) → 주유비 체감
  if (marketData.oil && Math.abs(marketData.oil.changePercent) > 0.5) {
    const oilChange = marketData.oil.changePercent;
    // 주유 5만원 기준, 국제유가 변동의 약 50%가 체감된다고 가정
    const gasImpact = Math.round(50_000 * (oilChange / 100) * 0.5);
    impacts.push({
      category: 'gasoline',
      emoji: '⛽',
      label: '주유비',
      change: gasImpact,
      sentiment: oilChange > 0 ? 'negative' : 'positive',
      message: oilChange > 0
        ? `주유 5만원 할 때 체감 비용이 약 ${Math.abs(gasImpact).toLocaleString()}원 올랐어요`
        : `주유 5만원 할 때 체감 비용이 약 ${Math.abs(gasImpact).toLocaleString()}원 내렸어요`,
    });
  }

  // 변동이 거의 없는 평화로운 날
  if (impacts.length === 0) {
    impacts.push({
      category: 'calm',
      emoji: '😌',
      label: '내 지갑',
      change: 0,
      sentiment: 'neutral',
      message: '오늘은 지갑에 영향을 주는 변화가 없어요',
    });
  }

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
