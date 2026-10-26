// Task 6.S-4: blank note pages before / after the page on screen, and their removal, without signing in and without
// Drive. Usage: node scripts/bos-sayfa-kontrol.mjs [output folder]
// A Vite dev server on its own port with the sample library (?demo). The script makes a PDF of 3 A4 pages ("Sayfa 1–3")
// in a temporary folder (not in the repo); the topic "Değişkenler ve veri tipleri" gets it as its ozet.pdf (page.route).
// window.defterBosSayfaSahte (dev only, src/okuma/bosSayfaSahte.ts) gives the open file a writable copy in memory,
// with a kitap.json (ribbons on pages 2 and 3) and a reading record (page 2): the real code runs (bosSayfa.ts,
// ekleVeYukle, the pen's queue, sayfaKaydir.ts), nothing goes to Google or Drive.
// Each size: book mode Önüne kareli, Arkasına çizgili, Önüne düz; PDF mode Arkasına düz, Önüne çizgili, Arkasına kareli;
// then pen on: Arkasına kareli, a stroke on the new blank page → Kaydet → "Bu sayfayı sil" (6.S-4d, confirmed).
// Checks after each step: the page count, the blank pages, the new page on screen, the ribbons / reading record
// shifted, the stroke saved on the blank page and gone with it (the other pages' strokes stay). Exit code 1 if anything fails.
// Task 6.S-4b (1180×820, two pages, a new reader): the page read stays on screen, the blank page beside it, in the four
// cases (left / right × Önüne / Arkasına), with turns on a shifted spread and the left page deleted (Sol + "Bu sayfayı
// sil"); screenshots with "-4b-".
// Task 6.S-4c (1180×820 and 820×1180): a PDF with a 16:9 slide, an upright A4 page, an A4 landscape page whose
// MediaBox is not at (0,0) and an upright page turned 90 (seen landscape). The blank page beside the slide is A4
// upright; "Deftere yapıştır" (kareli) on the slide → a stroke in its top band (pen, PDF mode) → Kaydet → drawn again
// (mode change) at the same place → "Dosyadaki tüm yatay sayfalar" (the upright pages stay) → "Deftere yapıştırmayı
// geri al" on the slide (the dialog about the band's writing is accepted) → its boxes back, the band stroke gone.
// Screenshots with "-4c-". `--4c`: only this part.
// Task 6.S-4d (1180×820): a PDF of 5 A4 pages with a pen stroke on page 3, a reading record for pages 3 and 4 (their
// real fingerprints), ribbons on pages 3 (topic) and 5 (book). Book mode: the left page 3 of the spread 3–4 deleted →
// 4 pages, ribbons 3→2 and 5→4, reading entry of 3 in `silinenler`, 4→3, the right page stays right (2–3); "Geri al"
// in the toast → 5 pages, the stroke back on page 3 with its id, the reading record as it was (JSON), ribbons 3 and 5,
// spread 3–4. PDF mode: page 3 deleted → page 2 on screen; "Son silineni geri getir" in the popover → all as before.
// A one-page PDF: "Bu sayfayı sil" grey, "Son sayfa silinemez". Screenshots with "-4d-". `--4d`: only this part.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4189;
const URL = `http://localhost:${PORT}/?demo`;
const OUT = process.argv.slice(2).find(a => !a.startsWith('--')) ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\bos-sayfa-6.S';
const KONU = 'Unite-01-Temeller/Konu-01-Degiskenler';
const TOPIC = 'Değişkenler ve veri tipleri';
const SIZES = [[1180, 820], [820, 1180], [390, 844]];

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function testPdf(n = 3) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= n; i++) {
    const p = doc.addPage([595.28, 841.89]);
    p.drawRectangle({ x: 1, y: 1, width: 593.28, height: 839.89, borderColor: rgb(0.2, 0.3, 0.6), borderWidth: 2 });
    p.drawText(`Sayfa ${i}`, { x: 220, y: 420, size: 40, font, color: rgb(0.1, 0.2, 0.5) });
  }
  return doc.save();
}

// 6.S-4c: slides and offsets
async function testPdf4c() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const yaz = (p, t, x, y, w, h) => {
    p.drawRectangle({ x: x + 2, y: y + 2, width: w - 4, height: h - 4, color: rgb(0.93, 0.95, 1), borderColor: rgb(0.2, 0.3, 0.6), borderWidth: 3 });
    p.drawText(t, { x: x + w * 0.2, y: y + h * 0.45, size: 40, font, color: rgb(0.1, 0.2, 0.5) });
  };
  yaz(doc.addPage([960, 540]), 'Slayt 1 (16:9)', 0, 0, 960, 540);
  yaz(doc.addPage([595.28, 841.89]), 'Dikey A4', 0, 0, 595.28, 841.89);
  const p3 = doc.addPage([891.89, 625.28]);
  p3.setMediaBox(50, 30, 841.89, 595.28);
  yaz(p3, 'Kaymis yatay', 50, 30, 841.89, 595.28);
  const p4 = doc.addPage([595.28, 841.89]);
  p4.drawRectangle({ x: 4, y: 4, width: 587.28, height: 833.89, color: rgb(1, 0.95, 0.9), borderColor: rgb(0.6, 0.3, 0.2), borderWidth: 3 });
  p4.drawText('Dondurulmus', { x: 300, y: 250, size: 40, font, color: rgb(0.5, 0.2, 0.1), rotate: degrees(90) });
  p4.setRotation(degrees(90));
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

