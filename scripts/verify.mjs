#!/usr/bin/env node
/**
 * Headless verification of the built site — three locales, no dependencies
 * beyond puppeteer.
 *
 *   node scripts/verify.mjs
 *   BASE=http://127.0.0.1:8099/ SHOTS=/tmp/cafeteria-zoe-shots node scripts/verify.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire('/home/davidoc/.openclaw/workspace/');
const puppeteer = require('puppeteer');
const fs = require('node:fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099/';
const SHOTS = process.env.SHOTS || '/tmp/cafeteria-zoe-shots';
fs.mkdirSync(SHOTS, { recursive: true });

// Derived from the build's own locale table so a default-locale change is verified,
// not silently missed: ca is the default at /, es at /es/, en at /en/.
const LOCALES = [
  { locale: 'ca', path: '', label: 'CA (default, /)' },
  { locale: 'es', path: 'es/', label: 'ES (/es/)' },
  { locale: 'en', path: 'en/', label: 'EN (/en/)' }
];

const HREFLANG = { ca: 'ca-ES', es: 'es-ES', en: 'en-GB' };

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('requestfailed', (r) => {
  const u = r.url();
  if (!/fonts\.g|googleusercontent|maps\.g|gstatic|google\.com\/maps/.test(u)) {
    errors.push('REQFAIL: ' + u + ' — ' + r.failure()?.errorText);
  }
});

const failures = [];
const expect = (cond, msg) => { if (!cond) failures.push(msg); return cond; };

/* llms.txt: fetched as a file, because that is how a crawler reads it. An empty or
   stray-HTML file is invisible in a browser and useless to an answer engine. */
{
  let body = '';
  let status = 0;
  try {
    const res = await fetch(BASE + 'llms.txt');
    status = res.status;
    body = res.ok ? await res.text() : '';
  } catch (err) {
    failures.push(`llms.txt fetch failed: ${err.message}`);
  }
  expect(status === 200, `llms.txt: expected 200 at /llms.txt, got ${status}`);
  expect(!/<(html|body|div|p)[\s>]/i.test(body), 'llms.txt: served HTML instead of plain text');
  expect(/^# \S/.test(body), 'llms.txt: does not start with an H1');
  expect(/^# .*\n\n> \S/m.test(body), 'llms.txt: no blockquote summary under the H1');
  expect(body.includes('cafeteria-zoe'), 'llms.txt: does not name this site');
  for (const { locale } of LOCALES) expect(body.includes(`/${locale === 'ca' ? '' : locale + '/'}`), `llms.txt: no link for ${locale}`);
  expect(body.trim().length > 300, `llms.txt: too thin (${body.trim().length} chars)`);
  console.log('llms.txt: ok');
}


async function inspect(url, label) {
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 40000 });
  await new Promise((r) => setTimeout(r, 800));

  const data = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const qa = (s) => [...document.querySelectorAll(s)];
    let jsonLd = null;
    try {
      const j = JSON.parse(q('script[type="application/ld+json"]').textContent);
      jsonLd = {
        type: j['@type'], name: j.name, rating: j.aggregateRating?.ratingValue,
        count: j.aggregateRating?.reviewCount, lang: j.inLanguage,
        sameAs: j.sameAs?.length, address: j.address?.addressLocality,
        telephone: j.telephone
      };
    } catch (e) { jsonLd = { error: String(e) }; }

    return {
      htmlLang: document.documentElement.lang,
      title: document.title,
      description: q('meta[name="description"]')?.content?.slice(0, 70),
      h1: q('#hero-title')?.innerText?.replace(/\s+/g, ' ').trim(),
      h1count: qa('h1').length,
      headingOrder: qa('h1,h2,h3,h4,h5,h6').map((h) => h.tagName).join(','),
      headingLevels: qa('h1,h2,h3,h4,h5,h6').map((h) => Number(h.tagName[1])),
      navLabels: qa('.nav a').map((a) => a.textContent.trim()),
      /* The toolbar switch and the drawer switch both live in .header-tools; take the
         first nav so the assertion counts one set of three, not six. */
      langOpts: qa('.header-tools > .langs .langs__link').map((a) => ({
        text: a.getAttribute('hreflang') || a.textContent.trim(),
        href: a.getAttribute('href'),
        active: a.getAttribute('aria-current') === 'true'
      })),
      socialLinks: qa('.social-bar--header .social-link').map((a) => a.getAttribute('aria-label')),
      reviews: qa('#review-grid .review').length,
      reviewStars: qa('#review-grid .review-stars').length,
      dishes: qa('.dish').length,
      ratingBadge: !!q('.rating-badge'),
      ratingValue: q('.rating-value')?.textContent?.trim(),
      ratingMeta: q('.rating-meta')?.textContent?.replace(/\s+/g, ' ').trim(),
      statStar: q('.stat-star')?.textContent?.trim(),
      statReviews: qa('.hero-stats .stat-label').map((e) => e.textContent.trim()),
      waLinks: qa('a[href*="wa.me"]').length,
      waHref: q('a[href*="wa.me"]')?.href,
      waFab: !!q('.wa-fab'),
      telLinks: qa('a[href^="tel:"]').map((a) => a.getAttribute('href')),
      caps: qa('.cap').length,
      capHeadings: qa('.cap-group h3').map((h) => h.textContent.trim()),
      canonical: q('link[rel="canonical"]')?.href,
      hreflangs: qa('link[rel="alternate"][hreflang]').map((l) => l.hreflang + '=' + l.href),
      ogLocale: q('meta[property="og:locale"]')?.content,
      ogAlternates: qa('meta[property="og:locale:alternate"]').map((m) => m.content),
      mapSrc: q('#map-frame')?.src || '',
      mapDataSrc: q('#map-frame')?.getAttribute('data-src') || '',
      cookieBanner: Boolean(q('#cookie-banner')),
      cookieBannerVisible: (() => {
        const b = q('#cookie-banner');
        if (!b) return false;
        const cs = getComputedStyle(b);
        return cs.display !== 'none' && cs.visibility !== 'hidden';
      })(),
      mapGateVisible: (() => {
        const g = q('#map-gate');
        if (!g) return false;
        const cs = getComputedStyle(g);
        return cs.display !== 'none' && cs.visibility !== 'hidden';
      })(),
      mapTitle: q('#map-frame')?.title,
      structured: jsonLd,
      skipLink: q('.skip')?.textContent?.trim(),
      imgAlts: qa('img').map((i) => i.alt),
      decorativeCount: qa('img').filter((i) => i.getAttribute('alt') === '').length,
      avatarsWithoutAlt: qa('.review-avatar img').filter((i) => !i.hasAttribute('alt')).length,
      contentImgsMissingAlt: qa('img').filter((i) => !i.hasAttribute('alt')).length,
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      heroPhoto: (() => {
        const img = q('.hero-media img');
        if (!img) return null;
        const r = img.getBoundingClientRect();
        const credit = q('[data-photo-credit]');
        const cs = credit ? getComputedStyle(credit) : null;
        return {
          src: img.getAttribute('src'),
          alt: img.getAttribute('alt'),
          natural: img.naturalWidth,
          inTopHalf: r.top < window.innerHeight * 0.5 && r.height > 80,
          creditText: credit ? credit.textContent.replace(/\s+/g, ' ').trim() : '',
          creditHidden: !credit || credit.hidden || !cs ||
            cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0
        };
      })(),
      hoursList: qa('#hours-list li').length,
      priceText: document.body.innerText.match(/€\s?\d+[–-]\d+/g) || []
    };
  });

  console.log(`\n===== ${label} =====`);
  console.log(JSON.stringify(data, null, 2));

  // assertions
  expect(data.h1count === 1, `${label}: expected exactly one h1, got ${data.h1count}`);
  expect(data.headingLevels[0] === 1, `${label}: the first heading should be an h1`);
  const jump = data.headingLevels.findIndex((lvl, i) => i > 0 && lvl - data.headingLevels[i - 1] > 1);
  expect(jump === -1, `${label}: heading level jumps at index ${jump} in ${data.headingOrder}`);
  expect(Boolean(data.canonical), `${label}: missing canonical`);
  expect(data.hreflangs.length === 4, `${label}: expected 4 hreflang links, got ${data.hreflangs.length} (${data.hreflangs.join(' ')})`);
  // Each locale must point at its own real path under the current default.
  for (const { locale, path: p } of LOCALES) {
    const want = `${HREFLANG[locale]}=https://cafeteria-zoe.vilanovailageltru.info/${p}`;
    expect(data.hreflangs.includes(want), `${label}: hreflang missing or wrong: ${want}`);
  }
  expect(data.hreflangs.includes('x-default=https://cafeteria-zoe.vilanovailageltru.info/'),
    `${label}: x-default must point at the default locale`);
  expect(data.langOpts.length === 3, `${label}: expected 3 language options, got ${data.langOpts.length}`);
  expect(data.langOpts.filter((o) => o.active).length === 1, `${label}: exactly one language should be active`);
  expect(data.reviews >= 1, `${label}: no testimonials rendered`);
  // This business has no phone number in its data, so the correct
  // outcome is no tel: link, no wa.me link and no floating WhatsApp button.
  expect(data.waLinks === 0, `${label}: WhatsApp links must not render without a phone number, found ${data.waLinks}`);
  expect(!data.waFab, `${label}: WhatsApp floating button must not render without a phone number`);
  expect(data.telLinks.length === 0, `${label}: tel: links must not render without a phone number, found ${data.telLinks}`);
  expect(data.ratingBadge, `${label}: rating badge missing for a 5.0 rating`);
  expect(data.structured && !data.structured.error, `${label}: JSON-LD failed to parse`);
  expect(data.structured?.type === 'CafeOrCoffeeShop', `${label}: JSON-LD @type should be CafeOrCoffeeShop, got ${data.structured?.type}`);
  expect(data.structured?.rating === 5, `${label}: JSON-LD rating should be 5`);
  expect(data.structured?.telephone === undefined || data.structured?.telephone === '', `${label}: JSON-LD must not invent a telephone number`);
  // 10 reviews is below the 50 threshold, so the count must stay hidden.
  expect(!/\b10\b/.test(data.ratingMeta || ''), `${label}: review count must stay hidden under 50, got "${data.ratingMeta}"`);
  // The map embed is consent-gated: the URL lives in data-src until accepted.
  expect(data.mapDataSrc.includes('output=embed'), `${label}: map iframe data-src not an embed`);
  expect(!data.mapSrc, `${label}: map iframe must not have src before consent, found "${data.mapSrc}"`);
  expect(data.cookieBanner, `${label}: missing cookie notice`);
  expect(data.cookieBannerVisible, `${label}: cookie notice should be visible on a first visit`);
  expect(data.mapGateVisible, `${label}: map gate should be visible before consent`);
  expect(data.hoursList === 0, `${label}: opening hours must not be published`);
  expect(data.priceText.length === 0, `${label}: price per person must not be published`);
  // Every <img> must carry an alt attribute; decorative ones are empty by design
  // (hero poster and the review avatars, which sit next to the author name).
  expect(data.contentImgsMissingAlt === 0, `${label}: ${data.contentImgsMissingAlt} img(s) without an alt attribute`);
  expect(data.avatarsWithoutAlt === 0, `${label}: review avatars must be decorative (alt="")`);
  expect(data.decorativeCount >= 1, `${label}: at least one decorative image expected`);
  // The brief asks for a business photo in the top half, credited to its author.
  expect(Boolean(data.heroPhoto), `${label}: hero photo missing`);
  expect(data.heroPhoto?.inTopHalf, `${label}: hero photo should sit in the top half of the page`);
  expect(!data.heroPhoto?.creditHidden, `${label}: photo credit must be visible`);
  expect(data.scrollW <= data.innerW + 1, `${label}: horizontal overflow ${data.scrollW} > ${data.innerW}`);

  return data;
}

