// Task 6.K6a: control screenshots of a topic without materials and of the "Dosya ekle" panel, without signing in and
// without Drive. Usage: node scripts/bos-konu-kontrol.mjs [output folder]
// A Vite dev server on its own port with the sample library (?demo). The sample book programlamaya-giris gets one
// more topic with an empty folder (kitap.json + ornek/index.json routed); its topic without a klasor stays as it is.
// The reader opens through the desk's "İçindekileri düzenle" (the real edit context with a made-up Drive in the
// page, as konusuz-kontrol.mjs), then "Bitti" and the topic tapped. The panel: ui/dosyaPanel.ts opened in the page
// with the empty topic's context (folders missing; lock open / locked). No request goes to Google or Drive.
// Sizes: phone 390 × 844, iPad portrait 820 × 1180, iPad landscape 1180 × 820 (touch), laptop 1920 × 632 (mouse).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4187;
const URL = `http://localhost:${PORT}/?demo`;
const OUT = process.argv[2] ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\kitap-6.K6a';
const BOS = 'Unite-02-Metotlar/Konu-05-Bos';

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
    const gorunur = (s) => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; };
    const dugme = (s) => !gorunur(s) ? 'yok' : document.querySelector(s).disabled ? `gri (${document.querySelector(s).title})` : 'açık';
    const panel = document.querySelector('#dosyaPanel');
    const hedef = (h) => {
      const i = panel?.querySelector(`input[name="dpHedef"][value="${h}"]`);
      if (!i) return '-';
      const not = i.closest('label')?.querySelector('.dp-neden');
      return `${i.checked ? '●' : '○'}${i.disabled ? ' gri' : ''}${not && !not.hidden ? ' ' + not.textContent : ''}`;
    };
    return {
      sayfaTasma: document.documentElement.scrollWidth > innerWidth,
      mesaj: !document.querySelector('#oMsg').hidden ? document.querySelector('#oMsg').textContent : '',
      cubuk: gorunur('#oBar') ? 'var' : 'yok',
      foto: dugme('#oFoto'), dosya: dugme('#oDosya'),
      kalemAraMod: ['#oPenBtn', '#oAraBtn', '#oMode'].map(s => gorunur(s) ? 'var' : 'yok').join('/'),
      orijinal: hedef('orijinal'), ozet: hedef('ozet'), uebungen: hedef('uebungen'), oedevler: hedef('oedevler'), cozum: hedef('cozum'),
      ad: panel?.querySelector('.dp-ad input')?.value ?? '-'
    };
  });
}

// The panel as the reader opens it for the empty topic (the demo PDF as the chosen file)
async function panelAc(page, klasorAcabilir) {
  await page.evaluate(async (klasorAcabilir) => {
    const [m, k] = await Promise.all([import('/src/ui/dosyaPanel.ts'), import('/src/okuma/konuKesfi.ts')]);
    const bytes = new Uint8Array(await (await fetch('/demo/demo-dikey.pdf')).arrayBuffer());
    m.acDosyaPanel({
      konuAdi: 'Boş konu', materials: k.emptyMaterials(), acikSekme: null, ornek: false, klasorAcabilir,
      klasorler: async () => ({ Uebungen: false, Oedevler: false }),
      ekle: async () => { throw new Error('bu betikte yazma yok'); }, bitti() {}, cevir: async () => { throw new Error('-'); }
    }, { tur: 'pdf', hazir: { ad: 'Blatt 3.pdf', bytes, kaynak: 'pdf' } });
  }, klasorAcabilir);
  await page.waitForSelector('#dosyaPanel');
  await wait(800);
}

const BOYUTLAR = [
  ['390', { width: 390, height: 844 }],
  ['820', { width: 820, height: 1180 }],
  ['1180', { width: 1180, height: 820 }],
  ['1920x632', { width: 1920, height: 632 }]
];

const dev = await startDev();
const browser = await chromium.launch({ channel: 'chrome' });
const tablo = [];
try {
  mkdirSync(OUT, { recursive: true });
  for (const [ad, viewport] of BOYUTLAR) {
    const laptop = ad === '1920x632';
    const ctx = await browser.newContext(laptop ? { viewport, deviceScaleFactor: 1 } : { viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.route('**/ornek/kitaplar/programlamaya-giris/kitap.json', async route => {
      const json = await (await route.fetch()).json();
      json.uniteler[1].konular.push({ baslik: 'Boş konu', klasor: BOS, durum: 'okunmadi', kurdeleler: {} });
      await route.fulfill({ json: { ...json, kurdele: null } });
    });
    await page.route('**/ornek/index.json', async route => {
      const json = await (await route.fetch()).json();
      json.klasorler['programlamaya-giris'][BOS] = {};   // the folder is there, nothing in it
      await route.fulfill({ json });
    });
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

    const konu = async (u, t) => {
      if (!await page.locator('#oTocList').isVisible()) { await page.click('#oTocBtn'); await wait(400); }
      await page.click(`#oTocList [data-u="${u}"][data-t="${t}"]`);
      await wait(1500);
      if (await page.locator('#oToc.show, #oToc:not([hidden])').count() && await page.locator('#oTocClose').isVisible()) { await page.click('#oTocClose'); await wait(400); }
    };
    await konu(1, 2);   // the topic with an empty folder
    await cek('1-bos-konu');
    await konu(1, 1);   // the topic without a klasor
    await cek('2-klasorsuz-konu');
    await konu(0, 0);   // a topic with materials: everything as before
    await cek('3-dolu-konu');
    await konu(1, 2);
    await panelAc(page, true);
    await cek('4-panel-kilit-acik');
    await page.keyboard.press('Escape');
    await wait(400);
    await panelAc(page, false);
    await cek('5-panel-kilitli');
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
