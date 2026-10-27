// Task 6.5-1: the two languages' check.
// Usage: npm run build && node scripts/dil-kontrol.mjs [output folder] [--sadece-sayim]
// (a) String literals with Turkish letters in src/ (not the tests, src/dil/, dev / measurement files, console.* lines):
//     file:line list + count. Never fails (the count goes to zero in 6.5-4).
//     Task 6.5-3: a line ending in "// dil-kontrol: yoksay" (a programmer's error, never shown) is counted apart.
// (b) ?lang=en and ?lang=tr at 390 / 820 / 1280: the sign-in card, the library (?demo), Özelleştir open → PNGs,
//     and every visible element whose content is wider than its box (scrollWidth > clientWidth + 1), plus the top bar's rows.
//     Task 6.5-2a: also the search panel ("or"), a book on the desk (Linear Algebra, opened from the search), and —
//     from a dev server, as kitap-sihirbazi-kontrol / kurulum-karti-kontrol do it, no Drive — the book wizard
//     (filled) and the set-up card.
// (c) Task 6.5-2a: public/ornek/en.json covers every name of the sample library (shelves; each book's title, spine,
//     course and its units / topics / chapters by their order). A missing one is listed (stays Turkish). Never fails.
// (d) Task 6.5-3: the reader (dev server, ?demo, no Drive) at 390 / 820 / 1180 / 1280 in both languages: book mode,
//     PDF mode, the pen bar on, İçindekiler open, the reader's search, the page popover (window.defterBosSayfaSahte),
//     the trash dialog (ui/copOnay.ts in the page, nothing written), an empty topic (routed into the sample book).
//     Overflow as in (b), the reader included, and the rows of the material bar (#oBar) and the pen bar (#oTools).
//     `--okuyucu`: only (a), (c) and (d).
// (e) Task 6.5-4a: adding (dev server, ?demo, no Drive): the Fotoğraf ekle panel, the Dosya ekle panel, an adding error
//     (a Word file in the sample library), the El yazısını oku panel (its module in the page, no account: its own
//     "sign in first" error) and the pending-photo toast (a fake GIS + Drive as dil-drive-kontrol.mjs, one record put
//     in IndexedDB first). EN and TR at 390 / 820 / 1280, overflow as in (b). `--ekleme`: only (a), (c) and (e).
// Task 6.5-4a: (a) fails (exit code 1) when a Turkish string is left or tr.ts / en.ts have different keys.
//     `npm run dil` = `--sadece-sayim`: (a) and (c) only, no browser.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4181;
const ORIGIN = `http://localhost:${PORT}`;
const DEV_PORT = 4184;
const DEV = `http://localhost:${DEV_PORT}`;
const args = process.argv.slice(2);
const SADECE_SAYIM = args.includes('--sadece-sayim');
const SADECE_OKUYUCU = args.includes('--okuyucu');
const SADECE_EKLEME = args.includes('--ekleme');
const OUT = args.find(a => !a.startsWith('--')) ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\dil-6.5-4a';
const TR_HARF = /[çğıöşüÇĞİÖŞÜ]/;

// ---- (a) Turkish string literals ----

// dev / measurement files: their texts stay Turkish (Deniz's tools)
const HARIC = [/\.test\.ts$/, /^src[\\/]dil[\\/]/, /olcum/i, /Dene\.ts$/, /Sahte\.ts$/, /atlas/i, /Test\.ts$/];
// Task 6.5-4a: dev files by name, each with why it never reaches the app's screen (counted apart, never fails)
const DEV_DOSYALARI = {
  'src/ocrAi/deneme.ts': 'only ocr-ai.html (dev page, not a build input: vite builds index.html only)',
  'src/ocrAi/gorsel.ts': 'only ocrAi/deneme.ts',
  'src/ocr/score.ts': 'only ocrAi/deneme.ts',
  'src/ocr/kayit/kayitDeneSec.ts': 'only ocr/kayit/kayitDene.ts, loaded by ocrAi/deneme.ts',
  'src/arama/dizinOlc.ts': 'main.ts: if (import.meta.env.DEV) import(...) (window.defterDizinOlc)',
  'src/arama/ocrDizinOlc.ts': 'main.ts: if (import.meta.env.DEV) import(...) (window.defterOcrDizinOlc)',
};
const devSayi = new Map();

