// Task 6.K5a: control screenshots of the contents' edit mode (the reader's İçindekiler panel), without signing in
// and without Drive. Usage: node scripts/icindekiler-kontrol.mjs [output folder]
// A Vite dev server on its own port with the sample library (?demo); the page sets a made-up edit context
// (setIcindekilerBaglami, as main.ts does for a Drive library) and opens the sample book programlamaya-giris.
// Its "gonder" writes nothing: it only records the request. No request goes to Google or Drive.
// Sizes: phone 390 × 844, iPad portrait 820 × 1180, iPad landscape 1180 × 820 (touch), laptop 1920 × 632 (mouse).
// States: the panel with "Düzenle", the edit mode, a rename with an empty name (error), "Ekleniyor…" (a unit and a
// topic waiting), a failed write (Tekrar dene / Vazgeç), a permission error (Tekrar giriş yap), locked (no
// ?kurulum=1), a unit whose folder is not known ("+ Konu" grey), surum 1 (grey "Düzenle" + note).
// Task 6.K5a-2: the real write queue (ui/icindekilerBaglami.ts) with a made-up Drive in the page: a topic added while
// "offline" → "Tekrar dene" → "Kaydedildi" and the topic in the list; a rename while offline → "Vazgeç" → the old name.
// The table: page overflow, the status line on screen without scrolling, the smallest button, the requests sent.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4184;
const URL = `http://localhost:${PORT}/?demo`;
const OUT = process.argv[2] ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\kitap-6.K5a';

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

// o: { kilit, durum, bekleyen, klasorYok }
async function ac(page, o = {}) {
  await page.evaluate(async (o) => {
    const [ok, parse, ornek, reader] = await Promise.all([import('/src/okuma/Okuyucu.ts'), import('/src/model/parse.ts'), import('/src/okuma/ornekKaynak.ts'), import('/src/ui/reader.ts')]);
    if (document.querySelector('#okuyucu.show')) { document.querySelector('#oClose').click(); await new Promise(r => setTimeout(r, 400)); }
    const b = parse.parseBook('programlamaya-giris', await (await fetch('/ornek/kitaplar/programlamaya-giris/kitap.json')).json());
    window.__kitap = b;
    window.__istekler = [];
    const dinleyiciler = new Set();
    ok.setIcindekilerBaglami({
      kilitAcik: o.kilit !== 'kilitli',
      hasJson: () => true,
      uniteKlasorleri: async x => x.uniteler.map((u, i) => o.klasorYok && i === x.uniteler.length - 1 ? null : `Unite-0${i + 1}`),
      gonder: (_x, istek) => { window.__istekler.push(istek.tur); },
      bekleyenEklemeler: () => o.bekleyen ? [{ tur: 'konuEkle', unite: 'k:Unite-01-Temeller', uniteSira: 0, baslik: 'Diziler ve listeler' }, { tur: 'uniteEkle', baslik: 'Nesneler' }] : [],
      durum: () => o.durum ?? { tur: 'bos' },
      dinle: fn => { dinleyiciler.add(fn); return () => dinleyiciler.delete(fn); },
      tekrarDene() {}, vazgec() {}, girisYap() {},
      copIste() {}, copBekleyenler: () => [], yonlendir: () => undefined   // 6.K5b (without them the edit mode doesn't open)
    });
    reader.readerShell(true);   // as the library search does: the reader's frame without a book on the desk
    void ok.openOkuyucu(b, ornek.sampleBookFolder(b.id), 0, 0, () => {});
  }, o);
  await wait(700);
  await page.click('#oTocBtn');
  await wait(400);
}

