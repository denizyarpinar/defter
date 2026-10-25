// Task 6.4e-2: control screenshots of the reader's "Temiz yazı ↔ Orijinal", without signing in and without Drive.
// Usage: node scripts/temiz-yazi-okuyucu-kontrol.mjs [output folder]
// A Vite dev server on its own port with the sample library (?demo). The reader opens a topic as
// dosya-cop-kontrol.mjs does; then window.defterTemizSahte (dev only, src/okuma/temizSahte.ts) makes pages 1 and 2
// of the list "read" with a made-up record, the atlas package from disk (../defter-test-dosyalari/atlas/4-paket,
// outside the repo; missing → skipped). No request goes to Google or Drive.
// Sizes 1180×820, 820×1180 (iPad), 390×844 (phone), touch, ×2 pixels; Kitap and PDF mode × temiz / orijinal,
// the style popover open, zoom 200 %, the pen on. Every shot: the bar is one row (else the script fails).
// 820×1180 also (6.4e-4): Kalem on a clean page → a stroke → Orijinal (no stroke) → a stroke → Temiz (only the first).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4189;
const URL = `http://localhost:${PORT}/?demo`;
const OUT = process.argv[2] ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\temiz-yazi-6.4e\\okuyucu';
const PAKET = join(ROOT, '..', 'defter-test-dosyalari', 'atlas', '4-paket');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

if (!existsSync(join(PAKET, 'el-yazisi-atlas.json'))) {
  console.log(`Atlas paketi yok (${PAKET}); kontrol atlandı. Önce: tools/atlas/.venv/Scripts/python tools/atlas/uret.py paket`);
  process.exit(0);
}
const atlasJson = readFileSync(join(PAKET, 'el-yazisi-atlas.json'), 'utf8');
const atlasPng = readFileSync(join(PAKET, 'el-yazisi-atlas.png')).toString('base64');

async function startDev() {
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(URL)).ok) return child; } catch { /* not up yet */ }
    await wait(200);
  }
  child.kill();
  throw new Error(`vite ${PORT} portunda başlamadı.`);
}

const SAYFA1 = {
  satirlar: [
    { girinti: 0, parcalar: [{ metin: 'Kuvvet ağırlık öğrenci Şekil üç İçerik', renk: 'kirmizi' }] },
    { girinti: 0, parcalar: [{ metin: 'Beispiele für Kräfte:', renk: 'mavi' }] },
    { girinti: 1, parcalar: [{ metin: 'Gewichtskraft', renk: 'mavi' }, { metin: '(ağırlık)', renk: 'siyah' }] },
    { girinti: 1, parcalar: [{ metin: 'Reibung', renk: 'mavi' }, { metin: 'Rebung', renk: 'mavi', ustuCizili: true }, { metin: '(sürtünme)', renk: 'siyah' }] },
    { girinti: 1, parcalar: [{ metin: 'Federkaft', duzeltme: 'Federkraft', renk: 'yesil' }, { metin: 'F = -D \\cdot s', renk: 'siyah', tur: 'formul' }] },
    { girinti: 0, parcalar: [{ metin: '\\vec{F} = m \\cdot \\vec{a}', renk: 'kirmizi', tur: 'formul' }, { metin: 'Newton 2.', renk: 'diger' }] },
    { girinti: 2, cizim: 'kutuya etki eden kuvvetler, oklarla' },
    { girinti: 0, parcalar: [{ metin: 'Uzun bir satır kelime kaydırmayı göstermek için yazılmıştır ve sayfanın sağ kenarına ulaşınca bir alt satıra geçer; kurşun kalemle.', renk: 'kursun' }] },
  ]
};
const SAYFA2 = {
  satirlar: [
    { girinti: 0, parcalar: [{ metin: 'Graphen', renk: 'kirmizi' }] },
    { girinti: 0, parcalar: [{ metin: 'Ein Graph G = (V, E) besteht aus Knoten und Kanten.', renk: 'mavi' }] },
    { girinti: 1, parcalar: [{ metin: 'Grad eines Knotens: deg(v)', renk: 'mavi' }] },
    { girinti: 1, parcalar: [{ metin: '\\sum_{v} deg(v) = 2 \\cdot |E|', renk: 'siyah', tur: 'formul' }] },
    { girinti: 0, parcalar: [{ metin: 'Düğüm derecelerinin toplamı kenar sayısının iki katıdır.', renk: 'yesil' }] },
  ]
};