function dosyalar(dir) {
  const out = [];
  for (const ad of readdirSync(dir)) {
    const p = join(dir, ad);
    if (statSync(p).isDirectory()) out.push(...dosyalar(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

// A small tokenizer: comments are skipped; '…', "…" and `…` (with ${…} inside) are literals; a regex is skipped.
function literaller(src) {
  const sonuc = [];
  let i = 0, satir = 1, onceki = '';
  const yigin = [];   // template literals waiting for their ${…} to close
  let derinlik = 0;   // braces inside the current ${…}
  const ilerle = () => { if (src[i] === '\n') satir++; i++; };
  function dize(tirnak, basSatir) {
    let s = '';
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { s += c + (src[i + 1] ?? ''); ilerle(); ilerle(); continue; }
      if (c === tirnak) { ilerle(); return { s, bitti: true }; }
      if (tirnak === '`' && c === '$' && src[i + 1] === '{') { ilerle(); ilerle(); return { s, bitti: false }; }
      if (tirnak !== '`' && c === '\n') return { s, bitti: true };
      s += c; ilerle();
    }
    return { s, bitti: true, basSatir };
  }
  function ekle(s, basSatir) { if (TR_HARF.test(s)) sonuc.push({ satir: basSatir, metin: s }); }
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') ilerle(); continue; }
    if (c === '/' && n === '*') { ilerle(); ilerle(); while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) ilerle(); ilerle(); ilerle(); continue; }
    if (c === "'" || c === '"' || c === '`') {
      const bas = satir; ilerle();
      const r = dize(c, bas);
      ekle(r.s, bas);
      if (c === '`' && !r.bitti) { yigin.push(derinlik); derinlik = 0; }
      onceki = c; continue;
    }
    if (c === '}' && yigin.length && derinlik === 0) {
      // back in the template literal
      derinlik = yigin.pop(); ilerle();
      const bas = satir;
      const r = dize('`', bas);
      ekle(r.s, bas);
      if (!r.bitti) { yigin.push(derinlik); derinlik = 0; }
      onceki = '`'; continue;
    }
    if (c === '{' && yigin.length) derinlik++;
    if (c === '}' && yigin.length) derinlik--;
    // a regex literal: after an operator / opening bracket / keyword-like start
    if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]|^$/.test(onceki)) {
      ilerle();
      let sinif = false;
      while (i < src.length && src[i] !== '\n') {
        const d = src[i];
        if (d === '\\') { ilerle(); ilerle(); continue; }
        if (d === '[') sinif = true; else if (d === ']') sinif = false;
        else if (d === '/' && !sinif) { ilerle(); break; }
        ilerle();
      }
      onceki = '/'; continue;
    }
    if (!/\s/.test(c)) onceki = c;
    ilerle();
  }
  return sonuc;
}

const YOKSAY = /\/\/.*\bdil-kontrol:\s*yoksay\s*$/;
const yoksayilan = [];

