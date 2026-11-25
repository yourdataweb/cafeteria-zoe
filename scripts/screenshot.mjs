#!/usr/bin/env node
/**
 * Handover screenshots — page top section with a QR overlay.
 *
 * Two deliverables:
 *   1. handover-tablet.png     — 768×1024 CSS @2x (tablet), for screens/sharing
 *   2. handover-a4-quarter.png — 105×148.5 mm at 300 dpi = 1240×1754 px,
 *                                i.e. exactly one quarter of an A4 sheet
 *   3. handover-a4-sheet.png   — full A4 at 300 dpi (2480×3508) with four
 *                                copies in a 2×2 grid and dashed cut marks
 *
 *   node scripts/screenshot.mjs
 *   BASE=http://127.0.0.1:8100 node scripts/screenshot.mjs
 *
 * Requires puppeteer and qrcode (resolved from the OpenClaw workspace).
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/davidoc/.openclaw/workspace/');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PHOTOS = join(ROOT, 'assets', 'photos');

const BASE = process.env.BASE || 'https://yourdataweb.github.io/cafeteria-zoe/';
const SITE_URL = 'https://yourdataweb.github.io/cafeteria-zoe/';

/* A4 at 300 dpi. A quarter is 105 × 148.5 mm. */
const A4 = { w: 2480, h: 3508 };
const QUARTER = { w: 1240, h: 1754 }; // 105 × 148.5 mm at 300 dpi

/* The quarter keeps the tablet layout so the printed card shows the tablet
   presentation, not the narrow phone one. 820 CSS px (iPad Air width) is used
   because the site switches to its mobile layout at 780 px and below: at 768
   the hamburger replaces the nav, which reads poorly on paper. The device pixel
   ratio is derived from the target width so the output lands on the exact
   print size. */
const TABLET_CSS_WIDTH = 820;
const QUARTER_DPR = QUARTER.w / TABLET_CSS_WIDTH; // ≈1.5122
const QUARTER_CSS_HEIGHT = Math.round(QUARTER.h / QUARTER_DPR); // ≈1160
const DPR = 2; // CSS px → device px for the screen/tablet variant

mkdirSync(PHOTOS, { recursive: true });

const qrDataUrl = await QRCode.toDataURL(SITE_URL, {
  errorCorrectionLevel: 'H',
  margin: 1,
  width: 600,
  color: { dark: '#23150fff', light: '#ffffffff' }
});

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

/**
 * Render the page top at a CSS viewport and return the base64 PNG.
 * The consent notice is dismissed first so the shot shows the real page.
 */
async function shoot(cssWidth, cssHeight, dpr) {
  const page = await browser.newPage();
  await page.setViewport({
    width: cssWidth,
    height: cssHeight,
    deviceScaleFactor: dpr
  });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 800));

  await page.evaluate(() => {
    const accept = document.querySelector('#cookie-accept');
    if (accept) accept.click();
  });
  await new Promise((r) => setTimeout(r, 400));

  const shot = await page.screenshot({ encoding: 'base64' });
  await page.close();
  return shot;
}

/**
 * Composite the QR overlay onto a shot.
 * `cssWidth`/`cssHeight` are the CSS viewport the shot was taken at, so the
 * overlay scales with the layout instead of being hard-coded per size.
 */
async function compose(shotB64, cssWidth, cssHeight, dpr) {
  const composer = await browser.newPage();
  await composer.setViewport({
    width: cssWidth,
    height: cssHeight,
    deviceScaleFactor: dpr
  });

  const qrSize = Math.round(cssWidth * 0.215); // ≈22 mm when printed as a quarter
  const pad = Math.round(cssWidth * 0.032);

  const html = `<!DOCTYPE html>
<html lang="ca"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  .frame { position: relative; width: ${cssWidth}px; height: ${cssHeight}px; overflow: hidden; background: #23150f; }
  .frame img.shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; }
  .scrim {
    position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(35,21,15,0) 55%, rgba(35,21,15,.55) 78%, rgba(35,21,15,.82) 100%);
  }
  .card {
    position: absolute; left: ${pad}px; right: ${pad}px; bottom: ${pad}px;
    display: flex; align-items: center; gap: ${Math.round(cssWidth * 0.028)}px;
    padding: ${Math.round(cssWidth * 0.026)}px ${Math.round(cssWidth * 0.03)}px;
    background: #fff;
    border-radius: ${Math.round(cssWidth * 0.026)}px;
    box-shadow: 0 8px 28px rgba(0,0,0,.28);
  }
  .copy { flex: 1; min-width: 0; }
  .eyebrow {
    font: 700 ${Math.round(cssWidth * 0.022)}px/1.25 Inter, system-ui, sans-serif;
    color: #8a5a2b; margin: 0 0 ${Math.round(cssWidth * 0.008)}px;
    letter-spacing: .01em;
  }
  .url {
    font: 600 ${Math.round(cssWidth * 0.0235)}px/1.3 Fraunces, Georgia, serif;
    color: #23150f; margin: 0; word-break: break-word;
  }
  .qr { flex: none; width: ${qrSize}px; height: ${qrSize}px; }
  .qr img { width: 100%; height: 100%; display: block; }
</style></head>
<body>
  <div class="frame">
    <img class="shot" src="data:image/png;base64,${shotB64}" alt="">
    <div class="scrim"></div>
    <div class="card">
      <div class="copy">
        <p class="eyebrow">Ja tens pàgina web:</p>
        <p class="url">${SITE_URL}</p>
      </div>
      <div class="qr"><img src="${qrDataUrl}" alt="Codi QR cap a ${SITE_URL}"></div>
    </div>
  </div>
</body></html>`;

  await composer.setContent(html, { waitUntil: 'networkidle0' });
  await composer.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 500));

  const png = await composer.screenshot({ type: 'png' });
  await composer.close();
  return png;
}