// A new browser page with the reader open on the test PDF (book mode) and the fake Drive
async function okuyucuAc(w, h, ad, govde = pdfBytes, sahte = (page) => page.evaluate(([k, o]) => window.defterBosSayfaSahte({ kitapJson: k, ocr: o }), [KITAP_JSON, OCR])) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => { bad++; console.error(`${ad} sayfa hatası:`, e.message); });
  page.on('dialog', d => { diyaloglar.push(d.message()); void d.accept(); });
  await page.route('**/ornek/index.json', async route => {
    const json = await (await route.fetch()).json();
    json.klasorler['programlamaya-giris'][KONU] = { 'ozet.pdf': 'demo/__bos.pdf' };
    await route.fulfill({ json });
  });
  await page.route('**/ornek/kitaplar/programlamaya-giris/kitap.json', async route => {
    const json = await (await route.fetch()).json();
    await route.fulfill({ json: { ...json, kurdele: null } });
  });
  await page.route('**/demo/__bos.pdf', route => route.fulfill({ contentType: 'application/pdf', body: govde }));
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
  await sahte(page);
  await wait(2000);
  kontrol(ad, 'Sayfa ekle düğmesi görünür', await page.locator('#oSayfaEkle').isVisible());
  return { ctx, page };
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
const diyaloglar = [];
const sadece4c = process.argv.includes('--4c');
const sadece4d = process.argv.includes('--4d');
const pdf4cPath = join(pdfDir, 'yapistir-4c.pdf');
writeFileSync(pdf4cPath, await testPdf4c());
const pdf4c = readFileSync(pdf4cPath);

// 6.S-4c: the fake Drive's PDF in detail: visible sizes, pasted pages, strokes (lowest / highest y of their points)
const ozet4c = (page) => page.evaluate(async () => {
  const d = await window.defterBosSayfaSahte();
  const [b, n] = await Promise.all([import('/src/defter/bosSayfa.ts'), import('/src/kalem/pdfNotlari.ts')]);
  const L = await n.pdfLib();
  const doc = await L.PDFDocument.load(d.bytes);
  const bilgi = await b.bosSayfaBilgisi(d.bytes);
  const s = await n.readDefterStrokes(d.bytes);
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    surum: d.surum, sayfa: doc.getPageCount(),
    olcu: doc.getPages().map(p => { const k = b.gorunurKutu(p); return [r2(k.w), r2(k.h)]; }),
    mediaBox: doc.getPages().map(p => { const m = p.getMediaBox(); return [m.x, m.y, m.width, m.height].map(r2); }),
    yapistirilmis: [...bilgi.yapistirilmis.keys()], yatay: [...bilgi.yatay], bos: [...bilgi.bos.keys()],
    cizgi: [...s].filter(([, l]) => l.length).map(([i, l]) => [i, l.map(x => { const y = x.noktalar.filter((_, k) => k % 2); return [x.id, Math.min(...y), Math.max(...y)]; })]),
  };
});

const sayfayaGit = async (page, no) => {
  await page.evaluate((v) => { const sl = document.querySelector('#oSlider'); sl.value = String(v); sl.dispatchEvent(new Event('input', { bubbles: true })); sl.dispatchEvent(new Event('change', { bubbles: true })); }, no);
  await wait(1200);
};

// 6.S-4d: the test PDF with a Defter stroke on page 3 (written by the app's own writer, in a page of the dev server)
async function kalemliPdf(bytes) {
  const page = await browser.newPage();
  await page.goto(URL);
  const out = await page.evaluate(async (arr) => {
    const m = await import('/src/kalem/pdfNotlari.ts');
    const stroke = { id: 'orta', arac: 'kalem', renk: '#c0392b', kalinlik: 3, opaklik: 1, noktalar: [150, 500, 250, 530, 350, 480, 450, 540] };
    return [...await m.writeDefterStrokes(new Uint8Array(arr), new Map([[2, [stroke]]]))];
  }, [...bytes]);
  await page.close();
  return Buffer.from(out);
}

