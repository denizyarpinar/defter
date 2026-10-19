// Task 6.K4a: control screenshots of the "Yeni kitap" wizard, without signing in and without Drive.
// Usage: node scripts/kitap-sihirbazi-kontrol.mjs [output folder]
// A Vite dev server on its own port; the page imports the app's own kitapSihirbazi.ts and opens it with made-up
// shelves (as main.ts does for a Drive library). No request goes to Google or Drive; nothing is written.
// Sizes: phone 390 × 844 (touch), iPad portrait 820 × 1180 (touch), iPad landscape 1180 × 820 (touch).
// States: empty, filled (Turkish + German, "Genel", a duplicate topic, a unit without topics), blocked (a too long
// name, a book that is already there), after the tree's "+" and "↓", and the ?olcum=1 plan box.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4183;
const URL = `http://localhost:${PORT}/`;
const OUT = process.argv[2] ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\kitap-6.K4a';

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

async function ac(page, olcum, d) {
  await page.evaluate(async ([raflar, olcum, d]) => {
    document.getElementById('kitapSihirbazi')?.remove();
    const [{ kitapSihirbaziAc }, { hideLogin }] = await Promise.all([import('/src/ui/kitapSihirbazi.ts'), import('/src/ui/login.ts')]);
    hideLogin();
    kitapSihirbaziAc({ raflar, mevcutIdler: ['mathe-1', 'lineer-cebir'], olcum });
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
  }, [RAFLAR, olcum, d]);
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
      olustur: document.querySelector('#kitapSihirbazi .fp-ekle').disabled ? 'gri' : 'açık',
      neden: document.querySelector('.ks-neden').textContent
    };
  });
}

const BOYUTLAR = [
  ['390', { width: 390, height: 844 }],
  ['820', { width: 820, height: 1180 }],
  ['1180', { width: 1180, height: 820 }]
];

const dev = await startDev();
const browser = await chromium.launch({ channel: 'chrome' });
const tablo = [];
try {
  mkdirSync(OUT, { recursive: true });
  for (const [ad, viewport] of BOYUTLAR) {
    const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(URL);
    await page.waitForFunction(() => document.querySelector('#loading')?.hidden, null, { timeout: 30_000 });

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
      const yeni = [...document.querySelectorAll('.ks-konu')].find(s => s.textContent.includes('Yeni konu'));
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
    await ctx.close();
  }
  for (const [ad, o] of tablo) console.log(ad.padEnd(14), JSON.stringify(o));
  console.log('Görüntüler:', OUT);
} finally {
  await browser.close();
  dev.kill();
}