/**
 * Crop a PNG to an exact pixel size from the top-left corner.
 * The viewport height can round to a fractional pixel; this trims the sliver
 * so the printed size is exact without resampling the image.
 */
async function cropTo(pngBuffer, w, h) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.setContent(
    `<body style="margin:0"><div style="width:${w}px;height:${h}px;overflow:hidden">` +
    `<img src="data:image/png;base64,${pngBuffer.toString('base64')}" ` +
    `style="display:block;width:auto;height:auto;margin:0"></div></body>`,
    { waitUntil: 'load' }
  );
  const out = await page.screenshot({ type: 'png' });
  await page.close();
  return out;
}

/* ---------- 1. tablet (768 × 1024 CSS @2x) ---------- */
const tabletCss = { w: 768, h: 1024 };
const tabletShot = await shoot(tabletCss.w, tabletCss.h, DPR);
const tabletPng = await compose(tabletShot, tabletCss.w, tabletCss.h, DPR);
writeFileSync(join(PHOTOS, 'handover-tablet.png'), tabletPng);
console.log('handover-tablet.png     768×1024 CSS @2x');

/* ---------- 2. A4 quarter (1240 × 1754 px = 105 × 148.5 mm @300dpi) ---------- */
const quarterCss = { w: TABLET_CSS_WIDTH, h: QUARTER_CSS_HEIGHT };
const quarterShot = await shoot(quarterCss.w, quarterCss.h, QUARTER_DPR);
const quarterPngRaw = await compose(quarterShot, quarterCss.w, quarterCss.h, QUARTER_DPR);
const quarterPng = await cropTo(quarterPngRaw, QUARTER.w, QUARTER.h);
writeFileSync(join(PHOTOS, 'handover-a4-quarter.png'), quarterPng);
console.log(`handover-a4-quarter.png ${QUARTER.w}×${QUARTER.h} px (105×148.5 mm @300 dpi)`);

/* ---------- 3. A4 sheet, 2×2 grid with cut marks ---------- */
const composer = await browser.newPage();
await composer.setViewport({ width: A4.w, height: A4.h, deviceScaleFactor: 1 });

const cellW = QUARTER.w;
const cellH = QUARTER.h;
const q64 = quarterPng.toString('base64');

const sheetHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .sheet {
    position: relative; width: ${A4.w}px; height: ${A4.h}px;
    background: #fff;
  }
  .cell {
    position: absolute; width: ${cellW}px; height: ${cellH}px; overflow: hidden;
  }
  .cell img { width: 100%; height: 100%; display: block; }
  .c1 { left: 0; top: 0; }
  .c2 { left: ${cellW}px; top: 0; }
  .c3 { left: 0; top: ${cellH}px; }
  .c4 { left: ${cellW}px; top: ${cellH}px; }
  /* cut marks: dashed guides at the centre lines */
  .cut-v {
    position: absolute; left: ${cellW - 1}px; top: 0; width: 0; height: ${A4.h}px;
    border-left: 2px dashed #b9b9b9;
  }
  .cut-h {
    position: absolute; top: ${cellH - 1}px; left: 0; height: 0; width: ${A4.w}px;
    border-top: 2px dashed #b9b9b9;
  }
</style></head>
<body>
  <div class="sheet">
    <div class="cell c1"><img src="data:image/png;base64,${q64}" alt=""></div>
    <div class="cell c2"><img src="data:image/png;base64,${q64}" alt=""></div>
    <div class="cell c3"><img src="data:image/png;base64,${q64}" alt=""></div>
    <div class="cell c4"><img src="data:image/png;base64,${q64}" alt=""></div>
    <div class="cut-v"></div>
    <div class="cut-h"></div>
  </div>
</body></html>`;

await composer.setContent(sheetHtml, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 400));
const sheetPng = await composer.screenshot({ type: 'png' });
writeFileSync(join(PHOTOS, 'handover-a4-sheet.png'), sheetPng);
console.log('handover-a4-sheet.png   2480×3508 px (A4 @300 dpi, 2×2 with cut marks)');

/* A print-ready PDF is more faithful than a PNG for physical printing: the page
   box is exactly A4 and the four cards land at their true millimetre size. */
const pdfPage = await browser.newPage();
await pdfPage.setContent(
  `<html><head><style>
     @page { size: A4; margin: 0; }
     html, body { margin: 0; padding: 0; }
     img { display: block; width: 210mm; height: 297mm; }
   </style></head><body>
     <img src="data:image/png;base64,${sheetPng.toString('base64')}" alt="">
   </body></html>`,
  { waitUntil: 'load' }
);
await pdfPage.pdf({
  path: join(PHOTOS, 'handover-a4-sheet.pdf'),
  format: 'A4',
  printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 }
});
await pdfPage.close();
console.log('handover-a4-sheet.pdf   A4, four cards, print at 100% scale');

await browser.close();
console.log(`\nQR target: ${SITE_URL}`);
