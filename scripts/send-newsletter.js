// scripts/send-newsletter.js
// 데일리 브리핑 이메일 뉴스레터 발송 (Resend API)
//
// 필요한 환경 변수:
//   RESEND_API_KEY       - Resend에서 발급한 API Key
//   NEWSLETTER_FROM      - 발신자 이메일 (예: briefing@econpedia.dedyn.io)
//   RESEND_AUDIENCE_ID   - Resend Audiences ID (구독자 전체 발송)
//   NEWSLETTER_TO        - 폴백용 수신자 (RESEND_AUDIENCE_ID 없을 때만 사용)

import { Resend } from 'resend';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

// 로컬 환경에서 .env 파일 로드 (GitHub Actions는 secrets로 주입됨)
config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

// ─── 결과 상태 파일 기록 헬퍼 ────────────────────────────────
const STATUS_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '.newsletter-status.json');
function writeStatus(success, message = '') {
  writeFileSync(STATUS_FILE, JSON.stringify({ success, message, ts: Date.now() }));
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── 환경 변수 검증 ─────────────────────────────────────
const RESEND_API_KEY  = process.env.RESEND_API_KEY;
const FROM            = process.env.NEWSLETTER_FROM || 'EconPedia <briefing@econpedia.dedyn.io>';
const AUDIENCE_ID     = process.env.RESEND_AUDIENCE_ID;
const FALLBACK_TO     = process.env.NEWSLETTER_TO; // Audience 없을 때 폴백

if (!RESEND_API_KEY) {
  console.error('❌ RESEND_API_KEY 환경 변수가 없습니다. 발송을 건너뜁니다.');
  writeStatus(false, 'RESEND_API_KEY 없음');
  process.exit(0);
}
if (!AUDIENCE_ID && !FALLBACK_TO) {
  console.error('❌ RESEND_AUDIENCE_ID 또는 NEWSLETTER_TO 환경 변수가 없습니다.');
  writeStatus(false, 'AUDIENCE_ID/NEWSLETTER_TO 없음');
  process.exit(0);
}

// ─── 최신 기사 읽기 ──────────────────────────────────────
let latestArticle = null;
try {
  const articles = JSON.parse(
    readFileSync(join(ROOT, 'src/data/daily-articles.json'), 'utf-8')
  );
  latestArticle = articles[0]; // 최신 기사 = 배열 첫 번째
} catch (e) {
  console.error('❌ daily-articles.json 읽기 실패:', e.message);
  writeStatus(false, `daily-articles.json 읽기 실패: ${e.message}`);
  process.exit(0);
}

if (!latestArticle) {
  console.log('ℹ️  발행된 기사가 없습니다. 발송을 건너뜁니다.');
  writeStatus(false, '발행된 기사 없음');
  process.exit(0);
}

// ─── 날짜 포맷 ────────────────────────────────────────────
const today = new Date();
const dateStr = today.toLocaleDateString('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
  timeZone: 'Asia/Seoul',
});

const articleUrl = `https://econpedia.dedyn.io${latestArticle.href}`;

// ─── HTML 이메일 템플릿 ───────────────────────────────────
const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EconPedia 데일리 브리핑</title>
</head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

  <!-- 외부 컨테이너 -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f1e;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- 헤더 -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%);border-radius:16px 16px 0 0;padding:32px 40px;border-bottom:1px solid rgba(255,255,255,0.08);">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="display:inline-flex;align-items:center;gap:8px;">
                      <span style="font-size:28px;">📊</span>
                      <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">EconPedia</span>
                    </div>
                    <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:8px 0 0;">
                      AI 데일리 경제 브리핑
                    </p>
                  </td>
                  <td align="right" style="vertical-align:top;">
                    <span style="display:inline-block;background:rgba(239,68,68,0.15);color:#f87171;font-size:11px;font-weight:700;padding:4px 12px;border-radius:100px;border:1px solid rgba(239,68,68,0.3);">
                      🔴 LIVE
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 날짜 배너 -->
          <tr>
            <td style="background:rgba(59,130,246,0.08);border-left:4px solid #3b82f6;padding:16px 40px;">
              <p style="color:#93c5fd;font-size:14px;font-weight:600;margin:0;">
                📅 ${dateStr}
              </p>
            </td>
          </tr>

          <!-- 기사 본문 -->
          <tr>
            <td style="background:#111827;padding:40px;">

              <!-- 기사 제목 -->
              <h1 style="color:#f9fafb;font-size:24px;font-weight:800;line-height:1.4;margin:0 0 16px;letter-spacing:-0.5px;">
                ${latestArticle.title}
              </h1>

              <!-- 구분선 -->
              <div style="height:1px;background:rgba(255,255,255,0.08);margin:24px 0;"></div>

              <!-- 요약 -->
              <p style="color:#9ca3af;font-size:16px;line-height:1.8;margin:0 0 32px;">
                ${latestArticle.excerpt}
              </p>

              <!-- CTA 버튼 -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:100px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);">
                    <a href="${articleUrl}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.3px;">
                      오늘의 브리핑 전문 읽기 →
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- 카테고리 둘러보기 -->
          <tr>
            <td style="background:#0d1420;padding:24px 40px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="color:rgba(255,255,255,0.4);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 16px;">
                카테고리 둘러보기
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:8px;padding-bottom:8px;">
                    <a href="https://econpedia.dedyn.io/economy/basics" style="display:inline-block;color:#93c5fd;font-size:13px;font-weight:500;text-decoration:none;background:rgba(59,130,246,0.1);padding:6px 14px;border-radius:100px;border:1px solid rgba(59,130,246,0.2);">🏦 기초 경제학</a>
                  </td>
                  <td style="padding-right:8px;padding-bottom:8px;">
                    <a href="https://econpedia.dedyn.io/economy/investment" style="display:inline-block;color:#6ee7b7;font-size:13px;font-weight:500;text-decoration:none;background:rgba(16,185,129,0.1);padding:6px 14px;border-radius:100px;border:1px solid rgba(16,185,129,0.2);">📈 투자 기초</a>
                  </td>
                  <td style="padding-bottom:8px;">
                    <a href="https://econpedia.dedyn.io/economy/finance" style="display:inline-block;color:#fcd34d;font-size:13px;font-weight:500;text-decoration:none;background:rgba(245,158,11,0.1);padding:6px 14px;border-radius:100px;border:1px solid rgba(245,158,11,0.2);">💳 생활 금융</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 푸터 -->
          <tr>
            <td style="background:#080d1a;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);">
              <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:0 0 8px;">
                이 메일은 EconPedia 자동 발행 시스템이 발송했습니다.
              </p>
              <p style="color:rgba(255,255,255,0.2);font-size:11px;margin:0 0 12px 0;">
                <a href="https://econpedia.dedyn.io" style="color:#3b82f6;text-decoration:none;">econpedia.dedyn.io</a>
              </p>
              <p style="margin:0;">
                <a href="{{UNSUBSCRIBE_URL}}" style="color:rgba(255,255,255,0.3);text-decoration:underline;font-size:11px;">더 이상 뉴스레터를 받고 싶지 않다면 여기를 클릭해 구독을 취소해주세요.</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
