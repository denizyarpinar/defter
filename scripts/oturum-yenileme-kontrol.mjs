// 6.6-6: compiled app verification. Google and Drive are isolated fakes, never real accounts.
// Run against npm run preview -- --port 5173, optionally pass screenshot output directory.
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const origin = process.env.DEFTER_TEST_ORIGIN ?? 'http://localhost:5173';
const output = process.argv[2];
if (output) mkdirSync(output, { recursive: true });
const driveChunk = readdirSync('dist/assets').find(name => /^drive-[\w-]+\.js$/.test(name));
assert.ok(driveChunk);
// Resolve the export containing fetch from the actual build, without adding product test hooks.
const source = readFileSync(join('dist/assets', driveChunk), 'utf8');
const fetchFunction = /async function (\w+)\([^)]*\)\{return \w+\([^;]*=>fetch\(/.exec(source)?.[1];
assert.ok(fetchFunction, 'compiled driveFetch function');
const fetchExport = new RegExp(`(?:\\{|,)${fetchFunction} as (\\w+)`).exec(source.slice(source.lastIndexOf('export{')))?.[1];
assert.ok(fetchExport, 'compiled driveFetch export');
const scope = 'https://www.googleapis.com/auth/drive.file';
const gis = `window.google = { accounts: { oauth2: {
  initTokenClient: options => ({ requestAccessToken: () => {
    window.fakeGisCalls.push({ active: navigator.userActivation.isActive });
    if (window.fakeMode === 'blocked') options.error_callback({ type: 'popup_failed_to_open' });
    else if (window.fakeMode === 'closed') options.error_callback({ type: 'popup_closed' });
    else options.callback({ access_token: 'fake-browser-' + window.fakeGisCalls.length, expires_in: 3600, scope: '${scope}' });
  } }), hasGrantedAllScopes: () => false, revoke: () => {}
} } };`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const [size, viewport] of [['phone', { width: 390, height: 844 }], ['laptop', { width: 1180, height: 820 }]]) {
    for (const lang of ['en', 'tr']) {
      const context = await browser.newContext({ viewport, hasTouch: size === 'phone' });
      const errors = []; let writes = 0;
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await context.route('https://accounts.google.com/**', route => route.fulfill({ contentType: 'application/javascript', body: gis }));
      await context.route('https://www.googleapis.com/**', route => {
        const req = route.request(), url = new URL(req.url());
        const json = value => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
        if (req.method() === 'PATCH' && /\/files\/test-[123]$/.test(url.pathname)) { writes++; return json({}); }
        assert.equal(req.method(), 'GET', 'no unexpected fake Drive writes');
        if (url.pathname.endsWith('/about')) return json({ user: { displayName: 'Session Test', emailAddress: 'session@example.invalid' } });
        if (url.pathname.endsWith('/files/library-json')) return json({ surum: 1, raflar: [{ id: 'shelf', ad: 'Shelf', kitaplar: [] }], oda: {}, ayarlar: { dil: lang } });
        if (url.pathname.endsWith('/files')) {
          const q = url.searchParams.get('q') ?? '';
          if (q.includes("key='defterKok'")) return json({ files: [{ id: 'root', name: 'Defter Library', mimeType: 'application/vnd.google-apps.folder' }] });
          if (q.includes("'root' in parents")) return json({ files: [
            { id: 'books', name: 'kitaplar', mimeType: 'application/vnd.google-apps.folder' },
            { id: 'library-json', name: 'kitaplik.json', mimeType: 'application/json' },
          ] });
          return json({ files: [] });
        }
        return route.fulfill({ status: 404, body: '{}' });
      });
      await context.addInitScript(({ scope }) => {
        window.fakeMode = 'success'; window.fakeGisCalls = [];
        if (!sessionStorage.getItem('test-started')) {
          sessionStorage.setItem('test-started', '1');
          sessionStorage.setItem('defter-oturum', JSON.stringify({ value: 'fake-restored', expiresAt: Date.now() + 120_000, aktif: 'dar', scopes: [scope] }));
        }
        const write = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (this === localStorage && String(value).includes('fake-')) throw new Error('fake token reached localStorage');
          return write.call(this, key, value);
        };
      }, { scope });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.clock.install();
      await page.goto(`${origin}/?tokenSure=120&olcum=1&lang=${lang}&sahip=0`, { waitUntil: 'domcontentloaded' });
      await page.locator('#bosKitaplik:not([hidden])').waitFor({ timeout: 60000 });
      assert.equal(await page.locator('#login').isVisible(), false);
      await page.clock.fastForward(81_000);
      await page.waitForFunction(() => window.fakeGisCalls.length === 1);
      assert.equal(await page.locator('#oturumBandi').isVisible(), false, 'silent success is invisible');
      await page.evaluate(() => { window.fakeMode = 'blocked'; });
      await page.clock.fastForward(81_000);
      await page.locator('#oturumBandi:not([hidden])').waitFor();
      assert.equal(await page.locator('#login').isVisible(), false);
      // Invoke the real compiled Drive wrapper for three simultaneous writes.
      await page.evaluate(async ({ chunk, key }) => {
        const module = await import(chunk);
        window.writeResult = 'pending';
        window.writePromise = Promise.all([1, 2, 3].map(n => module[key](`files/test-${n}`, { method: 'PATCH', body: '{}' })))
          .then(() => { window.writeResult = 'done'; }, () => { window.writeResult = 'error'; });
      }, { chunk: `/assets/${driveChunk}`, key: fetchExport });
      assert.equal(writes, 0);
      assert.equal(await page.evaluate(() => window.writeResult), 'pending');
      assert.equal(await page.evaluate(() => window.fakeGisCalls.length), 2, 'requests join one renewal');
      const geometry = await page.locator('#oturumBandi').evaluate(el => {
        const r = el.getBoundingClientRect(); const b = el.querySelector('button').getBoundingClientRect();
        return { left: r.left, right: r.right, overflow: el.scrollWidth > el.clientWidth, buttonHeight: b.height };
      });
      assert.ok(geometry.left >= 0 && geometry.right <= viewport.width && !geometry.overflow);
      assert.ok(geometry.buttonHeight >= 44);
      if (output) {
        // Screenshots isolate the product banner; diagnostics remain enabled for the assertions.
        const style = await page.addStyleTag({ content: '#olcumAuth, #olcum, #olcumKalem, #olcumSon { visibility: hidden !important }' });
        await page.screenshot({ path: join(output, `bant-${viewport.width}x${viewport.height}-${lang}.png`) });
        await style.evaluate(el => el.remove());
      }
      // Live-region semantics are retained while requests wait.
      assert.equal(await page.locator('#oturumBandi').getAttribute('role'), 'status');
      assert.equal(await page.locator('#oturumBandi').getAttribute('aria-live'), 'polite');
      await page.evaluate(() => { window.fakeMode = 'closed'; });
      await page.locator('#oturumBandi button').click();
      await page.waitForFunction(() => document.querySelector('#oturumBandi button').textContent === (document.documentElement.lang === 'tr' ? 'Tekrar dene' : 'Try again'));
      assert.equal(await page.evaluate(() => window.writeResult), 'pending');
      await page.evaluate(() => { window.fakeMode = 'success'; });
      await page.locator('#oturumBandi button').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.writeResult === 'done');
      assert.equal(writes, 3); assert.equal(await page.locator('#oturumBandi').isVisible(), false);
      assert.equal(await page.evaluate(() => window.fakeGisCalls.at(-1).active), true, 'button opens GIS with real user activation');
      // Block once more and sign out while a request is waiting.
      await page.evaluate(() => { window.fakeMode = 'blocked'; }); await page.clock.fastForward(81_000);
      await page.locator('#oturumBandi:not([hidden])').waitFor();
      await page.evaluate(async ({ chunk, key }) => {
        const module = await import(chunk); window.cancelResult = 'pending';
        module[key]('files/test-1').then(() => { window.cancelResult = 'done'; }, () => { window.cancelResult = 'cancelled'; });
      }, { chunk: `/assets/${driveChunk}`, key: fetchExport });
      // Diagnostics may cover the header on phones; keyboard activation is still available.
      await page.locator('#signOutBtn').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.cancelResult === 'cancelled');
      assert.equal(await page.locator('#oturumBandi').isVisible(), false);
      const log = await page.evaluate(() => sessionStorage.getItem('defter-auth-gunluk'));
      assert.doesNotMatch(log, /fake-restored|fake-browser-|session@example/);
      assert.doesNotMatch(log, /"olay":"onExpired"/);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('#loading').waitFor({ state: 'hidden', timeout: 60000 });
      assert.equal(await page.locator('#login').isVisible(), true);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('defter-oturum')), null);
      assert.deepEqual(errors, []);
      results.push({ size, lang, silent: true, blocked: true, threeWrites: true, retry: true, synchronousClick: true, logout: true, overflow: false });
      console.log(`PASS ${size}/${lang}`);
      await context.close();
    }
  }
  console.log(JSON.stringify({ results, physicalIPad: false, realGoogle: false }, null, 2));
} finally { await browser.close(); }
