// scripts/publish-external.js
// EconPedia 외부 플랫폼 자동 발행 모듈
// 채널: 텔레그램 알림 / 텔레그램 카드뉴스 / Blogger / X(Twitter) 스레드

import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

// ─── X(Twitter) OAuth 1.0a 유틸리티 ─────────────────────

function pct(str) {
  return encodeURIComponent(String(str))
    .replace(/!/g, '%21').replace(/'/g, '%27')
    .replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');
}

function buildOAuthHeader(method, url, creds) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts    = Math.floor(Date.now() / 1000).toString();

  const oauthParams = {
    oauth_consumer_key:     creds.apiKey,
    oauth_nonce:            nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        ts,
    oauth_token:            creds.accessToken,
    oauth_version:          '1.0',
  };

  // 서명 베이스: oauth 파라미터만 포함 (body는 application/json이라 서명에 미포함)
  const paramStr = Object.keys(oauthParams).sort()
    .map(k => `${pct(k)}=${pct(oauthParams[k])}`).join('&');

  const sigBase   = `${method.toUpperCase()}&${pct(url)}&${pct(paramStr)}`;
  const sigKey    = `${pct(creds.apiSecret)}&${pct(creds.accessTokenSecret)}`;
  const signature = crypto.createHmac('sha1', sigKey).update(sigBase).digest('base64');

  oauthParams.oauth_signature = signature;

  return 'OAuth ' + Object.keys(oauthParams).sort()
    .map(k => `${pct(k)}="${pct(oauthParams[k])}"`).join(', ');
}

/**
 * X(Twitter) 스레드 발행
 * tweets: string[] — 각 항목이 하나의 트윗 (280자 이내)
 */
export async function publishThreadToX(tweets) {
  const creds = {
    apiKey:            process.env.X_API_KEY,
    apiSecret:         process.env.X_API_SECRET,
    accessToken:       process.env.X_ACCESS_TOKEN,
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
  };

  if (!creds.apiKey || !creds.apiSecret || !creds.accessToken || !creds.accessTokenSecret) {
    return '[X] 환경변수(X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET) 미설정 — 스레드 발행 생략';
  }

  const url = 'https://api.twitter.com/2/tweets';
  let lastId = null;

  for (let i = 0; i < tweets.length; i++) {
    const body = { text: tweets[i] };
    if (lastId) body.reply = { in_reply_to_tweet_id: lastId };

    const res = await fetch(url, {
      method:  'POST',
      headers: {
        Authorization:  buildOAuthHeader('POST', url, creds),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      return `[X] 트윗 ${i + 1}번 발행 실패: ${JSON.stringify(err.detail || err)}`;
    }

    const data = await res.json();
    lastId = data.data.id;
  }

  return `[X] 스레드 발행 성공 (${tweets.length}개 트윗, 첫 ID: ${lastId})`;
}

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
/**
 * 텔레그램 카드뉴스 앨범 발행 (시각적 유입 극대화)
 */
export async function publishCardNewsToTelegram(title, imagePaths, canonicalUrl) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_OWNER_ID;

  if (!token || !chatId || !imagePaths || imagePaths.length === 0) {
    return '[Telegram] 카드뉴스 발행을 위한 정보가 부족하여 생략합니다.';
  }

  // 텔레그램 sendMediaGroup API는 파일 스트림이나 URL을 받습니다.
  // 여기서는 로컬 파일을 직접 업로드하는 방식 대신, 
  // 텔레그램 봇 API의 multipart/form-data 형식을 사용해야 하므로 
  // 간단한 구현을 위해 상위 5개 이미지를 순차적으로 구성합니다.
  
  const formData = new FormData();
  formData.append('chat_id', chatId);
  
  const subscribeUrl = `https://econpedia.dedyn.io/#newsletter?utm_source=telegram&utm_medium=cardnews&utm_campaign=album`;
  const media = imagePaths.map((p, idx) => ({
    type: 'photo',
    media: `attach://photo${idx}`,
    caption: idx === 0 ? `🖼️ <b>${title}</b> (카드뉴스 브리핑)\n\n📊 <b>오늘의 인사이트 확인하기</b> 👇\n${canonicalUrl}\n\n📮 <b>매일 아침 무료 브리핑 구독하기</b> 👇\n${subscribeUrl}` : '',
    parse_mode: 'HTML'
  }));
  
  formData.append('media', JSON.stringify(media));

  // 실제 파일 데이터 첨부
  for (let i = 0; i < imagePaths.length; i++) {
    const fs = await import('fs');
    const blob = new Blob([fs.readFileSync(imagePaths[i])]);
    formData.append(`photo${i}`, blob, `slide-${i}.png`);
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
      method: 'POST',
      body: formData
    });
    
    if (res.ok) return '[Telegram] 카드뉴스 앨범 전송 성공';
    const err = await res.json();
    return `[Telegram] 카드뉴스 전송 실패: ${err.description}`;
  } catch (e) {
    return `[Telegram] 카드뉴스 통신 에러: ${e.message}`;
  }
}

// ─── LinkedIn 게시 ────────────────────────────────────────

/**
 * LinkedIn access token 자동 갱신 (만료 60일, refresh 365일)
 */
