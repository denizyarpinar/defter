// Task 6.K5b: control screenshots of "to the trash" (the reader's İçindekiler edit mode, the dialog, the "Geri al"
// toast), without signing in and without Drive. Usage: node scripts/cop-kontrol.mjs [output folder]
// A Vite dev server on its own port with the sample library (?demo). The page builds the real queue, the real dialog
// and the real flow (ui/copAkisi.ts) on a made-up Drive (drive/icindekilerSahte.ts, shaped like the sample book
// programlamaya-giris). window.__offline = true makes every Drive call fail as without internet. No request goes
// to Google or Drive.
// Sizes: phone 390 × 844, iPad portrait 820 × 1180, iPad landscape 1180 × 820 (touch), laptop 1920 × 632 (mouse).
// States: the trash buttons, the dialog (counting → confirm), the warning for changes on the device, the toast with
// "Geri al" and the list after it, "Geri al" done, an error card (Tekrar dene / Vazgeç), the book's name (grey /
// open with İ/ı), "Geri al" failing (the card), the book's toast while the library loads again (another toast waits),
// locked, surum 1 (only "Kitabı çöpe at").
// The table: page overflow, the dialog on screen, its main button, the toast, the trash requests sent.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4185;
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

// o: { kilitli, surum1, yenileMs }
async function ac(page, o = {}) {
  await page.evaluate(async (o) => {
    const [ok, parse, ornek, reader, sahte, bg, akis] = await Promise.all([
      import('/src/okuma/Okuyucu.ts'), import('/src/model/parse.ts'), import('/src/okuma/ornekKaynak.ts'), import('/src/ui/reader.ts'),
      import('/src/drive/icindekilerSahte.ts'), import('/src/ui/icindekilerBaglami.ts'), import('/src/ui/copAkisi.ts')
    ]);
    if (document.querySelector('#okuyucu.show')) { document.querySelector('#oClose').click(); await new Promise(r => setTimeout(r, 400)); }
    document.querySelector('#copOnay')?.remove();
    const json = await (await fetch('/ornek/kitaplar/programlamaya-giris/kitap.json')).json();
    // the sample book's folders in the made-up Drive: kok → kitaplar → kb → units → topics → two PDFs each
    const items = { kb: { name: 'programlamaya-giris', parent: 'kitaplar' } };
    let n = 0;
    for (const u of json.uniteler ?? []) for (const t of u.konular) {
      const [un, tn] = t.klasor.split('/');
      const uid = 'U:' + un;
      items[uid] = { name: un, parent: 'kb' };
      const tid = 'T:' + t.klasor;
      items[tid] = { name: tn, parent: uid };
      for (const p of ['orijinal.pdf', 'ozet.pdf']) items['P' + ++n] = { name: p, parent: tid, mimeType: 'application/pdf', appProperties: {} };
    }
    const f = sahte.fakeDrive({ kitap: json, items, sil: ['u1', 't1', 't2', 'u2', 'f1', 'f2', 'f3'], kitaplik: { surum: 1, raflar: [{ id: 'r1', ad: 'Raf 1', kitaplar: ['programlamaya-giris'] }] } });
    window.__offline = false;
    window.__kalem = [];
    // every Drive call can fail "without internet"
    const drive = new Proxy(f.drive, { get: (t, k) => typeof t[k] === 'function' ? (...a) => { if (window.__offline) return Promise.reject(new TypeError('Failed to fetch')); return t[k](...a); } : t[k] });
    window.__f = f;
    const b = parse.parseBook('programlamaya-giris', structuredClone(json));
    window.__kitap = b;
    const kilitAcik = !o.kilitli;
    const loc = { rootId: 'kok', libraryFileId: 'kl', bookFolderIds: new Map([[b.id, 'kb']]), bookFileIds: new Map([[b.id, 'kj']]) };
    let bag = null;
    const a = akis.copAkisiKur({
      kilitAcik: () => kilitAcik, kokKaynagi: () => 'defterKok', yazabilir: () => true, loc: () => loc,
      icApi: drive, kitapApi: drive, baglanti: () => bag,
      bekleyenKalem: async () => window.__kalem, bekleyenFoto: async () => [],
      oncesi: async () => {}, mesgul: () => null,
      kitaplikYenile: async () => { await new Promise(r => setTimeout(r, o.yenileMs ?? 500)); ok.closeOkuyucu(); },
      girisYap: async () => {}
    });
    bag = bg.icindekilerBaglamiKur({
      drive, kilitAcik, hasJson: () => true,
      secenek: () => ({ kilitAcik, kokKaynagi: 'defterKok', kokId: 'kok', yazabilir: () => true, surum: b.surum, kitapKlasorId: 'kb', kitapJsonId: 'kj', bekleMs: 10 }),
      uniteKlasorleri: async x => x.uniteler.map(u => u.konular[0]?.klasor.split('/')[0] ?? null),
      kitap: () => b, yenile: () => reader.refreshReader(), jsonOku: () => drive.jsonOku('kj'), girisYap() {},
      copIste: (x, h) => a.copIste(x, h)
    });
    ok.setIcindekilerBaglami(bag.baglam);
    reader.readerShell(true);
    // as main.ts okuyucuClosed: the reader closed (e.g. the library loaded again) → the shell goes too
    void ok.openOkuyucu(b, ornek.sampleBookFolder(b.id), 0, 0, () => reader.readerShell(false));
  }, o);
  await wait(700);
  if (o.surum1) {
    // as icindekiler-kontrol.mjs: the open book turned into the old format, the panel drawn again
    await page.evaluate(() => {
      const b = window.__kitap;
      b.surum = 1;
      b.bolumler = b.uniteler.flatMap(u => u.konular).map(t => ({ baslik: t.baslik, durum: t.durum, kaynaklar: [{ tur: 'pdf', dosya: 'demo.pdf', extra: {} }], extra: {} }));
    });
  }
  await page.click('#oTocBtn');
  await wait(400);
  await page.click('#oTocEdit');
  await wait(400);
}

