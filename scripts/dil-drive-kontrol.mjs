// Task 6.5-2b: the language choice in kitaplik.json (ayarlar.dil), across devices — with a fake GIS + Drive
// (as kurulum-parametresiz-kontrol.mjs). Never contacts Google; the fake kitaplik.json lives in this process.
// Usage: npm run dev (5173), then node scripts/dil-drive-kontrol.mjs
// (i)   device A chooses TR → kitaplik.json gets ayarlar.dil = "tr", everything else the same, the page is TR
// (ii)  device B (empty storage) signs in → one reload, TR; no second reload, nothing written
// (iii) ?lang=en → EN stays, Drive unchanged
// (iv)  the write fails (500) / is slow (5 s) → the language still changes (≤ ~3 s); the next opening writes it
// (v)   a waiting choice of another library (another account) → removed, nothing written
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const ORIGIN = 'http://localhost:5173';
const FOLDER = 'application/vnd.google-apps.folder';
const scope = 'https://www.googleapis.com/auth/drive.file';
const gis = `window.google = { accounts: { oauth2: {
  initTokenClient: options => ({ requestAccessToken: () => {
    options.callback({ access_token: 'fake-local-test', expires_in: 3600, scope: '${scope}' });
  } }),
  hasGrantedAllScopes: (response, requested) => response.scope.split(' ').includes(requested)
} } };`;
const wait = ms => new Promise(r => setTimeout(r, ms));

// the user's Drive: one kitaplik.json, shared by every "device"
const ILK = { surum: 1, raflar: [{ id: 'raf-1', ad: 'Raf 1', kitaplar: [] }, { id: 'raf-2', ad: 'Mathe', kitaplar: [] }], oda: { duvar: '#d8cfc0', zemin: '#7a5a3c', mod: 'auto' }, bilinmeyen: { x: 1 } };
const drive = { json: structuredClone(ILK), surum: 1, patchler: [], hata: null };   // hata: null | 'sunucu' | 'yavas'
const sifirla = (json) => { drive.json = structuredClone(json); drive.surum++; drive.patchler = []; drive.hata = null; };

const browser = await chromium.launch({ channel: 'chrome' });
const sonuclar = [];

async function cihaz(adres = '/') {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  context.setDefaultTimeout(30000);
  const hatalar = [];
  const beklenmedik = [];
  await context.route('https://accounts.google.com/**', route => route.fulfill({ contentType: 'application/javascript', body: gis }));
  await context.route('https://www.googleapis.com/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() === 'PATCH' && url.pathname.endsWith('/files/library-json')) {
      if (drive.hata === 'sunucu') return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      if (drive.hata === 'yavas') {
        await wait(5000);
        try { await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }); } catch { /* the page went on */ }
        return;
      }
      drive.json = JSON.parse(req.postData());
      drive.surum++;
      drive.patchler.push(drive.json);
      return json({ id: 'library-json' });
    }
    if (req.method() !== 'GET') { beklenmedik.push(`${req.method()} ${url.pathname}`); return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }); }
    if (url.pathname.endsWith('/about')) return json({ user: { displayName: 'Yerel deneme' } });
    if (url.pathname.endsWith('/files/library-json')) {
      if (url.searchParams.get('alt') === 'media') return json(drive.json);
      return json({ id: 'library-json', modifiedTime: `2026-10-26T10:00:${String(drive.surum % 60).padStart(2, '0')}.000Z` });
    }
    if (url.pathname.endsWith('/files')) {
      const q = url.searchParams.get('q') || '';
      if (q.includes("key='defterKok'")) return json({ files: [{ id: 'library-root', name: 'Defter Library', mimeType: FOLDER }] });
      if (q.includes("'library-root' in parents")) return json({ files: [
        { id: 'books', name: 'kitaplar', mimeType: FOLDER },
        { id: 'library-json', name: 'kitaplik.json', mimeType: 'application/json' },
      ] });
      return json({ files: [] });
    }
    return route.fulfill({ status: 404, body: '{}' });
  });
  const page = await context.newPage();
  page.on('pageerror', e => hatalar.push(e.message));
  let yuklemeler = 0;
  page.on('load', () => { yuklemeler++; });
  await page.goto(ORIGIN + adres);
  await hazir(page);
  return { context, page, hatalar, beklenmedik, yuklemeler: () => yuklemeler };
}

const hazir = page => page.locator('#loading').waitFor({ state: 'hidden', timeout: 60000 });
const lang = page => page.evaluate(() => document.documentElement.lang);
const depo = page => page.evaluate(() => ({ dil: localStorage.getItem('defter-dil'), bekleyen: localStorage.getItem('defter-dil-bekleyen') }));

// sign in → the (empty) Drive library on screen
async function giris(page) {
  await page.locator('#loginGoogle').click();
  await page.locator('#bosKitaplik:not([hidden])').waitFor();
}

// sign in where Drive's language differs: one reload, then signing in again shows the library
async function girisYenilemeli(c) {
  const once = c.yuklemeler();
  await page2Nav(c.page, () => c.page.locator('#loginGoogle').click());
  assert.equal(c.yuklemeler(), once + 1, 'exactly one reload');
  await giris(c.page);
}

async function page2Nav(page, tetikle) {
  await Promise.all([page.waitForEvent('load', { timeout: 20000 }), tetikle()]);
  await hazir(page);
}

const dilBtn = page => page.locator('#dilBtn');