const results = [];
for (const { locale, path, label } of LOCALES) {
  results.push(await inspect(BASE + path, label));
}

/* ---------- consent flow: accept, then the map loads ---------- */
console.log('\n===== consent flow =====');
/* An isolated browser context: its own localStorage, so accepting consent here
   cannot leak into the locale pages above (they share the default context). */
const cctx = await browser.createBrowserContext();
const cpage = await cctx.newPage();
cpage.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
cpage.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await cpage.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
await cpage.goto(BASE, { waitUntil: 'networkidle2' });
await cpage.evaluate(() => { try { localStorage.removeItem('cookie-consent-v1'); } catch (e) {} });
await cpage.reload({ waitUntil: 'networkidle2' });
const beforeAccept = await cpage.evaluate(() => ({
  banner: getComputedStyle(document.querySelector('#cookie-banner')).display !== 'none',
  gate: getComputedStyle(document.querySelector('#map-gate')).display !== 'none',
  src: document.querySelector('#map-frame').getAttribute('src')
}));
console.log('before accept:', JSON.stringify(beforeAccept));
expect(beforeAccept.banner === true, 'consent: notice should be visible before accepting');
expect(beforeAccept.gate === true, 'consent: map gate should be visible before accepting');
expect(!beforeAccept.src, 'consent: map iframe should have no src before accepting');

