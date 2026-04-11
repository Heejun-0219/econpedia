// scripts/ping-google-indexing.js
// 구글 Indexing API 전송 모듈 (새로운 글 색인 1시간 이내 단축)
import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

/**
 * 핑 결과 저장을 위한 헬퍼 함수
 */
async function saveIndexingStatus(success, message) {
  const statusPath = path.join(ROOT, '.indexing-status.json');
  const status = {
    success,
    message,
    ts: new Date().toISOString(),
  };
  await fs.writeFile(statusPath, JSON.stringify(status, null, 2), 'utf-8');
}

/**
 * 환경변수 GOOGLE_SERVICE_ACCOUNT_JSON 내에 서비스 계정(JSON 포맷)이 통째로 들어있다고 가정합니다.
 * Github Actions Secrets에서 개행을 유지하며 값을 넘겨줍니다.
 */

async function pingIndexingAPI() {
  const saJsonRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJsonRaw) {
    console.log('⚠️ GOOGLE_SERVICE_ACCOUNT_JSON 환경변수가 없어 구글 Indexing API 핑 발송을 건너뜁니다.');
    return;
  }

  let credentials;
  try {
    credentials = JSON.parse(saJsonRaw);
  } catch (err) {
    console.error('❌ GOOGLE_SERVICE_ACCOUNT_JSON 파싱 실패 (올바른 JSON이 아닙니다.):', err.message);
    process.exit(1);
  }

  // GitHub Secrets에서 \n이 \\n으로 이스케이프되는 문제 보정
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  // 오늘 날짜(KST) 구하기
  const today = Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

  // 핑을 쏠 URL 목록 (본진 도메인)
  const urlsToPing = [
    `https://econpedia.dedyn.io/daily/${today}`,
    `https://econpedia.dedyn.io/blog/${today}`
  ];

  console.log(`🚀 구글 Indexing API: 오늘자 URL ${urlsToPing.length}개 핑(Ping) 발송 준비 중...`);
  console.log(urlsToPing);

  try {
    // JWT 클라이언트 세팅 (권한: indexing)
    const jwtClient = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/indexing'],
      null
    );

    // API 클라이언트 초기화
    const indexing = google.indexing({ version: 'v3', auth: jwtClient });

    // URL별로 개별 publish 발송 (batch 사용 안 함)
    for (const url of urlsToPing) {
      const res = await indexing.urlNotifications.publish({
        requestBody: {
          url: url,
          type: 'URL_UPDATED',
        },
      });
      console.log(`✅ 성공 [${url}] -> Status: ${res.status}`);
    }
    
    console.log(`🎉 구글 검색엔진에 새 글 색인(Indexing) 요청을 즉각 전달했습니다.`);
    await saveIndexingStatus(true, `URL ${urlsToPing.length}개 핑 발송 완료`);
  } catch (err) {
    console.error(`❌ 구글 Indexing API 에러 발생:`, err.message);
    if (err.response?.data) {
      console.error('응답 데이터:', JSON.stringify(err.response.data, null, 2));
    }
    if (err.code) {
      console.error('에러 코드:', err.code);
    }
    await saveIndexingStatus(false, err.message);
  }
}

pingIndexingAPI();