// 6.S-4d: the fake Drive with ribbons on pages 3 (topic) and 5 (book), a reading record for pages 3 and 4 with
// the PDF's real fingerprints
const sahte4d = (page) => page.evaluate(async ([konu, topic]) => {
  const b = new Uint8Array(await (await fetch('/demo/__bos.pdf')).arrayBuffer());
  const { sayfaParmakIzleri } = await import('/src/ocr/kayit/parmakIzi.ts');
  const iz = await sayfaParmakIzleri(b);
  const sayfa = (n) => ({ sayfa: n, parmakIzi: iz[n - 1], model: 'deneme', okunma: '2026-10-26T10:00:00.000Z', dondurme: 0,
    satirlar: [{ girinti: 0, parcalar: [{ metin: `Okunan sayfa ${n}`, renk: 'siyah' }] }] });
  const kitapJson = {
    surum: 2, baslik: 'Programlamaya giriş', bilinmeyen: { kalsin: true },
    kurdele: { konu, materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 5 },
    uniteler: [{ baslik: 'Temeller', konular: [{ baslik: topic, klasor: konu, durum: 'okunuyor', kurdeleler: { ozet: { dosya: 'ozet.pdf', sayfa: 3 } } }] }],
  };
  return window.defterBosSayfaSahte({ kitapJson, ocr: { tur: 'defter-ocr', surum: 1, kaynak: { id: 'sahte-pdf', ad: 'ozet.pdf' }, sayfalar: [sayfa(3), sayfa(4)] } });
}, [KONU, TOPIC]);

// 6.S-4d: the fake Drive in detail: strokes by id, the reading record as JSON, the page fingerprints
const ozet4d = (page) => page.evaluate(async () => {
  const d = await window.defterBosSayfaSahte();
  const [n, z] = await Promise.all([import('/src/kalem/pdfNotlari.ts'), import('/src/ocr/kayit/parmakIzi.ts')]);
  const s = await n.readDefterStrokes(d.bytes);
  const izler = await z.sayfaParmakIzleri(d.bytes);
  const k = d.kitapJson;
  return {
    surum: d.surum, sayfa: izler.length, izler,
    cizgi: [...s].filter(([, l]) => l.length).map(([i, l]) => [i, l.map(x => x.id)]),
    kurdele: k.kurdele?.sayfa, konuKurdele: k.uniteler?.[0]?.konular?.[0]?.kurdeleler?.ozet?.sayfa,
    ocr: d.ocr?.sayfalar.map(x => x.sayfa) ?? [], silinenler: (d.ocr?.silinenler ?? []).map(x => x.sayfa.sayfa), ocrJson: JSON.stringify(d.ocr),
  };
});

