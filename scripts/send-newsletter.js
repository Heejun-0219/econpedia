// scripts/send-newsletter.js
// 데일리 브리핑 이메일 뉴스레터 발송 (Resend API)
//
// 필요한 환경 변수:
//   RESEND_API_KEY     - Resend에서 발급한 API Key
//   NEWSLETTER_FROM    - 발신자 이메일 (예: onboarding@resend.dev 또는 briefing@econpedia.kr)
//   NEWSLETTER_TO      - 수신자 이메일 (쉼표로 구분 시 여러 명 가능)

import { Resend } from 'resend';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── 환경 변수 검증 ─────────────────────────────────────
const RESEND_API_KEY  = process.env.RESEND_API_KEY;
const FROM            = process.env.NEWSLETTER_FROM || 'EconPedia <onboarding@resend.dev>';
const TO              = process.env.NEWSLETTER_TO;

if (!RESEND_API_KEY) {
  console.error('❌ RESEND_API_KEY 환경 변수가 없습니다. 발송을 건너뜁니다.');
  process.exit(0);
}
if (!TO) {
  console.error('❌ NEWSLETTER_TO 환경 변수가 없습니다. 발송을 건너뜁니다.');
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
  process.exit(0);
}

if (!latestArticle) {
  console.log('ℹ️  발행된 기사가 없습니다. 발송을 건너뜁니다.');
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
              <p style="color:rgba(255,255,255,0.2);font-size:11px;margin:0;">
                <a href="https://econpedia.dedyn.io" style="color:#3b82f6;text-decoration:none;">econpedia.dedyn.io</a>
                &nbsp;·&nbsp;
                <a href="https://econpedia.dedyn.io/about" style="color:rgba(255,255,255,0.3);text-decoration:none;">소개</a>
                &nbsp;·&nbsp;
                <a href="https://econpedia.dedyn.io/contact" style="color:rgba(255,255,255,0.3);text-decoration:none;">문의</a>
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

const toList = TO.split(',').map(e => e.trim()).filter(Boolean);

console.log(`📧 뉴스레터 발송 시작...`);
console.log(`   수신자: ${toList.join(', ')}`);
console.log(`   기사: ${latestArticle.title}`);

try {
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: toList,
    subject: `📊 [EconPedia] ${dateStr} | ${latestArticle.title}`,
    html,
  });

  if (error) {
    // ── 에러 상세 로그 ──────────────────────────────────
    console.error('═══════════════════════════════════════');
    console.error('❌ 뉴스레터 발송 실패');
    console.error('───────────────────────────────────────');
    console.error(`   코드   : ${error.statusCode ?? 'N/A'}`);
    console.error(`   이름   : ${error.name ?? 'N/A'}`);
    console.error(`   메시지 : ${error.message}`);
    console.error('───────────────────────────────────────');

    // Resend 무료 플랜 제한 안내
    if (error.statusCode === 403 && error.name === 'validation_error') {
      const ownerEmail = error.message.match(/\(([^)]+)\)/)?.[1] ?? '계정 이메일';
      console.error('');
      console.error('💡 원인: Resend 무료 플랜 제한');
      console.error('   onboarding@resend.dev 발신자는 계정 소유자 이메일로만 발송 가능합니다.');
      console.error('');
      console.error('🛠  해결 방법 (둘 중 하나 선택):');
      console.error('');
      console.error('   [A] GitHub Secret NEWSLETTER_TO 값을 변경 (즉시 가능)');
      console.error(`       현재 설정값 → 계정 소유자 이메일로 변경: ${ownerEmail}`);
      console.error('       GitHub → Settings → Secrets → NEWSLETTER_TO');
      console.error('');
      console.error('   [B] Resend 도메인 인증 후 FROM 주소 변경 (권장, 수일 소요)');
      console.error('       https://resend.com/domains 에서 도메인 인증');
      console.error('       인증 후 GitHub Secret NEWSLETTER_FROM 을 도메인 이메일로 설정');
      console.error('       예: EconPedia <briefing@econpedia.kr>');
    }

    console.error('═══════════════════════════════════════');
    // 이메일 실패가 전체 워크플로우를 중단시키지 않도록 exit 0
    process.exit(0);
  }

  console.log('✅ 뉴스레터 발송 완료!');
  console.log(`   메일 ID  : ${data.id}`);
  console.log(`   수신자   : ${toList.join(', ')}`);
  console.log(`   제목     : ${latestArticle.title}`);
} catch (err) {
  console.error('═══════════════════════════════════════');
  console.error('❌ 뉴스레터 발송 중 예외 발생');
  console.error(`   ${err.message}`);
  console.error('═══════════════════════════════════════');
  process.exit(0); // 사이트 배포 파이프라인은 계속 진행
}

