// 6.6-3a: compiled application + isolated fake GIS/Drive. No real Google requests.
// npm run build; npm run preview -- --port 5173; node scripts/surukle-kontrol.mjs <output>
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
const original = await pdf(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1180, height: 820 }]) {
    for (const lang of ['en', 'tr']) {
      const context = await browser.newContext({ viewport, hasTouch: viewport.width === 390 });
      const errors = [], writes = [];
      const library = { surum: 1, raflar: [{ id: 'shelf', ad: 'Shelf', kitaplar: ['summary-test'] }] };
      let book = { surum: 2, baslik: 'Summary test', sirt: 'TEST', kapak: { renk: '#24476b' }, uniteler: [
        { baslik: 'Unit A', klasor: 'Unite-01', konular: Array.from({ length: 3 }, (_, i) => ({ baslik: i === 0 ? 'Topic test' : 'Topic ' + (i + 1), klasor: 'Unite-01/Konu-0' + (i + 1) })) },
        { baslik: 'Unit B', klasor: 'Unite-02', konular: [{ baslik: 'Other topic', klasor: 'Unite-02/Konu-01' }] }
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
      put('U2', 'Unite-02', 'B', folder);
      put('C2', 'Konu-02', 'U', folder);
      put('C3', 'Konu-03', 'U', folder);
      put('C4', 'Konu-01', 'U2', folder);
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
        const id = path.match(/\/files\/([^/]+)$/)?.[1];
        if (req.method() === 'PATCH' && id === 'BJ') {
          const updated = req.postDataJSON();
          const order = b => b.uniteler.map(u => [u.klasor, u.konular.map(t => t.klasor)]);
          if (JSON.stringify(order(updated)) !== JSON.stringify(order(book))) writes.push(structuredClone(updated));
          book = updated; return json({});
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
        await page.locator('#loading').waitFor({ state: 'hidden', timeout: 60000 });
        await page.locator('#signOutBtn').waitFor({ state: 'visible', timeout: 60000 });
        await page.locator('#login').waitFor({ state: 'hidden', timeout: 60000 });
        await page.locator('#araBtn').click();
        for (let attempt = 0; attempt < 40; attempt++) {
          await page.locator('#aramaPaneli .ap-kutu').fill('');
          await page.locator('#aramaPaneli .ap-kutu').fill('Topic test');
          await page.waitForTimeout(300);
          if (await page.locator('#aramaPaneli .ap-satir').count()) break;
        }
        await page.locator('#aramaPaneli .ap-satir').first().click();
        await page.locator('#okuyucu.show').waitFor();
        await page.waitForFunction(() => Number(document.querySelector('#oSlider').max) > 1);
      };
      await page.goto(origin + '/?kapsam=dar&sahip=0&kurulum=1&oda=eski&lang=' + lang);
      await page.locator('#loading').waitFor({ state: 'hidden', timeout: 60000 });
      await openTopic();
      const edit = async () => {
        await page.locator('#oTocBtn').click();
        await page.locator('#oTocEdit').click();
        await page.locator('[data-surukle="k0.0"]').waitFor();
      };
      await edit();
      await page.evaluate(() => document.addEventListener('pointerdown', e => window.__pointerId = e.pointerId, true));
      const cdp = await context.newCDPSession(page);
      const touch = viewport.width === 390;
      const start = async (x, y) => {
        if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        else { await page.mouse.move(x, y); await page.mouse.down(); }
      };
      const move = async (x, y) => {
        if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
        else await page.mouse.move(x, y);
      };
      const end = async () => {
        if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        else await page.mouse.up();
      };
      const drag = async (from, to, cancel = false, outside = false) => {
        await page.locator('#oTocList').evaluate(el => el.scrollTop = 0);
        await page.locator(`[data-surukle="${from}"]`).scrollIntoViewIfNeeded();
        const a = await page.locator(`[data-surukle="${from}"]`).boundingBox();
        const b = await page.locator(`[data-surukle="${to}"]`).boundingBox();
        const x = a.x + a.width / 2, y = a.y + a.height / 2;
        await start(x, y);
        const targetY = from === to ? y : b.y + b.height / 2 + (b.y > a.y ? 12 : -12);
        if (from === to) await move(x, y + 24);
        for (let i = 1; i <= 8; i++) await move(x, y + (targetY - y) * i / 8);
        if (outside) await move(viewport.width - 2, targetY);
        if (output && !cancel) await page.screenshot({ path: join(output, `drag-${viewport.width}-${lang}-${from[0]}.png`) });
        await page.locator('.ie-surukluyor').waitFor();
        if (cancel) await page.keyboard.press('Escape');
        await end();
      };
      await drag('k0.0', 'k0.2', false, true);
      await page.waitForTimeout(1300);
      assert.equal(writes.length, 1, 'one topic write');
      assert.deepEqual(book.uniteler[0].konular.map(t => t.baslik), ['Topic 2', 'Topic 3', 'Topic test']);
      assert.equal(book.uniteler[1].konular[0].baslik, 'Other topic');
      await drag('u1', 'u0');
      await page.waitForTimeout(1300);
      assert.equal(writes.length, 2, 'one unit write');
      assert.deepEqual(book.uniteler.map(u => u.baslik), ['Unit B', 'Unit A']);
      await drag('k1.0', 'k1.2', true);
      await page.waitForTimeout(1000);
      assert.equal(writes.length, 2, 'Escape writes nothing');
      await drag('k1.0', 'k1.0');
      await page.waitForTimeout(1000);
      assert.equal(writes.length, 2, 'same position writes nothing');
      // Pointer cancellation returns the original order, too.
      const a = await page.locator('[data-surukle="k1.0"]').boundingBox();
      await start(a.x + 20, a.y + 20); await move(a.x + 20, a.y + 90);
      await page.locator('[data-surukle="k1.0"]').dispatchEvent('pointercancel', { pointerId: await page.evaluate(() => window.__pointerId) });
      assert.equal(await page.locator('.ie-surukluyor').count(), 0);
      await end();
      await page.waitForTimeout(1000); assert.equal(writes.length, 2);
      const arrows = page.locator('[data-asagi="k1.0"]');
      assert.equal(await arrows.evaluate(el => getComputedStyle(el).position), 'absolute');
      await page.keyboard.press('Tab');
      await arrows.focus();
      assert.equal(await arrows.evaluate(el => el.matches(':focus-visible') && el.getBoundingClientRect().width >= 40), true);
      await page.keyboard.press('Enter');
      await page.locator('[data-surukle="k1.1"]').focus();
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(1300);
      assert.equal(writes.length, 3, 'arrow button + handle key combine in 800 ms');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-surukle')), 'k1.2', 'keyboard focus survives queue redraw');
      assert.deepEqual(book.uniteler[1].konular.map(t => t.baslik), ['Topic 3', 'Topic test', 'Topic 2']);
      // Name editing disables every handle, while keeping the input intact.
      await page.locator('[data-yeniad="k1.0"]').click();
      assert.equal(await page.locator('[data-surukle]:not(:disabled)').count(), 0);
      await page.locator('[data-girdi]').fill('Unsent name');
      await page.locator('[data-ie-iptal]').click();
      const overflow = await page.locator('#oTocList').evaluate(el => el.scrollWidth > el.clientWidth + 1);
      assert.equal(overflow, false);
      if (output) await page.screenshot({ path: join(output, `edit-${viewport.width}-${lang}.png`) });
      // Refresh reads the persisted order from the fake Drive, without changing paths.
      await page.reload();
      await openTopic();
      await edit();
      assert.deepEqual(await page.locator('.ie-ubas [data-ad]').allTextContents(), ['Unit B', 'Unit A']);
      assert.deepEqual(await page.locator('.ie-unite').nth(1).locator('li [data-ad]').allTextContents(), ['Topic 3', 'Topic test', 'Topic 2']);
      // Long-list edge scrolling; cancel must not persist an order.
      book.uniteler[0].konular = Array.from({ length: 30 }, (_, i) => ({ baslik: 'Long ' + i, klasor: `Unite-02/Long-${i}` }));
      await page.reload(); await openTopic(); await edit();
      const first = await page.locator('[data-surukle="k0.0"]').boundingBox();
      const list = await page.locator('#oTocList').boundingBox();
      await start(first.x + 20, first.y + 20);
      await move(first.x + 20, list.y + list.height - 8);
      await page.waitForTimeout(900);
      assert.ok(await page.locator('#oTocList').evaluate(el => el.scrollTop) > 50, 'edge scroll');
      await page.keyboard.press('Escape'); await end();
      await page.waitForTimeout(1000); assert.equal(writes.length, 3);
      assert.deepEqual(errors, []);
      results.push({ viewport, lang, topic: true, unit: true, escape: true, samePlace: true, keyboard: true, reload: true, edgeScroll: true, writes: writes.length, orders: writes.map(b => b.uniteler.map(u => ({ unit: u.klasor, topics: u.konular.map(t => t.klasor) }))), overflow });
      console.log('PASS ' + viewport.width + '/' + lang);
      await context.close();
    }
  }
  console.log(JSON.stringify({ results, physicalIPad: false, realDrive: false }, null, 2));
} finally { await browser.close(); }
