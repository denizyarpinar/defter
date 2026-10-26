// Task 6.K4a: control screenshots of the "Yeni kitap" wizard, without signing in and without Drive.
// Usage: node scripts/kitap-sihirbazi-kontrol.mjs [output folder]
// A Vite dev server on its own port; the page imports the app's own kitapSihirbazi.ts and opens it with made-up
// shelves (as main.ts does for a Drive library). No request goes to Google or Drive; nothing is written.
// Sizes: phone 390 × 844 (touch), iPad portrait 820 × 1180 (touch), iPad landscape 1180 × 820 (touch).
// States: empty, filled (Turkish + German, "Genel", a duplicate topic, a unit without topics), blocked (a too long
// name, a book that is already there), after the tree's "+" and "↓", and the ?olcum=1 plan box.
// Task 6.K4b: "Oluştur" open (kilit 'acik') with a made-up writer: running (3/9), an error with "Tekrar dene",
// a permission error ("Tekrar giriş yap"), and the owner's "Kitaplık" (grey + note). Still no request to Drive.
// Task 6.K4b-3: the message is in the sticky bottom row: "yarım kitap" error (nothing written, red name box) and
// "Oluşturuluyor…", the card NOT scrolled, also at laptop 1920 × 632 (mouse); the table says whether the bottom
// row and the whole message are on screen.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4183;
// 6.5-2a: DIL=en node scripts/kitap-sihirbazi-kontrol.mjs → the English interface (default Turkish)
const DIL = process.env.DIL === 'en' ? 'en' : 'tr';
const URL = `http://localhost:${PORT}/?lang=${DIL}`;
const OUT = process.argv[2] ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\kitap-6.K4b';

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

const RAFLAR = [{ id: 'raf-1', ad: 'Dersler' }, { id: 'raf-2', ad: 'Mathe' }, { id: 'raf-3', ad: 'Raf 3' }];
const DOLU = {
  ad: 'Programmieren 1',
  metin: 'Organisatorisches\n\n# Grundlagen\n- Werte, Typen, Ausdrücke\n- Kontrollstrukturen\n- Kontrollstrukturen\n\n# Objektorientierung\n1. Klassen und Objekte\n2. Vererbung\n\n# Übungsklausur\n\n# Değişkenler ve döngüler\n* Koşullar\n* Işık ve ölçü'
};
const ENGEL = {
  ad: 'Mathe 1',
  metin: `# Logik\nAussagenlogik\n${'Eine sehr lange Überschrift für ein Thema, die viel länger als achtzig Zeichen ist'}\n# Mengen\nRelationen`
};

// yazici (6.K4b): 'suruyor' stops at 3/n, 'ag' / 'izin' fail after 3 items; 'yarim' (6.K4b-3) fails before writing
async function ac(page, olcum, d, kilit = 'kilitli', yazici = null) {
  await page.evaluate(async ([raflar, olcum, d, kilit, yazici]) => {
    document.getElementById('kitapSihirbazi')?.remove();
    const [{ kitapSihirbaziAc }, { hideLogin }, ko] = await Promise.all([
      import('/src/ui/kitapSihirbazi.ts'), import('/src/ui/login.ts'), import('/src/drive/kitapOlustur.ts')
    ]);
    hideLogin();
    const olustur = async (islem, ilerleme) => {
      const n = islem.plan.ogeler.length;
      if (yazici === 'yarim') throw new ko.YarimKitapVar(islem.plan.kitapId);
      for (let i = 0; i < 3; i++) { islem.denenen.add(i); islem.tamam.set(i, 'id' + i); ilerleme(i + 1, n); }
      if (yazici === 'suruyor') return new Promise(() => {});
      throw yazici === 'izin' ? new ko.KitapOlusturIzinYok() : new ko.KitapOlusturAgHatasi();
    };
    kitapSihirbaziAc({ raflar, mevcutIdler: ['mathe-1', 'lineer-cebir'], olcum, kilit, olustur, girisYap: async () => {} });
    if (d) {
      const ad = document.querySelector('#kitapSihirbazi input[type=text]');
      ad.value = d.ad;
      ad.dispatchEvent(new Event('input'));
      const m = document.querySelector('#kitapSihirbazi textarea');
      m.value = d.metin;
      m.dispatchEvent(new Event('input'));
      document.querySelector('#kitapSihirbazi [data-c="#2f5d50"]').click();
    }
    document.activeElement?.blur();
    if (yazici) document.querySelector('#kitapSihirbazi .fp-ekle').click();
  }, [RAFLAR, olcum, d, kilit, yazici]);
  await wait(300);
}

// the card's own scrolling (its bottom part on small screens)
const kartKaydir = (page, y) => page.evaluate(y => { document.querySelector('#kitapSihirbazi .fp-kart').scrollTop = y; }, y);

