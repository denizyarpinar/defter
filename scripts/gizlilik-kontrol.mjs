// 6.K7a: inspect the built static pages without JavaScript/sign-in, plus the app links.
// No Google account or Drive access is used. node scripts/gizlilik-kontrol.mjs [output folder]
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://localhost:4191';
const OUT = process.argv[2] ?? join(process.env.USERPROFILE, 'iCloudDrive', 'uni_plan_claude_code', 'Claude outputs', 'gizlilik-6.K7a');
const sizes = [
  ['telefon-390', { width: 390, height: 844 }],
  ['ipad-dikey', { width: 820, height: 1180 }],
  ['ipad-yatay', { width: 1180, height: 820 }]
];
const report = [];
let server;
let browser;

async function startPreview() {
  server = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', '4191', '--strictPort'],
    { cwd: ROOT, stdio: 'ignore', windowsHide: true });
  let exited = false;
  server.on('exit', () => { exited = true; });
  for (let i = 0; i < 100; i++) {
    if (exited) throw new Error('Kontrol sunucusu başlatılamadı; 4191 portunu kontrol et.');
    try { if ((await fetch(`${ORIGIN}/privacy.html`)).ok) return; } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Kontrol sunucusu zaman aşımı.');
}

async function layout(page) {
  return page.evaluate(() => {
    const clipped = [...document.querySelectorAll('main *, .site-header *')].filter(e => {
      const r = e.getBoundingClientRect();
      return r.width && (r.left < -1 || r.right > innerWidth + 1);
    }).map(e => e.tagName + ': ' + e.textContent.trim().slice(0, 45));
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, clipped };
  });
}

try {
  mkdirSync(OUT, { recursive: true });
  await startPreview();
  browser = await chromium.launch({ channel: 'chrome' });
  for (const [name, viewport] of sizes) {
    const context = await browser.newContext({ viewport, javaScriptEnabled: false, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const requests = [];
    page.on('request', r => requests.push(r.url()));
    for (const file of ['privacy', 'terms']) {
      requests.length = 0;
      const response = await page.goto(`${ORIGIN}/${file}.html`);
      assert.equal(response.status(), 200);
      assert.match(response.headers()['content-type'], /text\/html/);
      assert.equal(await page.locator('script').count(), 0);
      assert.equal(await page.locator('time[datetime="2026-10-21"]').count(), 2);
      assert.equal(await page.locator('section[lang="en"], section[lang="tr"]').count(), 2);
      const measure = await layout(page);
      assert.ok(measure.scrollWidth <= viewport.width, JSON.stringify(measure));
      assert.deepEqual(measure.clipped, []);
      assert.ok(requests.every(url => url.startsWith(ORIGIN + '/')), 'Static page requested an external resource');

      // Only same-origin content links, not email/provider links, are followed.
      for (const href of await page.locator('a[href^="/"]').evaluateAll(links => [...new Set(links.map(a => a.getAttribute('href')))])) {
        const result = await context.request.get(ORIGIN + href.split('#')[0]);
        assert.equal(result.status(), 200, href);
      }
      await page.screenshot({ path: join(OUT, `${name}-${file}-en.png`) });
      await page.locator('.language-nav a[href="#tr"]').click();
      assert.ok(page.url().endsWith('#tr'));
      const anchor = await page.locator('#tr').boundingBox();
      const header = await page.locator('.site-header').boundingBox();
      assert.ok(anchor.y >= header.y + header.height - 1, 'Language heading is hidden under the header');
      await page.screenshot({ path: join(OUT, `${name}-${file}-tr.png`) });
      await page.locator('.language-nav a[href="#en"]').click();
      assert.ok(page.url().endsWith('#en'));
      report.push({ size: name, page: file, noJavaScript: true, status: 200, languages: 'EN/TR', ...measure });
    }
    if (name === 'telefon-390') {
      await page.goto(`${ORIGIN}/privacy.html#tr`);
      await page.getByRole('heading', { name: '5. Bağlantıyı kesme ve verileri kaldırma', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(OUT, `${name}-privacy-veri-kaldirma.png`) });
    }
    await context.close();

    // Clean browser, no remembered account; block Google services and all Drive access.
    const appContext = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    await appContext.route('https://accounts.google.com/**', route => route.abort());
    await appContext.route('https://www.googleapis.com/**', route => route.abort());
    const app = await appContext.newPage();
    const errors = [];
    app.on('pageerror', e => errors.push(e.message));
    await app.goto(ORIGIN + '/?kapsam=dar&sahip=0&kurulum=1&olcum=1&lang=tr');
    await app.locator('#login:not([hidden])').waitFor();
    const loginLinks = app.locator('#login .legal-links a');
    assert.equal(await loginLinks.count(), 2);
    for (const link of await loginLinks.all()) {
      const box = await link.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= viewport.width && box.height >= 44);
      const popupPromise = app.waitForEvent('popup');
      await link.click();
      const popup = await popupPromise;
      await popup.waitForLoadState('domcontentloaded');
      assert.ok(/\/(privacy|terms)\.html#tr$/.test(popup.url()));   // task 6.5-1: the part in the app's language
      assert.equal(await popup.locator('section[lang]').count(), 2);
      assert.equal(await popup.evaluate(() => window.opener === null), true);
      await popup.close();
    }
    await app.screenshot({ path: join(OUT, `${name}-giris.png`) });
    await app.locator('#loginSample').click();
    await app.locator('#custBtn').click();
    const panelLinks = app.locator('#panel .legal-links');
    await panelLinks.scrollIntoViewIfNeeded();
    for (const link of await panelLinks.locator('a').all()) {
      const box = await link.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= viewport.width && box.height >= 44);
    }
    assert.equal(await app.locator('#panel .legal-links a').count(), 2);
    await app.screenshot({ path: join(OUT, `${name}-panel.png`) });
    assert.deepEqual(errors, []);
    report.push({ size: name, page: 'app', loginLinks: 2, panelLinks: 2, popupOpener: null, errors });
    await appContext.close();
  }
  // Keyboard navigation works without JavaScript on the public pages.
  const keyboardContext = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const keyboardPage = await keyboardContext.newPage();
  await keyboardPage.goto(ORIGIN + '/privacy.html');
  await keyboardPage.keyboard.press('Tab'); // brand
  await keyboardPage.keyboard.press('Tab'); // English
  await keyboardPage.keyboard.press('Tab'); // Türkçe
  await keyboardPage.keyboard.press('Enter');
  assert.ok(keyboardPage.url().endsWith('#tr'));
  await keyboardContext.close();
  writeFileSync(join(OUT, 'rapor.json'), JSON.stringify({ checkedAt: new Date().toISOString(), cases: report, keyboard: 'passed', device: 'Chromium viewport emulation; not physical iPad Safari' }, null, 2));
  console.log(JSON.stringify({ cases: report.length, keyboard: 'passed', screenshots: OUT, results: report }, null, 2));
} finally {
  await browser?.close();
  server?.kill();
}
