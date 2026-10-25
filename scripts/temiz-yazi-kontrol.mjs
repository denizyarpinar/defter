// Task 6.4e-1: the clean-handwriting core in a real browser, without Drive and without signing in.
// Usage: node scripts/temiz-yazi-kontrol.mjs [output folder]
// A Vite dev server on its own port; a blank page (served by page.route, not a file) imports the app's own
// modules. The atlas package comes from disk (../defter-test-dosyalari/atlas/4-paket, outside the repo; missing → skipped).
// 1. PNG decoding in the browser (createImageBitmap + canvas, atlasCoz.ts) = the Python D values, bit for bit,
//    for the first 3 samples (5-referans/d-ornek.json from `uret.py referans`; missing → this part is skipped).
// 2. A sample read page drawn at 1180×820, 820×1180 and 390×844 (×2 pixels), tukenmez + yumusak, three papers.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4186;
const URL = `http://localhost:${PORT}/`;
const OUT = process.argv[2] ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\temiz-yazi-6.4e';
const ATLAS = join(ROOT, '..', 'defter-test-dosyalari', 'atlas');
const PAKET = join(ATLAS, '4-paket');
const REF = join(ATLAS, '5-referans', 'd-ornek.json');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

if (!existsSync(join(PAKET, 'el-yazisi-atlas.json'))) {
  console.log(`Atlas paketi yok (${PAKET}); kontrol atlandı. Önce: tools/atlas/.venv/Scripts/python tools/atlas/uret.py paket`);
  process.exit(0);
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

const SAYFA = {
  satirlar: [
    { girinti: 0, parcalar: [{ metin: 'Kuvvet ağırlık öğrenci Şekil üç İçerik', renk: 'kirmizi' }] },
    { girinti: 0, parcalar: [{ metin: 'Beispiele für Kräfte:', renk: 'mavi' }] },
    { girinti: 1, parcalar: [{ metin: 'Gewichtskraft', renk: 'mavi' }, { metin: '(ağırlık)', renk: 'siyah' }] },
    { girinti: 1, parcalar: [{ metin: 'Reibung', renk: 'mavi' }, { metin: 'Rebung', renk: 'mavi', ustuCizili: true }, { metin: '(sürtünme)', renk: 'siyah' }] },
    { girinti: 1, parcalar: [{ metin: 'Federkaft', duzeltme: 'Federkraft', renk: 'yesil' }, { metin: 'F = -D \\cdot s', renk: 'siyah', tur: 'formul' }] },
    { girinti: 0, parcalar: [{ metin: '\\vec{F} = m \\cdot \\vec{a}', renk: 'kirmizi', tur: 'formul' }, { metin: 'Newton 2.', renk: 'diger' }] },
    { girinti: 2, cizim: 'kutuya etki eden kuvvetler, oklarla' },
    { girinti: 0, parcalar: [{ metin: 'Uzun bir satır kelime kaydırmayı göstermek için yazılmıştır ve sayfanın sağ kenarına ulaşınca bir alt satıra geçer; kurşun kalemle.', renk: 'kursun' }] },
    { girinti: 0, parcalar: [{ metin: 'Eksik harfler: q J Q 7 ; " \'', renk: 'siyah' }] },
  ]
};
const BOYUTLAR = [[1180, 820], [820, 1180], [390, 844]];
const STILLER = ['tukenmez', 'yumusak'];
const KAGITLAR = ['kareli', 'duz', 'cizgili'];

const dev = await startDev();
const browser = await chromium.launch({ channel: 'chrome' });
let hata = false;
try {
  mkdirSync(OUT, { recursive: true });
  const ctx = await browser.newContext({ deviceScaleFactor: 2 });
  await ctx.route(`${URL}__temiz.html`, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#ddd"></body>' }));
  await ctx.route(`${URL}__atlas/*`, r => {
    const ad = r.request().url().split('/').pop();
    const yol = ad === 'd-ornek.json' ? REF : join(PAKET, ad);
    return existsSync(yol) ? r.fulfill({ body: readFileSync(yol), contentType: ad.endsWith('.png') ? 'image/png' : 'application/json' }) : r.fulfill({ status: 404 });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.error('sayfa hatası:', e.message); hata = true; });
  await page.goto(`${URL}__temiz.html`);

  // atlas + decoding, kept on window for the shots
  const kur = await page.evaluate(async () => {
    const [{ atlasJsonOku }, { temizYaziciKur }] = await Promise.all([import('/src/elYazisi/atlasSema.ts'), import('/src/elYazisi/temizSayfa.ts')]);
    const atlas = atlasJsonOku(await (await fetch('/__atlas/el-yazisi-atlas.json')).text());
    const y = await temizYaziciKur(atlas, await (await fetch('/__atlas/el-yazisi-atlas.png')).blob());
    window.__y = y;
    const ref = await fetch('/__atlas/d-ornek.json');
    if (!ref.ok) return { coz: y.sure.coz, ref: false };
    const { ornekD } = await import('/src/elYazisi/atlasCoz.ts');
    const sonuc = [];
    for (const o of (await ref.json()).ornekler) {
      const g = ornekD(y.sayfa, atlas.karakterler[o.karakter][o.sira]);
      let fark = 0;
      for (let i = 0; i < o.D.length; i++) if (g.D[i] !== o.D[i]) fark++;
      sonuc.push({ karakter: o.karakter, sira: o.sira, piksel: o.D.length, farkli: fark, boyut: g.w === o.w && g.h === o.h });
    }
    return { coz: y.sure.coz, ref: true, sonuc };
  });
  console.log(`PNG çözme (tarayıcı): ${kur.coz} ms`);
  if (!kur.ref) console.log('5-referans/d-ornek.json yok; D karşılaştırması atlandı (önce uret.py referans).');
  else for (const s of kur.sonuc) {
    const tamam = s.boyut && s.farkli === 0;
    if (!tamam) hata = true;
    console.log(`D "${s.karakter}"[${s.sira}]: ${s.piksel} piksel, farklı ${s.farkli}${s.boyut ? '' : ', BOYUT FARKLI'} → ${tamam ? 'bire bir aynı' : 'FARKLI'}`);
  }

  for (const [w, h] of BOYUTLAR) {
    await page.setViewportSize({ width: w, height: h });
    for (const stil of STILLER) {
      for (const kagit of KAGITLAR) {
        const r = await page.evaluate(async ([sayfa, stil, kagit]) => {
          const { temizSayfa } = await import('/src/elYazisi/temizSayfa.ts');
          document.body.replaceChildren();
          const c = document.createElement('canvas');
          const en = 595, boy = 842;
          const css = Math.min(innerWidth - 32, (innerHeight - 32) * en / boy);
          c.style.cssText = `display:block;margin:16px auto;width:${css}px;box-shadow:0 1px 4px rgba(0,0,0,.2)`;
          document.body.append(c);
          const r = temizSayfa(c, window.__y, sayfa, { en, boy, genislik: css * devicePixelRatio, yukseklik: css * devicePixelRatio * boy / en, stil, kagit });
          return { sure: r.sure, yeni: r.yeniGlif, xh: r.dizgi.xh, eksik: r.dizgi.eksik.join(' '), kesildi: r.dizgi.kesildi, tasma: document.documentElement.scrollWidth > innerWidth };
        }, [SAYFA, stil, kagit]);
        const ad = `${w}x${h}-${stil}-${kagit}.png`;
        await page.screenshot({ path: join(OUT, ad) });
        console.log(ad.padEnd(32), `dizgi ${r.sure.dizgi} ms · glif ${r.sure.glif} ms (${r.yeni} yeni) · çizim ${r.sure.cizim} ms · xh ${r.xh.toFixed(1)} · eksik ${r.eksik}${r.kesildi ? ' · KESİLDİ' : ''}${r.tasma ? ' · YATAY TAŞMA' : ''}`);
      }
    }
  }
  console.log('Görüntüler:', OUT);
} finally {
  await browser.close();
  dev.kill();
}
if (hata) process.exit(1);