try {
  // (i) device A: no choice yet → nothing written; TR → written before the reload
  {
    sifirla(ILK);
    const a = await cihaz();
    await giris(a.page);
    await wait(800);
    assert.equal(await lang(a.page), 'en');
    assert.deepEqual(drive.patchler, [], 'no choice ever → nothing written');
    await page2Nav(a.page, () => dilBtn(a.page).click());
    assert.equal(await lang(a.page), 'tr');
    assert.equal(drive.patchler.length, 1);
    const { ayarlar, ...geri } = drive.patchler[0];
    assert.deepEqual(ayarlar, { dil: 'tr' });
    assert.deepEqual(geri, ILK, 'the rest of kitaplik.json is the same');
    assert.deepEqual(await depo(a.page), { dil: 'tr', bekleyen: null });
    assert.deepEqual([a.hatalar, a.beklenmedik], [[], []]);
    sonuclar.push({ durum: '(i) A TR seçer', once: ILK, sonra: drive.json });
    await a.context.close();
  }

  // (ii) device B: empty storage, Drive says tr → one reload in TR, then nothing more
  {
    const b = await cihaz();
    assert.equal(await lang(b.page), 'en');
    await girisYenilemeli(b);
    assert.equal(await lang(b.page), 'tr');
    const n = b.yuklemeler();
    await wait(2500);
    assert.equal(b.yuklemeler(), n, 'no second reload');
    assert.equal(drive.patchler.length, 1, 'device B writes nothing');
    assert.equal((await depo(b.page)).dil, 'tr');
    assert.deepEqual([b.hatalar, b.beklenmedik], [[], []]);
    sonuclar.push({ durum: '(ii) B temiz girer', yenileme: 1, dil: 'tr' });
    await b.context.close();
  }

  // (iii) ?lang=en: Drive's tr not applied, not written
  {
    const c = await cihaz('/?lang=en');
    await giris(c.page);
    await wait(2500);
    assert.equal(await lang(c.page), 'en');
    assert.equal(c.yuklemeler(), 1, 'no reload');
    assert.equal(drive.patchler.length, 1, 'Drive unchanged');
    assert.equal(drive.json.ayarlar.dil, 'tr');
    assert.deepEqual([c.hatalar, c.beklenmedik], [[], []]);
    sonuclar.push({ durum: '(iii) ?lang=en', dil: 'en', drive: 'tr (değişmedi)' });
    await c.context.close();
  }

  // (iv) the write fails / is slow: the language changes anyway; the next opening writes it (not back to EN)
  for (const hata of ['sunucu', 'yavas']) {
    sifirla({ ...ILK, ayarlar: { dil: 'en' } });
    const d = await cihaz();
    await giris(d.page);
    assert.equal(await lang(d.page), 'en');
    drive.hata = hata;
    const t0 = Date.now();
    let sure = -1;   // until the reload starts (the page's own request), not until it has loaded
    const yenileme = d.page.waitForRequest(r => r.isNavigationRequest()).then(() => { sure = Date.now() - t0; });
    await page2Nav(d.page, async () => {
      await dilBtn(d.page).click();
      if (hata === 'yavas') {   // while Drive is awaited the button is off (no double press)
        await wait(500);
        assert.equal(await dilBtn(d.page).isDisabled(), true, 'the language button is off while writing');
      }
    });
    await yenileme;
    assert.equal(await lang(d.page), 'tr');
    assert.ok(sure >= 0 && sure < 3600, `the reload started after ${sure} ms`);
    assert.equal(drive.json.ayarlar.dil, 'en', 'not written yet');
    assert.equal(JSON.parse((await depo(d.page)).bekleyen).dil, 'tr');
    drive.hata = null;
    await giris(d.page);   // Drive en, the waiting choice tr → written, no reload back
    for (let i = 0; i < 30 && drive.json.ayarlar.dil !== 'tr'; i++) await wait(100);
    assert.equal(drive.json.ayarlar.dil, 'tr');
    await wait(1500);
    assert.equal(await lang(d.page), 'tr');
    assert.equal((await depo(d.page)).bekleyen, null);
    assert.deepEqual([d.hatalar, d.beklenmedik], [[], []]);
    sonuclar.push({ durum: `(iv) yazma ${hata === 'sunucu' ? '500' : '5 sn yavaş'}`, dilDegisti: `${sure} ms`, sonrakiAcilis: 'yazıldı' });
    await d.context.close();
  }

  // (v) another library's waiting choice: removed, never written here
  {
    sifirla(ILK);
    const e = await cihaz();
    await e.page.evaluate(() => {
      localStorage.setItem('defter-dil-bekleyen', JSON.stringify({ dil: 'tr', fileId: 'baska-hesap' }));
    });
    await e.page.reload();
    await hazir(e.page);
    await giris(e.page);
    await wait(1500);
    assert.equal((await depo(e.page)).bekleyen, null, 'removed');
    assert.deepEqual(drive.patchler, [], "another library's choice is not written here");
    assert.equal(await lang(e.page), 'en');
    assert.deepEqual([e.hatalar, e.beklenmedik], [[], []]);
    sonuclar.push({ durum: '(v) başka hesabın bekleyeni', bekleyen: 'silindi' });
    await e.context.close();
  }

  console.log(JSON.stringify({ gecti: true, sonuclar, gercekGoogle: false }, null, 2));
} finally { await browser.close(); }