// Task 6.K5a-2: the real queue; window.__offline = true makes every Drive call fail as without internet
async function acGercek(page) {
  await page.evaluate(async () => {
    const [ok, parse, ornek, reader, dr, bg] = await Promise.all([import('/src/okuma/Okuyucu.ts'), import('/src/model/parse.ts'), import('/src/okuma/ornekKaynak.ts'), import('/src/ui/reader.ts'), import('/src/drive/drive.ts'), import('/src/ui/icindekilerBaglami.ts')]);
    if (document.querySelector('#okuyucu.show')) { document.querySelector('#oClose').click(); await new Promise(r => setTimeout(r, 400)); }
    const json = await (await fetch('/ornek/kitaplar/programlamaya-giris/kitap.json')).json();
    const b = parse.parseBook('programlamaya-giris', json);
    window.__kitap = b;
    window.__offline = false;
    window.__istekler = [];
    let dosya = structuredClone(json), m = 1;
    const uniteler = [...new Set(json.uniteler.flatMap(u => u.konular.map(t => t.klasor.split('/')[0])))];
    const items = new Map(uniteler.map((n, i) => ['u' + i, { name: n, parents: ['kb'] }]));
    const ag = (ne) => { window.__istekler.push(ne); if (window.__offline) throw new TypeError('Failed to fetch'); };
    const drive = {
      async yeniIdler() { ag('yeniIdler'); return ['yeni1']; },
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
      drive, kilitAcik: true, hasJson: () => true,
      secenek: () => ({ kilitAcik: true, kokKaynagi: 'defterKok', kokId: 'kok', yazabilir: () => true, surum: 2, kitapKlasorId: 'kb', kitapJsonId: 'kj', bekleMs: 10 }),
      uniteKlasorleri: async x => x.uniteler.map((_, i) => uniteler[i] ?? null),
      kitap: () => b, yenile: () => reader.refreshReader(), jsonOku: () => drive.jsonOku('kj'), girisYap() {}
    });
    ok.setIcindekilerBaglami(baglam);
    reader.readerShell(true);
    void ok.openOkuyucu(b, ornek.sampleBookFolder(b.id), 0, 0, () => {});
  });
  await wait(700);
  await page.click('#oTocBtn');
  await wait(400);
}

const duzenle = async (page) => { await page.click('#oTocEdit'); await wait(300); };

