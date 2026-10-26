// Task 6.5-1: the two languages' check.
// Usage: npm run build && node scripts/dil-kontrol.mjs [output folder] [--sadece-sayim]
// (a) String literals with Turkish letters in src/ (not the tests, src/dil/, dev / measurement files, console.* lines):
//     file:line list + count. Never fails (the count goes to zero in 6.5-4).
// (b) ?lang=en and ?lang=tr at 390 / 820 / 1280: the sign-in card, the library (?demo), Özelleştir open → PNGs,
//     and every visible element whose content is wider than its box (scrollWidth > clientWidth + 1), plus the top bar's rows.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4181;
const ORIGIN = `http://localhost:${PORT}`;
const args = process.argv.slice(2);
const SADECE_SAYIM = args.includes('--sadece-sayim');
const OUT = args.find(a => !a.startsWith('--')) ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\dil-6.5-1';
const TR_HARF = /[çğıöşüÇĞİÖŞÜ]/;

// ---- (a) Turkish string literals ----

// dev / measurement files: their texts stay Turkish (Deniz's tools)
const HARIC = [/\.test\.ts$/, /^src[\\/]dil[\\/]/, /olcum/i, /Dene\.ts$/, /Sahte\.ts$/, /atlas/i, /Test\.ts$/];

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

function turkceDizeler() {
  const liste = [];
  for (const p of dosyalar(join(ROOT, 'src'))) {
    const rel = relative(ROOT, p);
    if (HARIC.some(r => r.test(rel))) continue;
    const src = readFileSync(p, 'utf8');
    const satirlar = src.split('\n');
    for (const l of literaller(src)) {
      if (/console\.\w+\(/.test(satirlar[l.satir - 1] ?? '')) continue;
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
console.log(`\n  TOPLAM: ${dizeler.length} dize, ${dosyaSayisi.size} dosya\n`);
if (SADECE_SAYIM) process.exit(0);

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

// visible elements wider inside than their box (the canvas, the 3D stage and intended scrollers left out)
const tasanlar = () => [...document.querySelectorAll('body *')].filter(e => {
  if (e.closest('#stage, svg, canvas, noscript, #reader')) return false;
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

const BOYUT = { 390: 844, 820: 1180, 1280: 800 };
mkdirSync(OUT, { recursive: true });
const server = await startPreview();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const tablo = [];
try {
  for (const lang of ['en', 'tr']) {
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
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}

console.log('(b) Ekranlar → ' + OUT);
for (const r of tablo) {
  const c = r.cubuk ? `  çubuk: ${r.cubuk.rows} satır, ${r.cubuk.dil}` : '';
  const h = r.html ? `  <html lang="${r.html}">` : '';
  console.log(`  ${r.ekran.padEnd(18)} taşan: ${r.tasan.length}${c}${h}`);
  for (const t of r.tasan) console.log(`      ${t}`);
}