async function olc(page) {
  return page.evaluate(() => {
    const ekranda = (el) => { if (!el || el.hidden) return '-'; const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 0.5 && r.left >= 0 && r.right <= innerWidth + 0.5 ? 'evet' : 'HAYIR'; };
    const kart = document.querySelector('#copOnay .fp-kart');
    const ana = document.querySelector('#copOnay .co-cop');
    const t = document.querySelector('#toast');
    const dugmeler = [...document.querySelectorAll('#copOnay button, #oTocList .ie-cop, #oTocList .ie-kitapcop')].filter(x => x.offsetParent);
    return {
      sayfaTasma: document.documentElement.scrollWidth > innerWidth,
      pencere: kart ? ekranda(kart) : '-',
      ana: ana ? `${ana.textContent}${ana.disabled ? ' (gri)' : ''}` : '-',
      metin: document.querySelector('#coMetin')?.textContent.slice(0, 50) ?? '-',
      toast: t.classList.contains('show') ? t.textContent.slice(0, 40) : '-',
      kabuk: document.querySelector('#reader').hidden ? '-' : 'evet',
      enKucukDugme: dugmeler.length ? Math.round(Math.min(...dugmeler.map(x => Math.min(x.getBoundingClientRect().height, x.getBoundingClientRect().width)))) : '-',
      copIstekleri: (window.__f?.calls ?? []).filter(c => c.startsWith('cop:') || c === 'jsonYaz').join(',') || '-'
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
    await page.goto(URL);
    await page.waitForFunction(() => document.querySelector('#loading')?.hidden, null, { timeout: 30_000 });
    // measured first: a big screenshot takes seconds (the toast's timing)
    const cek = async (dosya) => { const o = await olc(page); await page.screenshot({ path: join(OUT, `${ad}-${dosya}.png`) }); tablo.push([`${ad} ${dosya}`, o]); };
    const anaHazir = () => page.waitForFunction(() => { const b = document.querySelector('#copOnay .co-cop'); return b && !b.textContent.includes('Hesaplanıyor') && !document.querySelector('#coMetin').textContent.includes('Hesaplanıyor'); });

    // 1. the trash buttons; 2. a topic: counted → confirm
    await ac(page);
    await cek('01-cop-dugmeleri');
    await page.click('[data-cop="k0.0"]');
    await anaHazir();
    await cek('02-onay-konu');
    // 3. a confirm → the toast with Geri al, the topic gone from the list
    await page.click('#copOnay .co-cop');
    await page.waitForFunction(() => document.querySelector('#toast.show')?.textContent.includes('Geri al'));
    await wait(300);
    await cek('03-geri-al-toast');
    // 4. Geri al → back in the list
    await page.click('#toast button');
    await page.waitForFunction(() => document.querySelector('#toast.show')?.textContent.includes('Geri alındı'));
    await wait(300);
    await cek('04-geri-alindi');

    // 5. changes on the device inside the topic → the warning first
    await ac(page);
    await page.evaluate(() => { window.__kalem = ['P3']; });
    await page.click('[data-cop="k0.1"]');
    await anaHazir();
    await cek('05-bekleyen-uyari');
    await page.click('#copOnay .fp-vazgec');

    // 6. a unit, without internet at the trash request → the error card (Tekrar dene / Vazgeç)
    await page.evaluate(() => { window.__kalem = []; });
    await page.click('[data-cop="u0"]');
    await anaHazir();
    await cek('06-onay-unite');
    await page.evaluate(() => { window.__offline = true; });
    await page.click('#copOnay .co-cop');
    await page.waitForFunction(() => document.querySelector('#copOnay .co-cop')?.textContent === 'Tekrar dene');
    await cek('07-hata-karti');
    await page.evaluate(() => { window.__offline = false; });
    await page.click('#copOnay .fp-vazgec');
    await page.waitForFunction(() => !document.querySelector('#copOnay'));

    // 8–9. the book: its name typed (grey, then open with İ/ı)
    await page.evaluate(() => document.querySelector('[data-kitapcop]').scrollIntoView({ block: 'center' }));
    await page.click('[data-kitapcop]');
    await anaHazir();
    await cek('08-kitap-ad-gri');
    await page.fill('#copOnay input', '  PROGRAMLAMAYA GIRIŞ ');   // ı for i, any case
    await wait(100);
    await cek('09-kitap-ad-acik');
    await page.click('#copOnay .fp-vazgec');

    // 10. Geri al fails (no internet) → the card; it finishes Geri al after the toast is gone
    await ac(page);
    await page.click('[data-cop="k0.0"]');
    await anaHazir();
    await page.click('#copOnay .co-cop');
    await page.waitForFunction(() => document.querySelector('#toast.show')?.textContent.includes('Geri al'));
    await page.evaluate(() => { window.__offline = true; });
    await page.click('#toast button');
    await page.waitForSelector('#copOnay');
    await page.waitForFunction(() => document.querySelector('#copOnay .co-cop')?.textContent === 'Tekrar dene');
    await cek('10-geri-al-hata');
    await page.evaluate(() => { window.__offline = false; });
    await wait(8500);   // the toast is long gone
    await page.click('#copOnay .co-cop');
    await page.waitForFunction(() => !document.querySelector('#copOnay'));
    await wait(300);
    await cek('11-geri-al-karttan');

    // 12–13. the book to the trash: the library loads again for 7 s; another toast meanwhile waits; "Geri al" stays
    await ac(page, { yenileMs: 7000 });
    await page.evaluate(() => document.querySelector('[data-kitapcop]').scrollIntoView({ block: 'center' }));
    await page.click('[data-kitapcop]');
    await anaHazir();
    await page.fill('#copOnay input', 'Programlamaya giriş');
    await page.click('#copOnay .co-cop');
    await page.waitForFunction(() => document.querySelector('#toast.show')?.textContent.includes('Geri al'));
    const t0 = Date.now();
    await page.evaluate(async () => { (await import('/src/ui/toast.ts')).toast('Başka bir bildirim (sırada bekler)'); });
    await wait(1000);
    await cek('12-kitap-toast-yenilenirken');
    await wait(Math.max(0, 9000 - (Date.now() - t0)));   // 9 s after: still there (8 s, but at least 4 s after the 7 s reload)
    await cek('13-kitap-toast-yenilemeden-sonra');
    await page.waitForFunction(() => !document.querySelector('#toast.show'), null, { timeout: 15_000 });

    // 14. locked; 15. surum 1
    await ac(page, { kilitli: true });
    await cek('14-kilitli');
    await ac(page, { surum1: true });
    await cek('15-surum1');
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