async function olc(page) {
  return page.evaluate(() => {
    const ekranda = (el) => { if (!el || el.hidden) return '-'; const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 0.5 && r.left >= 0 && r.right <= innerWidth + 0.5 ? 'evet' : 'HAYIR'; };
    const dugmeler = [...document.querySelectorAll('#oToc button')].filter(b => b.offsetParent);
    const enKucuk = Math.min(...dugmeler.map(b => Math.min(b.getBoundingClientRect().height, b.getBoundingClientRect().width)));
    const edit = document.querySelector('#oTocEdit');
    return {
      sayfaTasma: document.documentElement.scrollWidth > innerWidth,
      panelTasma: document.querySelector('#oTocList').scrollWidth > document.querySelector('#oTocList').clientWidth + 1,
      durumEkranda: ekranda(document.querySelector('#oTocDurum')),
      durum: document.querySelector('#oTocDurum').hidden ? '' : document.querySelector('#oTocDurum').textContent.trim().slice(0, 60),
      dugme: edit.hidden ? 'yok' : `${edit.textContent}${edit.classList.contains('gri') ? ' (gri)' : ''}`,
      enKucukDugme: Math.round(enKucuk),
      griKonuEkle: document.querySelectorAll('[data-konuekle]:disabled').length,
      istekler: (window.__istekler ?? []).length > 12 ? `${window.__istekler.length} istek` : (window.__istekler ?? []).join(','),
      adlar: [...document.querySelectorAll('#oTocList .ie-ad, #oTocList li button span:last-child')].slice(0, 4).map(e => e.textContent).join(' / ')
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
const sayfalar = [];
try {
  mkdirSync(OUT, { recursive: true });
  for (const [ad, viewport] of BOYUTLAR) {
    const laptop = ad === '1920x632';
    const ctx = await browser.newContext(laptop ? { viewport, deviceScaleFactor: 1 } : { viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(URL);
    await page.waitForFunction(() => document.querySelector('#loading')?.hidden, null, { timeout: 30_000 });
    const cek = async (dosya) => { await page.screenshot({ path: join(OUT, `${ad}-${dosya}.png`) }); tablo.push([`${ad} ${dosya}`, await olc(page)]); };

    await ac(page);
    if (!laptop) {
      // Task 6.K5b-4: reading with pages, the panel closed: the pages scroll, the page itself doesn't
      await page.evaluate(() => document.querySelector('#oTocClose').click());
      await page.click('#oMode [data-m="pdf"]');   // the pages in a scrolling list
      await wait(1200);
      const cdp = await ctx.newCDPSession(page);
      const x = viewport.width / 2, y = viewport.height * 0.6;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 30 * i, id: 1 }] }); await wait(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await wait(600);
      sayfalar.push([ad, await page.evaluate(() => { const s = document.querySelector("#oScroll"); return `sayfalar ${Math.round(s.scrollTop)} px (liste ${s.scrollHeight}/${s.clientHeight}, kitap modu ${!document.querySelector("#oKitap").hidden}), scrollY ${Math.round(scrollY)}`; })]);
      await page.click('#oMode [data-m="kitap"]');   // back to the default for the screenshots
      await wait(600);
      await page.click('#oTocBtn');
      await wait(400);
    }
    await cek('1-panel');
    await duzenle(page);
    await cek('2-duzenleme');
    // rename: the ✎ of the first topic, an empty name → the error
    await page.click('[data-yeniad="k0.0"]');
    await page.fill('[data-girdi]', '  - ');
    await page.click('[data-ie-kaydet]');
    await wait(200);
    await cek('3-ad-bos-hata');
    // a valid name and ↓: the requests (recorded, nothing written)
    await page.fill('[data-girdi]', 'Merhaba dünya (yeni ad)');
    await page.press('[data-girdi]', 'Enter');
    await page.click('[data-asagi="k0.0"]');
    await wait(900);
    await cek('4-ad-ve-sira');

    await ac(page, { bekleyen: true, durum: { tur: 'kaydediliyor', ekleme: true } });
    await duzenle(page);
    await cek('5-ekleniyor');
    await ac(page, { durum: { tur: 'hata', mesaj: 'İçindekiler kaydedilemedi: Drive\'a bağlanılamadı. İnternetini kontrol edip tekrar dene; çift klasör oluşmaz.', izin: false } });
    await duzenle(page);
    await cek('6-hata');
    await ac(page, { durum: { tur: 'hata', mesaj: 'Drive yazmaya izin vermedi. Tekrar giriş yapıp Drive iznini onayla.', izin: true } });
    await duzenle(page);
    await cek('7-izin-hatasi');
    await ac(page, { kilit: 'kilitli' });
    await duzenle(page);
    await cek('8-kilitli');
    await ac(page, { klasorYok: true });
    await duzenle(page);
    // the last unit: scroll it into view inside the panel
    await page.evaluate(() => document.querySelector('[data-konuekle]:disabled')?.scrollIntoView({ block: 'center' }));
    await cek('9-unite-klasoru-yok');
    // surum 1: the open book is turned into the old format, the panel drawn again (close + open)
    await ac(page);
    await page.evaluate(() => {
      const b = window.__kitap;
      b.surum = 1;
      b.bolumler = b.uniteler.flatMap(u => u.konular).map(t => ({ baslik: t.baslik, durum: t.durum, kaynaklar: [{ tur: 'pdf', dosya: 'demo.pdf', extra: {} }], extra: {} }));
    });
    await page.evaluate(() => document.querySelector('#oTocClose').click());
    await wait(400);
    await page.click('#oTocBtn');
    await wait(400);
    await page.evaluate(() => document.querySelector('#oTocEdit').click());   // grey (aria-disabled): the tap shows the note
    await wait(200);
    await cek('10-surum1');

    // 6.K5a-2: + Konu without internet → error → internet back → Tekrar dene
    await acGercek(page);
    await duzenle(page);
    await page.evaluate(() => { window.__offline = true; });
    await page.click('[data-konuekle="0"]');
    await page.fill('[data-girdi]', 'Diziler ve listeler');
    await page.click('[data-ie-kaydet]');
    await page.waitForSelector('#oTocDurum [data-durum="tekrar"]');
    await page.evaluate(() => { window.__offline = false; });
    await page.click('#oTocDurum [data-durum="tekrar"]');
    await page.waitForFunction(() => document.querySelector('#oTocDurum').textContent.includes('Kaydedildi'));
    await cek('11-tekrar-dene');
    // a rename without internet → error → Vazgeç (kitap.json can't be read either: the name before the change)
    await page.evaluate(() => { window.__offline = true; });
    await page.click('[data-yeniad="k0.0"]');
    await page.fill('[data-girdi]', 'Yeni ad (kaydedilemedi)');
    await page.press('[data-girdi]', 'Enter');
    await page.waitForSelector('#oTocDurum [data-durum="vazgec"]');
    await page.click('#oTocDurum [data-durum="vazgec"]');
    await wait(300);
    await cek('12-vazgec');
    await ctx.close();
  }
} finally {
  await browser.close();
  dev.kill();
}

const sutunlar = Object.keys(tablo[0][1]);
console.log(['durum', ...sutunlar].join(' | '));
for (const [ad, o] of tablo) console.log([ad, ...sutunlar.map(k => String(o[k]))].join(' | '));
console.log('\nParmakla kaydırma (6.K5b-4; sayfalar > 0, scrollY 0):');
for (const [ad, s] of sayfalar) console.log(`${ad} | ${s}`);
console.log(`\nEkran görüntüleri: ${OUT}`);
