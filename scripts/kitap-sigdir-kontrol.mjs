// Task 6.S-2: in book mode the book fits into its area (nothing cut off at the top or the bottom), without signing in
// and without Drive. Usage: node scripts/kitap-sigdir-kontrol.mjs [output folder]
// A Vite dev server on its own port with the sample library (?demo). The script makes one PDF of 5 pages in a temporary
// folder (not in the repo): A4 portrait, A4 landscape, 595 × 1400, MediaBox [0 200 595 1042], /Rotate 90; each page
// has a 2 pt frame and "ÜST" at the top, "ALT" at the bottom. The topic "Değişkenler ve veri tipleri" gets it as its
// ozet.pdf (page.route). Every size opens the reader fresh (book mode is the default), so the page slider appears
// after the first layout, as on the iPad.
// Checks: every spread's #oSpread box inside #oKitap; again after the pen bar on / off; a stroke over "ÜST" stays at
// the same PDF spot after a new layout (and the pen stays on); while a stroke is being drawn no new layout, after
// pointerup one. Exit code 1 if anything fails.
// Task 6.S-2b: in book mode every page's content box is inside its paper by KITAP_KAGIT_PAYI (4 % of the paper's width) on
// every side (checked: at least 90 % of it). Pages 6 and 7: a notebook photo (../defter-test-dosyalari/defter.jpg, outside
// the repo; left out if missing) and page 1 of demo/demo-dikey.pdf (a lecture page with its own margins); for them a
// side-by-side picture: pay 0 (as before 6.S-2b: no pay, white page; put back by the script) | pay 0.04 (*-karsilastirma-pay.png).
// Screenshots end in -pay.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PDFDocument, PDFName, PDFArray, PDFNumber, StandardFonts, degrees, rgb } from 'pdf-lib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4187;
const URL = `http://localhost:${PORT}/?demo&lang=tr`;
const OUT = process.argv[2] ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\kitap-sigdir-6.S';
const KONU = 'Unite-01-Temeller/Konu-01-Degiskenler';
const TOPIC = 'Değişkenler ve veri tipleri';
const SIZES = [[1180, 820], [820, 1180], [1280, 800], [390, 844]];
const PAY = 0.04;   // KITAP_KAGIT_PAYI (src/okuma/kitapDuzen.ts)
const FOTO = join(ROOT, '..', 'defter-test-dosyalari', 'defter.jpg');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ---- the test PDF ----
async function testPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const add = (w, h, { oy = 0, rotate = 0, name }) => {
    const p = doc.addPage([w, h]);
    if (oy) p.node.set(PDFName.of('MediaBox'), PDFArray.withContext(doc.context));
    if (oy) { const a = p.node.lookup(PDFName.of('MediaBox'), PDFArray); for (const n of [0, oy, w, oy + h]) a.push(PDFNumber.of(n)); }
    if (rotate) p.setRotation(degrees(rotate));
    // a frame 2 pt wide, just inside the edge
    p.drawRectangle({ x: 1, y: oy + 1, width: w - 2, height: h - 2, borderColor: rgb(0.8, 0, 0), borderWidth: 2 });
    // rotated 90°: the reader's "top" is the PDF's left edge
    const label = (t, x, y, rot) => p.drawText(t, { x, y, size: 28, font, color: rgb(0, 0, 0.6), rotate: degrees(rot) });
    if (rotate === 90) { label('ÜST', 40, oy + h / 2 - 25, -90); label('ALT', w - 40, oy + h / 2 + 25, 90); }
    else { label('ÜST', w / 2 - 28, oy + h - 40, 0); label('ALT', w / 2 - 28, oy + 16, 0); }
    p.drawText(name, { x: 30, y: oy + h / 2, size: 14, font, color: rgb(0.3, 0.3, 0.3), rotate: degrees(rotate === 90 ? -90 : 0) });
  };
  add(595, 842, { name: 'A4 dikey' });
  add(842, 595, { name: 'A4 yatay' });
  add(595, 1400, { name: '595 x 1400' });
  add(595, 842, { oy: 200, name: 'MediaBox 0 200 595 1042' });
  add(595, 842, { rotate: 90, name: 'Rotate 90' });
  // 6: a notebook photo, the page in the photo's shape (as a photo added to a topic)
  if (existsSync(FOTO)) {
    const img = await doc.embedJpg(readFileSync(FOTO));
    const h = Math.round(595 * img.height / img.width);
    doc.addPage([595, h]).drawImage(img, { x: 0, y: 0, width: 595, height: h });
  }
  // 7: a lecture page with its own margins (the sample library's demo PDF)
  const ders = await PDFDocument.load(readFileSync(join(ROOT, 'public', 'demo', 'demo-dikey.pdf')));
  const [dp] = await doc.copyPages(ders, [0]);
  doc.addPage(dp);
  return doc.save();
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

