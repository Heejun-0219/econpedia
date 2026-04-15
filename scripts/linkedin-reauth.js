// scripts/linkedin-reauth.js
// LinkedIn OAuth 재인증 스크립트
//
// 사용법: node scripts/linkedin-reauth.js
//
// 동작:
//   1. 로컬 콜백 서버 시작 (port 8080)
//   2. 브라우저에서 LinkedIn 인증 페이지 자동 오픈
//   3. 승인 후 새 access_token 자동 교환
//   4. .env 파일 자동 업데이트
//   5. GitHub Secrets 자동 업데이트 (gh CLI 있을 때)

import http             from 'http';
import { execFile }     from 'child_process';
import { promisify }    from 'util';
import fs               from 'fs/promises';
import path             from 'path';
import { fileURLToPath } from 'url';
import dotenv           from 'dotenv';

dotenv.config();

const execFileAsync = promisify(execFile);
const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH      = path.join(__dirname, '..', '.env');

const CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI  = 'http://localhost:8080/callback';
const PORT          = 8080;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ LINKEDIN_CLIENT_ID 또는 LINKEDIN_CLIENT_SECRET이 .env에 없습니다.');
  process.exit(1);
}

// ─── .env 특정 키 업데이트 ────────────────────────────────
async function updateEnvKey(key, value) {
  let content = await fs.readFile(ENV_PATH, 'utf-8');
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}="${value}"`);
  } else {
    content += `\n${key}="${value}"`;
  }
  await fs.writeFile(ENV_PATH, content, 'utf-8');
}

// ─── GitHub Secrets 업데이트 (gh CLI) ────────────────────
async function updateGitHubSecret(name, value) {
  try {
    const repoDir = path.join(__dirname, '..');
    await execFileAsync('gh', ['secret', 'set', name, '--body', value], { cwd: repoDir });
    return true;
  } catch {
    return false;
  }
}

// ─── access token 교환 ────────────────────────────────────
async function exchangeCode(code) {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  REDIRECT_URI,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`토큰 교환 실패: ${err}`);
  }

  return res.json();
}

// ─── 브라우저 열기 ────────────────────────────────────────
function openBrowser(url) {
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  execFile(opener, [url], () => {}); // 실패해도 무시
}

// ─── 메인 ────────────────────────────────────────────────
async function main() {
  console.log('\n🔑 LinkedIn 재인증 시작...\n');

  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?` +
    new URLSearchParams({
      response_type: 'code',
      client_id:     CLIENT_ID,
      redirect_uri:  REDIRECT_URI,
      scope:         'w_member_social openid profile',
    });

  await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      if (url.pathname !== '/callback') return;

      const code  = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error || !code) {
        res.writeHead(400);
        res.end(`<h2>❌ 인증 실패: ${error || 'code 없음'}</h2>`);
        server.close();
        reject(new Error(error || 'code 없음'));
        return;
      }

      try {
        console.log('📡 access token 교환 중...');
        const { access_token, expires_in } = await exchangeCode(code);

        const expireDate = new Date(Date.now() + expires_in * 1000);
        const expireDays = Math.round(expires_in / 86400);
        console.log(`✅ 새 access token 발급 완료`);
        console.log(`   만료일: ${expireDate.toLocaleDateString('ko-KR')} (${expireDays}일 후)\n`);

        // .env 업데이트
        await updateEnvKey('LINKEDIN_ACCESS_TOKEN', access_token);
        await updateEnvKey('LINKEDIN_TOKEN_ISSUED_AT', String(Date.now()));
        console.log('✅ .env 업데이트 완료');

        // GitHub Secrets 업데이트
        const ghOk = await updateGitHubSecret('LINKEDIN_ACCESS_TOKEN', access_token);
        if (ghOk) {
          console.log('✅ GitHub Secrets 업데이트 완료');
        } else {
          console.log('⚠️  GitHub Secrets 자동 업데이트 실패');
          console.log('   GitHub → Settings → Secrets → LINKEDIN_ACCESS_TOKEN 수동 업데이트 필요');
          console.log(`   새 토큰: ${access_token}`);
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f172a;color:#f1f5f9;">
            <h2 style="color:#22c55e">✅ LinkedIn 재인증 완료!</h2>
            <p>새 토큰이 발급됐습니다.</p>
            <p>만료일: <b>${expireDate.toLocaleDateString('ko-KR')}</b> (${expireDays}일 후)</p>
            <p style="margin-top:24px;color:#94a3b8">이 창을 닫아도 됩니다.</p>
          </body></html>
        `);
        server.close();
        resolve();
      } catch (e) {
        res.writeHead(500);
        res.end(`<h2>❌ 에러: ${e.message}</h2>`);
        server.close();
        reject(e);
      }
    });

    server.listen(PORT, () => {
      console.log('🌐 브라우저에서 LinkedIn 인증 페이지를 여는 중...');
      openBrowser(authUrl);
      console.log('   (자동으로 안 열리면 아래 URL을 브라우저에 붙여넣으세요)');
      console.log(`   ${authUrl}\n`);
    });

    server.on('error', reject);
  });

  console.log('\n🚀 완료! 파이프라인이 자동으로 새 토큰을 사용합니다.');
}

main().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
