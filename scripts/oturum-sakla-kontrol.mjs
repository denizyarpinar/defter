// 6.6-5b: browser verification against dev or build preview. All GIS/Drive responses are fake.
// DEFTER_TEST_ORIGIN=http://localhost:5173 node scripts/oturum-sakla-kontrol.mjs [screenshot-directory]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const origin = process.env.DEFTER_TEST_ORIGIN ?? 'http://localhost:5173';
const output = process.argv[2];
if (output) mkdirSync(output, { recursive: true });
const KEY = 'defter-oturum';
const scope = 'https://www.googleapis.com/auth/drive.file';
const gis = `window.google = { accounts: { oauth2: {
  initTokenClient: options => ({ requestAccessToken: () => {
    window.recordFakeGis();
    options.callback({ access_token: 'fake-browser-session', expires_in: 3600, scope: '${scope}' });
  } }), hasGrantedAllScopes: (r, s) => r.scope.split(' ').includes(s), revoke: () => {}
} } };`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const [size, viewport] of [['laptop', { width: 1365, height: 900 }], ['ipad-emulation', { width: 820, height: 1180 }]]) {
    for (const scenario of ['user-language', 'drive-language']) {
      console.log(`Checking ${size}/${scenario}`);
      const context = await browser.newContext({ viewport, hasTouch: size !== 'laptop' });
      context.setDefaultTimeout(25000);
      let popupCount = 0;
      let library = { surum: 1, raflar: [{ id: 'shelf', ad: 'Shelf', kitaplar: [] }], oda: {}, ayarlar: { dil: scenario === 'drive-language' ? 'tr' : 'en' } };
      const errors = [];
      await context.exposeBinding('recordFakeGis', () => { popupCount++; });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await context.route('https://accounts.google.com/**', route => route.fulfill({ contentType: 'application/javascript', body: gis }));
      await context.route('https://www.googleapis.com/**', route => {
        const request = route.request(), url = new URL(request.url());
        const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        if (request.method() === 'PATCH' && url.pathname.endsWith('/files/library-json')) {
          library = request.postDataJSON();
          return json({});
        }
        assert.equal(request.method(), 'GET', 'no unexpected Drive writes');
        if (url.pathname.endsWith('/about')) return json({ user: { displayName: 'Session Test', emailAddress: 'session-test@example.invalid' } });
        if (url.pathname.endsWith('/files/library-json')) {
          return json(url.searchParams.get('fields') === 'modifiedTime' ? { modifiedTime: 'fake-version' } : library);
        }
        if (url.pathname.endsWith('/files')) {
          const q = url.searchParams.get('q') ?? '';
          if (q.includes("key='defterKok'")) return json({ files: [{ id: 'library-root', name: 'Defter Library', mimeType: 'application/vnd.google-apps.folder' }] });
          if (q.includes("'library-root' in parents")) return json({ files: [
            { id: 'books', name: 'kitaplar', mimeType: 'application/vnd.google-apps.folder' },
            { id: 'library-json', name: 'kitaplik.json', mimeType: 'application/json' },
          ] });
          return json({ files: [] });
        }
        return route.fulfill({ status: 404, body: '{}' });
      });
      await context.addInitScript(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (this === localStorage && (key === 'defter-oturum' || String(value).includes('fake-browser-session'))) throw new Error('Token attempted in localStorage');
          return original.call(this, key, value);
        };
        window.restoreLoginFrames = 0;
        const restoring = !!sessionStorage.getItem('defter-oturum') && !new URLSearchParams(location.search).has('demo') && new URLSearchParams(location.search).get('tokenSakla') !== '0';
        const sample = () => {
          const login = document.querySelector('#login');
          if (restoring && login && !login.hidden && getComputedStyle(login).display !== 'none') window.restoreLoginFrames++;
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      const base = origin + '/?olcum=1&sahip=0';
      const navigate = url => page.goto(url, { waitUntil: 'domcontentloaded' });
      const ready = () => page.locator('#loading').waitFor({ state: 'hidden', timeout: 60000 });
      const libraryReady = async () => {
        await ready();
        await page.locator('#bosKitaplik:not([hidden])').waitFor();
        assert.equal(await page.locator('#login').isVisible(), false);
      };
      await navigate(base);
      await ready();
      assert.equal(await page.locator('#login').isVisible(), true);
      if (scenario === 'drive-language') {
        await Promise.all([page.waitForEvent('domcontentloaded'), page.locator('#loginGoogle').click()]);
      } else {
        await page.locator('#loginGoogle').click();
        await libraryReady();
        await Promise.all([page.waitForEvent('domcontentloaded'), page.locator('#dilBtn').click()]);
      }
      await libraryReady();
      assert.equal(await page.locator('html').getAttribute('lang'), 'tr');
      assert.equal(popupCount, 1, 'one Google sign-in must cover language reload');
      assert.equal(await page.evaluate(() => window.restoreLoginFrames), 0, 'login card must never paint while restoring');
      assert.doesNotMatch(await page.locator('#toast').textContent(), /Session Test/, 'no welcome toast on restore');
      const log = await page.evaluate(() => JSON.parse(sessionStorage.getItem('defter-auth-gunluk') ?? '[]'));
      const store = log.findIndex(e => e.olay === 'token.store');
      const change = log.findIndex((e, i) => i > store && e.olay === 'dilSec' && e.ayrinti.kaynak === (scenario === 'drive-language' ? 'drive' : 'kullanici'));
      const open = log.findIndex((e, i) => i > change && e.olay === 'page.open');
      const restore = log.findIndex((e, i) => i > open && e.olay === 'token.restore' && e.ayrinti.sonuc === 'gecerli');
      const load = log.findIndex((e, i) => i > restore && e.olay === 'loadFromDrive');
      assert.ok(store >= 0 && change > store && open > change && restore > open && load > restore, 'store → language → open → restore → load');
      assert.doesNotMatch(JSON.stringify(log), /fake-browser-session|session-test@example.invalid/);
      assert.equal(await page.evaluate(() => Object.values(localStorage).some(v => v.includes('fake-browser-session'))), false);
      if (output) await page.screenshot({ path: join(output, `session-${size}-${scenario}.png`) });

      const tab = await context.newPage();
      await tab.goto(base, { waitUntil: 'domcontentloaded' });
      await tab.locator('#loading').waitFor({ state: 'hidden', timeout: 60000 });
      assert.equal(await tab.locator('#login').isVisible(), true, 'independent new tab must require sign-in');
      assert.equal(await tab.evaluate(key => sessionStorage.getItem(key), KEY), null);
      await tab.close();

      await navigate(base + '&demo');
      await ready();
      assert.equal(await page.locator('#login').isVisible(), false);
      assert.equal(popupCount, 1, 'demo must not sign in');
      await navigate(base + '&tokenSakla=0');
      await ready();
      assert.equal(await page.locator('#login').isVisible(), true, 'rollback query restores old login behavior');
      assert.equal(popupCount, 1);
      await navigate(base);
      await libraryReady();
      await page.locator('#signOutBtn').click();
      await page.locator('#login:not([hidden])').waitFor();
      assert.equal(await page.evaluate(key => sessionStorage.getItem(key), KEY), null);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ready();
      assert.equal(await page.locator('#login').isVisible(), true);
      assert.equal(popupCount, 1);
      assert.deepEqual(errors, []);
      results.push({ size, scenario, oneSignIn: true, noLoginFlash: true, logoutReload: true, independentTab: true, rollback: true, demo: true });
      await context.close();
    }
  }
  console.log(JSON.stringify({ results, realGoogleAccess: false, physicalIPad: false }, null, 2));
} finally { await browser.close(); }
