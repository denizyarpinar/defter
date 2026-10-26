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
const URL = `http://localhost:${PORT}/?demo&lang=tr`;
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

// Task 6.K5b-4: a finger drag (CDP touch events, as on the iPad) from (x, y) by dy; the page's scrollY after it
// and the scrollTop of the element under the finger's scrolling parent (#oTocList / #oScroll)
async function surukle(page, cdp, x, y, dy, kutu) {
  const nokta = (yy) => [{ x, y: yy, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: nokta(y) });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: nokta(y + dy * i / 10) }); await wait(16); }
  await wait(100);
  const surerken = await page.evaluate(() => Math.round(scrollY));   // before the touchend's reset (it could hide a move)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(600);
  return page.evaluate(([kutu, surerken]) => `${surerken}→${Math.round(scrollY)}${kutu ? ' (liste ' + Math.round(document.querySelector(kutu).scrollTop) + ')' : ''}`, [kutu, surerken]);
}

// iPad Safari: the layout viewport (html.clientHeight 1048) is taller than the visible part (innerHeight 969),
// so the page itself can move by 79 px. Chrome's emulation doesn't do that; a taller <html> gives the same room.
// Chrome also stops the drag by html/body's touch-action: none and body's overflow: hidden (it goes to the page);
// iPad Safari moves the page anyway (the recording). Both turned off here, as there.
const SAFARI_PAYI = () => { const s = document.createElement('style'); s.id = 'safariPayi'; s.textContent = 'html { height: calc(100% + 79px) } html, body { touch-action: auto !important } body { overflow: visible !important }'; document.head.append(s); };
const SIFIRLA = () => scrollTo(0, 0);

const BOYUTLAR = [
  ['390', { width: 390, height: 844 }],
  ['820', { width: 820, height: 1180 }],
  ['1180', { width: 1180, height: 820 }],
  ['1920x632', { width: 1920, height: 632 }]
];

const dev = await startDev();
const browser = await chromium.launch({ channel: 'chrome' });
const tablo = [];
const surukleme = [];
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

    if (!laptop) {
      // Task 6.K5b-4: the page must not move; only the contents list scrolls
      const cdp = await ctx.newCDPSession(page);
      await page.evaluate(SAFARI_PAYI);
      const { width: w, height: h } = viewport;
      const scrim = await surukle(page, cdp, w - 40, h * 0.6, -300);
      await page.evaluate(SIFIRLA);
      // the list made short so that it can scroll (the book has no units yet)
      await page.evaluate(() => { const l = document.querySelector('#oTocList'); l.style.flex = 'none'; l.style.height = '60px'; });
      const liste = await surukle(page, cdp, 120, (await page.locator('#oTocList').boundingBox()).y + 30, -200, '#oTocList');
      await page.evaluate(() => { const l = document.querySelector('#oTocList'); l.style.flex = ''; l.style.height = ''; l.scrollTop = 0; });
      await page.evaluate(SIFIRLA);
      await page.evaluate(() => document.querySelector('#oTocClose').click());
      await wait(400);
      const bos = await surukle(page, cdp, w / 2, h * 0.6, -300);
      const ust = await surukle(page, cdp, w / 2, 30, 200);   // the top bar, the finger pulled down
      await page.screenshot({ path: join(OUT, `${ad}-6-surukleme.png`) });
      surukleme.push([`${ad} konusuz`, { scrim, liste, bosAlan: bos, ust }]);
      await page.evaluate(SIFIRLA);
      await page.evaluate(() => document.querySelector('#safariPayi').remove());
      await page.click('#oTocBtn');
      await wait(400);
      if (!await page.locator('[data-uniteekle]').count()) { await page.click('#oTocEdit'); await wait(300); }   // closing the panel ended the edit mode
    }

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

    if (!laptop) {
      // Task 6.K5b-4: a topic open (no material yet): the same drags
      const cdp = await ctx.newCDPSession(page);
      await page.evaluate(SAFARI_PAYI);
      const { width: w, height: h } = viewport;
      const bos = await surukle(page, cdp, w / 2, h * 0.6, -300);
      await page.evaluate(SIFIRLA);
      await page.click('#oTocBtn');
      await wait(400);
      const scrim = await surukle(page, cdp, w - 40, h * 0.6, -300);
      surukleme.push([`${ad} konu açık`, { scrim, liste: '-', bosAlan: bos, ust: '-' }]);
      await page.evaluate(() => document.querySelector('#safariPayi').remove());
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
console.log('\nSürükleme (scrollY sürerken→sonra; beklenen 0→0, liste > 0):');
for (const [ad, o] of surukleme) console.log(`${ad} | scrim ${o.scrim} | liste ${o.liste} | boş alan ${o.bosAlan} | üst çubuk ${o.ust}`);
console.log(`\nEkran görüntüleri: ${OUT}`);