function turkceDizeler() {
  const liste = [];
  for (const p of dosyalar(join(ROOT, 'src'))) {
    const rel = relative(ROOT, p);
    if (HARIC.some(r => r.test(rel))) continue;
    const yol = rel.replace(/\\/g, '/');
    if (DEV_DOSYALARI[yol]) { devSayi.set(yol, literaller(readFileSync(p, 'utf8')).length); continue; }
    const src = readFileSync(p, 'utf8');
    const satirlar = src.split('\n');
    for (const l of literaller(src)) {
      if (/console\.\w+\(/.test(satirlar[l.satir - 1] ?? '')) continue;
      if (YOKSAY.test((satirlar[l.satir - 1] ?? '').trimEnd())) { yoksayilan.push(`${rel.replace(/\\/g, '/')}:${l.satir}`); continue; }
      liste.push({ yer: `${rel.replace(/\\/g, '/')}:${l.satir}`, metin: l.metin.replace(/\s+/g, ' ').slice(0, 70) });
    }
  }
  return liste;
}

const dizeler = turkceDizeler();
const dosyaSayisi = new Map();
for (const d of dizeler) { const f = d.yer.replace(/:\d+$/, ''); dosyaSayisi.set(f, (dosyaSayisi.get(f) ?? 0) + 1); }
console.log('(a) Türkçe harfli dize sabitleri');
for (const d of dizeler) console.log(`  ${d.yer}  ${d.metin}`);
console.log('\n  Dosya başına (çoktan aza):');
for (const [f, n] of [...dosyaSayisi].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${f}`);
console.log(`\n  TOPLAM: ${dizeler.length} dize, ${dosyaSayisi.size} dosya`);
console.log(`  YOKSAYILAN ("// dil-kontrol: yoksay"): ${yoksayilan.length} dize${yoksayilan.length ? ' — ' + yoksayilan.join(', ') : ''}`);
console.log(`  DEV DOSYASI (sayılmaz): ${[...devSayi.values()].reduce((a, b) => a + b, 0)} dize, ${devSayi.size} dosya`);
for (const [f, n] of devSayi) console.log(`    ${String(n).padStart(3)}  ${f} — ${DEV_DOSYALARI[f]}`);

// tr.ts and en.ts: the same keys (the type catches a missing en key, not an extra one)
const anahtarlar = (f) => new Set([...readFileSync(join(ROOT, 'src', 'dil', f), 'utf8').matchAll(/^  '([^']+)':/gm)].map(m => m[1]));
const trA = anahtarlar('tr.ts'), enA = anahtarlar('en.ts');
const sadeceTr = [...trA].filter(k => !enA.has(k)), sadeceEn = [...enA].filter(k => !trA.has(k));
console.log(`  ANAHTAR: tr ${trA.size}, en ${enA.size}${sadeceTr.length ? ' · sadece tr: ' + sadeceTr.join(', ') : ''}${sadeceEn.length ? ' · sadece en: ' + sadeceEn.join(', ') : ''}`);
if (dizeler.length || sadeceTr.length || sadeceEn.length) {
  process.exitCode = 1;
  console.log(`  HATA: ${dizeler.length} Türkçe dize kaldı${sadeceTr.length + sadeceEn.length ? `, ${sadeceTr.length + sadeceEn.length} anahtar farkı` : ''}. Çevir (t()) ya da gerçekten ekranda değilse "// dil-kontrol: yoksay".`);
}
console.log('');

// ---- (c) the sample library's English layer ----

function katmanKontrolu() {
  const ornek = join(ROOT, 'public', 'ornek');
  const oku = (p) => JSON.parse(readFileSync(join(ornek, p), 'utf8'));
  const en = existsSync(join(ornek, 'en.json')) ? oku('en.json') : {};
  const eksik = [];
  let sayi = 0;
  const bak = (yer, var_) => { sayi++; if (!var_) eksik.push(yer); };
  for (const r of oku('kitaplik.json').raflar ?? []) bak(`raf ${r.id} (${r.ad})`, !!en.raflar?.[r.id]);
  for (const id of oku('index.json').kitaplar ?? []) {
    const yol = join('kitaplar', id, 'kitap.json');
    if (!existsSync(join(ornek, yol))) { console.log(`  not: ${id} kitap.json'suz; ekranda klasör adı (id) görünür`); continue; }
    const k = oku(yol), c = en.kitaplar?.[id] ?? {};
    for (const a of ['baslik', 'sirt', 'ders']) if (k[a]) bak(`${id}.${a} (${k[a]})`, !!c[a]);
    (k.uniteler ?? []).forEach((u, i) => {
      bak(`${id} ünite ${i + 1} (${u.baslik})`, !!c.uniteler?.[i]?.baslik);
      (u.konular ?? []).forEach((t, j) => bak(`${id} ünite ${i + 1} konu ${j + 1} (${t.baslik})`, !!c.uniteler?.[i]?.konular?.[j]));
    });
    (k.bolumler ?? []).forEach((b, i) => bak(`${id} bölüm ${i + 1} (${b.baslik})`, !!c.bolumler?.[i]));
  }
  console.log(`(c) Örnek kitaplık en.json: ${sayi} ad, ${eksik.length} eksik`);
  for (const e of eksik) console.log(`  UYARI eksik: ${e}`);
  console.log('');
}
katmanKontrolu();
if (SADECE_SAYIM) process.exit(process.exitCode ?? 0);

// ---- (b) screenshots + overflow ----

const { chromium } = await import('playwright-core');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function startPreview() {
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(ORIGIN)).ok) return child; } catch { /* not up yet */ }
    await wait(200);
  }
  child.kill();
  throw new Error(`vite preview ${PORT} portunda başlamadı. Önce "npm run build" çalıştı mı?`);
}

// a dev server (the wizard and the set-up card are opened through the app's own modules, as their scripts do)
async function startDev() {
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, '--port', String(DEV_PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(DEV)).ok) return child; } catch { /* not up yet */ }
    await wait(200);
  }
  child.kill();
  throw new Error(`vite ${DEV_PORT} portunda başlamadı.`);
}

const SIHIRBAZ = {
  en: { ad: 'Calculus 1', metin: 'Course info\n\n# Limits\n- Sequences\n- Series\n- Series\n\n# Derivatives\n1. Rules\n2. Applications\n\n# Practice exam' },
  tr: { ad: 'Analiz 1', metin: 'Ders bilgisi\n\n# Limitler\n- Diziler\n- Seriler\n- Seriler\n\n# Türevler\n1. Kurallar\n2. Uygulamalar\n\n# Deneme sınavı' }
};

