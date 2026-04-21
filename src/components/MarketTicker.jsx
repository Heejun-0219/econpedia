import React, { useState, useEffect, useRef } from 'react';

function TickerItem({ label, value, changePercent, prefix = '' }) {
  const [flashClass, setFlashClass] = useState('');
  const prevValue = useRef(value);

  useEffect(() => {
    // 값이 변경되면 하이라이트 깜빡임(Flash) 애니메이션 실행 (소수점 2자리까지만 비교)
    const currentFormatted = (value || 0).toFixed(2);
    const prevFormatted = (prevValue.current || 0).toFixed(2);

    if (prevFormatted !== currentFormatted && prevValue.current !== undefined) {
      setFlashClass('ticker-flash');
      const timer = setTimeout(() => setFlashClass(''), 1000);
      prevValue.current = value;
      return () => clearTimeout(timer);
    }
    prevValue.current = value;
  }, [value]);

  const isUp = changePercent > 0;
  const className = `h1-imp ${isUp ? 'up' : 'dn'} ${flashClass}`;

  return (
    <div className={className}>
      <div className="t">{label}</div>
      <div className="v">{prefix}{(value || 0).toFixed(2)}</div>
      <div className="d">
        {isUp ? '↑' : '↓'} {Math.abs(changePercent || 0).toFixed(2)}%
      </div>
    </div>
  );
}

export default function MarketTicker({ initialData }) {
  const [marketData, setMarketData] = useState(initialData);

  useEffect(() => {
    // 브라우저 렌더링(Mount) 후 SSE 이벤트 스트림 연결 시작
    const eventSource = new EventSource('/api/market-stream');
    
    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.success && parsed.data) {
          setMarketData(parsed.data);
        }
      } catch (err) {
        console.error('SSE parsing error:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn('SSE stream closed or error occurred. Browser will auto-reconnect if needed.');
    };

    // 컴포넌트 파기(Unmount) 시 스트림 정리
    return () => {
      eventSource.close();
    };
  }, []);

  if (!marketData) return null;

  return (
    <div className="h1-impact">
      <TickerItem label="원유(WTI)" value={marketData.oil?.price} changePercent={marketData.oil?.changePercent} prefix="$" />
      <TickerItem label="코스피" value={marketData.kospi?.price} changePercent={marketData.kospi?.changePercent} />
      <TickerItem label="원/달러" value={marketData.krw?.price} changePercent={marketData.krw?.changePercent} prefix="₩" />
      <TickerItem label="S&P 500" value={marketData.sp500?.price} changePercent={marketData.sp500?.changePercent} />
    </div>
  );
}