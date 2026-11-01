// 6.6-5a: local browser verification. Fake GIS/Drive only; never contacts a real Google account.
// Run against npm run dev: node scripts/auth-gunluk-kontrol.mjs [screenshot-directory]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const origin = process.env.DEFTER_TEST_ORIGIN ?? 'http://localhost:5173';
const output = process.argv[2];
if (output) mkdirSync(output, { recursive: true });
const scope = 'https://www.googleapis.com/auth/drive.file';
const gis = `window.google = { accounts: { oauth2: {
  initTokenClient: options => ({ requestAccessToken: () => {
    if (window.__rejectAuth) options.callback({ error: 'access_denied' });
    else options.callback({ access_token: 'fake-local-test', expires_in: 3600, scope: '${scope}' });
  } }), hasGrantedAllScopes: (r, s) => r.scope.split(' ').includes(s)
} } };`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const [size, viewport] of [
    ['phone', { width: 390, height: 844 }], ['phone-landscape', { width: 844, height: 390 }],
    ['ipad-emulation', { width: 820, height: 1180 }], ['laptop', { width: 1365, height: 900 }],
  ]) {
    console.log(`Checking ${size}`);
    const context = await browser.newContext({ viewport, hasTouch: size !== 'laptop', permissions: ['clipboard-read', 'clipboard-write'] });
    context.setDefaultTimeout(20000);
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.route('https://accounts.google.com/**', route => route.fulfill({ contentType: 'application/javascript', body: gis }));
    const requests = [];
    await context.route('https://www.googleapis.com/**', route => {
      const request = route.request();
      const url = new URL(request.url());
      requests.push(request.method() + ' ' + url.pathname + url.search);
      assert.equal(request.method(), 'GET', 'diagnosis must never write Drive');
      const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname.endsWith('/about')) return json({ user: { displayName: 'Private Test Name', emailAddress: 'fake-user@example.invalid' } });
      // No root: enough to finish the real sign-in flow without a Drive language write.
      if (url.pathname.endsWith('/files')) return json({ files: [] });
      return route.fulfill({ status: 401, body: '{}' });
    });
    const page = await context.newPage();
    const press = locator => size === 'laptop' ? locator.click() : locator.tap();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const read = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('defter-auth-gunluk') ?? '[]'));
    const waitReady = async () => {
      await page.locator('#loading').waitFor({ state: 'hidden', timeout: 60000 });
      await page.waitForFunction(() => typeof window.defterDilSec === 'function');
    };
    await page.goto(origin + '/?olcum=1&demo', { waitUntil: 'domcontentloaded' });
    await waitReady();
    await page.locator('#olcumAuth').waitFor();
    const navigation = page.waitForEvent('domcontentloaded');
    await page.locator('#dilBtn').click();
    await navigation;
    await waitReady();
    const events = await read();
    const change = events.findIndex(e => e.olay === 'dilDegistir');
    const reload = events.findIndex(e => e.olay === 'dilSec' && e.ayrinti.kaynak === 'kullanici');
    const opened = events.findIndex(e => e.olay === 'page.open' && e.sayfa === 2 && e.ayrinti.dil === 'tr');
    assert.ok(change >= 0 && reload > change && opened > reload, 'language events survive reload in order');

    await page.goto(origin + '/?olcum=1', { waitUntil: 'domcontentloaded' });
    await waitReady();
    await page.locator('#login:not([hidden]) #olcumAuth').waitFor();
    assert.equal(await page.locator('#olcum').isVisible(), false, 'other measurement boxes must not obscure the login log');
    const overlap = await page.evaluate(() => {
      const log = document.querySelector('#olcumAuth').getBoundingClientRect();
      return ['#loginGoogle', '#loginSample', '#loginOther', '#login [data-dil="en"]', '#login [data-dil="tr"]']
        .map(s => document.querySelector(s)).filter(e => e && !e.hidden).some(e => {
          const r = e.getBoundingClientRect();
          return r.left < log.right && r.right > log.left && r.top < log.bottom && r.bottom > log.top;
        });
    });
    assert.equal(overlap, false, 'log must not overlap login controls');
    await press(page.locator('#olcumAuth button').filter({ hasText: /^Kopyala$/ }));
    await page.waitForFunction(() => document.querySelector('#olcumAuth [role="status"]').textContent === 'Kopyalandı');
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /page.open/);
    if (output) await page.screenshot({ path: join(output, `auth-login-${size}.png`) });

    // Compare the real main.ts sign-in requests with measurement enabled and disabled.
    requests.length = 0;
    await press(page.locator('#loginGoogle'));
    await page.locator('#kurulum:not([hidden])').waitFor();
    const measuredRequests = [...requests];
    const signInEvents = await read();
    assert.ok(signInEvents.some(e => e.olay === 'signIn.start' && e.ayrinti.neden === 'kullanici'));
    assert.ok(signInEvents.some(e => e.olay === 'gis.success' && e.ayrinti.expires_in === 3600));
    assert.doesNotMatch(JSON.stringify(signInEvents), /fake-local-test|fake-user|Private Test Name|example.invalid/);

    // A failed background renewal calls the actual expiry handler; the log moves into the card.
    await page.evaluate(async () => {
      // Use the loaded Vite module URLs (including any HMR timestamp), so we exercise main.ts's instances.
      const loaded = path => performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path)?.name ?? path;
      const auth = await import(loaded('/src/drive/auth.ts'));
      const drive = await import(loaded('/src/drive/drive.ts'));
      window.__rejectAuth = true;
      auth.dropToken();
      try { await drive.driveFetch('files/private-test-id?alt=media'); } catch { /* expected SessionExpired */ }
    });
    await page.locator('#login:not([hidden]) #olcumAuth').waitFor();
    assert.ok((await read()).some(e => e.olay === 'onExpired' && e.ayrinti.kaynak === 'freshToken'));
    assert.ok((await read()).some(e => e.olay === 'state' && e.ayrinti.oturumDoldu));
    assert.doesNotMatch(JSON.stringify(await read()), /private-test-id/);
    await press(page.locator('#olcumAuth button').filter({ hasText: /^Temizle$/ }));
    assert.deepEqual(await read(), []);

    await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
    await waitReady();
    assert.equal(await page.locator('#olcumAuth').count(), 0);
    requests.length = 0;
    await press(page.locator('#loginGoogle'));
    await page.locator('#kurulum:not([hidden])').waitFor();
    assert.deepEqual(requests, measuredRequests, 'measurement must not change Drive requests');
    assert.deepEqual(await read(), [], 'disabled measurement must not persist auth events');
    assert.deepEqual(errors, []);
    results.push({ size, reload: true, loginTouchable: true, noOverlap: true, expiry: true, sameRequests: true });
    await context.close();
  }
  console.log(JSON.stringify({ results, realGoogleAccess: false, physicalIPad: false }, null, 2));
} finally { await browser.close(); }