async function sihirbazAc(page, d) {
  await page.evaluate(async (d) => {
    const [{ kitapSihirbaziAc }, { hideLogin }] = await Promise.all([import('/src/ui/kitapSihirbazi.ts'), import('/src/ui/login.ts')]);
    hideLogin();
    kitapSihirbaziAc({ raflar: [{ id: 'r1', ad: 'Courses' }, { id: 'r2', ad: 'Math' }], mevcutIdler: [], olcum: false, kilit: 'acik', olustur: async () => {} });
    const ad = document.querySelector('#kitapSihirbazi input[type=text]');
    ad.value = d.ad; ad.dispatchEvent(new Event('input'));
    const m = document.querySelector('#kitapSihirbazi textarea');
    m.value = d.metin; m.dispatchEvent(new Event('input'));
    document.activeElement?.blur();
  }, d);
  await wait(400);
}

async function kurulumAc(page) {
  await page.evaluate(async () => {
    const [{ setKurulum }, { hideLogin }] = await Promise.all([import('/src/ui/driveStatus.ts'), import('/src/ui/login.ts')]);
    hideLogin();
    setKurulum({ dugme: 'kur', kilitli: false, mesgul: false, hata: null, izinYok: false, ilerleme: null });
  });
  await wait(400);
}

// visible elements wider inside than their box (the canvas, the 3D stage and intended scrollers left out)
const tasanlar = (okuyucuDahil = false) => [...document.querySelectorAll('body *')].filter(e => {
  if (e.closest(okuyucuDahil ? '#stage, svg, canvas, noscript' : '#stage, svg, canvas, noscript, #reader')) return false;
  const st = getComputedStyle(e);
  if (st.display === 'none' || st.visibility === 'hidden' || e.getClientRects().length === 0) return false;
  if (/(auto|scroll)/.test(st.overflowX)) return false;
  return e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0;
}).map(e => {
  const ad = e.id ? `#${e.id}` : `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''}`;
  return `${ad} (${e.scrollWidth}>${e.clientWidth}) "${(e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50)}"`;
}).concat(document.documentElement.scrollWidth > innerWidth + 1 ? [`SAYFA yatay kayıyor (${document.documentElement.scrollWidth}>${innerWidth})`] : []);

// the top bar: rows of its visible children, and is #dilBtn shown
const cubuk = () => {
  const kids = [...document.querySelector('.bar').children].filter(e => getComputedStyle(e).display !== 'none' && !e.hidden && e.getClientRects().length);
  const rows = new Set(kids.map(e => { const r = e.getBoundingClientRect(); return Math.round((r.top + r.bottom) / 2 / 12); })).size;
  const d = document.querySelector('#dilBtn');
  const dil = d && getComputedStyle(d).display !== 'none' ? `düğme (${d.textContent})` : 'düğme gizli';
  return { rows, dil };
};

const BOYUT = { 390: 844, 820: 1180, 1180: 820, 1280: 800 };

// ---- (d) the reader ----

const ornekJson = (p) => JSON.parse(readFileSync(join(ROOT, 'public', 'ornek', p), 'utf8'));
const KONU = {
  tr: ornekJson('kitaplar/programlamaya-giris/kitap.json').uniteler[0].konular[0].baslik,
  en: ornekJson('en.json').kitaplar['programlamaya-giris'].uniteler[0].konular[0]
};
const BOS = { klasor: 'Unite-99-Bos/Konu-99-Bos', tr: { unite: 'Boş ünite', konu: 'Boş konu' }, en: { unite: 'Empty unit', konu: 'Empty topic' } };
const OKUYUCU_ARAMA = 'de';

// rows of the visible children of a bar (centre lines, as cubuk)
const satirlar = (sec) => {
  const bar = document.querySelector(sec);
  if (!bar || bar.hidden || !bar.getClientRects().length) return null;
  const kids = [...bar.querySelectorAll(':scope > *, :scope > * > *')].filter(e => getComputedStyle(e).display !== 'none' && !e.hidden && e.getClientRects().length && e.tagName === 'BUTTON');
  return new Set(kids.map(e => { const r = e.getBoundingClientRect(); return Math.round((r.top + r.bottom) / 2 / 12); })).size;
};