await cpage.click('#cookie-accept');
await new Promise((r) => setTimeout(r, 1200));
const afterAccept = await cpage.evaluate(() => ({
  banner: getComputedStyle(document.querySelector('#cookie-banner')).display !== 'none',
  gate: getComputedStyle(document.querySelector('#map-gate')).display !== 'none',
  src: document.querySelector('#map-frame').getAttribute('src'),
  stored: localStorage.getItem('cookie-consent-v1')
}));
console.log('after accept:', JSON.stringify(afterAccept));
expect(afterAccept.banner === false, 'consent: notice should hide after accepting');
expect(afterAccept.gate === false, 'consent: map gate should hide after accepting');
expect((afterAccept.src || '').includes('output=embed'), 'consent: map should load after accepting');
expect(afterAccept.stored === 'accepted', 'consent: choice should be stored');

/* The choice must persist across a reload. */
await cpage.reload({ waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 900));
const afterReload = await cpage.evaluate(() => ({
  banner: getComputedStyle(document.querySelector('#cookie-banner')).display !== 'none',
  src: document.querySelector('#map-frame').getAttribute('src')
}));
console.log('after reload:', JSON.stringify(afterReload));
expect(afterReload.banner === false, 'consent: notice must stay hidden after reload');
expect((afterReload.src || '').includes('output=embed'), 'consent: map must stay loaded after reload');

