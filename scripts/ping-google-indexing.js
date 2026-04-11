// scripts/ping-google-indexing.js
// 구글 Indexing API 전송 모듈 (새로운 글 색인 1시간 이내 단축)
// 인증: Blogger API와 동일한 OAuth2 credentials 재사용
import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

async function saveIndexingStatus(success, message) {
  const statusPath = path.join(ROOT, '.indexing-status.json');
  await fs.writeFile(statusPath, JSON.stringify({ success, message, ts: new Date().toISOString() }, null, 2), 'utf-8');
}

async function pingIndexingAPI() {
  const clientId     = process.env.BLOGGER_CLIENT_ID;
  const clientSecret = process.env.BLOGGER_CLIENT_SECRET;
  const refreshToken = process.env.BLOGGER_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.log('⚠️ BLOGGER_CLIENT_ID / BLOGGER_CLIENT_SECRET / BLOGGER_REFRESH_TOKEN 환경변수가 없어 Google Indexing API 핑을 건너뜁니다.');
    await saveIndexingStatus(false, '필수 환경변수 없음');
    return;
  }

  // 오늘 날짜(KST)
  const today = Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

  const urlsToPing = [
    `https://econpedia.dedyn.io/daily/${today}`,
    `https://econpedia.dedyn.io/blog/${today}`,
  ];

  console.log(`🚀 Google Indexing API: 오늘자 URL ${urlsToPing.length}개 핑 발송 준비 중...`);
  console.log(urlsToPing);

  // Blogger와 동일한 OAuth2 클라이언트 재사용
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const indexing = google.indexing({ version: 'v3', auth: oauth2Client });

  try {
    for (const url of urlsToPing) {
      const res = await indexing.urlNotifications.publish({
        requestBody: { url, type: 'URL_UPDATED' },
      });
      console.log(`✅ 성공 [${url}] -> Status: ${res.status}`);
    }

    console.log('🎉 구글 검색엔진에 새 글 색인 요청 완료!');
    await saveIndexingStatus(true, `URL ${urlsToPing.length}개 핑 발송 완료`);
  } catch (err) {
    console.error('❌ Google Indexing API 에러:', err.message);
    if (err.response?.data) {
      console.error('응답:', JSON.stringify(err.response.data, null, 2));
    }
    await saveIndexingStatus(false, err.message);
  }
}

pingIndexingAPI();