async function okuyucuAc(lang, w) {
  const page = await browser.newPage({ viewport: { width: w, height: BOYUT[w] }, deviceScaleFactor: 2, hasTouch: w < 1280 });
  page.on('pageerror', e => console.error('Sayfa hatası:', e.message));
  page.on('dialog', d => { void d.dismiss(); });
  // an empty topic (its folder has no files) at the end of the sample book
  await page.route('**/ornek/index.json', async route => {
    const json = await (await route.fetch()).json();
    json.klasorler['programlamaya-giris'][BOS.klasor] = {};
    await route.fulfill({ json });
  });
  await page.route('**/ornek/kitaplar/programlamaya-giris/kitap.json', async route => {
    const json = await (await route.fetch()).json();
    json.uniteler.push({ baslik: BOS[lang].unite, konular: [{ baslik: BOS[lang].konu, klasor: BOS.klasor, durum: 'okunmadi' }] });
    await route.fulfill({ json: { ...json, kurdele: null } });
  });
  await page.goto(`${DEV}/?demo&lang=${lang}`);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).display === 'none', null, { timeout: 60_000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { try { localStorage.setItem('defter.okumaModu', 'kitap'); } catch { /* */ } });
  await page.locator('#araBtn').click();
  await page.locator('#aramaPaneli input').fill('program');
  await page.waitForSelector('#aramaPaneli .ap-satir', { timeout: 10_000 });
  await page.waitForTimeout(300);
  await page.locator('#aramaPaneli .ap-satir').first().click();
  await page.waitForSelector('#reader.show', { timeout: 15_000 });
  await page.waitForTimeout(2200);
  const konu = page.locator('#reader [data-t]', { hasText: KONU[lang] }).first();
  if (!await konu.isVisible() && await page.locator('#next').isEnabled()) { await page.click('#next'); await page.waitForTimeout(700); }
  await konu.click();
  await page.waitForSelector('#okuyucu.show', { timeout: 15_000 });
  await page.waitForFunction(() => /\d+ \/ \d+/.test(document.querySelector('#oPno')?.textContent ?? ''), null, { timeout: 20_000 });
  await page.waitForTimeout(1500);
  return page;
}

async function okuyucuEkranlari(lang, w) {
  const page = await okuyucuAc(lang, w);
  const ek = (ad) => join(OUT, `okuyucu-${ad}-${lang}-${w}.png`);
  const kaydet = async (ad, ekstra = {}) => {
    await page.screenshot({ path: ek(ad) });
    tablo.push({ ekran: `okuyucu ${ad} ${lang} ${w}`, tasan: await page.evaluate(tasanlar, true),
      cubuk: { rows: await page.evaluate(satirlar, '#oBar'), dil: `kalem çubuğu ${await page.evaluate(satirlar, '#oTools') ?? '-'} satır` }, ...ekstra });
  };
  try {
    await page.locator('#oMode [data-m="kitap"]').click();
    await page.waitForTimeout(1500);
    await kaydet('kitap');
    await page.locator('#oMode [data-m="pdf"]').click();
    await page.waitForTimeout(1500);
    await kaydet('pdf');

    // the pen bar (the "pen on" toast too)
    await page.locator('#oPenBtn').click();
    await page.waitForTimeout(1500);
    await kaydet('kalem');
    await page.locator('#oTools [data-kapat]').click();
    await page.waitForTimeout(800);

    // İçindekiler
    await page.locator('#oTocBtn').click();
    await page.waitForTimeout(800);
    await kaydet('icindekiler');
    await page.keyboard.press('Escape');   // the panel's veil covers the button
    await page.waitForTimeout(600);

    // the reader's search
    await page.locator('#oAraBtn').click();
    await page.locator('#oAraKutu').fill(OKUYUCU_ARAMA);
    await page.waitForFunction(() => (document.querySelector('#oAraSayac')?.textContent ?? '').trim() !== '', null, { timeout: 30_000 });
    await page.waitForTimeout(800);
    await kaydet('arama', { kitap: await page.locator('#oAraSayac').textContent() });
    await page.locator('#oAraKapat').click();
    await page.waitForTimeout(500);

    // the page popover: a writable copy of the file on screen in memory (dev only)
    await page.evaluate(() => window.defterBosSayfaSahte({}));
    await page.waitForSelector('#oSayfaEkle:not([hidden])', { timeout: 15_000 });
    await page.locator('#oSayfaEkle').click();
    await page.waitForFunction(() => !document.querySelector('#oSayfaEkleBalon')?.hidden && !!document.querySelector('#oSayfaEkleBalon [data-sil]'), null, { timeout: 15_000 });
    await page.waitForTimeout(500);
    await kaydet('balon');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // the trash dialog of a topic (counted, confirm step); nothing is written
    await page.evaluate(async (ad) => {
      const m = await import('/src/ui/copOnay.ts');
      const hic = async () => { throw new Error('dil-kontrol: yazma yok'); };
      m.copOnayAc({ tur: 'konu', ad, calistir: hic, vazgec: hic, girisYap() {}, basarili() {}, onizle: async () => ({ konu: 1, dosya: 3, bekleyen: 0 }) });
    }, KONU[lang]);
    await page.waitForSelector('#copOnay .co-kart[data-adim="onay"]', { timeout: 10_000 });
    await page.waitForTimeout(400);
    await kaydet('cop');
    await page.locator('#copOnay .fp-vazgec').click();
    await page.waitForTimeout(500);

    // an empty topic (from the contents)
    await page.locator('#oTocBtn').click();
    await page.waitForTimeout(600);
    await page.locator('#oTocList button[data-u]', { hasText: BOS[lang].konu }).click();
    await page.waitForFunction(() => document.querySelector('#okuyucu')?.classList.contains('o-materyalsiz'), null, { timeout: 15_000 });
    await page.waitForTimeout(1200);
    await kaydet('boskonu', { kitap: await page.locator('#oMsg').textContent() });
  } catch (e) {
    tablo.push({ ekran: `okuyucu HATA ${lang} ${w}`, tasan: [`HATA: ${e.message.split('\n')[0]}`] });
    await page.screenshot({ path: ek('hata') }).catch(() => {});
  } finally {
    await page.close();
  }
}
// ---- (e) adding (6.5-4a) ----