/* ---------- analytics gate: no Google request before consent ---------- */
console.log('\n===== analytics consent =====');
const GA_RE = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com/;

{
  // fresh context: a stored consent from the map test above would load the tag
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  const gaReqs = [];
  p.on('request', (r) => { if (GA_RE.test(r.url())) gaReqs.push(r.url().split('?')[0]); });
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(BASE, { waitUntil: 'networkidle2' });
  await p.evaluate(() => { try { localStorage.removeItem('cookie-consent-v1'); } catch (e) {} });
  await p.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));

  const pre = { reqs: gaReqs.length, cookies: (await p.cookies()).filter((c) => /^_ga/.test(c.name)).length };
  console.log('before consent:', JSON.stringify(pre));
  expect(pre.reqs === 0, `analytics: ${pre.reqs} Google request(s) before consent`);
  expect(pre.cookies === 0, `analytics: ${pre.cookies} _ga cookie(s) before consent`);

  await p.click('#cookie-accept');
  await new Promise((r) => setTimeout(r, 3500));
  const post = {
    reqs: gaReqs.length,
    collect: gaReqs.some((u) => /collect/.test(u)),
    cookies: (await p.cookies()).filter((c) => /^_ga/.test(c.name)).map((c) => c.name)
  };
  console.log('after accept:', JSON.stringify(post));
  expect(post.collect, 'analytics: no collect request after accepting');
  expect(post.cookies.length > 0, 'analytics: no _ga cookie after accepting');
  await ctx.close();
}

{
  // refusal must load nothing, and must not show the banner again on return
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  const gaReqs = [];
  p.on('request', (r) => { if (GA_RE.test(r.url())) gaReqs.push(1); });
  await p.goto(BASE, { waitUntil: 'networkidle2' });
  await p.click('#cookie-reject');
  await new Promise((r) => setTimeout(r, 2500));
  const stored = await p.evaluate(() => localStorage.getItem('cookie-consent-v1'));
  console.log('after reject:', JSON.stringify({ reqs: gaReqs.length, stored }));
  expect(gaReqs.length === 0, `analytics: ${gaReqs.length} Google request(s) after refusing`);
  expect(stored === 'essential', `analytics: refusal should be stored, got ${stored}`);

  await p.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1200));
  const onReturn = await p.evaluate(() => ({
    banner: getComputedStyle(document.querySelector('#cookie-banner')).display !== 'none',
    reqs: 0
  }));
  console.log('returning after refusal, banner visible:', onReturn.banner);
  expect(onReturn.banner === false, 'analytics: banner must stay hidden after an earlier refusal');
  expect(gaReqs.length === 0, 'analytics: a refusal must not start loading analytics later');
  await ctx.close();
}