async function olc(page) {
  return page.evaluate(() => {
    const k = document.querySelector('#kitapSihirbazi .fp-kart');
    const r = k.getBoundingClientRect();
    return {
      sayfaTasma: document.documentElement.scrollWidth > innerWidth,
      kartTasma: k.scrollWidth > k.clientWidth + 1,
      kart: `${Math.round(r.width)}×${Math.round(r.height)}`,
      ikiSutun: getComputedStyle(document.querySelector('.ks-govde')).gridTemplateColumns.split(' ').length === 2,
      satir: document.querySelectorAll('.ks-satir').length,
      uyari: document.querySelectorAll('.ks-uyarilar li').length,
      olustur: `${document.querySelector('#kitapSihirbazi .fp-ekle').textContent} (${document.querySelector('#kitapSihirbazi .fp-ekle').disabled ? 'gri' : 'açık'})`,
      vazgec: document.querySelector('#kitapSihirbazi .fp-vazgec').disabled ? 'gri' : 'açık',
      adKutusu: document.querySelector('#kitapSihirbazi input[type=text]').disabled ? 'kilitli' : 'açık',
      neden: document.querySelector('.ks-neden').textContent,
      ...altOlc()
    };
    function altOlc() {
      const a = document.querySelector('#kitapSihirbazi .fp-alt').getBoundingClientRect();
      const m = document.querySelector('.ks-neden');
      const mr = m.getBoundingClientRect();
      const ekranda = (x) => x.top >= 0 && x.bottom <= innerHeight + 0.5 && x.left >= 0 && x.right <= innerWidth + 0.5;
      return {
        altGorunur: ekranda(a),
        mesajGorunur: !m.textContent || (ekranda(mr) && m.scrollHeight <= m.clientHeight + 1),
        mesajSatir: m.textContent ? Math.round(mr.height / parseFloat(getComputedStyle(m).lineHeight)) : 0,
        adCerceve: document.querySelector('#kitapSihirbazi input[type=text]').classList.contains('ks-ad-hata')
      };
    }
  });
}

const BOYUTLAR = [
  ['390', { width: 390, height: 844 }],
  ['820', { width: 820, height: 1180 }],
  ['1180', { width: 1180, height: 820 }],
  ['1920x632', { width: 1920, height: 632 }]   // laptop, mouse (6.K4b-3): only the new states
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

    // 6.K4b-3: the card is not scrolled
    for (const [y, dosya] of [['yarim', 'yarim-hata'], ['suruyor', 'olusturuluyor']]) {
      await ac(page, false, DOLU, 'acik', y);
      await page.screenshot({ path: join(OUT, `${ad}-${dosya}.png`) });
      tablo.push([`${ad} ${dosya}`, await olc(page)]);
    }
    if (laptop) {
      await ac(page, false, DOLU);
      await page.screenshot({ path: join(OUT, `${ad}-dolu.png`) });
      tablo.push([`${ad} dolu`, await olc(page)]);
      await ctx.close();
      continue;
    }

    await ac(page, false, null);
    await page.screenshot({ path: join(OUT, `${ad}-bos.png`) });
    tablo.push([`${ad} boş`, await olc(page)]);

    await ac(page, false, DOLU);
    await page.screenshot({ path: join(OUT, `${ad}-dolu.png`) });
    tablo.push([`${ad} dolu`, await olc(page)]);
    if (ad === '390') {
      await kartKaydir(page, 99999);
      await wait(150);
      await page.screenshot({ path: join(OUT, `${ad}-dolu-alt.png`) });
      await kartKaydir(page, 0);
    }

    // the tree: "+" on the second unit, then "↓" on the new topic (into the next unit)
    await page.evaluate(() => {
      document.querySelector('.ks-unite:nth-of-type(n) [data-islem="konuEkle"][data-u="1"]').click();
    });
    await wait(80);
    await page.evaluate(() => {
      const yeni = document.querySelector('.ks-konu.ks-yeni');   // the row just added (lit up), in any language
      yeni.querySelector('[data-yon="1"]').click();
    });
    await wait(150);
    await page.screenshot({ path: join(OUT, `${ad}-agac-islem.png`) });
    tablo.push([`${ad} + ve ↓`, await olc(page)]);

    await ac(page, true, ENGEL);
    await page.screenshot({ path: join(OUT, `${ad}-engel.png`) });
    tablo.push([`${ad} engel`, await olc(page)]);
    await kartKaydir(page, 99999);
    await wait(150);
    await page.screenshot({ path: join(OUT, `${ad}-olcum.png`) });

    // 6.K4b
    await ac(page, false, DOLU, 'acik');
    tablo.push([`${ad} açık`, await olc(page)]);
    for (const y of ['suruyor', 'ag', 'izin']) {
      await ac(page, y === 'ag', DOLU, 'acik', y);
      await kartKaydir(page, 99999);
      await wait(150);
      await page.screenshot({ path: join(OUT, `${ad}-${y}.png`) });
      tablo.push([`${ad} ${y}`, await olc(page)]);
    }
    await ctx.close();
  }
  for (const [ad, o] of tablo) console.log(ad.padEnd(24), JSON.stringify(o));
  console.log('Görüntüler:', OUT);
} finally {
  await browser.close();
  dev.kill();
}