// a notebook-like page as a JPEG (made here, no real notes)
const { default: sharp } = await import('sharp');
const sayfaJpeg = async (n) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="100%" height="100%" fill="#fbfaf4"/>${
  Array.from({ length: 30 }, (_, i) => `<line x1="80" x2="1120" y1="${120 + i * 48}" y2="${120 + i * 48}" stroke="#c9d6e8" stroke-width="2"/>`).join('')
}<text x="100" y="100" font-size="56" fill="#234">Seite ${n}</text></svg>`)).jpeg({ quality: 85 }).toBuffer();
const JPEGLER = [await sayfaJpeg(1), await sayfaJpeg(2)];
const dosya = (name, mimeType, buffer) => ({ name, mimeType, buffer });

async function eklemeEkranlari(lang, w) {
  const page = await okuyucuAc(lang, w);
  const ek = (ad) => join(OUT, `ekleme-${ad}-${lang}-${w}.png`);
  const kaydet = async (ad, ekstra = {}) => {
    await page.screenshot({ path: ek(ad) });
    tablo.push({ ekran: `ekleme ${ad} ${lang} ${w}`, tasan: await page.evaluate(tasanlar, true), ...ekstra });
  };
  try {
    // Fotoğraf ekle: two photos, prepared in the panel (sample library: a preview, Ekle off)
    await page.setInputFiles('#oFotoInput', JPEGLER.map((b, i) => dosya(`seite-${i + 1}.jpg`, 'image/jpeg', b)));
    await page.waitForFunction(() => document.querySelectorAll('#fotoPanel .fp-oge').length === 2 && !!document.querySelector('#fotoPanel .fp-durum')?.hidden, null, { timeout: 30_000 });
    await page.waitForTimeout(500);
    await kaydet('foto', { kitap: await page.locator('#fotoPanel .fp-hedef').textContent() });
    await page.locator('#fotoPanel .fp-vazgec').click();
    await page.waitForTimeout(500);

    // Dosya ekle: two images → one PDF
    await page.setInputFiles('#oDosyaInput', JPEGLER.map((b, i) => dosya(`blatt-${i + 1}.jpg`, 'image/jpeg', b)));
    await page.waitForFunction(() => document.querySelectorAll('#dosyaPanel .fp-oge').length === 2, null, { timeout: 30_000 });
    await page.waitForTimeout(800);
    await kaydet('dosya', { kitap: await page.locator('#dosyaPanel .dp-bilgi, #dosyaPanel .fp-durum').first().textContent().catch(() => '') });
    await page.locator('#dosyaPanel .fp-vazgec').first().click();
    await page.waitForTimeout(500);

    // an adding error: a Word file in the sample library → refused with a toast
    await page.setInputFiles('#oDosyaInput', [dosya('notlar.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from('PK\u0003\u0004 deneme'))]);
    await page.waitForFunction(() => (document.querySelector('#toast')?.textContent ?? '').includes('PDF'), null, { timeout: 15_000 });
    await page.waitForTimeout(400);
    await kaydet('hata', { kitap: await page.locator('#toast').textContent() });

    // El yazısını oku: the panel's module in the page (no account, nothing sent); "Sayfaları kontrol et" → its own error
    await page.evaluate(async () => {
      const m = await import('/src/ocr/okuyucuPanel.ts');
      // an open file as the reader would give it (no token: "Sayfaları kontrol et" stops before any request)
      const snap = { file: 'demo-ozet', version: '1', content: {}, pages: [{ page: { ad: 'ozet.pdf', pdfSayfa: 1 }, index: 0 }], focus: 0, yer: {}, go() {} };
      m.installReaderOcr(() => snap).ac();
    });
    await page.locator('#reader-ocr-search [data-prepare]').click();
    await page.waitForFunction(() => (document.querySelector('#reader-ocr-search [data-status]')?.textContent ?? '') !== '', null, { timeout: 10_000 });
    await page.waitForTimeout(300);
    await kaydet('ocr', { kitap: await page.locator('#reader-ocr-search [data-status]').textContent() });
  } catch (e) {
    tablo.push({ ekran: `ekleme HATA ${lang} ${w}`, tasan: [`HATA: ${e.message.split('\n')[0]}`] });
    await page.screenshot({ path: ek('hata-betik') }).catch(() => {});
  } finally {
    await page.close();
  }
}

// the pending-photo toast: a fake GIS + Drive (empty library), one waiting record in IndexedDB, then sign in
const GIS = `window.google = { accounts: { oauth2: {
  initTokenClient: options => ({ requestAccessToken: () => {
    options.callback({ access_token: 'fake-local-test', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file' });
  } }),
  hasGrantedAllScopes: (response, requested) => response.scope.split(' ').includes(requested)
} } };`;
const KITAPLIK_JSON = { surum: 1, raflar: [{ id: 'raf-1', ad: 'Raf 1', kitaplar: [] }], oda: { duvar: '#d8cfc0', zemin: '#7a5a3c', mod: 'auto' } };

async function bekleyenToast(lang, w) {
  const context = await browser.newContext({ viewport: { width: w, height: BOYUT[w] }, deviceScaleFactor: 2, hasTouch: w < 1280 });
  const ad = join(OUT, `ekleme-bekleyen-${lang}-${w}.png`);
  const yazma = [];
  await context.route('https://accounts.google.com/**', route => route.fulfill({ contentType: 'application/javascript', body: GIS }));
  await context.route('https://www.googleapis.com/**', async route => {
    const req = route.request(), url = new URL(req.url());
    const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() !== 'GET') { yazma.push(`${req.method()} ${url.pathname}`); return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }); }
    if (url.pathname.endsWith('/about')) return json({ user: { displayName: 'Yerel deneme' } });
    if (url.pathname.endsWith('/files/library-json')) {
      if (url.searchParams.get('alt') === 'media') return json(KITAPLIK_JSON);
      return json({ id: 'library-json', modifiedTime: '2026-10-27T10:00:00.000Z' });
    }
    if (url.pathname.endsWith('/files')) {
      const q = url.searchParams.get('q') || '';
      if (q.includes("key='defterKok'")) return json({ files: [{ id: 'library-root', name: 'Defter Library', mimeType: 'application/vnd.google-apps.folder' }] });
      if (q.includes("'library-root' in parents")) return json({ files: [
        { id: 'books', name: 'kitaplar', mimeType: 'application/vnd.google-apps.folder' },
        { id: 'library-json', name: 'kitaplik.json', mimeType: 'application/json' },
      ] });
      return json({ files: [] });
    }
    return route.fulfill({ status: 404, body: '{}' });
  });
  const page = await context.newPage();
  page.on('pageerror', e => console.error('Sayfa hatası:', e.message));
  try {
    await page.goto(`${DEV}/?lang=${lang}`);
    await page.locator('#loading').waitFor({ state: 'hidden', timeout: 60_000 });
    // one record with two photos, as "Ekle" saves it (the bytes are a tiny JPEG; it is never uploaded here)
    await page.evaluate(async () => {
      const [{ bekleyenFotoDepo }, { yeniKayit }] = await Promise.all([import('/src/defter/bekleyenFoto.ts'), import('/src/defter/bekleyenFotoKayit.ts')]);
      const j = () => ({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 1, height: 1 });
      await bekleyenFotoDepo.kaydet(yeniKayit({ kitapAdi: 'Mathe 1', konuKlasorId: 'konu-x', konuBaslik: 'Graphen', hedefAd: 'ozet.pdf', jpegler: [j(), j()] }, new Date().toISOString()));
    });
    await page.locator('#loginGoogle').click();
    await page.locator('#bosKitaplik:not([hidden])').waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => /\d/.test(document.querySelector('#toast')?.textContent ?? ''), null, { timeout: 15_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: ad });
    tablo.push({ ekran: `ekleme bekleyen ${lang} ${w}`, tasan: [...await page.evaluate(tasanlar), ...yazma.map(y => `DRIVE'A YAZMA: ${y}`)],
      kitap: await page.locator('#toast').textContent() });
  } catch (e) {
    tablo.push({ ekran: `ekleme bekleyen HATA ${lang} ${w}`, tasan: [`HATA: ${e.message.split('\n')[0]}`] });
    await page.screenshot({ path: ad }).catch(() => {});
  } finally {
    await context.close();
  }
}

