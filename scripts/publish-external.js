// scripts/publish-external.js
// EconPedia 외부 플랫폼 자동 발행 모듈 (최종 최적화 버전)
// 수익성이 낮은 워드프레스/미디엄/티스토리 제거 -> 텔레그램 알림 및 구글 블로거 집중

import dotenv from 'dotenv';
dotenv.config();

/**
 * 텔레그램 채널 알림 (코어 독자 타겟팅 및 즉각적 유입)
 * 비용: 무료 / 가장 강력한 마케팅 채널
 */
export async function publishToTelegram(title, url) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_OWNER_ID;

  if (!token || !chatId) {
    return '[Telegram] 환경변수 미설정으로 알림을 생략합니다.';
  }

  const text = `📢 *EconPedia 시니어 리포트 발행*\n\n*${title}*\n\n지금 바로 깊이 있는 분석을 확인하세요! 👇\n${url}`;
  
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
    
    if (res.ok) return '[Telegram] 채널 알림 전송 성공';
    const err = await res.json();
    return `[Telegram] 전송 실패: ${err.description}`;
  } catch (e) {
    return `[Telegram] 통신 에러: ${e.message}`;
  }
}

/**
 * Blogger (구글 검색 최적화 및 메인 수익 채널)
 * OAuth2 refresh token으로 액세스 토큰 갱신 후 포스팅
 */
export async function publishToBlogger(title, htmlContent, tags = []) {
  const clientId     = process.env.BLOGGER_CLIENT_ID;
  const clientSecret = process.env.BLOGGER_CLIENT_SECRET;
  const refreshToken = process.env.BLOGGER_REFRESH_TOKEN;
  const blogId       = process.env.BLOGGER_BLOG_ID;

  if (!clientId || !clientSecret || !refreshToken || !blogId) {
    return '[Blogger] 환경변수(BLOGGER_CLIENT_ID, BLOGGER_CLIENT_SECRET, BLOGGER_REFRESH_TOKEN, BLOGGER_BLOG_ID)가 없어 생략합니다.';
  }

  try {
    // Access Token 갱신
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return `[Blogger] 토큰 갱신 실패: ${JSON.stringify(tokenData)}`;
    }

    // 포스트 발행
    const postRes = await fetch(
      `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          content: htmlContent,
          labels: tags,
        }),
      }
    );
    const postData = await postRes.json();
    if (postData.url) {
      return `[Blogger] ✅ 포스팅 성공! (URL: ${postData.url})`;
    }
    return `[Blogger] ❌ 포스팅 실패: ${JSON.stringify(postData.error || postData)}`;
  } catch (e) {
    return `[Blogger] ❌ 에러: ${e.message}`;
  }
}
