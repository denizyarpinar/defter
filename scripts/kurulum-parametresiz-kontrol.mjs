// 6.K8b: real main.ts wiring at a parameter-free URL, with isolated fake GIS/Drive.
// Never contacts a real Google account or writes to Drive. Run with the local dev server on 5173.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const ORIGIN = process.env.A1_TEST_ORIGIN || 'http://localhost:5173';
const A1 = process.argv.includes('--a1');
const OUT = process.argv.slice(2).find(arg => arg !== '--a1');
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
  if (A1) await checkA1();
  else {
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
        if (await page.locator('#kitapSihirbazi .ks-details').count()) await page.locator('#kitapSihirbazi .ks-details').click();
        await page.getByLabel('Üniteler ve konular', { exact: true }).fill('# Ünite\nKonu');
        const create = page.locator('#kitapSihirbazi .fp-ekle');
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
  }
} finally { await browser.close(); }

// A1: exercise the actual application, with an in-memory Drive and no real account.
// Run exactly the same assertions before and after the UI change; collect all failures.
async function checkA1() {
  assert.ok(OUT, 'A1 output directory required');
  const failures = [], cases = [];
  const copy = {
    tr: {
      intro: 'PDF oku, kalemle not al ve belgelerinde ara. Dosyaların kendi Google Drive’ında kalır.',
      demo: 'Drive’ına dosya eklenmez.', sample: 'Drive’ıma örnek kitap ekle',
      setup: 'Kitapların için Drive’ında “Defter Library” klasörü oluşturulur. Diğer dosyalarına dokunulmaz.',
      half: '“Defter Library” kurulumunu tamamla. Yalnız eksik parçalar eklenir; diğer dosyalarına dokunulmaz.',
      empty: 'İlk kitabını oluştur · ＋ Yeni kitap',
      success: 'Kitaplığın hazır. Başlamak için kitaplığa dokun veya ＋ Yeni kitap’ı seç.',
    },
    en: {
      intro: 'Read PDFs, add pen annotations and search your documents. Your files stay in your own Google Drive.',
      demo: 'No files are added to your Drive.', sample: 'Add a sample book to my Drive',
      setup: 'A “Defter Library” folder will be created in your Drive for your books. Your other files are left untouched.',
      half: 'Finish setting up “Defter Library”. Only missing parts are added; your other files are left untouched.',
      empty: 'Create your first book · ＋ New book',
      success: 'Your library is ready. Tap the bookcase to begin, or choose ＋ New book.',
    },
  };
  const verify = (name, actual, expected = true) => {
    try { assert.deepEqual(actual, expected); }
    catch { failures.push({ name, actual, expected }); }
  };
  const sizes = [[390, 844], [820, 1180], [1180, 820], [1280, 800]];
  for (const lang of ['tr', 'en']) for (const [width, height] of sizes) {
    const label = `${lang}-${width}x${height}`;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1200 });
    context.setDefaultTimeout(15000);
    const files = new Map(), writes = [], errors = [], consoleErrors = [], unexpected = [];
    let nextId = 0;
    const add = (id, name, parent, mimeType = FOLDER, content) => files.set(id, {
      id, name, parents: [parent], mimeType, content, modifiedTime: '2026-11-04T10:00:00Z',
      appProperties: { defter: '1', ...(id === 'library-root' ? { defterKok: '1' } : {}) },
    });
    const reset = state => {
      files.clear();
      if (state === 'missing') return;
      add('library-root', 'Defter Library', 'root');
      if (state === 'half') return;
      add('books', 'kitaplar', 'library-root');
      add('library-json', 'kitaplik.json', 'library-root', 'application/json', {
        raflar: [{ id: 'raf-1', kitaplar: state === 'book' ? ['a1-book'] : [] }, {}, {}, {}, {}],
        ayarlar: { dil: lang },
      });
      if (state === 'book') {
        add('book-folder', 'a1-book', 'books');
        add('book-json', 'kitap.json', 'book-folder', 'application/json', {
          surum: 2, baslik: 'A1 Book', uniteler: [{ baslik: 'Unit', konular: [{ baslik: 'Topic', klasor: 'Unit/Topic', durum: 'okunmadi' }] }],
        });
        add('unit', 'Unit', 'book-folder'); add('topic', 'Topic', 'unit');
        add('pdf', 'orijinal.pdf', 'topic', 'application/pdf');
      }
    };
    await context.addInitScript(lang => { localStorage.setItem('defter-dil', lang); window.__requestedScopes = []; }, lang);
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      if (url.origin === ORIGIN) {
        if (url.pathname.startsWith('/models/')) return route.fulfill({ contentType: 'application/octet-stream', body: '' });
        if (url.pathname.startsWith('/api/')) return json({ erisim: false });
        return route.continue();
      }
      if (url.hostname === 'accounts.google.com') return route.fulfill({ contentType: 'application/javascript', body: gis });
      if (url.hostname !== 'www.googleapis.com') return route.fulfill({ body: '' });
      if (req.method() === 'GET') {
        if (url.pathname.endsWith('/about')) return json({ user: { displayName: 'A1 User', emailAddress: 'a1@example.invalid' } });
        if (url.pathname.endsWith('/generateIds')) return json({ ids: Array.from({ length: Number(url.searchParams.get('count') || 1) }, () => `a1-${++nextId}`) });
        if (url.pathname.endsWith('/files')) {
          const q = url.searchParams.get('q') || '';
          const parent = /'([^']+)' in parents/.exec(q)?.[1];
          const name = /name = '([^']+)'/.exec(q)?.[1];
          const props = [...q.matchAll(/key='([^']+)' and value='([^']+)'/g)];
          return json({ files: [...files.values()].filter(f => (!parent || f.parents.includes(parent)) && (!name || f.name === name)
            && (!q.includes(`mimeType = '${FOLDER}'`) || f.mimeType === FOLDER)
            && props.every(([, key, value]) => f.appProperties?.[key] === value)).map(({ content, ...meta }) => meta) });
        }
        const id = url.pathname.split('/').at(-1), file = files.get(id);
        if (file) {
          if (url.searchParams.get('alt') === 'media') {
            if (file.mimeType === 'application/pdf') return route.fulfill({ contentType: 'application/pdf', body: readFileSync('public/demo/demo-dikey.pdf') });
            return json(file.content);
          }
          return json(file);
        }
      } else {
        writes.push({ method: req.method(), path: url.pathname });
        if (req.method() === 'POST') {
          const raw = req.postDataBuffer().toString('utf8');
          const jsonParts = [...raw.matchAll(/Content-Type: application\/json[^\r]*\r\n\r\n([\s\S]*?)(?=\r\n--)/gi)].map(m => JSON.parse(m[1]));
          const meta = jsonParts[0] || JSON.parse(raw);
          files.set(meta.id, { ...meta, content: jsonParts[1], modifiedTime: '2026-11-04T10:00:00Z' });
          return json({ id: meta.id });
        }
      }
      unexpected.push(`${req.method()} ${url.pathname}`);
      return route.fulfill({ status: 404, body: '{}' });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    const tap = locator => width < 1200 ? locator.tap() : locator.click();
    const start = async state => {
      reset(state);
      if (page.url().startsWith(ORIGIN)) await page.evaluate(() => { sessionStorage.clear(); });
      await page.goto(ORIGIN + '/');
      await page.locator('#loading').waitFor({ state: 'hidden', timeout: 30000 });
      await page.locator('#login').waitFor({ state: 'visible' });
    };
    const screen = async name => {
      const bounds = await page.evaluate(() => {
        const visible = e => e.getClientRects().length > 0;
        const cards = [...document.querySelectorAll('#login .card, #kurulum .card, #bosKitaplik')].filter(visible);
        return { horizontal: document.documentElement.scrollWidth > innerWidth,
          clipped: cards.some(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1 || e.scrollWidth > e.clientWidth + 1; }) };
      });
      verify(`${label}/${name}/bounds`, bounds, { horizontal: false, clipped: false });
      await page.screenshot({ path: join(OUT, `${label}-${name}.png`) });
    };
    try {
      await start('missing');
      verify(`${label}/selected-language-only`, await page.locator('.login-intro').innerText(), copy[lang].intro);
      verify(`${label}/login-demo-note`, await page.locator('#login').innerText().then(t => t.includes(copy[lang].demo)));
      verify(`${label}/login-demo-accessible-description`, await page.locator('#loginSample').evaluate(link =>
        (link.ariaDescribedByElements ?? []).map(element => element.textContent).join(' ')), copy[lang].demo);
      if (process.argv.includes('--login-a11y-only')) { cases.push(`${label}/login-demo-accessibility`); continue; }
      verify(`${label}/privacy-links`, await page.locator('#login a[data-yasal]').count(), 2);
      verify(`${label}/signed-out-no-guidance`, await page.locator('#bosKitaplik').isVisible(), false);
      await screen('login');
      await tap(page.locator('#loginSample'));
      await page.waitForFunction(() => document.querySelector('#app').dataset.kilit === undefined && document.querySelector('#userBox').hidden === false);
      verify(`${label}/demo-no-guidance`, await page.locator('#bosKitaplik').isVisible(), false);
      verify(`${label}/demo-no-announcement`, await page.locator('#defterDuyuru').count(), 0);
      verify(`${label}/demo-no-writes`, writes.length, 0);
      await start('missing');
      await tap(page.locator('#loginGoogle'));
      await page.locator('#kurulum').waitFor({ state: 'visible' });
      verify(`${label}/setup-text`, await page.locator('#kuText').innerText(), copy[lang].setup);
      verify(`${label}/sample-drive-label`, await page.locator('label[for="kuOrnek"]').innerText(), copy[lang].sample);
      verify(`${label}/setup-demo-note`, (await page.locator('#kurulum').innerText()).includes(copy[lang].demo));
      verify(`${label}/sample-default`, await page.locator('#kuOrnek').isChecked());
      verify(`${label}/setup-no-guidance`, await page.locator('#bosKitaplik').isVisible(), false);
      verify(`${label}/setup-no-announcement`, await page.locator('#defterDuyuru').count(), 0);
      verify(`${label}/no-automatic-setup`, writes.length, 0);
      await screen('setup');
      // Actual setup, including the optional sample, runs only after the tap.
      await tap(page.locator('#kuKur'));
      await page.locator('#kurulum').waitFor({ state: 'hidden' });
      await page.locator('#defterDuyuru[open]').waitFor();
      verify(`${label}/setup-success-next-step`, await page.locator('#toast').innerText(), copy[lang].success);
      verify(`${label}/sample-created`, [...files.values()].some(f => f.name === 'kitap.json' && f.appProperties?.defterOrnek === '1'));
      await tap(page.locator('.duyuru-back'));
      verify(`${label}/sample-no-empty-guidance`, await page.locator('#bosKitaplik').isVisible(), false);
      cases.push(`${label}/sample-setup`);
      writes.length = 0;
      await start('half');
      await tap(page.locator('#loginGoogle')); await page.locator('#kurulum').waitFor({ state: 'visible' });
      verify(`${label}/half-text`, await page.locator('#kuText').innerText(), copy[lang].half);
      verify(`${label}/half-no-automatic-write`, writes.length, 0);
      await screen('half');
      await page.locator('#kuOrnek').uncheck(); await tap(page.locator('#kuKur'));
      await page.locator('#defterDuyuru[open]').waitFor(); await tap(page.locator('.duyuru-back'));
      await page.locator('#toast.show').waitFor({ state: 'hidden' });
      verify(`${label}/empty-guidance-after-toast`, await page.locator('#bosKitaplik').innerText(), copy[lang].empty);
      verify(`${label}/empty-guidance-visible`, await page.locator('#bosKitaplik').isVisible());
      verify(`${label}/single-root-after-repair`, [...files.values()].filter(f => f.appProperties?.defterKok === '1').length, 1);
      await screen('empty');
      await page.reload(); await page.locator('#bosKitaplik:not([hidden])').waitFor();
      verify(`${label}/empty-guidance-after-reload`, await page.locator('#bosKitaplik').innerText(), copy[lang].empty);
      await tap(page.locator('#bosKitaplik')); await page.locator('#kitapSihirbazi').waitFor();
      await page.getByRole('button', { name: lang === 'tr' ? 'Vazgeç' : 'Cancel', exact: true }).click();
      cases.push(`${label}/half-repair-empty-persistence`);
      writes.length = 0;
      await start('book'); await tap(page.locator('#loginGoogle'));
      await page.locator('#defterDuyuru[open]').waitFor(); await tap(page.locator('.duyuru-back'));
      verify(`${label}/existing-no-setup`, await page.locator('#kurulum').isVisible(), false);
      verify(`${label}/existing-no-guidance`, await page.locator('#bosKitaplik').isVisible(), false);
      verify(`${label}/existing-no-writes`, writes.length, 0);
      await screen('existing');
      await page.reload(); await page.locator('#userBox').waitFor({ state: 'visible' });
      await page.locator('#loading').waitFor({ state: 'hidden' });
      await page.locator('#libLoading').waitFor({ state: 'hidden' });
      verify(`${label}/restored-no-login`, await page.locator('#login').isVisible(), false);
      verify(`${label}/restored-no-setup`, await page.locator('#kurulum').isVisible(), false);
      verify(`${label}/restored-no-guidance`, await page.locator('#bosKitaplik').isVisible(), false);
      // Use the real search UI to select the existing book, then its real topic button.
      await tap(page.locator('#araBtn')); await page.locator('.ap-kutu').fill('A1 Book');
      await page.locator('.ap-liste [data-i]').first().waitFor(); await page.locator('.ap-liste [data-i]').first().click();
      await page.locator('#reader').waitFor({ state: 'visible' });
      await page.locator('#spread .slot').first().waitFor();
      await page.waitForFunction(() => !document.querySelector('#spread .leaf, #spread .single-turn'));
      if (!await page.locator('#reader button[data-u="0"][data-t="0"]').first().isVisible()) await page.locator('#next').click();
      await page.locator('#reader button[data-u="0"][data-t="0"]').first().click();
      await page.locator('#okuyucu').waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('#okuyucu canvas'));
      cases.push(`${label}/existing-login-restore-open-pdf`);
      verify(`${label}/scope-unchanged`, await page.evaluate(() => window.__requestedScopes.every(s => s === 'https://www.googleapis.com/auth/drive.file')));
      verify(`${label}/uncaught-errors`, errors, []);
      verify(`${label}/console-errors`, consoleErrors, []);
      verify(`${label}/unexpected-api`, unexpected, []);
    } catch (e) { failures.push({ name: `${label}/scenario`, message: e.message }); }
    finally { await context.close(); console.log(`Checked ${label}`); }
  }
  const report = { cases, failures, realGoogleAccess: false, physicalIPad: false };
  writeFileSync(join(OUT, 'rapor.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) throw Error(`A1: ${failures.length} failed checks`);
}
