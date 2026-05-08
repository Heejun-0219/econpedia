// api/server.js
// EconPedia 뉴스레터 구독 API 서버
// POST /api/subscribe   — Resend Audiences에 이메일 추가
// DELETE /api/subscribe — 구독 취소
// GET  /api/health      — 헬스체크

import 'dotenv/config';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yahooFinance from 'yahoo-finance2';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// data 폴더를 루트 디렉토리에 마운트된 영역으로 지정 (로컬에서는 api/../data)
const DATA_DIR = path.join(__dirname, '..', 'data');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

const PORT = process.env.API_PORT || 3001;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://econpedia.dedyn.io';

// ─── 데이터 파일 초기화 ──────────────────────────────
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── 실시간 시장 데이터 폴링 (10초 주기) ───────────────────
let latestMarketData = null;
let sseClients = [];

async function startMarketDataPolling() {
  const symbols = {
    sp500: '^GSPC',
    nasdaq: '^IXIC',
    kospi: '^KS11',
    bitcoin: 'BTC-USD',
    krw: 'KRW=X',
    oil: 'CL=F'
  };

  console.log('🔄 Market data polling loop started...');
  
  while (true) {
    try {
      const results = {};
      const promises = Object.entries(symbols).map(async ([key, symbol]) => {
        try {
          const quote = await yahooFinance.quote(symbol);
          results[key] = {
            price: quote.regularMarketPrice,
            change: quote.regularMarketChange,
            changePercent: quote.regularMarketChangePercent
          };
        } catch (err) {
          // ignore individual fetch failure
        }
      });
      await Promise.all(promises);
      if (Object.keys(results).length > 0) {
        latestMarketData = results;
        
        // SSE 클라이언트들에게 브로드캐스트 (실시간 스트림)
        const dataStr = JSON.stringify({ success: true, data: latestMarketData });
        sseClients.forEach(client => {
          client.res.write(`data: ${dataStr}\n\n`);
        });
      }
    } catch (e) {
      console.error('⚠️ Market data polling error:', e.message);
    }
    
    // Wait 10 seconds before next fetch
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}
startMarketDataPolling();

// 인메모리 카운터 및 데이터 (디스크 I/O 제거 — 비동기 플러시)
let stats = { total: 0, daily: {} };
let polls = {};
let wallets = {};

try {
  if (fs.existsSync(STATS_FILE)) {
    stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
  }
  if (fs.existsSync(POLLS_FILE)) {
    polls = JSON.parse(fs.readFileSync(POLLS_FILE, 'utf-8'));
  }
  if (fs.existsSync(WALLETS_FILE)) {
    wallets = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf-8'));
  }
} catch (e) {
  console.warn('⚠️ 데이터 파일 로드 실패, 초기값으로 시작:', e.message);
}

function pruneOldDaily() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  if (stats.daily) {
    for (const key of Object.keys(stats.daily)) {
      if (key < cutoffStr) delete stats.daily[key];
    }
  }
}

async function flushStats() {
  try {
    pruneOldDaily();
    const { writeFile } = await import('fs/promises');
    await writeFile(STATS_FILE, JSON.stringify(stats, null, 2), 'utf-8');
    await writeFile(POLLS_FILE, JSON.stringify(polls, null, 2), 'utf-8');
    await writeFile(WALLETS_FILE, JSON.stringify(wallets, null, 2), 'utf-8');
  } catch (e) {
    console.error('⚠️ 데이터 비동기 플러시 실패:', e.message);
  }
}

// 30초마다 디스크에 기록 (테스트 및 안정성 강화)
setInterval(flushStats, 30 * 1000);
// 프로세스 종료 시에도 저장 (Graceful Shutdown)
const shutdown = () => {
  console.log('⚠️ SIGTERM/SIGINT 수신. API 서버 Graceful Shutdown 시작...');
  server.close(async () => {
    console.log('✅ 기존 연결 처리 완료 및 HTTP 서버 종료.');
    await flushStats();
    process.exit(0);
  });
  
  // 5초 내에 정상 종료되지 않으면 강제 종료
  setTimeout(() => {
    console.error('🚨 Graceful Shutdown 타임아웃. 강제 종료합니다.');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);


// ─── 간단한 인메모리 Rate Limiter ────────────────────────
const rateLimitMap = new Map(); // ip → { count, resetAt }
function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + 60_000 };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + 60_000;
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count > 5; // 분당 5회 제한
}

