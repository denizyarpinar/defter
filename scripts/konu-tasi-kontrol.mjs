// 6.6-3a: compiled application + isolated fake GIS/Drive. No real Google requests.
// npm run build; npm run preview -- --port 5173; node scripts/surukle-kontrol.mjs <output>
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
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
      let failJson = false, loseMove = false;
      const parentWrites = [];
      let book = { surum: 2, baslik: 'Summary test', sirt: 'TEST', kapak: { renk: '#24476b' }, uniteler: [
        { baslik: 'Unit A', klasor: 'Unite-01', konular: Array.from({ length: 3 }, (_, i) => ({ baslik: i === 0 ? 'Topic test' : 'Topic ' + (i + 1), klasor: 'Unite-01/Konu-0' + (i + 1) })) },
        { baslik: 'Unit B', klasor: 'Unite-02', konular: [{ baslik: 'Other topic', klasor: 'Unite-02/Konu-04' }] }
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
      put('U3', 'Unite-03', 'B', folder);
      book.uniteler.push({ baslik: 'Empty unit', klasor: 'Unite-03', konular: [] });
      put('C2', 'Konu-02', 'U', folder);
      put('C3', 'Konu-03', 'U', folder);
      put('C4', 'Konu-04', 'U2', folder);
      put('C', 'Konu-01', 'U', folder);
      put('OLD', 'ozet.pdf', 'C', 'application/pdf', original);
      const publicItem = ({ bytes, ...item }) => ({ ...item, ...(bytes ? { size: String(bytes.length) } : {}) });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await context.route('https://accounts.google.com/**', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'window.google={accounts:{oauth2:{initTokenClient:()=>({requestAccessToken(){}}),hasGrantedAllScopes:()=>false,revoke(){}}}};'
      }));
      await context.route('https://www.googleapis.com/**', async route => {
        const req = route.request(); assert.notEqual(req.method(), 'DELETE'); const url = new URL(req.url()), path = url.pathname;
        const json = value => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
        if (path.endsWith('/about')) return json({ user: { displayName: 'Summary Test', emailAddress: 'summary@example.invalid' } });
        const id = path.match(/\/files\/([^/]+)$/)?.[1];
        if (req.method() === 'PATCH' && id && url.searchParams.has('addParents')) {
          assert.equal(req.postData(), null, 'no rename body');
          assert.equal(id, 'C');
          const item = items.get(id), to = url.searchParams.get('addParents'), from = url.searchParams.get('removeParents');
          assert.deepEqual(item.parents, [from]); item.parents = [to]; parentWrites.push({ from, to });
          if (loseMove) { loseMove = false; return route.abort('failed'); }
          return json(publicItem(item));
        }
        if (req.method() === 'PATCH' && id === 'BJ') {
          if (failJson) return route.abort('failed');
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
      await page.goto(origin + '/?konuTasi=1&kapsam=dar&sahip=0&kurulum=1&oda=eski&lang=' + lang);
      await page.locator('#loading').waitFor({ state: 'hidden', timeout: 60000 });
      await openTopic();
      const edit = async () => {
        await page.locator('#oTocBtn').click();
        await page.locator('#oTocEdit').click();
        await page.locator('[data-surukle="k0.0"]').waitFor();
      };
      await page.locator('#oMode [data-m=pdf]').click();
      await page.waitForTimeout(300);
      await page.locator('#oSlider').evaluate(el => { el.value = '2'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
      await page.waitForTimeout(400);
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
        // Follow the actual target as an insertion gap pushes later units down.
        for (let i = 1; i <= 8; i++) {
          const live = await page.locator(`[data-surukle="${to}"]`).boundingBox();
          const liveY = live.y + live.height / 2 + (live.y > a.y ? 12 : -12);
          await move(x, y + (liveY - y) * i / 8);
        }
        for (let i = 0; i < 2; i++) {
          await page.waitForTimeout(100);
          const live = await page.locator(`[data-surukle="${to}"]`).boundingBox();
          await move(x, live.y + live.height / 2 + (live.y > a.y ? 12 : -12));
        }
        if (outside) await move(viewport.width - 2, targetY);
        if (output && !cancel) await page.screenshot({ path: join(output, `drag-${viewport.width}-${lang}-${from[0]}.png`) });
        await page.locator('.ie-surukluyor').waitFor();
        if (cancel) await page.keyboard.press('Escape');
        await end();
      };
      const waitForParent = async id => {
        await page.waitForFunction(() => !document.querySelector('.ie-bekliyor'), { timeout: 15000 });
        for (let i=0; i<60 && items.get('C').parents[0] !== id; i++) await page.waitForTimeout(100);
        assert.equal(items.get('C').parents[0], id);
        await page.waitForTimeout(300);
      };
      const undo = async () => { await page.locator('#toast button').click(); await page.waitForTimeout(500); };
      const topicPath = () => book.uniteler.flatMap(u => u.konular).find(k => k.baslik === 'Topic test').klasor;
      const initialSlide = await page.locator('#oSlider').inputValue();
      assert.equal(initialSlide, '2');
      // A deleted-page backup is keyed by operation id but contains a topic path.
      await page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => {
          const r = indexedDB.open('defter-silinen-sayfa', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('yedekler');
          r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
        });
        await new Promise((resolve, reject) => { const tx = db.transaction('yedekler', 'readwrite');
          tx.objectStore('yedekler').put({ islemId: 'move-backup', kitapId: 'summary-test', konu: 'Unite-01/Konu-01', zaman: new Date().toISOString(), tamam: true }, 'move-backup');
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
        }); db.close();
      });
      const backupPath = () => page.evaluate(async () => {
        const db = await new Promise(resolve => { const r = indexedDB.open('defter-silinen-sayfa', 1); r.onsuccess = () => resolve(r.result); });
        const record = await new Promise(resolve => { const r = db.transaction('yedekler').objectStore('yedekler').get('move-backup'); r.onsuccess = () => resolve(r.result); });
        db.close(); return record?.konu;
      });
      await drag('k0.0', 'k1.0'); await waitForParent('U2');
      assert.equal(topicPath(), 'Unite-02/Konu-01');
      assert.equal(await backupPath(), topicPath(), 'backup path moves');
      assert.equal(await page.locator('#oSlider').inputValue(), initialSlide, 'same page');
      await undo(); await waitForParent('U'); assert.equal(topicPath(), 'Unite-01/Konu-01');
      assert.equal(await backupPath(), topicPath(), 'undo preserves backup');
      await drag('k0.0', 'u2'); await waitForParent('U3'); assert.equal(topicPath(), 'Unite-03/Konu-01');
      await undo(); await waitForParent('U');
      loseMove = true;
      await drag('k0.0', 'k1.0');
      await page.locator('[data-durum="tekrar"]').waitFor();
      const moveCount = parentWrites.length;
      await page.locator('[data-durum="tekrar"]').click(); await waitForParent('U2');
      assert.equal(parentWrites.length, moveCount, 'lost response retries without second move');
      await undo(); await waitForParent('U');
      failJson = true;
      await drag('k0.0', 'k1.0'); await page.locator('[data-durum="vazgec"]').waitFor();
      failJson = false;
      await page.locator('[data-durum="vazgec"]').click(); await waitForParent('U');
      assert.equal(topicPath(), 'Unite-01/Konu-01');
      // Reload after parent succeeds but JSON is still pending: journal recovery.
      failJson = true;
      await drag('k0.0', 'k1.0'); await page.locator('[data-durum="tekrar"]').waitFor();
      assert.ok(await page.evaluate(() => localStorage.getItem('defter-konu-tasi')));
      failJson = false;
      await page.reload(); await openTopic(); await edit();
      await waitForParent('U2'); assert.equal(topicPath(), 'Unite-02/Konu-01');
      assert.equal(await page.evaluate(() => localStorage.getItem('defter-konu-tasi')), null);
      const overflow = await page.locator('#oTocList').evaluate(el => el.scrollWidth > el.clientWidth + 1);
      assert.equal(overflow, false); assert.deepEqual(errors, []);
      if (output) await page.screenshot({ path: join(output, `done-${viewport.width}-${lang}.png`) });
      results.push({ viewport, lang, move: true, empty: true, undo: true, retry: true, cancel: true, recovery: true, samePage: true, overflow, parentWrites });
      console.log('PASS ' + viewport.width + '/' + lang); await context.close();
    }
  }
  const report = { results, physicalIPad: false, realDrive: false };
  if (output) writeFileSync(join(output, 'rapor.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