`;

// ─── Resend 발송 ──────────────────────────────────────────
const resend = new Resend(RESEND_API_KEY);

async function getAudienceContacts(audienceId) {
  const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Contacts API 오류: ${res.status}`);
  const json = await res.json();
  // 구독 취소하지 않은 활성 구독자만
  return (json.data || []).filter(c => !c.unsubscribed).map(c => c.email);
}

async function sendToEmail(to, subject, baseHtml) {
  const unsubscribeUrl = `https://econpedia.dedyn.io/unsubscribe?email=${encodeURIComponent(to)}`;
  const htmlBody = baseHtml.replace('{{UNSUBSCRIBE_URL}}', unsubscribeUrl);

  return resend.emails.send({
    from: FROM,
    to,
    subject,
    html: htmlBody,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`
    }
  });
}

console.log(`📧 뉴스레터 발송 시작...`);
console.log(`   기사: ${latestArticle.title}`);

const subject = `📊 [EconPedia] ${dateStr} | ${latestArticle.title}`;

try {
  let recipients = [];

  if (AUDIENCE_ID) {
    // ── Audience 구독자 전체 발송 ────────────────────────
    console.log(`   📋 Audience ID: ${AUDIENCE_ID}`);
    console.log(`   구독자 목록 조회 중...`);
    recipients = await getAudienceContacts(AUDIENCE_ID);
    console.log(`   ✅ 활성 구독자 ${recipients.length}명 조회 완료`);

    if (recipients.length === 0) {
      console.log('ℹ️  구독자가 없습니다. 발송을 건너뜁니다.');
      writeStatus(false, '구독자 0명');
      process.exit(0);
    }
  } else {
    // ── 폴백: NEWSLETTER_TO 목록 발송 ─────────────────
    recipients = FALLBACK_TO.split(',').map(e => e.trim()).filter(Boolean);
    console.log(`   ⚠️  Audience 없음 — 폴백 수신자 ${recipients.length}명`);
  }

  console.log(`   발송 대상: ${recipients.slice(0, 3).join(', ')}${recipients.length > 3 ? ` 외 ${recipients.length - 3}명` : ''}`);
  console.log(`─────────────────────────────────────────`);

  // 개별 발송 (Resend 무료 플랜 호환 - 초당 2건 제한)
  let successCount = 0;
  let failCount = 0;
  const BATCH_SIZE = 2; // 동시 발송 최대 수

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(email => sendToEmail(email, subject, html))
    );

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && !result.value.error) {
        successCount++;
      } else {
        failCount++;
        const err = result.value?.error || result.reason;
        console.error(`   ❌ ${batch[idx]}: ${err?.message || '알 수 없는 오류'}`);
      }
    });

    // Rate limit 방지 (배치간 1100ms 대기)
    if (i + BATCH_SIZE < recipients.length) {
      await new Promise(r => setTimeout(r, 1100));
    }
  }

  console.log(`═══════════════════════════════════════`);
  console.log(`✅ 뉴스레터 발송 완료!`);
  console.log(`   성공: ${successCount}명 / 실패: ${failCount}명 / 전체: ${recipients.length}명`);
  console.log(`   제목: ${latestArticle.title}`);
  writeStatus(true, `성공 ${successCount}/${recipients.length}명`);

} catch (err) {
  console.error('═══════════════════════════════════════');
  console.error('❌ 뉴스레터 발송 중 예외 발생');
  console.error(`   ${err.message}`);
  console.error('═══════════════════════════════════════');
  writeStatus(false, `예외: ${err.message}`);
  process.exit(0); // 사이트 배포 파이프라인은 계속 진행
}