// the spread's box against the area's (px; negative = cut off)
const fit = (page) => page.evaluate(() => {
  const a = document.querySelector('#oKitap').getBoundingClientRect(), s = document.querySelector('#oSpread').getBoundingClientRect();
  const r = (v) => Math.round(v * 10) / 10;
  return { ust: r(s.top - a.top), alt: r(a.bottom - s.bottom), sol: r(s.left - a.left), sag: r(a.right - s.right), alan: `${Math.round(a.width)}×${Math.round(a.height)}` };
});
const okMu = (f) => f.ust >= -0.5 && f.alt >= -0.5 && f.sol >= -0.5 && f.sag >= -0.5;

// task 6.S-2b: every visible page's content box against its paper (px): the smallest side, and what it must be at least
const pay = (page, en) => page.evaluate((en) => {
  let min = Infinity, ister = 0;
  for (const sheet of document.querySelectorAll('#oSpread .o-slot > .o-sheet:not(.o-end)')) {
    const k = sheet.querySelector('.o-page');
    if (!k) continue;
    const s = sheet.getBoundingClientRect(), b = k.getBoundingClientRect();
    min = Math.min(min, b.left - s.left, s.right - b.right, b.top - s.top, s.bottom - b.bottom);
    ister = Math.max(ister, en * s.width);
  }
  return { min: Math.round(min * 10) / 10, ister: Math.round(ister * 10) / 10 };
}, en * 0.9);

// task 6.S-2b: the visible pages as before 6.S-2b (no pay, white page, not multiplied) and back
const payYok = (page, on) => page.evaluate((on) => {
  let st = document.querySelector('#payYok');
  if (!on) {
    st?.remove();
    for (const k of document.querySelectorAll('#oSpread .o-page[data-eski]')) { k.style.cssText = k.dataset.eski; delete k.dataset.eski; }
    return;
  }
  if (!st) { st = document.createElement('style'); st.id = 'payYok'; document.head.append(st); }
  st.textContent = '.o-kitap .o-page.ready { background: #fff var(--paperImg, none) !important } .o-kitap .o-baski { mix-blend-mode: normal !important }';
  for (const sheet of document.querySelectorAll('#oSpread .o-slot > .o-sheet:not(.o-end)')) {
    const k = sheet.querySelector('.o-page');
    if (!k) continue;
    const sw = sheet.clientWidth, sh = sheet.clientHeight, ratio = k.offsetHeight / k.offsetWidth;
    // fitPage(ratio, sw, sh, 0)
    let w = sw, h = Math.round(sw * ratio);
    if (h > sh) { h = sh; w = Math.round(sh / ratio); }
    k.dataset.eski = k.style.cssText;
    Object.assign(k.style, { left: Math.round((sw - w) / 2) + 'px', top: Math.round((sh - h) / 2) + 'px', width: w + 'px', height: h + 'px' });
  }
}, on);

