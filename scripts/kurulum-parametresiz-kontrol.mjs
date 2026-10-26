// 6.K8b: real main.ts wiring at a parameter-free URL, with isolated fake GIS/Drive.
// Never contacts a real Google account or writes to Drive. Run with the local dev server on 5173.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const ORIGIN = 'http://localhost:5173';
const OUT = process.argv[2];
if (OUT) mkdirSync(OUT, { recursive: true });
const FOLDER = 'application/vnd.google-apps.folder';
const scope = 'https://www.googleapis.com/auth/drive.file';
const gis = `window.google = { accounts: { oauth2: {
  initTokenClient: options => ({ requestAccessToken: request => {
    window.__requestedScopes.push(request.scope);
    options.callback({ access_token: 'fake-local-test', expires_in: 3600, scope: '${scope}' });
  } }),
  hasGrantedAllScopes: (response, requested) => response.scope.split(' ').includes(requested)
} } };`;
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
try {
  for (const [size, viewport] of [['laptop', { width: 1365, height: 900 }], ['ipad-emulation', { width: 820, height: 1180 }]]) {
    for (const root of ['missing', 'half', 'ready']) {
      console.log(`Checking ${size}/${root}`);
      const context = await browser.newContext({ viewport, hasTouch: size !== 'laptop' });
      context.setDefaultTimeout(30000);
      const writes = [];
      const errors = [];
      await context.route('https://accounts.google.com/**', route => route.fulfill({ contentType: 'application/javascript', body: gis }));
      // All Google API traffic is handled locally. Unexpected paths fail closed.
      await context.route('https://www.googleapis.com/**', async route => {
        const req = route.request();
        const url = new URL(req.url());
        const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        if (req.method() !== 'GET') {
          writes.push(req.method());
          await new Promise(resolve => setTimeout(resolve, 250));
          return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
        }
        if (url.pathname.endsWith('/about')) return json({ user: { displayName: 'Yerel deneme' } });
        if (url.pathname.endsWith('/generateIds')) return json({ ids: Array.from({ length: Number(url.searchParams.get('count') || 1) }, (_, n) => `fake-${n}`) });
        if (url.pathname.endsWith('/files/library-json')) return json({ surum: 1, raflar: [{ id: 'raf-1', ad: 'Raf 1', kitaplar: [] }], oda: {}, ayarlar: { dil: 'tr' } });   // 6.5-2b: the same language as localStorage, nothing to write
        if (url.pathname.endsWith('/files')) {
          const q = url.searchParams.get('q') || '';
          if (q.includes("key='defterKok'")) return json({ files: root === 'missing' ? [] : [{ id: 'library-root', name: 'Defter Library', mimeType: FOLDER }] });
          if (q.includes("'library-root' in parents")) return json({ files: root === 'half' ? [] : [
            { id: 'books', name: 'kitaplar', mimeType: FOLDER },
            { id: 'library-json', name: 'kitaplik.json', mimeType: 'application/json' },
          ] });
          return json({ files: [] });
        }
        return route.fulfill({ status: 404, body: '{}' });
      });
      // Also assert the actual main.ts chooses narrow permission, without scope/owner test switches.
      await context.addInitScript(() => {
        window.__requestedScopes = [];
        // 6.5-2a: Turkish without ?lang (the URL must stay parameter-free; the texts below are Turkish)
        try { localStorage.setItem('defter-dil', 'tr'); } catch { /* the page then opens in English */ }
      });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(ORIGIN + '/');
      assert.equal(new URL(page.url()).search, '');
      await page.locator('#loading').waitFor({ state: 'hidden', timeout: 60000 });
      assert.deepEqual(writes, [], 'page load must not mutate Drive');
      await page.locator('#loginSample').click();
      await page.waitForFunction(() => document.querySelector('#login').hidden);
      assert.equal(await page.locator('#kurulum').isVisible(), false);
      assert.equal(await page.locator('#bosKitaplik').isVisible(), false);
      assert.deepEqual(writes, [], 'demo must not mutate Drive');
      await page.goto(ORIGIN + '/');
      await page.locator('#loading').waitFor({ state: 'hidden', timeout: 60000 });
      await page.locator('#loginGoogle').click();
      console.log(`Signed in: ${size}/${root}`);
      if (root === 'ready') {
        await page.locator('#bosKitaplik:not([hidden])').waitFor();
        assert.deepEqual(writes, [], 'loading an existing library must not write');
        await page.locator('#bosKitaplik').click();
        await page.getByLabel('Kitap adı', { exact: true }).fill('Parametresiz deneme');
        await page.getByLabel('Üniteler ve konular', { exact: true }).fill('# Ünite\nKonu');
        const create = page.getByRole('button', { name: 'Oluştur', exact: true });
        assert.equal(await create.isEnabled(), true);
        assert.deepEqual(writes, [], 'opening/filling the wizard must not write');
        if (OUT) await page.screenshot({ path: join(OUT, `${size}-${root}.png`) });
        await create.click();
      } else {
        await page.locator('#kurulum:not([hidden])').waitFor();
        const setup = page.getByRole('button', { name: root === 'missing' ? 'Kitaplığı kur' : 'Kurulumu tamamla', exact: true });
        assert.equal(await setup.isEnabled(), true);
        assert.deepEqual(writes, [], 'the setup card must not start setup itself');
        await page.locator('#kuOrnek').uncheck();
        if (OUT) await page.screenshot({ path: join(OUT, `${size}-${root}.png`) });
        // Two synchronous clicks exercise the actual busy guard, with the first write still pending.
        await setup.evaluate(button => { button.click(); button.click(); });
      }
      for (let i = 0; i < 100 && !writes.length; i++) await new Promise(resolve => setTimeout(resolve, 100));
      if (!writes.length) console.log(await page.locator('.ks-neden, #kuError').allTextContents());
      await new Promise(resolve => setTimeout(resolve, 400)); // first response completes; no late duplicate write
      assert.equal(writes.length, 1, 'only the explicit action starts one write; duplicate clicks do not');
      assert.deepEqual(await page.evaluate(() => window.__requestedScopes), [scope]);
      assert.deepEqual(errors, []);
      results.push({ size, root, parameterFree: true, writesBeforeClick: 0, writesAfterClick: writes.length });
      console.log(`Passed: ${size}/${root}`);
      await context.close();
    }
  }
  console.log(JSON.stringify({ cases: results, realGoogleAccess: false, physicalIPad: false }, null, 2));
} finally { await browser.close(); }
