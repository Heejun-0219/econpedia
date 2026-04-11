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

const SITE_URL = 'https://econpedia.kr';
const SITEMAP_URL = `${SITE_URL}/sitemap-index.xml`;

async function saveIndexingStatus(success, message) {
  const statusPath = path.join(ROOT, '.indexing-status.json');
  await fs.writeFile(statusPath, JSON.stringify({ success, message, ts: new Date().toISOString() }, null, 2), 'utf-8');
}

async function pingGoogleSitemap() {
  // Google의 /ping 엔드포인트는 deprecated → Bing sitemap 핑으로 대체
  // (IndexNow 미설정 시 Bing에라도 알림)
  const pingUrl = `https://www.bing.com/ping?sitemap=${encodeURIComponent(SITEMAP_URL)}`;
  try {
    const res = await fetch(pingUrl);
    if (res.ok) {
      console.log(`✅ [Bing] 사이트맵 핑 성공 (${res.status})`);
      return true;
    }
    console.log(`⚠️ [Bing] 사이트맵 핑 응답: ${res.status}`);
    return false;
  } catch (e) {
    console.log(`⚠️ [Bing] 사이트맵 핑 에러: ${e.message}`);
    return false;
  }
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

async function getActualSlugs() {
  const today = Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

  // blog-status.json에서 실제 발행된 slug 읽기
  let blogSlug = today;
  try {
    const raw = await fs.readFile(path.join(ROOT, '.blog-status.json'), 'utf-8');
    const status = JSON.parse(raw);
    if (status.slug) blogSlug = status.slug;
  } catch {
    // 파일 없으면 날짜 fallback
  }

  return {
    daily: `${SITE_URL}/daily/${today}`,
    blog: `${SITE_URL}/blog/${blogSlug}`,
  };
}

async function pingIndexingAPI() {
  const slugs = await getActualSlugs();
  const urlsToPing = [slugs.daily, slugs.blog];

  console.log(`🚀 검색엔진 색인 핑: ${urlsToPing.length}개 URL`);
  console.log(urlsToPing);

  try {
    const [googleOk, indexNowOk] = await Promise.all([
      pingGoogleSitemap(),
      pingIndexNow(urlsToPing),
    ]);

    const msg = [
      googleOk ? 'Bing 사이트맵 핑 성공' : 'Bing 핑 실패',
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
