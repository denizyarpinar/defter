// Task 6.3c: control screenshots of the reader's search (sample library, ?demo, no sign-in) from the local build.
// Usage: npm run build && node scripts/arama-kontrol.mjs [query] [output folder] [file name suffix, e.g. -2]
// Three shots with the search open and highlights on screen: 1280 px PDF mode, 1024 px book mode, 390 px phone.
// Also measures the top bar (one row? box width?) at several widths and prints a table.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4180;
const URL = `http://localhost:${PORT}/?demo&lang=tr`;
const QUERY = process.argv[2] ?? 'logic';
const OUT = process.argv[3] ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\arama-6.3c';
const SUFFIX = process.argv[4] ?? '';   // 6.3c-2: arama-1280-pdf-2.png next to the first shots
const BOOKCASE = { x: 1040, y: 330 };   // room view at 1600 × 1000 (as in screenshots.mjs)
const PRG_BOOK = { x: 618, y: 350 };    // shelf view: "Programlamaya Giriş"
const TOPIC = 'Değişkenler ve veri tipleri';
const WIDTHS = [1440, 1280, 1024, 820, 768, 600, 430, 390, 360];

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function startPreview() {
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(URL)).ok) return child; } catch { /* not up yet */ }
    await wait(200);
  }
  child.kill();
  throw new Error(`vite preview ${PORT} portunda başlamadı. Önce "npm run build" çalıştı mı?`);
}

// the counter shows a result (n/m or "bulunamadı"), then the pages get a moment to draw
async function searched(page) {
  await page.waitForFunction(() => /\d+\/\d+|bulunamadı/.test(document.querySelector('#oAraSayac')?.textContent ?? ''), null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  return page.locator('#oAraSayac').textContent();
}

async function shot(page, name) {
  await page.mouse.move(0, 0);
  const file = join(OUT, name.replace(/\.png$/, `${SUFFIX}.png`));
  await page.screenshot({ path: file });
  const marks = await page.locator('svg.o-ara rect').count();
  const current = await page.locator('svg.o-ara rect.gecerli').count();
  console.log(`${file}  (vurgu: ${marks}, geçerli: ${current})`);
}

// the top bar at this width: one row? (its height vs. a single button), overflow, the box's width
async function measure(page, w) {
  await page.setViewportSize({ width: w, height: w < 700 ? 844 : 800 });
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const top = document.querySelector('.o-top'), input = document.querySelector('#oAraKutu');
    const kids = [...top.children].filter(e => getComputedStyle(e).display !== 'none');
    const mid = (e) => { const r = e.getBoundingClientRect(); return (r.top + r.bottom) / 2; };
    const rows = new Set(kids.map(e => Math.round(mid(e) / 12))).size;
    const right = Math.max(...kids.map(e => e.getBoundingClientRect().right));
    return {
      satir: rows, yukseklik: Math.round(top.getBoundingClientRect().height),
      tasma: top.scrollWidth > top.clientWidth + 1 || right > innerWidth + 1,
      kutu: Math.round(input.getBoundingClientRect().width),
      kapat: Math.round(document.querySelector('#oClose').getBoundingClientRect().width),
      sayac: document.querySelector('#oAraSayac').textContent,
      not: document.querySelector('#oAraNot').hidden ? '' : document.querySelector('#oAraNot').innerText,
    };
  });
}

mkdirSync(OUT, { recursive: true });
const server = await startPreview();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.error('Sayfa hatası:', e.message));
  await page.goto(URL);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).display === 'none', null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.mouse.click(BOOKCASE.x, BOOKCASE.y);
  await page.waitForTimeout(2500);
  await page.mouse.click(PRG_BOOK.x, PRG_BOOK.y);
  await page.waitForSelector('#reader:not([hidden])', { timeout: 10_000 });
  await page.waitForTimeout(1500);
  await page.locator('[data-t]', { hasText: TOPIC }).first().click();
  await page.waitForSelector('#oFoto', { state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(2000);

  // 1. 1280 px, PDF mode
  await page.locator('#oMode [data-m="pdf"]').click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(1500);
  await page.locator('#oAraBtn').click();
  await page.keyboard.type(QUERY);
  console.log(`"${QUERY}": ${await searched(page)}`);
  await page.keyboard.press('Enter');   // the next match: the reader moves there
  await page.waitForTimeout(1500);
  await shot(page, 'arama-1280-pdf.png');

  // 2. 1024 px, book mode (two pages): the search stays open, Enter goes to the next match's spread
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.locator('#oMode [data-m="kitap"]').click();
  await page.waitForTimeout(1500);
  await page.locator('#oAraKutu').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1800);
  await shot(page, 'arama-1024-kitap.png');

  // 3. 390 px phone
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  await page.locator('#oAraKutu').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1800);
  await shot(page, 'arama-390-telefon.png');

  // the top bar at many widths (search open, then closed)
  console.log('\nGenişlik | arama açık: satır, yükseklik, taşma, kutu px, × px, sayaç, not | kapalı: satır, taşma, × px');
  const open = {};
  for (const w of WIDTHS) open[w] = await measure(page, w);
  await page.locator('#oAraKapat').click();
  for (const w of WIDTHS) {
    const c = await measure(page, w), o = open[w];
    console.log(`${w} | ${o.satir}, ${o.yukseklik}, ${o.tasma ? 'VAR' : 'yok'}, ${o.kutu}, ${o.kapat}, ${o.sayac}, ${o.not || '-'} | ${c.satir}, ${c.tasma ? 'VAR' : 'yok'}, ${c.kapat}`);
  }
  await page.close();
} finally {
  await browser.close();
  server.kill();
}