// two screenshots side by side, with a label over each
async function yanYana(browser, a, b, clip, path) {
  const w = Math.ceil(clip.width), h = Math.ceil(clip.height);
  const p = await browser.newPage({ viewport: { width: 2 * w + 36, height: h + 52 }, deviceScaleFactor: 2 });
  const src = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
  const img = (buf) => `<img src="${src(buf)}" style="display:block;width:${w}px;height:${h}px">`;
  await p.setContent(`<body style="margin:0;background:#333;font:600 16px system-ui;color:#fff;display:flex;gap:12px;padding:12px">
    <figure style="margin:0"><figcaption style="padding:0 0 6px">pay 0 (önce)</figcaption>${img(a)}</figure>
    <figure style="margin:0"><figcaption style="padding:0 0 6px">pay ${PAY} (6.S-2b)</figcaption>${img(b)}</figure></body>`);
  await p.waitForFunction(() => [...document.images].every(i => i.complete));
  await p.screenshot({ path });
  await p.close();
}

// the stroke on the first visible page: its box as a part of the page box (0–1)
const stroke = (page) => page.evaluate(() => {
  for (const box of document.querySelectorAll('#oSpread .o-slot .o-page')) {
    const path = box.querySelector('svg.o-cizim:not(.canli) path');
    if (!path) continue;
    const b = box.getBoundingClientRect(), p = path.getBoundingClientRect();
    return { x: (p.left - b.left) / b.width, y: (p.top - b.top) / b.height, w: p.width / b.width, h: p.height / b.height };
  }
  return null;
});

