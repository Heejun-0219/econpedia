// scripts/generate-logo-png.js
// EconPedia 로고 PNG 생성 (Puppeteer 렌더링)
// 출력: public/brand/ 디렉터리
//
// 생성 파일:
//   logo-light.png        — 흰 배경, 가로형 (1200×300)
//   logo-dark.png         — 다크 배경, 가로형 (1200×300)
//   logo-transparent.png  — 투명 배경, 가로형 (1200×300)
//   icon-light.png        — 흰 배경, 아이콘만 (512×512)
//   icon-dark.png         — 다크 배경, 아이콘만 (512×512)
//   icon-transparent.png  — 투명 배경, 아이콘만 (512×512)
//   og-image.png          — OG/SNS 커버 (1200×630)

import puppeteer from 'puppeteer';
import fs        from 'fs/promises';
import path      from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = path.join(__dirname, '..', 'public', 'brand');

// ─── 디자인 토큰 ──────────────────────────────────────────
const TOKEN = {
  green:      '#16a34a',
  greenLight: '#22c55e',
  navy:       '#0f172a',
  slate:      '#1e293b',
  white:      '#f1f5f9',
  textDark:   '#0f172a',
};

// ─── SVG 아이콘 (공통) ────────────────────────────────────
function iconSvg(color, size = 120) {
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1"   y="16" width="5"  height="7"  rx="1.5" fill="${color}" opacity="0.3"/>
      <rect x="9.5" y="10" width="5"  height="13" rx="1.5" fill="${color}" opacity="0.65"/>
      <rect x="18"  y="4"  width="5"  height="19" rx="1.5" fill="${color}"/>
      <path d="M3.5 16 Q12 3.5 20.5 4" stroke="${color}" stroke-width="1.75" stroke-linecap="round" fill="none"/>
    </svg>`;
}

// ─── HTML 템플릿 생성 ─────────────────────────────────────
function logoHtml({ bg, textColor, accentColor, iconSize, fontSize, subSize, padding, gap }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; }
  body {
    background: ${bg};
    display: flex;
    align-items: center;
    justify-content: center;
    padding: ${padding}px;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: ${gap}px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  }
  .icon { display: flex; align-items: center; flex-shrink: 0; }
  .text {
    font-size: ${fontSize}px;
    font-weight: 800;
    color: ${textColor};
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .sub {
    color: ${accentColor};
    font-weight: 700;
    font-size: ${subSize}px;
  }
</style>
</head>
<body>
  <div class="logo">
    <div class="icon">${iconSvg(accentColor, iconSize)}</div>
    <div class="text">Econ<span class="sub">Pedia</span></div>
  </div>
</body>
</html>`;
}

function iconHtml({ bg, accentColor, iconSize }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; }
  body {
    background: ${bg};
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
</head>
<body>${iconSvg(accentColor, iconSize)}</body>
</html>`;
}

function ogHtml() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; }
  body {
    background: linear-gradient(135deg, ${TOKEN.navy} 0%, ${TOKEN.slate} 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 32px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    padding: 60px;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 24px;
  }
  .title {
    font-size: 96px;
    font-weight: 800;
    color: ${TOKEN.white};
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .sub { color: ${TOKEN.green}; font-weight: 700; }
  .tagline {
    font-size: 32px;
    color: rgba(241,245,249,0.6);
    font-weight: 400;
    letter-spacing: 0.02em;
  }
  .bar {
    width: 80px;
    height: 4px;
    background: ${TOKEN.green};
    border-radius: 2px;
    opacity: 0.8;
  }
</style>
</head>
<body>
  <div class="logo">
    ${iconSvg(TOKEN.green, 120)}
    <div class="title">Econ<span class="sub">Pedia</span></div>
  </div>
  <div class="bar"></div>
  <div class="tagline">경제 초보자를 전문가로 만드는 AI 경제 백과사전</div>
</body>
</html>`;
}

// ─── 렌더링 ───────────────────────────────────────────────
async function render(page, html, width, height, outPath, transparent = false) {
  await page.setViewport({ width, height, deviceScaleFactor: 2 }); // 2x = 고해상도
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 200));

  const opts = { path: outPath, type: 'png' };
  if (transparent) opts.omitBackground = true;

  await page.screenshot(opts);
  console.log(`  ✅ ${path.basename(outPath)}`);
}

// ─── 메인 ────────────────────────────────────────────────
async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  console.log('🎨 EconPedia 로고 PNG 생성 중...\n');

  // 가로형 로고 (1200×300) — 실제 출력은 2x → 2400×600
  const logoConfigs = [
    { name: 'logo-light',       bg: '#ffffff',     textColor: TOKEN.textDark, accentColor: TOKEN.green },
    { name: 'logo-dark',        bg: TOKEN.navy,    textColor: TOKEN.white,    accentColor: TOKEN.green },
    { name: 'logo-transparent', bg: 'transparent', textColor: TOKEN.textDark, accentColor: TOKEN.green },
  ];

  for (const cfg of logoConfigs) {
    const html = logoHtml({ ...cfg, iconSize: 88, fontSize: 72, subSize: 68, padding: 40, gap: 28 });
    const transparent = cfg.bg === 'transparent';
    await render(page, html, 600, 150, path.join(OUT_DIR, `${cfg.name}.png`), transparent);
  }

  // 아이콘만 (512×512) — 2x → 1024×1024
  const iconConfigs = [
    { name: 'icon-light',       bg: '#ffffff',     accentColor: TOKEN.green },
    { name: 'icon-dark',        bg: TOKEN.navy,    accentColor: TOKEN.green },
    { name: 'icon-transparent', bg: 'transparent', accentColor: TOKEN.green },
  ];

  for (const cfg of iconConfigs) {
    const html = iconHtml({ ...cfg, iconSize: 400 });
    const transparent = cfg.bg === 'transparent';
    await render(page, html, 512, 512, path.join(OUT_DIR, `${cfg.name}.png`), transparent);
  }

  // OG 이미지 (1200×630) — 2x → 2400×1260
  await render(page, ogHtml(), 1200, 630, path.join(OUT_DIR, 'og-image.png'));

  await browser.close();
  console.log(`\n🚀 완료! 출력 디렉터리: public/brand/`);
  console.log(`\n생성된 파일:`);

  const files = await fs.readdir(OUT_DIR);
  for (const f of files.filter(f => f.endsWith('.png'))) {
    const stat = await fs.stat(path.join(OUT_DIR, f));
    console.log(`  • ${f.padEnd(26)} ${(stat.size / 1024).toFixed(1)} KB`);
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
