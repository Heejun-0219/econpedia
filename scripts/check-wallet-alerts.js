import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const WALLETS_FILE = path.join(DATA_DIR, 'wallets.json');
const MARKET_DATA_FILE = path.resolve(__dirname, '../.market-data.json');
const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function run() {
  console.log('🔍 내 지갑 맞춤형 알림 발송 엔진 시작...');

  if (!fs.existsSync(WALLETS_FILE) || !fs.existsSync(MARKET_DATA_FILE)) {
    console.log('⚠️ 데이터 파일이 없습니다. 종료합니다.');
    return;
  }

  const wallets = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf-8'));
  const marketData = JSON.parse(fs.readFileSync(MARKET_DATA_FILE, 'utf-8'));
  const raw = marketData.raw || {};

  const subscribers = Object.keys(wallets);
  if (subscribers.length === 0) {
    console.log('ℹ️ 구독자가 없습니다.');
    return;
  }

  // 예시: 한국은행 기준금리가 0.25%p 이상 변동했을 때를 가정 (시뮬레이션을 위해 baseRate > 0 일 때 항상 전송하도록 조건 완화)
  // 실제 프로덕션에서는 어제 데이터와 비교하는 로직 필요
  const isBaseRateChanged = raw.baseRate && Math.abs(raw.baseRate.change) >= 0.1;
  const isKrwChanged = raw.krw && Math.abs(raw.krw.changePercent) >= 1.0;

  if (!isBaseRateChanged && !isKrwChanged) {
    console.log('ℹ️ 알림을 발송할 만큼 큰 경제 지표 변동이 없습니다.');
    return;
  }

  console.log(`🚀 주요 지표 변동 감지! (금리 변동: ${isBaseRateChanged}, 환율 급등락: ${isKrwChanged})`);

  let sendCount = 0;

  for (const email of subscribers) {
    const { settings } = wallets[email];
    
    let subject = '[EconPedia] 내 지갑 맞춤형 경제 알림 🔔';
    let messageHtml = `<h2>안녕하세요, EconPedia 맞춤형 알림입니다.</h2>`;

    if (isBaseRateChanged) {
      const changeVal = raw.baseRate.change;
      const interestChange = Math.round((settings.housing * (changeVal / 100)) / 12);
      const absInterest = Math.abs(interestChange).toLocaleString();
      const direction = changeVal > 0 ? '늘어날' : '줄어들';
      
      subject = `[긴급] 금리가 변동했어요! 주담대 이자가 월 ${absInterest}원 ${direction} 수 있습니다. 😱`;
      messageHtml += `
        <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
          <h3 style="margin-top: 0; color: #0f172a;">🏦 한국은행 기준금리 변동 안내</h3>
          <p>오늘 기준금리가 <strong>${changeVal}%p</strong> 변동했습니다.</p>
          <p>고객님이 입력해주신 주담대/전세대출 원금(${settings.housing.toLocaleString()}원)을 기준으로 계산했을 때, 이번 달부터 은행에 내야 할 이자가 약 <strong>${absInterest}원 ${direction}</strong> 것으로 예상됩니다.</p>
        </div>
      `;
    }

    if (isKrwChanged) {
      const changeVal = raw.krw.changePercent;
      const travelChange = Math.round(settings.travel * (changeVal / 100));
      const direction = changeVal > 0 ? '비싸졌' : '저렴해졌';
      
      if (!isBaseRateChanged) {
        subject = `[긴급] 환율 급동! 예정하신 해외여행 예산이 ${Math.abs(travelChange).toLocaleString()}원 더 들 수 있어요. ✈️`;
      }
      
      messageHtml += `
        <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
          <h3 style="margin-top: 0; color: #0f172a;">💵 원/달러 환율 급동 안내</h3>
          <p>오늘 환율이 <strong>${changeVal}%</strong> 변동했습니다.</p>
          <p>고객님이 입력해주신 해외여행/직구 예산(${settings.travel.toLocaleString()}원)을 기준으로, 약 <strong>${Math.abs(travelChange).toLocaleString()}원 더 ${direction}습니다.</strong></p>
        </div>
      `;
    }

    messageHtml += `
      <div style="text-align: center; margin-top: 30px;">
        <a href="https://econpedia.dedyn.io/wallet" style="display: inline-block; padding: 14px 28px; background: #3182f6; color: white; text-decoration: none; font-weight: bold; border-radius: 8px;">내 지갑 대시보드에서 정확하게 확인하기</a>
      </div>
    `;

    console.log(`📧 Sending alert to ${email}...`);
    
    if (RESEND_API_KEY) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'EconPedia 알림 <news@econpedia.dedyn.io>',
            to: email,
            subject: subject,
            html: messageHtml
          })
        });
        
        if (res.ok) sendCount++;
        else console.error('Failed to send:', await res.text());
      } catch (err) {
        console.error('Resend API Error:', err);
      }
    } else {
      console.log('ℹ️ RESEND_API_KEY가 없어 콘솔에만 출력합니다.');
      // console.log(messageHtml);
      sendCount++;
    }
  }

  console.log(`✅ 발송 완료! (총 ${sendCount}건 발송됨)`);
}

run();