async function refreshLinkedInToken() {
  const clientId     = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const refreshToken = process.env.LINKEDIN_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

/**
 * LinkedIn 아티클 포스트 발행
 * text: 본문 (최대 3000자), title: 링크 제목, url: 아티클 URL
 */
export async function publishToLinkedIn(text, title, url) {
  const personUrn = process.env.LINKEDIN_PERSON_URN;
  let   token     = process.env.LINKEDIN_ACCESS_TOKEN;

  if (!token || !personUrn) {
    return '[LinkedIn] LINKEDIN_ACCESS_TOKEN 또는 LINKEDIN_PERSON_URN 미설정 — 발행 생략';
  }

  // refresh token 있으면 갱신 시도
  const refreshed = await refreshLinkedInToken();
  if (refreshed) token = refreshed;

  // 토큰 만료 임박 경고 (발급일 기준 53일 초과 시 → 7일 이내 만료)
  const tokenIssuedAt = process.env.LINKEDIN_TOKEN_ISSUED_AT;
  if (tokenIssuedAt) {
    const daysElapsed = (Date.now() - Number(tokenIssuedAt)) / 86400000;
    if (daysElapsed > 53) {
      const daysLeft = Math.max(0, Math.round(60 - daysElapsed));
      const tgToken  = process.env.TELEGRAM_BOT_TOKEN;
      const tgChat   = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_OWNER_ID;
      if (tgToken && tgChat) {
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            chat_id:    tgChat,
            text:       `⚠️ LinkedIn 토큰 만료 ${daysLeft}일 전!\n\nnode scripts/linkedin-reauth.js 실행해서 갱신하세요.`,
            parse_mode: 'HTML',
          }),
        }).catch(() => {});
      }
    }
  }

  const body = {
    author:        personUrn,
    commentary:    text,
    visibility:    'PUBLIC',
    distribution:  {
      feedDistribution:            'MAIN_FEED',
      targetEntities:              [],
      thirdPartyDistributionChannels: [],
    },
    content: {
      article: {
        source:      url,
        title:       title,
        description: text.slice(0, 200),
      },
    },
    lifecycleState:           'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method:  'POST',
    headers: {
      Authorization:               `Bearer ${token}`,
      'Content-Type':              'application/json',
      'LinkedIn-Version':          '202503',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 201) return '[LinkedIn] 포스트 발행 성공';
  const err = await res.json().catch(() => ({}));
  return `[LinkedIn] 포스트 발행 실패 (${res.status}): ${err.message || JSON.stringify(err)}`;
}

// ─── Threads(Meta) 스레드 발행 ────────────────────────────

/**
 * Threads에 포스트 체인 발행
 * posts: string[] — 각 항목이 하나의 포스트 (500자 이내)
 */
export async function publishToThreads(posts) {
  const token  = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID || 'me';

  if (!token) {
    return '[Threads] THREADS_ACCESS_TOKEN 미설정 — 발행 생략';
  }

  const base = `https://graph.threads.net/v1.0/${userId}`;
  let replyToId = null;

  for (let i = 0; i < posts.length; i++) {
    // 1단계: 컨테이너 생성
    const createParams = new URLSearchParams({
      media_type:   'TEXT',
      text:         posts[i],
      access_token: token,
    });
    if (replyToId) createParams.set('reply_to_id', replyToId);

    const createRes = await fetch(`${base}/threads`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    createParams,
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      return `[Threads] 포스트 ${i + 1} 생성 실패: ${err.error?.message || JSON.stringify(err)}`;
    }

    const { id: creationId } = await createRes.json();

    // 2단계: 발행
    const publishRes = await fetch(`${base}/threads_publish`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ creation_id: creationId, access_token: token }),
    });

    if (!publishRes.ok) {
      const err = await publishRes.json();
      return `[Threads] 포스트 ${i + 1} 발행 실패: ${err.error?.message || JSON.stringify(err)}`;
    }

    const { id: postId } = await publishRes.json();
    if (i === 0) replyToId = postId; // 첫 포스트 ID를 답글 기준으로

    // 연속 발행 간 짧은 딜레이 (API 안정성)
    if (i < posts.length - 1) await new Promise(r => setTimeout(r, 1000));
  }

  return `[Threads] 스레드 발행 성공 (${posts.length}개 포스트)`;
}

export async function publishToBlogger(title, htmlContent, labels = []) {
  const clientId     = process.env.BLOGGER_CLIENT_ID;
  const clientSecret = process.env.BLOGGER_CLIENT_SECRET;
  const refreshToken = process.env.BLOGGER_REFRESH_TOKEN;
  const blogId       = process.env.BLOGGER_BLOG_ID;

  if (!clientId || !clientSecret || !refreshToken || !blogId) {
    return '[Blogger] 환경변수(BLOGGER_CLIENT_ID, BLOGGER_CLIENT_SECRET, BLOGGER_REFRESH_TOKEN, BLOGGER_BLOG_ID)가 없어 생략합니다.';
  }

  try {
    // Access Token 갱신
    console.log('🔑 [Blogger] Access Token 갱신 시도 중...');
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
      console.error('❌ [Blogger] 토큰 갱신 실패:', JSON.stringify(tokenData));
      return `[Blogger] 토큰 갱신 실패: ${JSON.stringify(tokenData)}`;
    }
    console.log('✅ [Blogger] Access Token 갱신 성공');

    // 포스트 발행
    console.log('📝 [Blogger] 포스트 발행 요청 중...');
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
          labels: labels,
        }),
      }
    );
    const postData = await postRes.json();
    if (postData.url) {
      console.log('✅ [Blogger] 포스팅 성공:', postData.url);
      return `[Blogger] ✅ 포스팅 성공! (URL: ${postData.url})`;
    }
    console.error('❌ [Blogger] 포스팅 실패:', JSON.stringify(postData.error || postData));
    return `[Blogger] ❌ 포스팅 실패: ${JSON.stringify(postData.error || postData)}`;
  } catch (e) {
    return `[Blogger] ❌ 에러: ${e.message}`;
  }
}
