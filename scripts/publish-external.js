// scripts/publish-external.js
// EconPedia 외부 플랫폼 자동 발행 모듈 (최적화 버전)
// 워드프레스/미디엄 제거 -> 티스토리/네이버/텔레그램 등 마케팅 채널 위주로 재편 예정

import dotenv from 'dotenv';
dotenv.config();

/**
 * 텔레그램 채널 알림 (마케팅 및 즉시성 확보)
 * 비용: 무료 / 속도: 즉시
 */
export async function publishToTelegram(title, url) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return '[Telegram] 환경변수가 없어 알림을 생략합니다.';
  }

  const text = `📢 *EconPedia 새로운 분석 리포트*\n\n*${title}*\n\n지금 확인해보세요! 👇\n${url}`;
  
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false
      })
    });
    
    if (res.ok) return '[Telegram] 알림 전송 완료';
    const err = await res.json();
    return `[Telegram] 전송 실패: ${err.description}`;
  } catch (e) {
    return `[Telegram] 에러: ${e.message}`;
  }
}

/**
 * 티스토리 (국내 SEO 최적화용)
 * 비용: 무료 / API: 공식 지원
 */
export async function publishToTistory(title, content, tags) {
  // TODO: 티스토리 API 구현 (ACCESS_TOKEN 필요)
  return '[Tistory] API 연동 준비 중...';
}

// 기존 워드프레스/미디엄 함수는 삭제되었습니다.