try {
  for (const [w, h] of sadece4c || sadece4d ? [] : SIZES) {
    const ad = `${w}×${h}`, dosya = `${w}x${h}`;
    const { ctx, page } = await okuyucuAc(w, h, ad);

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
    // 6.S-4b: two pages (B | 1.) after the page read (the left one = index 0), one page: after page 1 (the blank, index 0)
    const beklenen = '0,1';
    kontrol(ad, `kitap · arkasına çizgili (${single ? 'tek' : 'iki'} sayfa): boş sayfalar ${beklenen}`, s.sayfa === 5 && s.bos.join() === beklenen, JSON.stringify(s.bos));
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
    const silVar = await page.locator('#oSayfaEkleBalon [data-sil]:not([disabled])').count();
    kontrol(ad, '"Bu sayfayı sil" boş sayfada görünür', silVar === 1);
    await page.screenshot({ path: join(OUT, `${dosya}-10-balon-sil.png`) });
    s0 = s;
    const kurdeleOnce = s.kurdele, ocrOnce = s.ocr[0];
    const d0 = diyaloglar.length;
    await page.locator('#oSayfaEkleBalon [data-sil]').click();
    await bekleBitti(page, s0.surum);
    s = await ozet(page);
    kontrol(ad, 'onay: "s. N silinecek…"', diyaloglar.slice(d0).some(m => /^s\. \d+ silinecek\./.test(m)), diyaloglar.slice(d0).join(' | '));
    kontrol(ad, 'silindi: bir sayfa eksik, o boş sayfa gitti, çizgisi ile', s.sayfa === s0.sayfa - 1 && s.bos.length === s0.bos.length - 1 && !s.cizgi.length, `${s.sayfa}, çizgi ${JSON.stringify(s.cizgi)}`);
    kontrol(ad, 'silince kurdele / okuma kaydı geri kaydı (sonraysa −1)', (kurdeleOnce - 1 > yeniIndeks ? s.kurdele === kurdeleOnce - 1 : s.kurdele === kurdeleOnce) && (ocrOnce - 1 > yeniIndeks ? s.ocr[0] === ocrOnce - 1 : s.ocr[0] === ocrOnce), `kurdele ${kurdeleOnce}→${s.kurdele}, ocr ${ocrOnce}→${s.ocr[0]}`);
    await page.screenshot({ path: join(OUT, `${dosya}-11-silindi.png`) });

    // 6.S-4d: the user's own page can go too
    await page.locator('#oPenBtn').click(); await wait(500);
    await page.evaluate(() => { const sl = document.querySelector('#oSlider'); sl.value = String(Number(sl.max)); sl.dispatchEvent(new Event('input', { bubbles: true })); sl.dispatchEvent(new Event('change', { bubbles: true })); });
    await wait(1200);
    const sonBos = s.bos.includes(s.sayfa - 1);
    await balonAc(page);
    kontrol(ad, `son sayfada (${sonBos ? 'boş' : 'kullanıcının'}) "Bu sayfayı sil" var`, (await page.locator('#oSayfaEkleBalon [data-sil]:not([disabled])').count()) === 1);
    await page.keyboard.press('Escape');
    // the bar on one row, nothing outside the screen
    const tasma = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    kontrol(ad, 'yatay taşma yok', tasma <= 0, `${tasma}px`);
    kontrol(ad, 'işlem günlüğü (pdf, kitap.json, ocr.json)', s.log.includes('kitap.json') && s.log.includes('ocr.json'), s.log.join(' · '));
    await ctx.close();
  }

  // ---- 6.S-4b: the page read stays on screen (two pages) ----
  if (!sadece4c && !sadece4d) {
    const [w, h] = SIZES[0], ad = `${w}×${h} 4b`, dosya = `${w}x${h}-4b`;
    const { ctx, page } = await okuyucuAc(w, h, ad);
    // tap the middle of the left / right page (not its outer edge: that turns the page)
    const dokun = async (taraf) => {
      const r = await page.locator('#oSpread').boundingBox();
      await page.mouse.click(r.x + r.width * (taraf === 'sag' ? 0.7 : 0.3), r.y + r.height * 0.5);
      await wait(300);
    };
    const pno = () => ekranda(page);
    let s = await ozet(page), n = 0;
    // one case: the side read, the direction; expected: the spread's first page index and the blank page's index
    const durum = async (adim, taraf, yon, bas, bos, etiket) => {
      const once = await pno();
      await dokun(taraf);
      await balonAc(page);
      const secili = await page.locator('#oSayfaEkleBalon [data-taraf][aria-pressed="true"]').getAttribute('data-taraf');
      kontrol(ad, `${adim}: dokunulan taraf balonda seçili (${taraf})`, secili === taraf, `${secili}`);
      if (adim === 'L arkasına') await page.screenshot({ path: join(OUT, `${dosya}-00-balon-taraf.png`) });
      const s0 = s;
      await page.locator(`#oSayfaEkleBalon [data-yon="${yon}"]`).click();
      await page.locator('#oSayfaEkleBalon [data-desen="kareli"]').click();
      await bekleBitti(page, s0.surum);
      s = await ozet(page);
      const beklenen = `${bas + 1}–${bas + 2} / ${s.sayfa}`, simdi = await pno();
      kontrol(ad, `${adim}: ${once} → ekranda ${etiket} (${beklenen})`, simdi === beklenen && s.bos.includes(bos) && s.sayfa === s0.sayfa + 1, `${simdi}, boş ${s.bos.join()}`);
      await page.screenshot({ path: join(OUT, `${dosya}-0${++n}-${adim.replace(/ /g, '-').replace('ı', 'i')}.png`) });
    };
    kontrol(ad, 'başta 1–2', (await pno()) === '1–2 / 3', await pno());
    // (1 | 2) → L Arkasına → (1 | B)
    await durum('L arkasına', 'sol', 'sonra', 0, 1, 'L | B');
    // (1 | B) → R Önüne (R = the blank index 1) → (B | R): the spread starts at index 1 (ofset 1)
    await durum('R önüne', 'sag', 'once', 1, 1, 'B | R');
    // turns keep the ofset: forward (4–5), back (2–3), back (only page 1, empty paper on the left), forward (2–3)
    const ofsetKaldi = [];
    for (const [tus, bek] of [['ArrowRight', '4–5 / 5'], ['ArrowLeft', '2–3 / 5'], ['ArrowLeft', '1 / 5'], ['ArrowRight', '2–3 / 5']]) {
      await page.keyboard.press(tus); await wait(700);
      ofsetKaldi.push(`${await pno()}${(await pno()) === bek ? '' : ' ≠ ' + bek}`);
      if (bek === '1 / 5') await page.screenshot({ path: join(OUT, `${dosya}-03-bos-kagit-solda.png`) });
    }
    kontrol(ad, 'çevirme ofseti korur (4–5, 2–3, 1, 2–3)', ofsetKaldi.every(x => !x.includes('≠')), ofsetKaldi.join(' · '));
    n = 3;
    // (2 | 3) indexes 1, 2 → R Arkasına (R = index 2) → (R | B): starts at 2 (ofset 0)
    await durum('R arkasına', 'sag', 'sonra', 2, 3, 'R | B');
    // (3 | 4) indexes 2, 3 → L Önüne (L = index 2) → (B | L): starts at 2
    await durum('L önüne', 'sol', 'once', 2, 2, 'B | L');
    // the slider keeps the ofset too: page 1 → spread 1–2
    await page.evaluate(() => { const sl = document.querySelector('#oSlider'); sl.value = '1'; sl.dispatchEvent(new Event('input', { bubbles: true })); sl.dispatchEvent(new Event('change', { bubbles: true })); });
    await wait(900);
    kontrol(ad, 'kaydırıcı: sayfa 1 → 1–2 (ofset 0)', (await pno()) === '1–2 / 7', await pno());
    // delete: spread (3 | 4) = indexes 2, 3 → Sol + "Bu sayfayı sil" → the right page (index 3, now 2) stays right: (2 | 3)
    await page.keyboard.press('ArrowRight'); await wait(700);
    s = await ozet(page);
    const sol = await pno();
    await balonAc(page);
    await page.locator('#oSayfaEkleBalon [data-taraf="sol"]').click();
    const silDugmesi = page.locator('#oSayfaEkleBalon [data-sil]:not([disabled])');
    kontrol(ad, `sil: ${sol} → Sol seçili, "Bu sayfayı sil" var`, (await silDugmesi.count()) === 1);
    const s0 = s;
    await silDugmesi.click();
    await bekleBitti(page, s0.surum);
    s = await ozet(page);
    kontrol(ad, `sil soldaki: sağdaki ekranda sağda kaldı (${sol} → 2–3 / 6)`, (await pno()) === '2–3 / 6' && s.sayfa === 6, `${await pno()}, boş ${s.bos.join()}`);
    await page.screenshot({ path: join(OUT, `${dosya}-06-sil-soldaki.png`) });
    // PDF mode and back: the ofset is gone (spreads 0–1, 2–3, …)
    await page.locator('#oMode [data-m="pdf"]').click(); await wait(900);
    await page.locator('#oMode [data-m="kitap"]').click(); await wait(1200);
    const geri = await pno();
    kontrol(ad, 'PDF modu → kitap: ofset 0 (çift tek sayıyla başlar)', /^(1|3|5)–/.test(geri), geri);
    await ctx.close();
  }
  // ---- 6.S-4c: a blank page beside a slide is upright; "Deftere yapıştır" ----
  for (const [w, h] of sadece4d ? [] : [SIZES[0], SIZES[1]]) {
    const ad = `${w}×${h} 4c`, dosya = `${w}x${h}-4c`;
    const { ctx, page } = await okuyucuAc(w, h, ad, pdf4c);
    const solSec = async () => { const t = page.locator('#oSayfaEkleBalon [data-taraf="sol"]'); if (await t.count()) await t.click(); };
    let s = await ozet4c(page);
    kontrol(ad, 'başta: 4 sayfa, yataylar 0, 2, 3 (3: Rotate 90)', s.sayfa === 4 && s.yatay.join() === '0,2,3', JSON.stringify(s.olcu));
    await sayfayaGit(page, 1);
    await balonAc(page);
    await solSec();
    kontrol(ad, 'slaytta balonda "Deftere yapıştır" var', await page.locator('#oSayfaEkleBalon .o-sekle-yapistir').isVisible());
    await page.screenshot({ path: join(OUT, `${dosya}-01-balon-slayt.png`) });
    // (a) a blank page after the slide: A4 upright
    let s0 = s;
    await page.locator('#oSayfaEkleBalon [data-yon="sonra"]').click();
    await page.locator('#oSayfaEkleBalon [data-desen="cizgili"]').click();
    await bekleBitti(page, s0.surum);
    s = await ozet4c(page);
    kontrol(ad, 'slaytın arkasına boş sayfa: A4 dikey (595.28 × 841.89)', s.sayfa === 5 && s.bos.join() === '1' && s.olcu[1].join() === '595.28,841.89', JSON.stringify(s.olcu[1]));
    await page.screenshot({ path: join(OUT, `${dosya}-02-bos-sayfa-dikey.png`) });

    // (b) paste the slide (kareli)
    await sayfayaGit(page, 1);
    await balonAc(page);
    await solSec();
    await page.locator('#oSayfaEkleBalon [data-ydesen="kareli"]').click();
    s0 = s;
    await page.locator('#oSayfaEkleBalon [data-yapistir="bu"]').click();
    await bekleBitti(page, s0.surum);
    s = await ozet4c(page);
    const [sw, sh] = s.olcu[0];
    kontrol(ad, 'yapıştır: sayfa sayısı aynı (5), slayt 960 × 960√2', s.sayfa === 5 && sw === 960 && Math.abs(sh - 960 * Math.SQRT2) < 0.01 && s.yapistirilmis.join() === '0', `${sw} × ${sh}, mediaBox ${s.mediaBox[0]}`);
    kontrol(ad, 'yapıştır: okuyucu aynı sayfada (1)', (await ekranda(page)).startsWith('1'), await ekranda(page));
    await page.screenshot({ path: join(OUT, `${dosya}-03-kitap-yapistirildi.png`) });

    // pen in PDF mode: a stroke in the slide's top band
    await page.locator('#oMode [data-m="pdf"]').click();
    await wait(1500);
    await sayfayaGit(page, 1);
    await page.locator('#oPenBtn').click();
    await wait(1200);
    await page.locator('#oTools [data-arac="kalem"]').click().catch(() => {});
    const r0 = await page.evaluate(() => { const r = document.querySelectorAll('#oPages .o-page')[0].getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const x0 = r0.x + r0.w * 0.2, y0 = r0.y + r0.h * 0.12;
    await page.mouse.move(x0, y0); await page.mouse.down();
    for (let i = 1; i <= 14; i++) { await page.mouse.move(x0 + i * r0.w * 0.03, y0 + Math.sin(i / 2) * 10); await wait(16); }
    await page.mouse.up();
    await wait(600);
    s0 = s;
    await page.locator('#oTools .o-kaydet').click();
    await page.waitForFunction(async (v) => (await window.defterBosSayfaSahte()).surum > v, s0.surum, { timeout: 20_000, polling: 200 });
    await wait(1200);
    s = await ozet4c(page);
    const bant = s.cizgi.find(([i]) => i === 0)?.[1] ?? [];
    kontrol(ad, 'bantta çizgi kaydedildi (y > 540, slaytın üstü)', bant.length === 1 && bant[0][1] > 540, JSON.stringify(bant));
    const yer = () => page.evaluate(() => {
      const p = document.querySelectorAll('#oPages .o-page')[0], r = p.getBoundingClientRect();
      const b = [...p.querySelectorAll('svg.o-cizim path')].map(x => x.getBoundingClientRect()).find(x => x.width > 0);
      return b ? [(b.left - r.left) / r.width, (b.top - r.top) / r.height].map(v => Math.round(v * 1000) / 1000) : null;
    });
    await page.locator('#oPenBtn').click(); await wait(800);
    const yerOnce = await yer();
    await page.screenshot({ path: join(OUT, `${dosya}-04-pdf-bantta-kalem.png`) });
    // drawn again from the file (book mode and back)
    await page.locator('#oMode [data-m="kitap"]').click(); await wait(1500);
    await page.screenshot({ path: join(OUT, `${dosya}-05-kitap-bantta-kalem.png`) });
    await page.locator('#oMode [data-m="pdf"]').click(); await wait(1500);
    await sayfayaGit(page, 1);
    const yerSonra = await yer();
    kontrol(ad, 'yeniden çizilince çizgi aynı yerde', !!yerOnce && !!yerSonra && Math.abs(yerOnce[0] - yerSonra[0]) < 0.01 && Math.abs(yerOnce[1] - yerSonra[1]) < 0.01, `${yerOnce} → ${yerSonra}`);

    // all landscape pages: the shifted one and the turned one; upright pages stay
    await sayfayaGit(page, 4);
    await balonAc(page);
    const hepsi = page.locator('#oSayfaEkleBalon [data-yapistir="hepsi"]');
    kontrol(ad, '"Dosyadaki tüm yatay sayfalar (2)"', (await hepsi.count()) === 1 && (await hepsi.textContent()).includes('(2)'), (await hepsi.count()) ? await hepsi.textContent() : 'yok');
    await page.screenshot({ path: join(OUT, `${dosya}-06-balon-pdf-hepsi.png`) });
    s0 = s;
    await hepsi.click();
    await bekleBitti(page, s0.surum);
    s = await ozet4c(page);
    kontrol(ad, 'tüm yataylar: 0, 3, 4 yapıştırılmış; dikey (2) ve boş (1) aynen', s.yapistirilmis.join() === '0,3,4' && s.olcu[1].join() === '595.28,841.89' && s.olcu[2].join() === '595.28,841.89', JSON.stringify(s.olcu));
    kontrol(ad, 'kaymış MediaBox (50,30) yukarı-aşağı büyüdü, x aynı', s.mediaBox[3][0] === 50 && s.mediaBox[3][2] === 841.89 && Math.abs(s.olcu[3][1] - 841.89 * Math.SQRT2) < 0.01, JSON.stringify(s.mediaBox[3]));
    kontrol(ad, 'Rotate 90: görünür oran √2', Math.abs(s.olcu[4][1] / s.olcu[4][0] - Math.SQRT2) < 0.001, JSON.stringify(s.olcu[4]));
    await page.screenshot({ path: join(OUT, `${dosya}-07-pdf-kaymis.png`) });
    await sayfayaGit(page, 5);
    await page.screenshot({ path: join(OUT, `${dosya}-08-pdf-dondurulmus.png`) });

    // undo on the slide: the band's stroke → the dialog → gone
    await sayfayaGit(page, 1);
    await balonAc(page);
    const geriAl = page.locator('#oSayfaEkleBalon [data-geri-al]');
    kontrol(ad, '"Deftere yapıştırmayı geri al" görünür', (await geriAl.count()) === 1);
    await page.screenshot({ path: join(OUT, `${dosya}-09-balon-geri-al.png`) });
    s0 = s;
    const d0 = diyaloglar.length;
    await geriAl.click();
    await bekleBitti(page, s0.surum);
    s = await ozet4c(page);
    kontrol(ad, 'geri al: onay soruldu (slaytın dışındaki kalem yazısı)', diyaloglar.slice(d0).some(m => m.includes('Slaytın dışındaki kalem yazısı')), diyaloglar.slice(d0).join(' | '));
    kontrol(ad, 'geri al: slayt 960 × 540, bant çizgisi gitti, diğerleri yapıştırılmış', s.olcu[0].join() === '960,540' && !s.cizgi.some(([i]) => i === 0) && s.yapistirilmis.join() === '3,4', `${s.olcu[0]}, ${JSON.stringify(s.cizgi)}`);
    await page.screenshot({ path: join(OUT, `${dosya}-10-geri-alindi.png`) });
    const tasma = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    kontrol(ad, 'yatay taşma yok', tasma <= 0, `${tasma}px`);
    await ctx.close();
  }

  // ---- 6.S-4d: any page deleted, and back with "Geri al" ----
  if (!sadece4c) {
    const [w, h] = SIZES[0], ad = `${w}×${h} 4d`, dosya = `${w}x${h}-4d`;
    const govde = await kalemliPdf(await testPdf(5));
    const { ctx, page } = await okuyucuAc(w, h, ad, govde, sahte4d);
    const pno = () => ekranda(page);
    let s = await ozet4d(page);
    const bas = s;
    kontrol(ad, 'başta: 5 sayfa, çizgi 3. sayfada, okuma 3 ve 4, kurdeleler 3 ve 5', s.sayfa === 5 && JSON.stringify(s.cizgi) === '[[2,["orta"]]]' && s.ocr.join() === '3,4' && s.konuKurdele === 3 && s.kurdele === 5, JSON.stringify({ c: s.cizgi, o: s.ocr, k: [s.konuKurdele, s.kurdele] }));
    const ayni = (x) => x.sayfa === 5 && JSON.stringify(x.cizgi) === JSON.stringify(bas.cizgi) && x.ocrJson === bas.ocrJson && x.konuKurdele === 3 && x.kurdele === 5 && x.izler.join() === bas.izler.join();

    // book mode: spread 3–4, delete the left page (3)
    await sayfayaGit(page, 3);
    kontrol(ad, 'kitap: çift 3–4', (await pno()) === '3–4 / 5', await pno());
    await balonAc(page);
    await page.locator('#oSayfaEkleBalon [data-taraf="sol"]').click();
    await page.screenshot({ path: join(OUT, `${dosya}-01-balon-sil.png`) });
    const d0 = diyaloglar.length;
    let s0 = s;
    await page.locator('#oSayfaEkleBalon [data-sil]').click();
    await bekleBitti(page, s0.surum);
    s = await ozet4d(page);
    kontrol(ad, 'onay metni (s. 3)', diyaloglar.slice(d0).includes('s. 3 silinecek. Sayfadaki kalem yazısı ve okunmuş el yazısı da gider. Geri al ile hemen geri getirebilirsin.'), diyaloglar.slice(d0).join(' | '));
    kontrol(ad, 'kitap · sil: 4 sayfa, çizgi gitti, 3. sayfanın izi yok', s.sayfa === 4 && !s.cizgi.length && !s.izler.includes(bas.izler[2]), `${s.sayfa}, ${JSON.stringify(s.cizgi)}`);
    kontrol(ad, 'kitap · sil: kurdeleler 3→2, 5→4', s.konuKurdele === 2 && s.kurdele === 4, `${s.konuKurdele}, ${s.kurdele}`);
    kontrol(ad, 'kitap · sil: okuma 4→3, 3. sayfanın kaydı silinenler alanında', s.ocr.join() === '3' && s.silinenler.join() === '3', `ocr ${s.ocr}, silinenler ${s.silinenler}`);
    kontrol(ad, 'kitap · sil: sağdaki sayfa (eski 4) sağda kaldı → 2–3 / 4', (await pno()) === '2–3 / 4', await pno());
    const toastGeri = page.locator('#toast.show button', { hasText: 'Geri al' });
    kontrol(ad, 'toast "Sayfa silindi · Geri al"', (await toastGeri.count()) === 1 && (await page.locator('#toast').textContent()).includes('Sayfa silindi'), await page.locator('#toast').textContent());
    await page.screenshot({ path: join(OUT, `${dosya}-02-kitap-silindi.png`) });
    s0 = s;
    await toastGeri.click();
    await bekleBitti(page, s0.surum);
    s = await ozet4d(page);
    kontrol(ad, 'kitap · geri al (toast): her şey eski haliyle (sayfa, çizgi id, okuma JSON, kurdeleler, izler)', ayni(s), JSON.stringify({ sayfa: s.sayfa, c: s.cizgi, o: s.ocr, sil: s.silinenler, k: [s.konuKurdele, s.kurdele] }));
    kontrol(ad, 'kitap · geri al: çift 3–4 (geri gelen solda)', (await pno()) === '3–4 / 5', await pno());
    await page.screenshot({ path: join(OUT, `${dosya}-03-kitap-geri-alindi.png`) });

    // PDF mode: page 3 deleted, back from the popover
    await page.locator('#oMode [data-m="pdf"]').click();
    await wait(1500);
    await sayfayaGit(page, 3);
    await balonAc(page);
    s0 = s;
    await page.locator('#oSayfaEkleBalon [data-sil]').click();
    await bekleBitti(page, s0.surum);
    s = await ozet4d(page);
    kontrol(ad, 'pdf · sil: 4 sayfa, kurdeleler 2 / 4, okuma 3, silinenler 3', s.sayfa === 4 && s.konuKurdele === 2 && s.kurdele === 4 && s.ocr.join() === '3' && s.silinenler.join() === '3', JSON.stringify({ o: s.ocr, k: [s.konuKurdele, s.kurdele] }));
    kontrol(ad, 'pdf · sil: okuyucu bir önceki sayfada (2)', (await pno()).startsWith('2'), await pno());
    await page.screenshot({ path: join(OUT, `${dosya}-04-pdf-silindi.png`) });
    await page.evaluate(() => document.querySelector('#toast')?.classList.remove('show'));
    await balonAc(page);
    const geriGetir = page.locator('#oSayfaEkleBalon [data-geri-getir]:not([disabled])');
    kontrol(ad, 'balonda "Son silineni geri getir"', (await geriGetir.count()) === 1);
    await page.screenshot({ path: join(OUT, `${dosya}-05-balon-geri-getir.png`) });
    s0 = s;
    await geriGetir.click();
    await bekleBitti(page, s0.surum);
    s = await ozet4d(page);
    kontrol(ad, 'pdf · geri getir: her şey eski haliyle', ayni(s), JSON.stringify({ sayfa: s.sayfa, c: s.cizgi, o: s.ocr, k: [s.konuKurdele, s.kurdele] }));
    kontrol(ad, 'pdf · geri getir: okuyucu geri gelen sayfada (3)', (await pno()).startsWith('3'), await pno());
    await balonAc(page);
    kontrol(ad, 'geri getirince "Son silineni geri getir" gitti', (await page.locator('#oSayfaEkleBalon [data-geri-getir]').count()) === 0);
    await page.screenshot({ path: join(OUT, `${dosya}-06-pdf-geri-getirildi.png`) });
    await page.keyboard.press('Escape');
    const tasma = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    kontrol(ad, 'yatay taşma yok', tasma <= 0, `${tasma}px`);
    await ctx.close();

    // a one-page PDF: the last page can't go
    const t = await okuyucuAc(w, h, `${ad} tek`, Buffer.from(await testPdf(1)));
    await t.page.locator('#oSayfaEkle').click();
    await t.page.waitForSelector('#oSayfaEkleBalon:not([hidden]) [data-sil]', { timeout: 15_000 });
    const silGri = await t.page.locator('#oSayfaEkleBalon [data-sil][disabled]').count();
    const not = await t.page.locator('#oSayfaEkleBalon .o-sekle-silnot').textContent().catch(() => '');
    kontrol(`${ad} tek`, 'tek sayfalık PDF: "Bu sayfayı sil" gri, "Son sayfa silinemez"', silGri === 1 && /Son sayfa silinemez/.test(not ?? ''), not ?? '');
    await t.page.screenshot({ path: join(OUT, `${dosya}-07-son-sayfa.png`) });
    await t.ctx.close();
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
