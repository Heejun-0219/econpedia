import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const FORECAST_PATH = path.join(ROOT, 'src', 'data', 'weather-forecast.json');

async function main() {
  console.log('🔮 다음 주 경제 날씨 예보 생성 시작...');
  // 실제 프로덕션 환경에서는 이 부분에서 Gemini API를 호출하여 이벤트를 파악합니다.
  const today = new Date();
  const forecast = Array.from({length: 7}).map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + 1 + i); // 내일부터 7일
    const isMajor = Math.random() > 0.8;
    return {
      date: d.toISOString().split('T')[0],
      weather: isMajor ? 'storm' : 'sunny',
      label: isMajor ? '폭풍' : '맑음',
      emoji: isMajor ? '🌩️' : '☀️',
      event: isMajor ? '주요 거시 지표 발표' : ''
    };
  });

  await fs.mkdir(path.dirname(FORECAST_PATH), { recursive: true });
  await fs.writeFile(FORECAST_PATH, JSON.stringify(forecast, null, 2), 'utf8');
  console.log('✅ 예보 생성 완료: weather-forecast.json');
}

main();