// The edit context (so the desk shows "İçindekileri düzenle", as dosya-cop-kontrol.mjs); nothing is written
async function baglamKur(page) {
  await page.evaluate(async () => {
    const [ok, reader, bg] = await Promise.all([import('/src/okuma/Okuyucu.ts'), import('/src/ui/reader.ts'), import('/src/ui/icindekilerBaglami.ts')]);
    const hayir = async () => { throw new Error('bu betikte yazma yok'); };
    const drive = { yeniIdler: hayir, oge: hayir, islemAra: hayir, olustur: hayir, kokCocuklari: hayir, klasorler: hayir, jsonOku: hayir, degisimZamani: hayir, jsonYaz: hayir };
    const { baglam } = bg.icindekilerBaglamiKur({
      drive, kilitAcik: true,
      hasJson: x => { window.__masa = x; return true; },
      secenek: () => ({ kilitAcik: true, kokKaynagi: 'defterKok', kokId: 'kok', yazabilir: () => true, surum: 2, kitapKlasorId: 'kb', kitapJsonId: 'kj' }),
      uniteKlasorleri: async x => x.uniteler.map(u => u.klasor ?? null),
      kitap: () => window.__masa, yenile: () => reader.refreshReader(), jsonOku: hayir, girisYap() {}
    });
    ok.setIcindekilerBaglami(baglam);
  });
}

async function olc(page) {
  return page.evaluate(() => {
    const bar = document.querySelector('#oBar'), grup = document.querySelector('#oTemizGrup'), btn = document.querySelector('#oTemiz');
    const b = bar.getBoundingClientRect(), g = grup.getBoundingClientRect();
    const gorunur = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
    const kutular = [...document.querySelectorAll('.o-page, #oSpread [class*="page"]')];
    return {
      tekSatir: bar.scrollWidth <= bar.clientWidth + 1 && b.height < 64,
      cubukH: Math.round(b.height),
      dugme: gorunur(grup) ? `${Math.round(g.width)}px "${btn.querySelector(getComputedStyle(btn.querySelector('.o-uzun')).display === 'none' ? '.o-kisa' : '.o-uzun').textContent}"` : 'yok',
      cubukta: gorunur(grup) ? g.left >= b.left - 1 && g.right <= b.right + 1 : '-',
      basili: btn.getAttribute('aria-pressed') + (btn.disabled ? ' (gri)' : ''),
      temizSayfa: document.querySelectorAll('.o-temizsayfa').length,
      detay: document.querySelectorAll('.o-temizsayfa .o-detail').length,
      balon: gorunur(document.querySelector('#oTemizBalon')) ? 'açık' : '-',
      kutular: kutular.length,
    };
  });
}

