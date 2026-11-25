#!/usr/bin/env node
/**
 * Handover screenshot — page top section with a QR overlay.
 *
 * Single deliverable:
 *   assets/photos/handover.png — 10.5 × 14.5 cm at 300 dpi (1240 × 1713 px),
 *   with the DPI written into the PNG so the file reports its physical size.
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
import zlib from 'node:zlib';

const require = createRequire('/home/davidoc/.openclaw/workspace/');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PHOTOS = join(ROOT, 'assets', 'photos');

const BASE = process.env.BASE || 'https://yourdataweb.github.io/cafeteria-zoe/';
const SITE_URL = 'https://yourdataweb.github.io/cafeteria-zoe/';

/* ---------- target size ----------
   10.5 × 14.5 cm at 300 dpi.
   10.5 cm = 4.1339 in → 1240.16 px → 1240
   14.5 cm = 5.7087 in → 1712.60 px → 1713
   At 300 dpi those pixels measure 104.99 × 145.03 mm, i.e. within 0.03 mm. */
const DPI = 300;
const TARGET = { w: 1240, h: 1713 };
const PPM = Math.round(DPI / 0.0254); // 11811 pixels per metre

/* The site switches to its mobile layout at 780 px and below, where the
   hamburger replaces the nav bar. 820 CSS px (iPad Air width) keeps the tablet
   presentation, which reads far better on a printed card. The device pixel
   ratio is derived from the target width so the output lands on the exact
   print size without resampling. */
const CSS_WIDTH = 820;
const DPR = (TARGET.w / CSS_WIDTH) * 1.004; // slight overshoot, cropped back to exact
const CSS_HEIGHT = Math.ceil(TARGET.h / DPR) + 2; // ditto: always at least TARGET.h

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
 * Sizes are expressed as fractions of the CSS width so the overlay scales with
 * the layout instead of being hard-coded per size.
 */
async function compose(shotB64, cssWidth, cssHeight, dpr) {
  const composer = await browser.newPage();
  await composer.setViewport({
    width: cssWidth,
    height: cssHeight,
    deviceScaleFactor: dpr
  });

  const qrSize = Math.round(cssWidth * 0.215); // ≈22 mm when printed
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
 * The viewport rounds to whole device pixels; this trims the sliver so the
 * printed size is exact without resampling the image.
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

/**
 * Insert a pHYs chunk so the PNG declares its resolution. Without it the file
 * is just pixels and a print dialog or image editor has no idea that 1240 px
 * are meant to be 10.5 cm wide. The chunk goes right after IHDR, which is
 * always 8 (signature) + 25 (IHDR) = 33 bytes into the file.
 */
function withDpi(png, ppm) {
  const type = Buffer.from('pHYs', 'ascii');
  const data = Buffer.alloc(9);
  data.writeUInt32BE(ppm, 0);
  data.writeUInt32BE(ppm, 4);
  data[8] = 1; // unit: metre
  const length = Buffer.alloc(4);
  length.writeUInt32BE(9, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([type, data])) >>> 0, 0);
  const chunk = Buffer.concat([length, type, data, crc]);
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
}

const shot = await shoot(CSS_WIDTH, CSS_HEIGHT, DPR);
const composed = await compose(shot, CSS_WIDTH, CSS_HEIGHT, DPR);
const cropped = await cropTo(composed, TARGET.w, TARGET.h);
const final = withDpi(cropped, PPM);

writeFileSync(join(PHOTOS, 'handover.png'), final);
console.log(`handover.png  ${TARGET.w}×${TARGET.h} px @ ${DPI} dpi = 10.5 × 14.5 cm`);
console.log(`QR target: ${SITE_URL}`);

await browser.close();