// ─── Resend Contacts API 헬퍼 ────────────────────────────
async function addContact(email, firstName = '') {
  const res = await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, first_name: firstName, unsubscribed: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Resend API 오류: ${res.status}`);
  return data;
}

async function removeContact(email) {
  // 1. 이메일로 contact ID 조회
  const listRes = await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  const list = await listRes.json();
  const contact = (list.data || []).find(c => c.email === email);
  if (!contact) return { message: '등록된 구독자가 아닙니다.' };

  // 2. 구독 취소 (삭제 대신 unsubscribed = true)
  const res = await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts/${contact.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ unsubscribed: true }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.message || `Resend API 오류: ${res.status}`);
  }
  return { message: '구독이 취소됐습니다.' };
}

// ─── 요청 파싱 헬퍼 ─────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

// ─── 이메일 검증 ─────────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
}

// ─── HTTP 서버 ───────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return sendJSON(res, 204, {});
  }

  // ── GET /api/health ────────────────────────────────────
  if (req.method === 'GET' && path === '/api/health') {
    return sendJSON(res, 200, {
      status: 'ok',
      audience: AUDIENCE_ID ? '설정됨' : '미설정',
      ts: new Date().toISOString(),
    });
  }

  // ── GET /api/market-data (실시간 시장 데이터 폴링용) ─────────
  if (req.method === 'GET' && path === '/api/market-data') {
    return sendJSON(res, 200, { success: true, data: latestMarketData });
  }

  // ── GET /api/stats (슬랙 리포트용 + 홈페이지 Social Proof) ──────────
  if (req.method === 'GET' && path === '/api/stats') {
    const todayStr = Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    const todayCount = stats.daily[todayStr] || 0;

    // Resend API에서 실제 구독자 수 조회
    let subscriberCount = 0;
    try {
      if (RESEND_API_KEY && AUDIENCE_ID) {
        const resendRes = await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
          headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
        });
        if (resendRes.ok) {
          const resendData = await resendRes.json();
          const activeContacts = (resendData.data || []).filter(c => !c.unsubscribed);
          subscriberCount = activeContacts.length;
        }
      }
    } catch (e) {
      console.warn('⚠️ Resend 구독자 수 조회 실패:', e.message);
    }

    // 지갑 알림 구독자 수 (실제 등록된 수)
    const walletUserCount = Object.keys(wallets).length;

    return sendJSON(res, 200, {
      total_visitors: stats.total || 0,
      daily_visitors: todayCount,
      subscribers: subscriberCount,
      portfolio_users: walletUserCount,
      ts: new Date().toISOString(),
    });
  }

  // ── GET /api/track (방문자 수 카운팅 — 인메모리, 논블로킹) ──────
  if (req.method === 'GET' && path === '/api/track') {
    const todayStr = Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    stats.total = (stats.total || 0) + 1;
    stats.daily[todayStr] = (stats.daily[todayStr] || 0) + 1;
    // 디스크 I/O 없음 — 5분마다 자동 플러시
    return sendJSON(res, 200, { success: true });
  }

  // ── POST /api/analytics (체류 시간 / 이탈률 수집) ───────────────
  if (req.method === 'POST' && path === '/api/analytics') {
    let body;
    try { body = await parseBody(req); }
    catch { return sendJSON(res, 400, { error: 'Invalid JSON' }); }

    const todayStr = Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    if (!stats.analytics) stats.analytics = { daily: {} };
    if (!stats.analytics.daily[todayStr]) {
      stats.analytics.daily[todayStr] = { pageviews: 0, bounces: 0, totalDwell: 0, sessions: 0 };
    }
    
    const todayStats = stats.analytics.daily[todayStr];
    
    if (body.type === 'pageview') {
      todayStats.pageviews += 1;
      if (body.isNewSession) todayStats.sessions += 1;
    } else if (body.type === 'dwell') {
      todayStats.totalDwell += (body.timeSpent || 0);
    } else if (body.type === 'bounce') {
      todayStats.bounces += 1;
    }

    return sendJSON(res, 200, { success: true });
  }

  // ── GET /api/poll (투표 결과 조회) ────────────────────────────────
  if (req.method === 'GET' && path.startsWith('/api/poll/')) {
    const pollId = path.replace('/api/poll/', '').split('?')[0];
    if (!pollId) return sendJSON(res, 400, { error: 'Invalid poll id' });
    
    const results = polls[pollId] || {};
    return sendJSON(res, 200, { success: true, results });
  }

  // ── POST /api/poll (투표 제출) ────────────────────────────────
  if (req.method === 'POST' && path.startsWith('/api/poll/')) {
    const pollId = path.replace('/api/poll/', '').split('?')[0];
    if (!pollId) return sendJSON(res, 400, { error: 'Invalid poll id' });

    let body;
    try { body = await parseBody(req); }
    catch { return sendJSON(res, 400, { error: 'Invalid JSON' }); }

    const { option } = body;
    if (!option) return sendJSON(res, 400, { error: 'Option required' });

    if (!polls[pollId]) polls[pollId] = {};
    polls[pollId][option] = (polls[pollId][option] || 0) + 1;
    
    return sendJSON(res, 200, { success: true, results: polls[pollId] });
  }

  // ── GET /api/share/wallet (소셜 공유용 동적 OG HTML 반환) ────────
  if (req.method === 'GET' && path.startsWith('/api/share/wallet')) {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const gain = urlObj.searchParams.get('gain') || '0';
    const weather = urlObj.searchParams.get('weather') || 'cloudy';
    const market = urlObj.searchParams.get('market') || 'cloudy';

    const ogImageUrl = `${ALLOWED_ORIGIN}/api/og/wallet?gain=${encodeURIComponent(gain)}&weather=${encodeURIComponent(weather)}&market=${encodeURIComponent(market)}`;
    
    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>EconPedia 내 지갑 방어율 리포트</title>
  <meta property="og:title" content="EconPedia 내 지갑 방어율 리포트" />
  <meta property="og:description" content="시장은 흔들려도, 내 지갑 날씨는 어떨까? 지금 방어율을 확인하세요!" />
  <meta property="og:image" content="${ogImageUrl}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${ogImageUrl}" />
  <meta http-equiv="refresh" content="0; url=/wallet" />
</head>
<body>
  <p>EconPedia 지갑으로 이동 중입니다...</p>
  <script>window.location.href="/wallet";</script>
</body>
</html>
    `;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html.trim());
    return;
  }

  // ── GET /api/og/wallet (Puppeteer를 이용한 동적 OG 이미지 생성) ────
  if (req.method === 'GET' && path.startsWith('/api/og/wallet')) {
    // Puppeteer DoS Attack Prevention
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (isRateLimited(ip)) {
      res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('너무 많은 요청입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const gainStr = urlObj.searchParams.get('gain') || '0';
    const gain = parseInt(gainStr, 10) || 0;
    const weather = urlObj.searchParams.get('weather') || 'cloudy';
    const market = urlObj.searchParams.get('market') || 'cloudy';

    // Generate HTML for the OG image
    let weatherLabel = '흐림';
    let weatherDesc = `${gain.toLocaleString()}원 타격`;
    let bgColor = '#f59e0b';
    let msg = '약간의 손실, 아직 시장 방어가 가능한 수준입니다.';
    let iconSvg = '<svg viewBox="0 0 24 24" fill="none"><path d="M17.5 19H9a7 7 0 116.71-4.9A5.5 5.5 0 0117.5 19z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    if (gain > 0) {
      bgColor = '#10b981';
      weatherLabel = '맑음 (수익)';
      weatherDesc = `+${gain.toLocaleString()}원 상승`;
      msg = '바람을 타고, 내 자산이 순항하고 있습니다.';
      if (weather === 'umbrella') {
        weatherLabel = '우산 (선방)';
        msg = '시장은 폭우가 쏟아져도, 내 지갑은 안전합니다.';
        iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"/></svg>';
      } else {
        iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/></svg>';
      }
    } else if (gain <= -10000) {
      bgColor = '#ef4444';
      weatherLabel = '폭풍';
      msg = '거센 폭풍우! 내 지갑에 비상경보가 켜졌습니다.';
      iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 13H9a7 7 0 116.71-4.9A5.5 5.5 0 0117.5 13z"/><path d="M13 14l-3.5 5h4.5l-4 5"/></svg>';
    }

    const templateHtml = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <style>
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        body {
          margin: 0; padding: 0; width: 1200px; height: 630px; font-family: 'Pretendard', sans-serif;
          background: linear-gradient(145deg, #1e293b, #0f172a);
          display: flex; justify-content: center; align-items: center; color: white;
        }
        .card {
          width: 1050px; height: 500px; background: rgba(30,41,59,0.8);
          border: 2px solid rgba(255,255,255,0.1); border-radius: 32px;
          display: flex; flex-direction: column; justify-content: center; align-items: center;
          position: relative; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        }
        .glow {
          position: absolute; width: 600px; height: 600px; background: ${bgColor};
          filter: blur(150px); opacity: 0.15; border-radius: 50%;
        }
        .icon { width: 120px; height: 120px; color: ${bgColor}; margin-bottom: 24px; z-index: 1; }
        .label { font-size: 56px; font-weight: 800; color: ${bgColor}; margin-bottom: 12px; z-index: 1; }
        .desc { font-size: 32px; font-weight: 700; color: #94a3b8; margin-bottom: 40px; z-index: 1; }
        .msg { font-size: 40px; font-weight: 700; color: #f8fafc; z-index: 1; text-align: center; }
        .logo { position: absolute; bottom: 40px; right: 50px; font-size: 28px; font-weight: 800; color: rgba(255,255,255,0.3); z-index: 1; }
        .badge { position: absolute; top: 40px; left: 50px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 10px 24px; border-radius: 99px; font-size: 24px; font-weight: 700; border: 2px solid rgba(56, 189, 248, 0.3); z-index: 1; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="glow"></div>
        <div class="badge">Econ-Sync Data</div>
        <div class="icon">${iconSvg}</div>
        <div class="label">${weatherLabel}</div>
        <div class="desc">${weatherDesc}</div>
        <div class="msg">${msg}</div>
        <div class="logo">EconPedia</div>
      </div>
    </body>
    </html>
    `;

    try {
      const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 630 });
      await page.setContent(templateHtml, { waitUntil: 'networkidle0' });
      const buffer = await page.screenshot({ type: 'png' });
      await browser.close();

      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable'
      });
      res.end(buffer);
    } catch (err) {
      console.error("Puppeteer OG Generate Error:", err);
      res.writeHead(500);
      res.end("Internal Server Error");
    }
    return;
  }

  // ── POST /api/wallet-subscribe (지갑 알림 구독) ───────────────────
  if (req.method === 'POST' && path === '/api/wallet-subscribe') {
    let body;
    try { body = await parseBody(req); }
    catch { return sendJSON(res, 400, { error: 'Invalid JSON' }); }

    const { email, settings } = body;
    if (!email || !isValidEmail(email)) {
      return sendJSON(res, 400, { error: '올바른 이메일 주소를 입력해주세요.' });
    }
    if (!settings) {
      return sendJSON(res, 400, { error: '설정값이 필요합니다.' });
    }

    wallets[email] = {
      settings,
      subscribedAt: new Date().toISOString()
    };
    
    return sendJSON(res, 200, { success: true, message: '변동 시 알림 구독이 완료되었습니다!' });
  }

  // ── POST /api/subscribe ────────────────────────────────
  if (req.method === 'POST' && path === '/api/subscribe') {
    // Rate limit
    if (isRateLimited(ip)) {
      return sendJSON(res, 429, { error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' });
    }

    if (!RESEND_API_KEY || !AUDIENCE_ID) {
      return sendJSON(res, 500, { error: '서버 설정 오류입니다. 관리자에게 문의해주세요.' });
    }

    let body;
    try { body = await parseBody(req); }
    catch { return sendJSON(res, 400, { error: '잘못된 요청 형식입니다.' }); }

    const { email, name } = body;

    if (!email || !isValidEmail(email)) {
      return sendJSON(res, 400, { error: '올바른 이메일 주소를 입력해주세요.' });
    }

    try {
      await addContact(email, name || '');
      console.log(`[subscribe] ✅ ${email}`);
      return sendJSON(res, 200, {
        success: true,
        message: '구독 신청이 완료됐습니다! 내일 아침 첫 브리핑을 보내드릴게요. 📊',
      });
    } catch (err) {
      console.error(`[subscribe] ❌ ${email}: ${err.message}`);
      // 이미 구독중인 경우도 성공으로 처리
      if (err.message?.includes('already')) {
        return sendJSON(res, 200, {
          success: true,
          message: '이미 구독 중입니다! 매일 아침 브리핑을 보내드리고 있어요. 📊',
        });
      }
      return sendJSON(res, 500, { error: '구독 신청 중 오류가 발생했습니다. 다시 시도해주세요.' });
    }
  }

  // ── DELETE /api/subscribe (구독 취소) ─────────────────
  if (req.method === 'DELETE' && path === '/api/subscribe') {
    let body;
    try { body = await parseBody(req); }
    catch { return sendJSON(res, 400, { error: '잘못된 요청 형식입니다.' }); }

    const { email } = body;
    if (!email || !isValidEmail(email)) {
      return sendJSON(res, 400, { error: '올바른 이메일 주소를 입력해주세요.' });
    }

    try {
      const result = await removeContact(email);
      console.log(`[unsubscribe] ✅ ${email}`);
      return sendJSON(res, 200, { success: true, ...result });
    } catch (err) {
      console.error(`[unsubscribe] ❌ ${email}: ${err.message}`);
      return sendJSON(res, 500, { error: '구독 취소 중 오류가 발생했습니다.' });
    }
  }

  // 404
  return sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`🚀 EconPedia Subscribe API 서버 실행 중 — port ${PORT}`);
  console.log(`   Audience ID: ${AUDIENCE_ID || '⚠️ 미설정'}`);
});
