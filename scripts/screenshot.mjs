#!/usr/bin/env node
/**
 * Handover screenshot — tablet top section with a QR overlay.
 *
 * Renders the live (or local) page at tablet width, then composites an overlay
 * carrying a QR code pointing at the site URL and the Catalan caption
 * "Ja tens pàgina web: <url>".
 *
 *   node scripts/screenshot.mjs
 *   BASE=http://127.0.0.1:8100/ OUT=/tmp/shot.png node scripts/screenshot.mjs
 *
 * Requires puppeteer and qrcode, resolved from the shared workspace install.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const require = createRequire('/home/davidoc/.openclaw/workspace/');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');

const BASE = process.env.BASE || 'https://yourdataweb.github.io/cafeteria-zoe/';
const OUT = process.env.OUT || join(ROOT, 'assets', 'photos', 'handover-tablet.png');
const SITE_URL = 'https://yourdataweb.github.io/cafeteria-zoe/';
const CAPTION = 'Ja tens pàgina web:';

mkdirSync(dirname(OUT), { recursive: true });

/* QR as a data URL, sized to stay crisp when composited. */
const qrDataUrl = await QRCode.toDataURL(SITE_URL, {
  errorCorrectionLevel: 'M',
  margin: 1,
  width: 420,
  color: { dark: '#23150fff', light: '#ffffffff' }
});

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

const page = await browser.newPage();
await page.setViewport({ width: 768, height: 1024, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise((r) => setTimeout(r, 900));

/* Consent state is irrelevant for the shot; dismiss the notice if present. */
await page.evaluate(() => {
  const accept = document.querySelector('#cookie-accept');
  if (accept) accept.click();
});
await new Promise((r) => setTimeout(r, 350));

/* Capture only the top section — the viewport, not the full page. */
const shot = await page.screenshot({ encoding: 'base64' });

/* Compose the overlay in a second page so the DOM APIs do the layout. */
const composer = await browser.newPage();
await composer.setViewport({ width: 768, height: 1024, deviceScaleFactor: 2 });

const html = `<!DOCTYPE html>
<html lang="ca"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  .frame {
    position: relative; width: 768px; height: 1024px; overflow: hidden;
    background: #23150f;
  }
  .frame img.shot {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover; object-position: top center; display: block;
  }
  .overlay {
    position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(35,21,15,.10) 0%, rgba(35,21,15,.34) 62%, rgba(35,21,15,.78) 100%);
  }
  .card {
    position: absolute; left: 40px; right: 40px; bottom: 44px;
    display: flex; align-items: center; gap: 28px;
    padding: 26px 30px;
    background: rgba(255,255,255,.96);
    border-radius: 22px;
    box-shadow: 0 18px 44px rgba(0,0,0,.34);
  }
  .copy { flex: 1; min-width: 0; }
  .copy .eyebrow {
    font: 700 17px/1.2 Inter, system-ui, sans-serif;
    color: #7a5a3a; margin: 0 0 10px;
  }
  .copy .url {
    font: 700 26px/1.25 Fraunces, Georgia, serif;
    color: #23150f; margin: 0;
    word-break: break-all;
  }
  .qr {
    flex: none; width: 190px; height: 190px; padding: 12px;
    background: #fff; border-radius: 14px;
    border: 1px solid rgba(35,21,15,.12);
    box-shadow: 0 6px 18px rgba(0,0,0,.12);
  }
  .qr img { width: 100%; height: 100%; display: block; }
</style></head>
<body>
  <div class="frame">
    <img class="shot" src="data:image/png;base64,${shot}" alt="">
    <div class="overlay"></div>
    <div class="card">
      <div class="copy">
        <p class="eyebrow">Ja tens pàgina web:</p>
        <p class="url">${SITE_URL}</p>
      </div>
      <div class="qr"><img src="${qrDataUrl}" alt="Codi QR cap a ${SITE_URL}"></div>
    </div>
  </div>
</body></html>`;

await composer.setContent(html, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 500));

const final = await composer.screenshot({ type: 'png' });
writeFileSync(OUT, final);

console.log(`Screenshot written: ${OUT}`);
console.log(`  viewport : 768x1024 (tablet) @2x`);
console.log(`  QR target: ${SITE_URL}`);
console.log(`  caption  : ${CAPTION} ${SITE_URL}`);

await browser.close();
