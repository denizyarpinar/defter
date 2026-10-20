// Task 6.K5b-3: control screenshots of a book without topics: the desk's "İçindekileri düzenle" and the reader with no
// topic open, without signing in and without Drive. Usage: node scripts/konusuz-kontrol.mjs [output folder]
// A Vite dev server on its own port with the sample library (?demo); the sample book programlamaya-giris is served
// without units (its kitap.json with "uniteler": []). The page sets the real write queue (ui/icindekilerBaglami.ts)
// with a made-up Drive in the page, as main.ts does for a Drive library. No request goes to Google or Drive.
// Flow: library search → the book on the desk → its contents page (the button) → the reader with no topic (edit mode)
// → + Ünite → + Konu → Bitti → the topic tapped (normal reading).
// Sizes: phone 390 × 844, iPad portrait 820 × 1180, iPad landscape 1180 × 820 (touch), laptop 1920 × 632 (mouse).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4186;
const URL = `http://localhost:${PORT}/?demo`;
const OUT = process.argv[2] ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\kitap-6.K5b';

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

// The edit context with the real queue; the made-up Drive keeps the folders and kitap.json in the page
async function baglamKur(page) {
  await page.evaluate(async () => {
    const [ok, reader, dr, bg] = await Promise.all([import('/src/okuma/Okuyucu.ts'), import('/src/ui/reader.ts'), import('/src/drive/drive.ts'), import('/src/ui/icindekilerBaglami.ts')]);
    window.__istekler = [];
    let dosya = { surum: 2, baslik: 'Programlamaya Giriş', uniteler: [] }, m = 1;
    const items = new Map();
    const ag = (ne) => { window.__istekler.push(ne); };
    const drive = {
      async yeniIdler() { ag('yeniIdler'); return ['yeni' + (items.size + 1)]; },
      async oge(id) { ag('oge'); if (id === 'kb') return { id, name: 'programlamaya-giris', parents: ['kitaplar'] }; const i = items.get(id); return i ? { id, ...i } : null; },
      async islemAra(islemId) { ag('islemAra'); return [...items].filter(([, i]) => i.appProperties?.defterIslem === islemId).map(([id, i]) => ({ id, name: i.name })); },
      async olustur(meta) { ag('olustur'); items.set(meta.id, { name: meta.name, parents: meta.parents, appProperties: meta.appProperties }); return { id: meta.id }; },
      async kokCocuklari() { ag('kokCocuklari'); return [{ id: 'kitaplar', name: 'kitaplar', mimeType: dr.FOLDER_MIME }]; },
      async klasorler(ps) { ag('klasorler'); return [...items].filter(([, i]) => ps.includes(i.parents[0])).map(([id, i]) => ({ id, ...i })); },
      async jsonOku() { ag('jsonOku'); return structuredClone(dosya); },
      async degisimZamani() { ag('degisimZamani'); return 't' + m; },
      async jsonYaz(_id, o) { ag('jsonYaz'); dosya = o; m++; }
    };
    const { baglam } = bg.icindekilerBaglamiKur({
      drive, kilitAcik: true,
      hasJson: x => { window.__masa = x; return true; },   // the book on the desk (the library's own object)
      secenek: () => ({ kilitAcik: true, kokKaynagi: 'defterKok', kokId: 'kok', yazabilir: () => true, surum: 2, kitapKlasorId: 'kb', kitapJsonId: 'kj', bekleMs: 10 }),
      uniteKlasorleri: async x => x.uniteler.map(u => u.klasor ?? null),
      kitap: () => window.__masa, yenile: () => reader.refreshReader(), jsonOku: () => drive.jsonOku('kj'), girisYap() {}
    });
    ok.setIcindekilerBaglami(baglam);
  });
}

