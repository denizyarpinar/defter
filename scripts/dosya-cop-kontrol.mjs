// Task 6.K6b: control screenshots of the reader's trash button and the file trash dialog, without signing in and
// without Drive. Usage: node scripts/dosya-cop-kontrol.mjs [output folder]
// A Vite dev server on its own port with the sample library (?demo). The sample library never shows the button
// (no Drive, no ?kurulum=1): here it is made visible in the page only to measure the bar (one row, no overflow).
// The reader opens through the desk's "İçindekileri düzenle" (as bos-konu-kontrol.mjs), then a topic with Übungen
// (blatt-01 + its solution). The dialog: ui/copOnay.ts opened in the page with made-up inputs; nothing runs.
// No request goes to Google or Drive.
// Sizes: phone 390 × 844, iPad portrait 768 × 1024, iPad landscape 1024 × 768 (touch), laptop 1280 × 800 and
// 1920 × 632 (mouse).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4188;
const URL = `http://localhost:${PORT}/?demo&lang=tr`;
const OUT = process.argv[2] ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\kitap-6.K6b';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

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

// The edit context (so the desk shows "İçindekileri düzenle"); nothing is written in this script
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
    const bar = document.querySelector('#oBar');
    const cop = document.querySelector('#oCop');
    const b = bar.getBoundingClientRect(), c = cop.getBoundingClientRect();
    const kart = document.querySelector('#copOnay .co-kart');
    const gorunur = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
    return {
      sayfaTasma: document.documentElement.scrollWidth > innerWidth,
      cubukTasma: bar.scrollWidth > bar.clientWidth,
      cubukYukseklik: Math.round(b.height),
      cop: gorunur(cop) ? `${Math.round(c.width)}×${Math.round(c.height)} @${Math.round(c.left)}` : 'yok',
      copCubukta: gorunur(cop) ? c.left >= b.left && c.right <= b.right : '-',
      pencere: kart ? kart.querySelector('#coMetin').textContent : '-',
      kutu: kart ? (gorunur(kart.querySelector('.co-cozum')) ? (kart.querySelector('.co-cozum input').checked ? '☑' : '☐') : 'yok') : '-',
      dugmeler: kart ? [...kart.querySelectorAll('.fp-alt button')].filter(gorunur).map(x => x.textContent).join(' / ') : '-'
    };
  });
}

async function pencere(page, tur) {
  await page.evaluate(async (tur) => {
    const [m, d] = await Promise.all([import('/src/ui/copOnay.ts'), import('/src/drive/dosyaCop.ts')]);
    const hic = async () => { throw new Error('bu betikte yazma yok'); };
    const ortak = { tur: 'dosya', calistir: hic, vazgec: hic, girisYap() {}, basarili() {} };
    if (tur === 'cozum') m.copOnayAc({ ...ortak, ad: 'Übung · Uebungen/blatt-01.pdf', cozumKutusu: { ad: 'blatt-01_cozum.pdf' }, onizle: async () => ({ konu: 0, dosya: 1, bekleyen: 0 }) });
    if (tur === 'uyari') m.copOnayAc({ ...ortak, ad: 'Orijinal · orijinal.pdf', onizle: async () => ({ konu: 0, dosya: 1, bekleyen: 1 }) });
    if (tur === 'engel') m.copOnayAc({ ...ortak, ad: 'Özet · ozet.pdf', onizle: async () => ({ konu: 0, dosya: 1, bekleyen: 0, engel: (await import('/src/ui/copOnayDurumu.ts')).engelFoto() }) });
    if (tur === 'adDolu') m.copOnayAc({ ...ortak, ad: 'orijinal.pdf', ilkHata: new d.GeriAlAdDolu() });
  }, tur);
  await page.waitForSelector('#copOnay');
  await wait(500);
}

const BOYUTLAR = [
  ['390', { width: 390, height: 844 }],
  ['768', { width: 768, height: 1024 }],
  ['1024', { width: 1024, height: 768 }],
  ['1280', { width: 1280, height: 800 }],
  ['1920x632', { width: 1920, height: 632 }]
];

const dev = await startDev();
const browser = await chromium.launch({ channel: 'chrome' });
const tablo = [];
try {
  mkdirSync(OUT, { recursive: true });
  for (const [ad, viewport] of BOYUTLAR) {
    const fare = ad === '1280' || ad === '1920x632';
    const ctx = await browser.newContext(fare ? { viewport, deviceScaleFactor: 1 } : { viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(URL);
    await page.waitForFunction(() => document.querySelector('#loading')?.hidden, null, { timeout: 30_000 });
    await wait(1500);
    await baglamKur(page);
    const cek = async (dosya) => { await page.screenshot({ path: join(OUT, `${ad}-${dosya}.png`) }); tablo.push([`${ad} ${dosya}`, await olc(page)]); };

    // the book to the desk (library search), its contents page → "İçindekileri düzenle" → "Bitti" → a topic
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

    // the sample library hides the button: shown here only to measure (as with Drive + ?kurulum=1)
    const goster = () => page.evaluate(() => { document.querySelector('#oCop').hidden = false; });
    await goster();
    await cek('1-ozet');
    await page.click('#oTabs [data-kind="uebungen"]');
    await wait(1500);
    await goster();
    await page.click('#oSol');
    await wait(1500);
    await goster();
    await cek('2-uebung-cozum');
    await page.click('#oPenBtn');
    await wait(500);
    await cek('3-kalem-acik');   // the button is hidden with the pen on (CSS)
    await page.click('#oPenBtn');
    await wait(400);
    for (const [i, t] of ['cozum', 'uyari', 'engel', 'adDolu'].entries()) {
      await pencere(page, t);
      await cek(`${4 + i}-pencere-${t}`);
      if (t === 'cozum') {
        await page.click('#copOnay .co-cozum input');
        await wait(200);
        await cek('4b-pencere-cozum-kapali');
      }
      await page.keyboard.press('Escape');
      await wait(300);
    }
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
