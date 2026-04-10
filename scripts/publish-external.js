import dotenv from 'dotenv';
import fetch from 'node-fetch'; // GitHub Actions의 Node.js 환경에서 사용 가능, Node 18+는 내장이라 제거 가능하지만 호환성을 위해. (Node 22 사용중이므로 fetch 내장)

dotenv.config();

/**
 * 구글 블로거(Google Blogger)에 포스팅합니다.
 * Blogger API v3 활용
 * @param {string} title 
 * @param {string} htmlContent 
 * @param {Array<string>} tags 
 * @returns {Promise<string>}
 */
export async function publishToBlogger(title, htmlContent, tags = []) {
  const clientId = process.env.BLOGGER_CLIENT_ID;
  const clientSecret = process.env.BLOGGER_CLIENT_SECRET;
  const refreshToken = process.env.BLOGGER_REFRESH_TOKEN;
  const blogId = process.env.BLOGGER_BLOG_ID;

  if (!clientId || !clientSecret || !refreshToken || !blogId) {
    return 'Blogger 환경변수(CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN, BLOG_ID)가 모두 갖춰지지 않아 생략합니다.';
  }

  console.log(`[Blogger] 블로그 ID '${blogId}'로 포스팅 시도 중...`);

  // 1. Refresh Token을 이용해 새로운 Access Token 발급
  let token;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    
    if (!tokenRes.ok) throw new Error("새로운 Access Token 발급 실패");
    const tokenData = await tokenRes.json();
    token = tokenData.access_token;
  } catch (err) {
    console.error(`[Blogger] ❌ 토큰 갱신 실패:`, err.message);
    throw err;
  }

  const payload = {
    kind: "blogger#post",
    blog: { id: blogId },
    title: title,
    content: htmlContent,
    labels: tags,
  };

  try {
    const res = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Blogger API 에러 (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return `[Blogger] ✅ 포스팅 성공! (URL: ${data.url})`;
  } catch (err) {
    console.error(`[Blogger] ❌ 포스팅 실패:`, err.message);
    throw err;
  }
}

/**
 * 워드프레스(WordPress)에 포스팅합니다.
 * WordPress REST API 활용
 * @param {string} title 
 * @param {string} htmlContent 
 * @param {Array<string>} tags 
 * @returns {Promise<string>}
 */
export async function publishToWordPress(title, htmlContent, tags = []) {
  const wpUrl = process.env.WP_API_URL;         // 예: https://example.com
  const wpUser = process.env.WP_USERNAME;         // 워드프레스 관리자 아이디
  const wpPass = process.env.WP_APP_PASSWORD;     // Application Password (16자리)

  if (!wpUrl || !wpUser || !wpPass) {
    return 'WordPress 환경변수(URL, USERNAME, APP_PASSWORD)가 존재하지 않아 생략합니다.';
  }

  console.log(`[WordPress] '${wpUrl}'에 포스팅 시도 중...`);

  // Basic Auth 헤더 생성
  const credentials = Buffer.from(`${wpUser}:${wpPass}`).toString('base64');
  const endpoint = wpUrl.endsWith('/') ? `${wpUrl}wp-json/wp/v2/posts` : `${wpUrl}/wp-json/wp/v2/posts`;

  const payload = {
    title: title,
    content: htmlContent,
    status: 'publish',  // 즉시 발행
    // 태그를 넣으려면 워드프레스의 태그 ID 풀을 조회해야 하는 복잡성이 있어, 텍스트 형태로는 바로 주입 불가.
    // 여기서는 기본 발행에 집중.
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`WordPress API 에러 (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return `[WordPress] ✅ 포스팅 성공! (Post ID: ${data.id}, Link: ${data.link})`;
  } catch (err) {
    console.error(`[WordPress] ❌ 포스팅 실패:`, err.message);
    throw err;
  }
}

/**
 * 미디엄(Medium)에 포스팅합니다.
 * @param {string} title 
 * @param {string} htmlContent 
 * @param {Array<string>} tags 
 * @param {string} canonicalUrl 
 * @returns {Promise<string>}
 */
export async function publishToMedium(title, htmlContent, tags = [], canonicalUrl = '') {
  const token = process.env.MEDIUM_TOKEN;
  const userId = process.env.MEDIUM_USER_ID;

  if (!token || !userId) {
    return 'Medium 환경변수(MEDIUM_TOKEN, MEDIUM_USER_ID)가 존재하지 않아 생략합니다.';
  }

  console.log(`[Medium] 사용자 ID '${userId}'로 포스팅 시도 중...`);

  const mediumTags = tags.slice(0, 5);

  const payload = {
    title: title,
    contentFormat: 'html',
    content: htmlContent,
    tags: mediumTags,
    publishStatus: 'public',
    notifyFollowers: true,
  };

  if (canonicalUrl) {
    payload.canonicalUrl = canonicalUrl;
  }

  try {
    const res = await fetch(`https://api.medium.com/v1/users/${userId}/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Medium API 에러 (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return `[Medium] ✅ 포스팅 성공! (URL: ${data.data.url})`;
  } catch (err) {
    console.error(`[Medium] ❌ 포스팅 실패:`, err.message);
    throw err;
  }
}