async function olc(page) {
  return page.evaluate(() => {
    const gorunur = (s) => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; };
    const masa = document.querySelector('#reader.show [data-duzenle]');
    const r = masa?.getBoundingClientRect();
    const sayfa = masa?.closest('.page')?.querySelector('.in');
    const okuyucu = document.querySelector('#okuyucu');
    const acik = okuyucu.classList.contains('show');
    const dugmeler = acik ? [...document.querySelectorAll('#oToc button')].filter(b => b.offsetParent) : [];
    return {
      sayfaTasma: document.documentElement.scrollWidth > innerWidth,
      masaDugme: masa && !acik ? `${Math.round(r.width)}×${Math.round(r.height)}${r.right > innerWidth || r.left < 0 ? ' DIŞARIDA' : ''}` : '-',
      masaSayfaTasma: sayfa && !acik ? sayfa.scrollHeight > sayfa.clientHeight + 1 : '-',
      konusuz: okuyucu.classList.contains('o-konusuz'),
      mesaj: acik && !document.querySelector('#oMsg').hidden ? document.querySelector('#oMsg').textContent : '',
      kalemAraMod: acik ? ['#oPenBtn', '#oAraBtn', '#oMode'].map(s => gorunur(s) ? 'var' : 'yok').join('/') : '-',
      foto: acik ? (gorunur('#oFoto') ? 'var' : 'yok') : '-',
      panelDugmeEnKucuk: dugmeler.length ? Math.round(Math.min(...dugmeler.map(b => Math.min(b.getBoundingClientRect().height, b.getBoundingClientRect().width)))) : '-',
      durum: acik && !document.querySelector('#oTocDurum').hidden ? document.querySelector('#oTocDurum').textContent.trim().slice(0, 40) : '',
      istekler: (window.__istekler ?? []).length
    };
  });
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
    // the sample book without units (as a book the wizard made without topics)
    await page.route('**/ornek/kitaplar/programlamaya-giris/kitap.json', async route => {
      const json = await (await route.fetch()).json();
      await route.fulfill({ json: { ...json, uniteler: [], kurdele: null } });
    });
    await page.goto(URL);
    await page.waitForFunction(() => document.querySelector('#loading')?.hidden, null, { timeout: 30_000 });
    await wait(1500);
    await baglamKur(page);
    const cek = async (dosya) => { await page.screenshot({ path: join(OUT, `${ad}-${dosya}.png`) }); tablo.push([`${ad} ${dosya}`, await olc(page)]); };

    // the book to the desk through the library search (as tapping it on the shelf)
    await page.keyboard.press('/');
    await page.locator('#aramaPaneli .ap-kutu').fill('programlamaya');
    await page.waitForFunction(() => document.querySelectorAll('#aramaPaneli .ap-satir').length > 0, null, { timeout: 10_000 });
    await page.locator('#aramaPaneli .ap-satir').first().click();
    await page.waitForSelector('#reader.show', { timeout: 15_000 });
    await wait(2500);
    if (await page.locator('#next').isEnabled()) { await page.click('#next'); await wait(700); }   // one page: the contents
    await cek('1-masa');

    await page.click('#reader [data-duzenle]');
    await page.waitForSelector('#okuyucu.show');
    await wait(700);
    await cek('2-konusuz');

    await page.click('[data-uniteekle]');
    await page.fill('[data-girdi]', 'Temeller');
    await page.click('[data-ie-kaydet]');
    await page.waitForFunction(() => document.querySelector('#oTocDurum').textContent.includes('Kaydedildi'));
    await cek('3-unite-eklendi');

    await page.click('[data-konuekle="0"]');
    await page.fill('[data-girdi]', 'Değişkenler');
    await page.click('[data-ie-kaydet]');
    await page.waitForFunction(() => document.querySelectorAll('[data-yeniad^="k"]').length > 0);
    await page.click('#oTocEdit');   // Bitti
    await wait(300);
    await cek('4-konu-eklendi');

    await page.click('#oTocList [data-u="0"][data-t="0"]');
    await wait(1200);
    await cek('5-konu-acildi');
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
