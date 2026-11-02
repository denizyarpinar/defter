// 6.6-2: compiled application + isolated fake GIS/Drive. No real Google requests.
// npm run build; npm run preview -- --port 5173; node scripts/coklu-ozet-kontrol.mjs <output>
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { PDFDocument } from 'pdf-lib';

const origin = process.env.DEFTER_TEST_ORIGIN ?? 'http://localhost:5173';
const output = process.argv[2];
if (output) mkdirSync(output, { recursive: true });
const folder = 'application/vnd.google-apps.folder';
const scope = 'https://www.googleapis.com/auth/drive.file';
const pdf = async n => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([300, 400]);
  return Buffer.from(await doc.save());
};
const original = await pdf(2), added = await pdf(3);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1180, height: 820 }]) {
    for (const lang of ['en', 'tr']) {
      const context = await browser.newContext({ viewport, hasTouch: viewport.width === 390 });
      const errors = [], writes = [];
      let nextId = 0;
      const library = { surum: 1, raflar: [{ id: 'shelf', ad: 'Shelf', kitaplar: ['summary-test'] }] };
      let book = { surum: 2, baslik: 'Summary test', sirt: 'TEST', kapak: { renk: '#24476b' }, uniteler: [
        { baslik: 'Unit', klasor: 'Unite-01', konular: [{ baslik: 'Topic test', klasor: 'Unite-01/Konu-01' }] }
      ] };
      const items = new Map();
      const put = (id, name, parent, mimeType, bytes) => items.set(id, {
        id, name, parents: [parent], mimeType, modifiedTime: '2026-11-02T10:00:00Z',
        capabilities: { canAddChildren: true, canEdit: true }, headRevisionId: 'r1', bytes
      });
      put('R', 'Defter Library', 'root', folder);
      put('K', 'kitaplar', 'R', folder);
      put('LJ', 'kitaplik.json', 'R', 'application/json');
      put('B', 'summary-test', 'K', folder);
      put('BJ', 'kitap.json', 'B', 'application/json');
      put('U', 'Unite-01', 'B', folder);
      put('C', 'Konu-01', 'U', folder);
      put('OLD', 'ozet.pdf', 'C', 'application/pdf', original);
      const publicItem = ({ bytes, ...item }) => ({ ...item, ...(bytes ? { size: String(bytes.length) } : {}) });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await context.route('https://accounts.google.com/**', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'window.google={accounts:{oauth2:{initTokenClient:()=>({requestAccessToken(){}}),hasGrantedAllScopes:()=>false,revoke(){}}}};'
      }));
      await context.route('https://www.googleapis.com/**', async route => {
        const req = route.request(), url = new URL(req.url()), path = url.pathname;
        const json = value => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
        if (path.endsWith('/about')) return json({ user: { displayName: 'Summary Test', emailAddress: 'summary@example.invalid' } });
        if (path.endsWith('/generateIds')) return json({ ids: Array.from({ length: Number(url.searchParams.get('count') ?? 1) }, () => 'new-' + ++nextId) });
        if (req.method() === 'POST' && url.searchParams.get('uploadType') === 'multipart') {
          const body = req.postDataBuffer(), split = Buffer.from('\r\n\r\n');
          const start = body.indexOf(split) + split.length, end = body.indexOf(Buffer.from('\r\n--'), start);
          const meta = JSON.parse(body.subarray(start, end).toString());
          const dataStart = body.indexOf(split, end) + split.length;
          const dataEnd = body.lastIndexOf(Buffer.from('\r\n--'));
          const bytes = body.subarray(dataStart, dataEnd);
          put(meta.id, meta.name, meta.parents[0], meta.mimeType, bytes);
          Object.assign(items.get(meta.id), { appProperties: meta.appProperties });
          writes.push({ kind: 'pdf', parent: meta.parents[0], name: meta.name });
          return json(publicItem(items.get(meta.id)));
        }
        if (req.method() === 'POST' && path.endsWith('/files')) {
          const meta = req.postDataJSON();
          assert.equal(meta.name, 'Ozetler'); assert.deepEqual(meta.parents, ['C']);
          put(meta.id, meta.name, 'C', folder);
          Object.assign(items.get(meta.id), { appProperties: meta.appProperties });
          writes.push({ kind: 'folder', name: meta.name });
          return json(publicItem(items.get(meta.id)));
        }
        const id = path.match(/\/files\/([^/]+)$/)?.[1];
        if (req.method() === 'PATCH' && id === 'BJ') {
          book = req.postDataJSON(); return json({});
        }
        if (req.method() === 'PATCH' && id === 'LJ') {
          const updated = req.postDataJSON();
          assert.deepEqual(updated.raflar, library.raflar);
          Object.assign(library, updated); return json({});
        }
        assert.equal(req.method(), 'GET', 'unexpected Drive mutation: ' + req.method() + ' ' + path);
        if (id && items.has(id)) {
          if (url.searchParams.get('alt') === 'media') {
            if (id === 'LJ') return json(library);
            if (id === 'BJ') return json(book);
            return route.fulfill({ contentType: 'application/pdf', body: items.get(id).bytes });
          }
          return json(publicItem(items.get(id)));
        }
        if (path.endsWith('/files')) {
          const q = url.searchParams.get('q') ?? '';
          if (q.includes("key='defterKok'")) return json({ files: [publicItem(items.get('R'))] });
          let found = [...items.values()];
          const parent = q.match(/'([^']+)' in parents/)?.[1];
          if (parent) found = found.filter(f => f.parents.includes(parent));
          const name = q.match(/name\s*=\s*'([^']+)'/)?.[1];
          if (name) found = found.filter(f => f.name === name);
          if (!q.includes(' or ') && q.includes("mimeType = '" + folder + "'")) found = found.filter(f => f.mimeType === folder);
          if (!q.includes(' or ') && q.includes("mimeType = 'application/pdf'")) found = found.filter(f => f.mimeType === 'application/pdf');
          for (const [, key, value] of q.matchAll(/key='([^']+)' and value='([^']+)'/g)) {
            found = found.filter(f => f.appProperties?.[key] === value);
          }
          return json({ files: found.map(publicItem) });
        }
        return route.fulfill({ status: 404, body: '{}' });
      });
      await context.addInitScript(({ scope }) => {
        sessionStorage.setItem('defter-oturum', JSON.stringify({ value: 'fake-summary-test', expiresAt: Date.now() + 3600000, aktif: 'dar', scopes: [scope] }));
      }, { scope });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      const openTopic = async () => {
        await page.locator('#signOutBtn').waitFor({ state: 'visible', timeout: 60000 });
        await page.locator('#login').waitFor({ state: 'hidden', timeout: 60000 });
        await page.locator('#araBtn').click();
        await page.locator('#aramaPaneli .ap-kutu').fill('Topic test');
        await page.locator('#aramaPaneli .ap-satir').first().click();
        await page.locator('#okuyucu.show').waitFor();
        await page.waitForFunction(() => Number(document.querySelector('#oSlider').max) > 1);
      };
      await page.goto(origin + '/?kapsam=dar&sahip=0&kurulum=1&cokluOzet=1&oda=eski&lang=' + lang);
      await page.locator('#loading').waitFor({ state: 'hidden', timeout: 60000 });
      await openTopic();
      assert.equal(await page.locator('#oFiles').isVisible(), false);
      assert.equal(await page.locator('#oSlider').getAttribute('max'), '2');
      await page.locator('#oDosyaInput').setInputFiles({ name: 'Notes.pdf', mimeType: 'application/pdf', buffer: added });
      await page.locator('#dosyaPanel').waitFor();
      assert.equal(await page.locator('input[value="yeniOzet"]').isChecked(), true);
      assert.equal(await page.locator('#dosyaPanel .fp-kart').evaluate(el => el.scrollWidth > el.clientWidth), false);
      if (output) await page.screenshot({ path: join(output, 'panel-' + viewport.width + '-' + lang + '.png') });
      await page.locator('#dosyaPanel .fp-ekle').click();
      await page.locator('#dosyaPanel').waitFor({ state: 'detached' });
      await page.waitForFunction(() => document.querySelectorAll('#oFile option').length === 2);
      // The first file never grows when a second summary is added.
      assert.equal(await page.locator('#oSlider').getAttribute('max'), '2');
      await page.locator('#oFile').selectOption('1');
      await page.waitForFunction(() => document.querySelector('#oSlider').max === '3');
      assert.equal(await page.locator('#oFile option:checked').textContent(), 'Notes');
      await page.locator('#oMode [data-m=pdf]').click();
      await page.locator('#oSlider').fill('2');
      await page.locator('#oSlider').dispatchEvent('input');
      await page.waitForFunction(() => document.querySelector('#oSlider').value === '2');
      const overflow = await page.evaluate(() => {
        const bar = document.querySelector('#oBar'), select = document.querySelector('#oFile'), r = select.getBoundingClientRect();
        return document.documentElement.scrollWidth > innerWidth || bar.scrollWidth > bar.clientWidth || r.left < 0 || r.right > innerWidth;
      });
      assert.equal(overflow, false);
      if (output) await page.screenshot({ path: join(output, 'summary-' + viewport.width + 'x' + viewport.height + '-' + lang + '.png') });
      await page.locator('#oClose').click();
      await page.waitForFunction(() => !document.querySelector('#okuyucu').classList.contains('show'));
      await openTopic();
      await page.waitForFunction(() => document.querySelector('#oFile').value === '1' && document.querySelector('#oSlider').value === '2');
      // Exercise the real language reload handler with a second summary open.
      const otherLang = lang === 'en' ? 'tr' : 'en';
      await Promise.all([
        page.waitForURL(url => !url.searchParams.has('lang')), 
        page.locator('#dilBtn').dispatchEvent('click')
      ]);
      await page.waitForFunction(lang => document.documentElement.lang === lang, otherLang);
      await page.locator('#okuyucu.show').waitFor({ timeout: 60000 });
      await page.waitForFunction(() => document.querySelector('#oFile').value === '1' && document.querySelector('#oSlider').value === '2');
      await page.locator('#oFile').selectOption('0');
      await page.waitForFunction(() => document.querySelector('#oSlider').max === '2');
      assert.deepEqual(items.get('OLD').bytes, original);
      assert.deepEqual(writes.map(x => x.kind), ['folder', 'pdf']);
      const nested = [...items.values()].find(x => x.name === 'Ozetler');
      assert.equal(writes[1].parent, nested.id);
      await page.locator('#oClose').click();
      const lockedURL = new URL(page.url()); lockedURL.searchParams.delete('cokluOzet');
      await page.goto(lockedURL.href);
      await page.locator('#login').waitFor({ state: 'hidden', timeout: 60000 });
      await openTopic();
      assert.equal(await page.locator('#oFiles').isVisible(), true, 'reading is independent of the write gate');
      await page.locator('#oDosyaInput').setInputFiles({ name: 'Append.pdf', mimeType: 'application/pdf', buffer: added });
      await page.locator('#dosyaPanel').waitFor();
      assert.equal(await page.locator('input[value="yeniOzet"]').count(), 0);
      assert.equal(await page.locator('input[value="ozet"]').isChecked(), true);
      assert.equal(await page.locator('#dosyaPanel .dp-ad').isVisible(), false);
      await page.locator('#dosyaPanel .fp-vazgec').first().click();
      assert.deepEqual(errors, []);
      results.push({ viewport, lang, creation: true, separatePages: true, ribbon: true, languageReturn: true, lockedPanel: true, overflow });
      console.log('PASS ' + viewport.width + '/' + lang);
      await context.close();
    }
  }
  console.log(JSON.stringify({ results, physicalIPad: false, realDrive: false }, null, 2));
} finally { await browser.close(); }