async function zoom2(page) {
  await page.evaluate(() => {
    const r = document.querySelector(document.querySelector('#oScroll').hidden ? '#oKitap' : '#oScroll').getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 3;
    // Ctrl + wheel: f = exp(-deltaY · 0.01) → 2 (zoomKontrol.ts)
    document.querySelector('#okuyucu').dispatchEvent(new WheelEvent('wheel', { deltaY: -Math.log(2) / 0.01, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  });
  await wait(2500);   // the wheel commit + the sharp canvas
}

// The clean page in view, marked (data-prob); its state: clean class, the pen layer's strokes and whether they show
const sayfaDurumu = (page) => page.evaluate(() => {
  const b = document.querySelector('.o-page[data-prob]');
  if (!b) return null;
  const svg = [...b.querySelectorAll(':scope > svg.o-cizim:not(.canli)')];
  return { temiz: b.classList.contains('o-temizsayfa'), cizgi: svg.reduce((n, x) => n + x.querySelectorAll('path').length, 0),
    gorunur: svg.some(x => getComputedStyle(x).display !== 'none' && x.querySelector('path')) };
});

// One pen stroke on the marked page (dy: px under the middle of its visible part)
async function cizgiCiz(page, dy) {
  const nokta = await page.evaluate((dy) => {
    const v = document.querySelector('#oScroll').getBoundingClientRect(), r = document.querySelector('.o-page[data-prob]').getBoundingClientRect();
    const top = Math.max(r.top, v.top) + 40, bottom = Math.min(r.bottom, v.bottom) - 40;
    return { x: r.left + r.width * 0.25, y: (top + bottom) / 2 + dy };
  }, dy);
  await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const ev = (t, k) => el.dispatchEvent(new PointerEvent(t, { pointerId: 9, pointerType: 'pen', isPrimary: true, clientX: x + k * 8, clientY: y + k * 3,
      pressure: 0.5, buttons: t === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true }));
    ev('pointerdown', 0); for (let k = 1; k <= 25; k++) ev('pointermove', k); ev('pointerup', 25);
  }, nokta);
  await wait(800);
}

// The pending record(s) on the device (IndexedDB defter-kalem/bekleyen): [id, gorunum] of the strokes added
const bekleyenler = (page) => page.evaluate(() => new Promise(res => {
  const r = indexedDB.open('defter-kalem', 1);
  r.onerror = () => res(null);
  r.onsuccess = () => {
    try {
      const q = r.result.transaction('bekleyen', 'readonly').objectStore('bekleyen').getAll();
      q.onsuccess = () => res(q.result.flatMap(k => k.eklenen.map(e => e.stroke.gorunum ?? 'orijinal')));
      q.onerror = () => res(null);
    } catch { res(null); }
  };
}));

// Task 6.4e-4: each view its own strokes. Clean page → Kalem (the page stays clean) → a stroke (shows) →
// Orijinal (no stroke) → a stroke on the photo (1) → Temiz (only the first) → Kalem off (still only the first).
// The pending record keeps both, each with its view.
async function temizeCiz(page, cek) {
  const bulundu = await page.evaluate(() => {
    const v = document.querySelector('#oScroll').getBoundingClientRect();
    const b = [...document.querySelectorAll('.o-page.o-temizsayfa')].find(x => { const r = x.getBoundingClientRect(); return r.bottom > v.top + 200 && r.top < v.bottom - 200; });
    if (b) b.dataset.prob = '1';
    return !!b;
  });
  if (!bulundu) throw new Error('Ekranda temiz sayfa yok.');
  await page.click('#oPenBtn');
  await wait(1500);
  const kalemAcik = await sayfaDurumu(page);
  const dugmeGri = await page.evaluate(() => document.querySelector('#oTemiz').disabled);
  await cizgiCiz(page, -60);
  const temizde = await sayfaDurumu(page);
  await cek('9-temizde-ciz');
  await page.click('#oTemiz');
  await wait(1500);
  const orijinal = await sayfaDurumu(page);
  await cek('10-orijinal-cizgi-yok');
  await cizgiCiz(page, 60);
  const orijinalde = await sayfaDurumu(page);
  await cek('11-orijinalde-ciz');
  await page.click('#oTemiz');
  await wait(1500);
  const temizeDon = await sayfaDurumu(page);
  await cek('12-temiz-yalniz-ilk');
  await page.click('#oPenBtn');
  await wait(1500);
  const kalemKapali = await sayfaDurumu(page);
  const kayit = await bekleyenler(page);
  await cek('13-kalem-kapali-temiz');
  const sonuc = { kalemAcik, dugmeGri, temizde, orijinal, orijinalde, temizeDon, kalemKapali, kayit };
  console.log('temiz / orijinal çizgileri:', JSON.stringify(sonuc));
  const ok = kalemAcik?.temiz && !dugmeGri
    && temizde.temiz && temizde.cizgi === 1 && temizde.gorunur
    && !orijinal.temiz && orijinal.cizgi === 0
    && !orijinalde.temiz && orijinalde.cizgi === 1
    && temizeDon.temiz && temizeDon.cizgi === 1 && temizeDon.gorunur
    && kalemKapali.temiz && kalemKapali.cizgi === 1
    && JSON.stringify([...(kayit ?? [])].sort()) === JSON.stringify(['orijinal', 'temiz']);
  if (!ok) { console.error('HATA: temiz / orijinal çizgileri beklendiği gibi ayrılmadı.'); process.exitCode = 1; }
}

const BOYUTLAR = [['1180x820', { width: 1180, height: 820 }], ['820x1180', { width: 820, height: 1180 }], ['390x844', { width: 390, height: 844 }]];

const dev = await startDev();
const browser = await chromium.launch({ channel: 'chrome' });
const tablo = [];
let hata = false;
try {
  mkdirSync(OUT, { recursive: true });
  for (const [ad, viewport] of BOYUTLAR) {
    const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.error(`[${ad}] sayfa hatası:`, e.message); hata = true; });
    await page.goto(URL);
    await page.waitForFunction(() => document.querySelector('#loading')?.hidden, null, { timeout: 30_000 });
    await wait(1500);
    await baglamKur(page);
    const cek = async (dosya) => {
      await page.screenshot({ path: join(OUT, `${ad}-${dosya}.png`) });
      const o = await olc(page);
      tablo.push([`${ad} ${dosya}`, o]);
      if (!o.tekSatir || o.cubukta === false) hata = true;
    };

    // the book to the desk (library search), its contents → "İçindekileri düzenle" → "Bitti" → the first topic
    await page.keyboard.press('/');
    await page.locator('#aramaPaneli .ap-kutu').fill('programlamaya');
    await page.waitForFunction(() => document.querySelectorAll('#aramaPaneli .ap-satir').length > 0, null, { timeout: 10_000 });
    await page.locator('#aramaPaneli .ap-satir').first().click();
    await page.waitForSelector('#reader.show', { timeout: 15_000 });
    await wait(2500);
    if (await page.locator('#next').isEnabled()) { await page.click('#next'); await wait(700); }
    await page.click('#reader [data-duzenle]');
    await page.waitForSelector('#okuyucu.show');
    await wait(700);
    if (await page.locator('[data-uniteekle]').count()) { await page.click('#oTocEdit'); await wait(300); }   // Bitti
    if (!await page.locator('#oTocList').isVisible()) { await page.click('#oTocBtn'); await wait(400); }
    await page.click('#oTocList [data-u="0"][data-t="0"]');
    await wait(1500);
    if (await page.locator('#oTocClose').isVisible()) { await page.click('#oTocClose'); await wait(400); }

    // pages 1 and 2 of the list read (made up), 4 photo pages
    await page.evaluate(async (o) => { await window.defterTemizSahte(o); }, { sayfalar: { 0: SAYFA1, 1: SAYFA2 }, fotograf: [0, 1, 2, 3], atlasJson, atlasPng });
    await wait(1500);

    for (const mod of ['kitap', 'pdf']) {
      await page.click(`#oMode [data-m="${mod}"]`);
      await wait(1800);
      // the first page in view (PDF mode: the top of the list)
      await cek(`${mod}-1-temiz`);
      await page.click('#oTemiz');
      await wait(1500);
      await cek(`${mod}-2-orijinal`);
      await page.click('#oTemiz');
      await wait(1200);
      await page.click('#oTemizStil');
      await wait(300);
      await cek(`${mod}-3-balon`);
      await page.click('#oTemizBalon [data-stil="yumusak"]');
      await wait(1200);
      await cek(`${mod}-4-yumusak`);
      await page.click('#oTemizStil');
      await wait(200);
      await page.click('#oTemizBalon [data-stil="tukenmez"]');
      await wait(1000);
      await zoom2(page);
      await cek(`${mod}-5-zoom200`);
      await page.click('#oTemiz');
      await wait(2500);
      await cek(`${mod}-6-zoom200-orijinal`);
      await page.click('#oTemiz');
      await wait(1500);
      await page.click(`#oMode [data-m="${mod === 'kitap' ? 'pdf' : 'kitap'}"]`);   // a mode change resets the zoom
      await wait(800);
      await page.click(`#oMode [data-m="${mod}"]`);
      await wait(1200);
    }
    if (ad === '820x1180') { await temizeCiz(page, cek); await ctx.close(); continue; }
    await page.click('#oPenBtn');
    await wait(1500);
    await cek('7-kalem-acik');
    await page.click('#oPenBtn');
    await wait(1500);
    await cek('8-kalem-kapali');
    await ctx.close();
  }
} finally {
  await browser.close();
  dev.kill();
}

const sutunlar = Object.keys(tablo[0][1]);
console.log(['durum', ...sutunlar].join(' | '));
for (const [ad, o] of tablo) console.log([ad, ...sutunlar.map(k => String(o[k]))].join(' | '));
console.log(`\nEkran görüntüleri: ${OUT}`);
if (hata) { console.error('HATA: çubuk tek satır değil, düğme çubuğun dışında ya da sayfa hatası var.'); process.exit(1); }