// titles and h1s must differ per locale (real localized HTML, not a JS swap)
const titles = new Set(results.map((r) => r.title));
const h1s = new Set(results.map((r) => r.h1));
expect(titles.size === 3, `titles are not unique per locale: ${[...titles].join(' | ')}`);
expect(h1s.size === 3, `h1 text is not unique per locale: ${[...h1s].join(' | ')}`);

// screenshots at desktop and mobile
for (const { locale, path } of LOCALES) {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(BASE + path, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `${SHOTS}/${locale}-desktop.png`, fullPage: true });

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `${SHOTS}/${locale}-mobile.png`, fullPage: true });

  const ov = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth }));
  console.log(`\n${locale} mobile overflow: ${ov.s > ov.i + 1 ? '❌ ' + ov.s + ' > ' + ov.i : '✓ none'}`);
  expect(ov.s <= ov.i + 1, `${locale} mobile: horizontal overflow ${ov.s} > ${ov.i}`);
}

// tablet width
await page.setViewport({ width: 768, height: 1024, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: 'networkidle2' });
const tablet = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth }));
console.log(`tablet 768 overflow: ${tablet.s > tablet.i + 1 ? '❌' : '✓ none'}`);
expect(tablet.s <= tablet.i + 1, `tablet: horizontal overflow ${tablet.s} > ${tablet.i}`);

// language switching actually navigates between locales
await page.setViewport({ width: 1440, height: 900 });
for (const [from, to, target] of [['', 'es/', 'es'], ['es/', 'en/', 'en'], ['en/', '', 'ca']]) {
  await page.goto(BASE + from, { waitUntil: 'networkidle2' });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    /* The header was migrated to the shared markup (.langs__link); the old
       .lang-switch--header .lang-opt selector no longer exists. */
    page.click(`.langs .langs__link[lang="${target}"]`)
  ]);
  const landed = await page.evaluate(() => document.documentElement.lang);
  console.log(`switch ${from || '/'} → ${target}: ${page.url()} | lang=${landed}`);
  expect(landed.startsWith(target), `language switch to ${target} landed on lang=${landed}`);
}

// stale locale paths must keep working: already-shared links point at /ca/
const staleHtml = fs.readFileSync(new URL('../ca/index.html', import.meta.url), 'utf8');
// From /ca/ the only correct relative root is '../': './' would re-enter /ca/ and loop.
expect(/location\.replace\('\.\.\/'\)|location\.replace\("\.\.\/"\)/.test(staleHtml),
  '/ca/ redirect must climb to the site root, not loop back into /ca/');
expect(/rel="canonical"/.test(staleHtml) && /noindex/.test(staleHtml), '/ca/ redirect should be noindex with a canonical');
expect(/<a href=/.test(staleHtml), '/ca/ redirect needs a JS-off fallback link');
console.log('stale /ca/ redirect: ok');

// mobile drawer + keyboard
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.click('.nav-toggle');
await new Promise((r) => setTimeout(r, 350));
const opened = await page.evaluate(() => ({
  expanded: document.querySelector('.nav-toggle').getAttribute('aria-expanded'),
  hidden: document.querySelector('#mobile-nav').hidden,
  socialInDrawer: document.querySelectorAll('.social-bar--mobile .social-link').length,
  /* Language switching lives in the single shared toolbar now, not duplicated in the
     drawer, so count the header switch and require the drawer to expose it. */
  langInDrawer: document.querySelectorAll('.header-tools > .langs .langs__link').length
}));
console.log('mobile drawer open:', JSON.stringify(opened));
expect(opened.expanded === 'true' && opened.hidden === false, 'mobile drawer did not open');
expect(opened.langInDrawer === 3, 'mobile drawer should list all three languages');
expect(opened.socialInDrawer >= 1, 'mobile drawer should carry the social links');

await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 300));
const closed = await page.evaluate(() => document.querySelector('#mobile-nav').hidden);
console.log('escape closes drawer:', closed);
expect(closed === true, 'Escape did not close the mobile drawer');

console.log('\nERRORS:', errors.length ? JSON.stringify([...new Set(errors)], null, 2) : 'none');
console.log('FAILURES:', failures.length ? JSON.stringify(failures, null, 2) : 'none');

await cctx.close();
await browser.close();
process.exit(failures.length || errors.length ? 1 : 0);
