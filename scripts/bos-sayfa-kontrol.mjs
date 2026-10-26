// Task 6.S-4: blank note pages before / after the page on screen, and their removal, without signing in and without
// Drive. Usage: node scripts/bos-sayfa-kontrol.mjs [output folder]
// A Vite dev server on its own port with the sample library (?demo). The script makes a PDF of 3 A4 pages ("Sayfa 1–3")
// in a temporary folder (not in the repo); the topic "Değişkenler ve veri tipleri" gets it as its ozet.pdf (page.route).
// window.defterBosSayfaSahte (dev only, src/okuma/bosSayfaSahte.ts) gives the open file a writable copy in memory,
// with a kitap.json (ribbons on pages 2 and 3) and a reading record (page 2): the real code runs (bosSayfa.ts,
// ekleVeYukle, the pen's queue, sayfaKaydir.ts), nothing goes to Google or Drive.
// Each size: book mode Önüne kareli, Arkasına çizgili, Önüne düz; PDF mode Arkasına düz, Önüne çizgili, Arkasına kareli;
// then pen on: Arkasına kareli, a stroke on the new blank page → Kaydet → "Bu sayfayı kaldır" (confirmed).
// Checks after each step: the page count, the blank pages, the new page on screen, the ribbons / reading record
// shifted, the stroke saved on the blank page and gone with it (the other pages' strokes stay). Exit code 1 if anything fails.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4189;
const URL = `http://localhost:${PORT}/?demo`;
const OUT = process.argv[2] ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\bos-sayfa-6.S';
const KONU = 'Unite-01-Temeller/Konu-01-Degiskenler';
const TOPIC = 'Değişkenler ve veri tipleri';
const SIZES = [[1180, 820], [820, 1180], [390, 844]];

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function testPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= 3; i++) {
    const p = doc.addPage([595.28, 841.89]);
    p.drawRectangle({ x: 1, y: 1, width: 593.28, height: 839.89, borderColor: rgb(0.2, 0.3, 0.6), borderWidth: 2 });
    p.drawText(`Sayfa ${i}`, { x: 220, y: 420, size: 40, font, color: rgb(0.1, 0.2, 0.5) });
  }
  return doc.save();
}

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

const KITAP_JSON = {
  surum: 2, baslik: 'Programlamaya giriş', bilinmeyen: { kalsin: true },
  kurdele: { konu: KONU, materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 3 },
  uniteler: [{ baslik: 'Temeller', konular: [{ baslik: TOPIC, klasor: KONU, durum: 'okunuyor', kurdeleler: { ozet: { dosya: 'ozet.pdf', sayfa: 2 } } }] }],
};
const OCR = {
  tur: 'defter-ocr', surum: 1, kaynak: { id: 'sahte-pdf', ad: 'ozet.pdf' },
  sayfalar: [{ sayfa: 2, parmakIzi: 'i:sayfa2', model: 'deneme', okunma: '2026-10-25T10:00:00.000Z', dondurme: 0, satirlar: [] }],
};

// What is in the fake Drive now (computed in the page with the app's own readers)
const ozet = (page) => page.evaluate(async () => {
  const d = await window.defterBosSayfaSahte();
  const [b, n] = await Promise.all([import('/src/defter/bosSayfa.ts'), import('/src/kalem/pdfNotlari.ts')]);
  const bilgi = await b.bosSayfaBilgisi(d.bytes);
  const s = await n.readDefterStrokes(d.bytes);
  const k = d.kitapJson;
  return {
    surum: d.surum, sayfa: bilgi.sayfa, bos: [...bilgi.bos.keys()],
    cizgi: [...s].filter(([, l]) => l.length).map(([i, l]) => [i, l.length]),
    kurdele: k.kurdele?.sayfa, konuKurdele: k.uniteler?.[0]?.konular?.[0]?.kurdeleler?.ozet?.sayfa, bilinmeyen: !!k.bilinmeyen?.kalsin,
    ocr: d.ocr?.sayfalar.map(x => x.sayfa) ?? [], log: [...d.log],
  };
});

// The page(s) on screen: the reader's list index and its PDF page (from the page number text)
const ekranda = (page) => page.evaluate(() => document.querySelector('#oPno')?.textContent ?? '');

async function balonAc(page) {
  await page.locator('#oSayfaEkle').click();
  await page.waitForSelector('#oSayfaEkleBalon:not([hidden]) [data-desen]:not([disabled])', { timeout: 15_000 });
}

