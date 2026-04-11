// scripts/ping-google-indexing.js
// 검색엔진 색인 요청 모듈
// - Google: Sitemaps API 핑 (서비스 계정 불필요)
// - IndexNow: Bing/Naver/Yandex 등 동시 지원 (키 1개)
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const SITE_URL = 'https://econpedia.dedyn.io';
const SITEMAP_URL = `${SITE_URL}/sitemap-index.xml`;

async function saveIndexingStatus(success, message) {
  const statusPath = path.join(ROOT, '.indexing-status.json');
  await fs.writeFile(statusPath, JSON.stringify({ success, message, ts: new Date().toISOString() }, null, 2), 'utf-8');
}

async function pingGoogleSitemap() {
  // Google Search Console에 사이트맵 핑 (인증 불필요)
  const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(SITEMAP_URL)}`;
  const res = await fetch(pingUrl);
  if (res.ok) {
    console.log(`✅ [Google] 사이트맵 핑 성공 (${res.status})`);
    return true;
  }
  console.log(`⚠️ [Google] 사이트맵 핑 응답: ${res.status}`);
  return false;
}

async function pingIndexNow(urlsToPing) {
  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    console.log('⚠️ [IndexNow] INDEXNOW_KEY 환경변수가 없어 생략합니다.');
    return false;
  }

  // IndexNow 엔드포인트 (Bing이 가장 안정적, Bing → Google/Naver/Yandex 자동 전파)
  const res = await fetch('https://api.indexnow.org/IndexNow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: 'econpedia.dedyn.io',
      key,
      keyLocation: `${SITE_URL}/${key}.txt`,
      urlList: urlsToPing,
    }),
  });

  if (res.ok || res.status === 202) {
    console.log(`✅ [IndexNow] 핑 성공 (${res.status}) — ${urlsToPing.length}개 URL`);
    return true;
  }
  const body = await res.text().catch(() => '');
  console.log(`⚠️ [IndexNow] 응답: ${res.status} ${body}`);
  return false;
}

async function pingIndexingAPI() {
  const today = Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const urlsToPing = [
    `${SITE_URL}/daily/${today}`,
    `${SITE_URL}/blog/${today}`,
  ];

  console.log(`🚀 검색엔진 색인 핑: ${urlsToPing.length}개 URL`);
  console.log(urlsToPing);

  try {
    const [googleOk, indexNowOk] = await Promise.all([
      pingGoogleSitemap(),
      pingIndexNow(urlsToPing),
    ]);

    const msg = [
      googleOk ? 'Google 사이트맵 핑 성공' : 'Google 핑 실패',
      indexNowOk ? 'IndexNow 핑 성공' : 'IndexNow 생략',
    ].join(' / ');

    console.log(`🎉 완료: ${msg}`);
    await saveIndexingStatus(true, msg);
  } catch (err) {
    console.error('❌ 색인 핑 에러:', err.message);
    await saveIndexingStatus(false, err.message);
  }
}

pingIndexingAPI();