// the page's top label "ÜST" sits at 40 pt below the top (A4: 802 of 842); a stroke over it
async function drawOverTop(page, { hold } = {}) {
  const b = await page.evaluate(() => { const r = document.querySelector('#oSpread .o-slot .o-page').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const y = b.y + b.h * (28 / 842), x0 = b.x + b.w * 0.42;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(x0 + i * b.w * 0.016, y + (i % 2) * 3); await wait(16); }
  if (hold) await hold();
  await page.mouse.up();
  await wait(400);
}

// how often the book was laid out: BookView.layout puts new slots into the spread (a phone's book can keep its size)
const countLayouts = (page) => page.evaluate(() => {
  window.__dizim = 0;
  const s = document.querySelector('#oSpread');
  window.__dizimGozlem?.disconnect();
  window.__dizimGozlem = new MutationObserver(recs => {
    if (recs.some(r => [...r.removedNodes].some(n => n.classList?.contains('o-slot')))) window.__dizim++;
  });
  window.__dizimGozlem.observe(s, { childList: true });
});
const layouts = (page) => page.evaluate(() => window.__dizim);

// a change of the area's size without a window resize (only the ResizeObserver sees it)
const footPad = (page, px) => page.evaluate((px) => {
  let st = document.querySelector('#sigdirPay');
  if (!st) { st = document.createElement('style'); st.id = 'sigdirPay'; document.head.append(st); }
  st.textContent = px ? `#oFoot { padding-bottom: ${px}px !important }` : '';
}, px);

const pdfDir = join(tmpdir(), 'kitap-sigdir-6S');
mkdirSync(pdfDir, { recursive: true });
const pdfPath = join(pdfDir, 'sigdir.pdf');
writeFileSync(pdfPath, await testPdf());
const pdfBytes = readFileSync(pdfPath);
const FOTOLU = existsSync(FOTO);
const SAYFA = FOTOLU ? 7 : 6;
if (!FOTOLU) console.log(`Defter fotoğrafı yok (${FOTO}): fotoğraf sayfası ve karşılaştırması atlandı.`);

mkdirSync(OUT, { recursive: true });
const dev = await startDev();
const browser = await chromium.launch({ channel: 'chrome' });
const rows = [], pens = [];
let bad = 0;
try {
  for (const [w, h] of SIZES) {
    const touch = w !== 1280;   // the iPad and the phone sizes (1280 × 800 is the laptop)
    const ctx = await browser.newContext(touch ? { viewport: { width: w, height: h }, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', e => { bad++; console.error('Sayfa hatası:', e.message); });
    await page.route('**/ornek/index.json', async route => {
      const json = await (await route.fetch()).json();
      json.klasorler['programlamaya-giris'][KONU] = { 'ozet.pdf': 'demo/__sigdir.pdf' };
      await route.fulfill({ json });
    });
    await page.route('**/ornek/kitaplar/programlamaya-giris/kitap.json', async route => {
      const json = await (await route.fetch()).json();
      await route.fulfill({ json: { ...json, kurdele: null } });
    });
    await page.route('**/demo/__sigdir.pdf', route => route.fulfill({ contentType: 'application/pdf', body: pdfBytes }));
    await page.goto(URL);
    await page.waitForFunction(() => document.querySelector('#loading')?.hidden, null, { timeout: 30_000 });
    await wait(1500);

    // the book to the desk (library search), the topic from its contents page
    await page.keyboard.press('/');
    await page.locator('#aramaPaneli .ap-kutu').fill('programlamaya');
    await page.waitForFunction(() => document.querySelectorAll('#aramaPaneli .ap-satir').length > 0, null, { timeout: 10_000 });
    await page.locator('#aramaPaneli .ap-satir').first().click();
    await page.waitForSelector('#reader.show', { timeout: 15_000 });
    await wait(2500);
    if (!await page.locator('#reader [data-t]', { hasText: TOPIC }).first().isVisible() && await page.locator('#next').isEnabled()) { await page.click('#next'); await wait(700); }
    await page.locator('#reader [data-t]', { hasText: TOPIC }).first().click();
    await page.waitForSelector('#okuyucu.show #oKitap:not([hidden]) #oSpread .o-page', { timeout: 15_000 });
    await wait(2000);

    const ad = `${w}×${h}`;
    const single = await page.evaluate(() => document.querySelector('#oSpread').classList.contains('single'));
    const spreads = single ? SAYFA : Math.ceil(SAYFA / 2);
    const check = async (durum, sayfa) => {
      const f = await fit(page), pp = await pay(page, PAY);
      f.pay = pp;
      const ok = okMu(f) && pp.min >= pp.ister - 0.5;
      if (!ok) bad++;
      rows.push([ad, durum, sayfa, f, ok]);
    };
    // pay 0 | pay 0.04 of the spread on screen (only the spread's box)
    const kiyas = async (adi) => {
      const clip = await page.evaluate(() => { const r = document.querySelector('#oSpread').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
      const b = await page.screenshot({ clip });
      await payYok(page, true); await wait(300);
      const a = await page.screenshot({ clip });
      await payYok(page, false); await wait(200);
      await yanYana(browser, a, b, clip, join(OUT, `${w}x${h}-${adi}-karsilastirma-pay.png`));
    };

    for (let i = 0; i < spreads; i++) {
      const n = single ? [i + 1] : [2 * i + 1, 2 * i + 2].filter(k => k <= SAYFA);
      await check('açılış', n.join('–'));
      await page.screenshot({ path: join(OUT, `${w}x${h}-kitap-${i + 1}-pay.png`) });
      if (FOTOLU && n.includes(6)) await kiyas('defter-foto');
      if (n.includes(SAYFA)) await kiyas('ders-pdf');
      if (i < spreads - 1) { await page.keyboard.press('ArrowRight'); await wait(700); }
    }
    // back to the first spread (slider to 1)
    await page.evaluate(() => { const s = document.querySelector('#oSlider'); s.value = '1'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
    await wait(800);

    // pen on: a stroke over "ÜST"; pen bar off / on; the area's size changed (relayout): the stroke stays
    await page.locator('#oPenBtn').click();
    await wait(700);
    await check('kalem açık', '1');
    await page.locator('#oTools [data-arac="kalem"]').click().catch(() => {});
    await drawOverTop(page);
    const s0 = await stroke(page);
    await page.locator('#oPenBtn').click(); await wait(600);
    await check('kalem kapandı', '1');
    await page.locator('#oPenBtn').click(); await wait(600);
    await check('kalem tekrar açık', '1');
    const s1 = await stroke(page);
    await countLayouts(page);
    await footPad(page, 40); await wait(500);
    const afterResize = await layouts(page);
    await check('alan küçüldü (kalem açık)', '1');
    const s2 = await stroke(page);
    const penOn = await page.evaluate(() => document.querySelector('#okuyucu').classList.contains('kalem'));
    const near = (a, b) => !!a && !!b && ['x', 'y', 'w', 'h'].every(k => Math.abs(a[k] - b[k]) <= 0.005);
    const d = (a, b) => a && b ? `${(Math.max(...['x', 'y'].map(k => Math.abs(a[k] - b[k]))) * 842).toFixed(2)} pt` : '-';

    // drawing while the area changes: no layout until pointerup, then one
    await countLayouts(page);
    let during = -1;
    await drawOverTop(page, { hold: async () => { await footPad(page, 0); await wait(400); during = await layouts(page); } });
    const afterUp = await layouts(page);
    const penOn2 = await page.evaluate(() => document.querySelector('#okuyucu').classList.contains('kalem'));
    await check('çizim sonrası dizim', '1');
    await page.screenshot({ path: join(OUT, `${w}x${h}-kalem-pay.png`) });

    const p = {
      'çizgi var': !!s0,
      // 6.S-2b: the stroke is where it was drawn in the content box (28/842 from its top)
      'çizgi içerik kutusunda': !!s0 && Math.abs(s0.y + s0.h / 2 - 28 / 842) <= 0.01,
      'kalem kapat/aç: çizgi yerinde': near(s0, s1),
      'alan küçüldü: bir dizim': afterResize === 1,
      'alan küçüldü: çizgi yerinde': near(s0, s2),
      'dizimden sonra kalem açık': penOn,
      'çizerken dizim yok': during === 0,
      'pointerup sonrası bir dizim': afterUp === 1,
      'ikinci çizimden sonra kalem açık': penOn2,
    };
    for (const v of Object.values(p)) if (!v) bad++;
    pens.push([ad, p, `fark: aç/kapa ${d(s0, s1)}, dizim ${d(s0, s2)}; çizerken ${during}, sonra ${afterUp}`]);

    // PDF mode: only a screenshot
    await page.locator('#oPenBtn').click(); await wait(400);
    await page.locator('#oMode [data-m="pdf"]').click();
    await wait(1500);
    await page.screenshot({ path: join(OUT, `${w}x${h}-pdf-pay.png`) });
    await page.locator('#oMode [data-m="kitap"]').click();   // the next context starts in book mode again
    await wait(500);
    await ctx.close();
  }
} finally {
  await browser.close();
  dev.kill();
}

console.log('ölçü | durum | sayfa | alan | üst | alt | sol | sağ | pay (en az / gerekli) | sonuç   (px; eksi = kesik)');
for (const [ad, durum, sayfa, f, ok] of rows) console.log(`${ad} | ${durum} | ${sayfa} | ${f.alan} | ${f.ust} | ${f.alt} | ${f.sol} | ${f.sag} | ${f.pay.min} / ${f.pay.ister} | ${ok ? 'geçti' : 'KALDI'}`);
console.log('\nKalem:');
for (const [ad, p, not] of pens) {
  console.log(`${ad}: ${Object.entries(p).map(([k, v]) => `${k} ${v ? 'evet' : 'HAYIR'}`).join(' · ')}`);
  console.log(`  ${not}`);
}
console.log(`\nTest PDF'i: ${pdfPath}`);
console.log(`Ekran görüntüleri: ${OUT}`);
console.log(bad ? `\n${bad} sorun var.` : '\nHepsi tamam.');
process.exit(bad ? 1 : 0);