async function bekleBitti(page, onceSurum) {
  await page.waitForFunction(async (s) => {
    const d = await window.defterBosSayfaSahte();
    return d.surum > s && !document.querySelector('#oSayfaEkle')?.classList.contains('calisiyor');
  }, onceSurum, { timeout: 30_000, polling: 200 });
  await wait(1500);
}

mkdirSync(OUT, { recursive: true });
const pdfDir = join(tmpdir(), 'bos-sayfa-6S');
mkdirSync(pdfDir, { recursive: true });
const pdfPath = join(pdfDir, 'bos-sayfa.pdf');
writeFileSync(pdfPath, await testPdf());
const pdfBytes = readFileSync(pdfPath);

const dev = await startDev();
const browser = await chromium.launch({ channel: 'chrome' });
const rows = [];
let bad = 0;
const kontrol = (ad, adim, kosul, not = '') => { rows.push([ad, adim, kosul, not]); if (!kosul) bad++; };

try {
  for (const [w, h] of SIZES) {
    const ad = `${w}×${h}`, dosya = `${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', e => { bad++; console.error(`${ad} sayfa hatası:`, e.message); });
    page.on('dialog', d => { void d.accept(); });
    await page.route('**/ornek/index.json', async route => {
      const json = await (await route.fetch()).json();
      json.klasorler['programlamaya-giris'][KONU] = { 'ozet.pdf': 'demo/__bos.pdf' };
      await route.fulfill({ json });
    });
    await page.route('**/ornek/kitaplar/programlamaya-giris/kitap.json', async route => {
      const json = await (await route.fetch()).json();
      await route.fulfill({ json: { ...json, kurdele: null } });
    });
    await page.route('**/demo/__bos.pdf', route => route.fulfill({ contentType: 'application/pdf', body: pdfBytes }));
    await page.goto(URL);
    await page.waitForFunction(() => document.querySelector('#loading')?.hidden, null, { timeout: 30_000 });
    await wait(1500);
    await page.evaluate(() => { try { localStorage.setItem('defter.okumaModu', 'kitap'); } catch { /* */ } });

    await page.keyboard.press('/');
    await page.locator('#aramaPaneli .ap-kutu').fill('programlamaya');
    await page.waitForFunction(() => document.querySelectorAll('#aramaPaneli .ap-satir').length > 0, null, { timeout: 10_000 });
    await page.locator('#aramaPaneli .ap-satir').first().click();
    await page.waitForSelector('#reader.show', { timeout: 15_000 });
    await wait(2500);
    if (!await page.locator('#reader [data-t]', { hasText: TOPIC }).first().isVisible() && await page.locator('#next').isEnabled()) { await page.click('#next'); await wait(700); }
    await page.locator('#reader [data-t]', { hasText: TOPIC }).first().click();
    await page.waitForSelector('#okuyucu.show #oKitap:not([hidden]) #oSpread .o-page', { timeout: 15_000 });
    await wait(2000);

    // the fake writable Drive for the file on screen
    await page.evaluate(([k, o]) => window.defterBosSayfaSahte({ kitapJson: k, ocr: o }), [KITAP_JSON, OCR]);
    await wait(2000);
    kontrol(ad, 'Sayfa ekle düğmesi görünür', await page.locator('#oSayfaEkle').isVisible());

    // ---- book mode ----
    await balonAc(page);
    await page.screenshot({ path: join(OUT, `${dosya}-01-balon-kitap.png`) });
    let s0 = await ozet(page);
    await page.locator('#oSayfaEkleBalon [data-yon="once"]').click();
    await page.locator('#oSayfaEkleBalon [data-desen="kareli"]').click();
    await bekleBitti(page, s0.surum);
    let s = await ozet(page);
    kontrol(ad, 'kitap · önüne kareli: sayfa 4, boş sayfa 1. sırada', s.sayfa === 4 && s.bos.join() === '0', JSON.stringify({ sayfa: s.sayfa, bos: s.bos }));
    kontrol(ad, 'kurdeleler +1 (kitap 3→4, konu 2→3), bilinmeyen alan kaldı', s.kurdele === 4 && s.konuKurdele === 3 && s.bilinmeyen, `${s.kurdele}, ${s.konuKurdele}`);
    kontrol(ad, 'okuma kaydı +1 (2→3)', s.ocr.join() === '3', s.ocr.join());
    kontrol(ad, 'okuyucu yeni sayfada (1)', (await ekranda(page)).startsWith('1'), await ekranda(page));
    await page.screenshot({ path: join(OUT, `${dosya}-02-kitap-onune-kareli.png`) });

    await balonAc(page);
    s0 = s;
    await page.locator('#oSayfaEkleBalon [data-yon="sonra"]').click();
    await page.locator('#oSayfaEkleBalon [data-desen="cizgili"]').click();
    await bekleBitti(page, s0.surum);
    s = await ozet(page);
    const single = await page.evaluate(() => document.querySelector('#oSpread').classList.contains('single'));
    // spread 1–2 (two pages: after the RIGHT page = index 2), one page: after page 1 (index 1)
    const beklenen = single ? '0,1' : '0,2';
    kontrol(ad, `kitap · arkasına çizgili: boş sayfalar ${beklenen}`, s.sayfa === 5 && s.bos.join() === beklenen, JSON.stringify(s.bos));
    await page.screenshot({ path: join(OUT, `${dosya}-03-kitap-arkasina-cizgili.png`) });

    await balonAc(page);
    s0 = s;
    await page.locator('#oSayfaEkleBalon [data-yon="once"]').click();
    await page.locator('#oSayfaEkleBalon [data-desen="duz"]').click();
    await bekleBitti(page, s0.surum);
    s = await ozet(page);
    kontrol(ad, 'kitap · önüne düz: 6 sayfa, 3 boş sayfa', s.sayfa === 6 && s.bos.length === 3, JSON.stringify(s.bos));
    await page.screenshot({ path: join(OUT, `${dosya}-04-kitap-onune-duz.png`) });

    // ---- PDF mode ----
    await page.locator('#oMode [data-m="pdf"]').click();
    await wait(1500);
    for (const [yon, desen, n] of [['sonra', 'duz', 5], ['once', 'cizgili', 6], ['sonra', 'kareli', 7]]) {
      await balonAc(page);
      if (n === 5) await page.screenshot({ path: join(OUT, `${dosya}-05-balon-pdf.png`) });
      s0 = s;
      await page.locator(`#oSayfaEkleBalon [data-yon="${yon}"]`).click();
      await page.locator(`#oSayfaEkleBalon [data-desen="${desen}"]`).click();
      await bekleBitti(page, s0.surum);
      s = await ozet(page);
      kontrol(ad, `pdf · ${yon === 'once' ? 'önüne' : 'arkasına'} ${desen}: ${s0.sayfa + 1} sayfa`, s.sayfa === s0.sayfa + 1 && s.bos.length === s0.bos.length + 1, `${s.sayfa}, boş ${s.bos.join()}`);
      kontrol(ad, `pdf · ${desen}: okuyucu yeni (boş) sayfada`, s.bos.includes(Number((await ekranda(page)).split(' ')[0]) - 1), await ekranda(page));
      await page.screenshot({ path: join(OUT, `${dosya}-0${n + 1}-pdf-${yon}-${desen}.png`) });
    }
    kontrol(ad, 'kurdele ve okuma kaydı hep birlikte kaydı (kullanıcının 2. ve 3. sayfası)', s.kurdele !== undefined && s.ocr.length === 1, `kurdele ${s.kurdele}, konu ${s.konuKurdele}, ocr ${s.ocr}`);

    // ---- pen on: add, write, save, remove ----
    await page.locator('#oPenBtn').click();
    await wait(1200);
    await balonAc(page);
    s0 = s;
    await page.locator('#oSayfaEkleBalon [data-yon="sonra"]').click();
    await page.locator('#oSayfaEkleBalon [data-desen="kareli"]').click();
    await bekleBitti(page, s0.surum);
    s = await ozet(page);
    kontrol(ad, 'kalem açıkken arkasına kareli', s.sayfa === s0.sayfa + 1, `${s.sayfa}`);
    const yeniIndeks = Number((await ekranda(page)).split(' ')[0]) - 1;
    kontrol(ad, 'kalem açıkken: ekrandaki sayfa boş sayfa', s.bos.includes(yeniIndeks), `${yeniIndeks} / ${s.bos}`);
    await page.locator('#oTools [data-arac="kalem"]').click().catch(() => {});
    const kutu = await page.evaluate(() => {
      const s = document.querySelector('#oScroll'), st = s.getBoundingClientRect();
      for (const b of document.querySelectorAll('#oPages .o-page')) {
        const r = b.getBoundingClientRect();
        if (r.top < st.top + st.height / 3 && r.bottom > st.top + st.height / 3) return { x: r.left, y: Math.max(r.top, st.top), w: r.width, h: Math.min(r.bottom, st.bottom) - Math.max(r.top, st.top) };
      }
      return null;
    });
    if (kutu) {
      const x0 = kutu.x + kutu.w * 0.25, y0 = kutu.y + kutu.h * 0.4;
      await page.mouse.move(x0, y0); await page.mouse.down();
      for (let i = 1; i <= 14; i++) { await page.mouse.move(x0 + i * kutu.w * 0.03, y0 + Math.sin(i / 2) * 12); await wait(16); }
      await page.mouse.up();
      await wait(600);
    }
    await page.screenshot({ path: join(OUT, `${dosya}-09-kalem-bos-sayfada.png`) });
    s0 = s;
    await page.locator('#oTools .o-kaydet').click();
    await page.waitForFunction(async (v) => (await window.defterBosSayfaSahte()).surum > v, s0.surum, { timeout: 20_000, polling: 200 });
    await wait(1200);
    s = await ozet(page);
    kontrol(ad, 'çizgi boş sayfaya kaydedildi', s.cizgi.some(([i]) => i === yeniIndeks), JSON.stringify(s.cizgi));

    await balonAc(page);
    const kaldirVar = await page.locator('#oSayfaEkleBalon .o-sekle-kaldir').count();
    kontrol(ad, '"Bu sayfayı kaldır" boş sayfada görünür', kaldirVar === 1);
    await page.screenshot({ path: join(OUT, `${dosya}-10-balon-kaldir.png`) });
    s0 = s;
    const kurdeleOnce = s.kurdele, ocrOnce = s.ocr[0];
    await page.locator('#oSayfaEkleBalon .o-sekle-kaldir').first().click();
    await bekleBitti(page, s0.surum);
    s = await ozet(page);
    kontrol(ad, 'kaldırıldı: bir sayfa eksik, o boş sayfa gitti, çizgisi ile', s.sayfa === s0.sayfa - 1 && s.bos.length === s0.bos.length - 1 && !s.cizgi.length, `${s.sayfa}, çizgi ${JSON.stringify(s.cizgi)}`);
    kontrol(ad, 'kaldırınca kurdele / okuma kaydı geri kaydı (sonraysa −1)', (kurdeleOnce - 1 > yeniIndeks ? s.kurdele === kurdeleOnce - 1 : s.kurdele === kurdeleOnce) && (ocrOnce - 1 > yeniIndeks ? s.ocr[0] === ocrOnce - 1 : s.ocr[0] === ocrOnce), `kurdele ${kurdeleOnce}→${s.kurdele}, ocr ${ocrOnce}→${s.ocr[0]}`);
    await page.screenshot({ path: join(OUT, `${dosya}-11-kaldirildi.png`) });

    // the user's own page: no "kaldır"
    await page.locator('#oPenBtn').click(); await wait(500);
    await page.evaluate(() => { const sl = document.querySelector('#oSlider'); sl.value = String(Number(sl.max)); sl.dispatchEvent(new Event('input', { bubbles: true })); sl.dispatchEvent(new Event('change', { bubbles: true })); });
    await wait(1200);
    const sonBos = s.bos.includes(s.sayfa - 1);
    await balonAc(page);
    kontrol(ad, 'son sayfada kaldır düğmesi sadece boş sayfaysa', (await page.locator('#oSayfaEkleBalon .o-sekle-kaldir').count()) === (sonBos ? 1 : 0));
    await page.keyboard.press('Escape');
    // the bar on one row, nothing outside the screen
    const tasma = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    kontrol(ad, 'yatay taşma yok', tasma <= 0, `${tasma}px`);
    kontrol(ad, 'işlem günlüğü (pdf, kitap.json, ocr.json)', s.log.includes('kitap.json') && s.log.includes('ocr.json'), s.log.join(' · '));
    await ctx.close();
  }
} finally {
  await browser.close();
  dev.kill();
}

console.log('ölçü | adım | sonuç | not');
for (const [ad, adim, ok, not] of rows) console.log(`${ad} | ${adim} | ${ok ? 'geçti' : 'KALDI'} | ${not}`);
console.log(`\nTest PDF'i: ${pdfPath}`);
console.log(`Ekran görüntüleri: ${OUT}`);
console.log(bad ? `\n${bad} sorun var.` : '\nHepsi tamam.');
process.exit(bad ? 1 : 0);