mkdirSync(OUT, { recursive: true });
const server = SADECE_OKUYUCU || SADECE_EKLEME ? null : await startPreview();
const dev = await startDev();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const tablo = [];
try {
  for (const lang of SADECE_OKUYUCU || SADECE_EKLEME ? [] : ['en', 'tr']) {
    for (const w of [390, 820, 1280]) {
      const page = await browser.newPage({ viewport: { width: w, height: BOYUT[w] }, deviceScaleFactor: 2 });
      page.on('pageerror', e => console.error('Sayfa hatası:', e.message));
      const hazir = () => page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).display === 'none', null, { timeout: 30_000 });

      // the sign-in card
      await page.goto(`${ORIGIN}/?lang=${lang}`);
      await hazir();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: join(OUT, `giris-${lang}-${w}.png`) });
      tablo.push({ ekran: `giriş ${lang} ${w}`, tasan: await page.evaluate(tasanlar), html: await page.evaluate(() => document.documentElement.lang) });

      // the sample library
      await page.goto(`${ORIGIN}/?demo&lang=${lang}`);
      await hazir();
      await page.waitForTimeout(1800);
      await page.screenshot({ path: join(OUT, `kitaplik-${lang}-${w}.png`) });
      tablo.push({ ekran: `kitaplık ${lang} ${w}`, tasan: await page.evaluate(tasanlar), cubuk: await page.evaluate(cubuk) });

      // Özelleştir open
      await page.locator('#custBtn').click();
      await page.waitForTimeout(700);
      await page.screenshot({ path: join(OUT, `ozellestir-${lang}-${w}.png`) });
      tablo.push({ ekran: `özelleştir ${lang} ${w}`, tasan: await page.evaluate(tasanlar), cubuk: await page.evaluate(cubuk) });

      // 6.5-2a: the search panel ("or": books, topics, file names with badges)
      await page.locator('#pClose').click();
      await page.waitForTimeout(400);
      await page.locator('#araBtn').click();
      await page.locator('#aramaPaneli input').fill('or');
      await page.waitForSelector('#aramaPaneli .ap-satir', { timeout: 10_000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(OUT, `arama-${lang}-${w}.png`) });
      tablo.push({ ekran: `arama ${lang} ${w}`, tasan: await page.evaluate(tasanlar) });

      // a book on the desk: Linear Algebra / Lineer Cebir (both have "line"), the first row (books come first)
      await page.locator('#aramaPaneli input').fill('line');
      await page.waitForSelector('#aramaPaneli .ap-satir', { timeout: 10_000 });
      await page.waitForTimeout(300);
      await page.locator('#aramaPaneli .ap-satir').first().click();
      await page.waitForSelector('#reader:not([hidden])', { timeout: 15_000 });
      await page.waitForTimeout(2200);
      await page.screenshot({ path: join(OUT, `masa-${lang}-${w}.png`) });
      tablo.push({ ekran: `masa ${lang} ${w}`, tasan: await page.evaluate(tasanlar, true), kitap: await page.locator('#rBook').textContent() });
      await page.close();

      // the wizard and the set-up card (dev server)
      const p2 = await browser.newPage({ viewport: { width: w, height: BOYUT[w] }, deviceScaleFactor: 2, hasTouch: w < 1280 });
      p2.on('pageerror', e => console.error('Sayfa hatası:', e.message));
      await p2.goto(`${DEV}/?lang=${lang}`);
      await p2.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).display === 'none', null, { timeout: 60_000 });
      await p2.waitForTimeout(800);
      await sihirbazAc(p2, SIHIRBAZ[lang]);
      await p2.screenshot({ path: join(OUT, `sihirbaz-${lang}-${w}.png`) });
      tablo.push({ ekran: `sihirbaz ${lang} ${w}`, tasan: await p2.evaluate(tasanlar) });
      await p2.evaluate(() => document.getElementById('kitapSihirbazi')?.remove());
      await kurulumAc(p2);
      await p2.screenshot({ path: join(OUT, `kurulum-${lang}-${w}.png`) });
      tablo.push({ ekran: `kurulum ${lang} ${w}`, tasan: await p2.evaluate(tasanlar) });
      await p2.close();
    }
  }
  if (!SADECE_EKLEME) for (const lang of ['en', 'tr']) for (const w of [390, 820, 1180, 1280]) await okuyucuEkranlari(lang, w);
  if (!SADECE_OKUYUCU) {
    for (const lang of ['en', 'tr']) for (const w of [390, 820, 1280]) { await eklemeEkranlari(lang, w); await bekleyenToast(lang, w); }
  }
} finally {
  await browser.close();
  server?.kill();
  dev.kill();
}

console.log('(b) Ekranlar → ' + OUT);
for (const r of tablo) {
  const c = r.cubuk ? `  çubuk: ${r.cubuk.rows} satır, ${r.cubuk.dil}` : '';
  const h = r.html ? `  <html lang="${r.html}">` : '';
  const k = r.kitap ? `  kitap: ${r.kitap}` : '';
  console.log(`  ${r.ekran.padEnd(28)} taşan: ${r.tasan.length}${c}${h}${k}`);
  for (const t of r.tasan) console.log(`      ${t}`);
}
