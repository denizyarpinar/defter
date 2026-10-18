// Task 6.3e: control screenshots of the library search panel (sample library, ?demo, no sign-in) from the local build.
// Usage: npm run build && node scripts/arama-paneli-kontrol.mjs [output folder]
// Shots: the panel with results at 1280 / 1024 / 390 px, a result opened (reader at the right tab and file),
// a book result (on the desk). Also checks keys (/, Ctrl+F, ↑/↓, Enter, Esc), taps outside, the kept query,
// and measures the panel at several widths; prints a table.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4181;
const URL = `http://localhost:${PORT}/?demo`;
const OUT = process.argv[2] ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\arama-6.3e';
const QUERY = 'or';            // sample library: books, topics and files (orijinal.pdf)
const WIDTHS = [1440, 1280, 1024, 820, 768, 600, 430, 390, 360];

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const sonuclar = [];
const kontrol = (ad, ok, ek = '') => { sonuclar.push({ ad, ok, ek }); console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ek ? ` (${ek})` : ''}`); };

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

async function shot(page, name) {
  await page.mouse.move(0, 0);
  const file = join(OUT, name);
  await page.screenshot({ path: file });
  console.log(`  görüntü: ${file}`);
}

const panelAcik = (page) => page.evaluate(() => !document.querySelector('#aramaPaneli').hidden);

async function ara(page, q) {
  await page.locator('#aramaPaneli .ap-kutu').fill(q);
  await page.waitForFunction(() => document.querySelectorAll('#aramaPaneli .ap-satir').length > 0, null, { timeout: 10_000 });
  await page.waitForTimeout(300);
}

// the panel at this width: the card's box, page overflow, the smallest row, the box's width
async function olc(page, w) {
  await page.setViewportSize({ width: w, height: w < 700 ? 844 : 800 });
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const kart = document.querySelector('.ap-kart').getBoundingClientRect();
    const satirlar = [...document.querySelectorAll('.ap-satir')].map(e => e.getBoundingClientRect().height);
    const btn = document.querySelector('#araBtn').getBoundingClientRect();
    const bar = document.querySelector('.bar');
    return {
      kart: `${Math.round(kart.left)}–${Math.round(kart.right)} × ${Math.round(kart.top)}–${Math.round(kart.bottom)}`,
      tasma: document.documentElement.scrollWidth > innerWidth + 1 || kart.right > innerWidth + 1 || bar.scrollWidth > bar.clientWidth + 1,
      enKucukSatir: Math.round(Math.min(...satirlar)),
      kutu: Math.round(document.querySelector('.ap-kutu').getBoundingClientRect().width),
      dugme: `${Math.round(btn.width)}×${Math.round(btn.height)}`,
    };
  });
}

mkdirSync(OUT, { recursive: true });
const server = await startPreview();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => { console.error('Sayfa hatası:', e.message); kontrol('sayfa hatası yok', false, e.message); });
  await page.goto(URL);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).display === 'none', null, { timeout: 30_000 });
  await page.waitForTimeout(1500);

  // 1. "/" opens, results, 1280
  await page.keyboard.press('/');
  kontrol('"/" paneli açar', await panelAcik(page));
  kontrol('"/" kutuya yazılmaz', (await page.locator('.ap-kutu').inputValue()) === '');
  await page.keyboard.type(QUERY);
  await page.waitForFunction(() => document.querySelectorAll('.ap-satir').length > 0, null, { timeout: 10_000 });
  await page.waitForTimeout(400);
  const gruplar = await page.locator('.ap-grup').allTextContents();
  kontrol('gruplar', gruplar.length >= 3, gruplar.join(' · '));
  kontrol('durum satırı (örnek)', /Örnek kitaplıkta metin araması yok/.test(await page.locator('.ap-durum').innerText()), await page.locator('.ap-durum').innerText());
  kontrol('kalın eşleşme', (await page.locator('.ap-ad b').count()) > 0);
  await shot(page, 'arama-paneli-1280.png');

  // ↑/↓ + Esc + tap outside (the room's view must not change)
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  kontrol('↓ seçer', (await page.locator('.ap-satir[aria-selected="true"]').count()) === 1);
  await page.keyboard.press('Escape');
  kontrol('Esc kapatır', !(await panelAcik(page)));
  await page.keyboard.press('Control+f');
  kontrol('Ctrl+F açar, sorgu duruyor', await panelAcik(page) && (await page.locator('.ap-kutu').inputValue()) === QUERY);
  const view0 = await page.evaluate(() => document.querySelector('#app').dataset.view);
  await page.mouse.click(1000, 700);   // on the dimmed room (the bookcase is there in the room view)
  await page.waitForTimeout(1500);
  const view1 = await page.evaluate(() => document.querySelector('#app').dataset.view);
  kontrol('dışa dokunma kapatır, sahneye geçmez', !(await panelAcik(page)) && view0 === view1, `${view0} → ${view1}`);
  await page.locator('#araBtn').click();
  kontrol('× kapatır', await panelAcik(page) && (await page.locator('.ap-kapat').click(), !(await panelAcik(page))));

  // 2. 1024
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(500);
  await page.locator('#araBtn').click();
  await ara(page, 'blatt');
  await shot(page, 'arama-paneli-1024.png');

  // 3. a file result: the solution of blatt-01 → Übungen tab, blatt-01 chosen, solution on
  await page.locator('.ap-satir', { hasText: 'blatt-01_cozum' }).click();
  await page.waitForSelector('#okuyucu:not([hidden])', { timeout: 10_000 });
  await page.waitForSelector('#oTabs [aria-selected="true"]', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const sekme = await page.locator('#oTabs [aria-selected="true"]').textContent();
  const dosya = await page.locator('#oFile').evaluate(s => s.options[s.selectedIndex]?.text);
  const cozum = await page.locator('#oSol').getAttribute('aria-pressed');
  kontrol('sonuç → doğru sekme/dosya/çözüm', sekme === 'Übungen' && dosya === 'blatt-01' && cozum === 'true', `${sekme} / ${dosya} / çözüm ${cozum}`);
  kontrol('masada kitap yok (kabuk)', await page.evaluate(() => document.querySelector('#reader').classList.contains('kabuk')));
  // the reader's own search in that file: the highlights (the sample library has no Drive text results)
  await page.locator('#oAraBtn').click();
  await page.keyboard.type('logic');
  await page.waitForFunction(() => /\d+\/\d+|bulunamadı/.test(document.querySelector('#oAraSayac')?.textContent ?? ''), null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  kontrol('okuyucuda vurgu', (await page.locator('svg.o-ara rect').count()) > 0, await page.locator('#oAraSayac').textContent());
  await shot(page, 'arama-sonuc-okuyucu-1024.png');

  // closing the reader: back to the library; the panel keeps the query
  await page.locator('#oAraKapat').click();
  await page.locator('#oClose').click();
  await page.waitForTimeout(800);
  kontrol('okuyucu kapanınca kitaplık', await page.evaluate(() => document.querySelector('#reader').hidden && document.querySelector('#okuyucu').hidden));
  await page.locator('#araBtn').click();
  kontrol('son sorgu kutuda', (await page.locator('.ap-kutu').inputValue()) === 'blatt');

  // a topic result with the keyboard: ↓ to "Koşullar ve döngüler", Enter → reader on that topic
  await ara(page, 'koşul');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#okuyucu:not([hidden])', { timeout: 10_000 });
  await page.waitForTimeout(1500);
  kontrol('konu sonucu (↓ + Enter)', (await page.locator('#oChap').textContent()) === 'Koşullar ve döngüler', await page.locator('#oChap').textContent());
  await page.locator('#oClose').click();
  await page.waitForTimeout(800);

  // 4. 390 px phone
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  await page.locator('#araBtn').click();
  await ara(page, QUERY);
  await shot(page, 'arama-paneli-390.png');

  // the panel at many widths
  console.log('\nGenişlik | kart (x × y) | taşma | en küçük satır px | kutu px | düğme');
  for (const w of WIDTHS) {
    const o = await olc(page, w);
    console.log(`${w} | ${o.kart} | ${o.tasma ? 'VAR' : 'yok'} | ${o.enKucukSatir} | ${o.kutu} | ${o.dugme}`);
    if (o.tasma || o.enKucukSatir < 44) kontrol(`${w} px düzen`, false, JSON.stringify(o));
  }

  // 5. a book result: as a tap on the book (flies to the desk)
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(800);
  await ara(page, 'lineer');
  await page.locator('.ap-satir', { hasText: 'Lineer Cebir' }).first().click();
  await page.waitForSelector('#reader:not([hidden])', { timeout: 10_000 });
  await page.waitForTimeout(2000);
  kontrol('kitap sonucu masada', (await page.locator('#rBook').textContent()) === 'Lineer Cebir' && !(await page.evaluate(() => document.querySelector('#reader').classList.contains('kabuk'))));
  await shot(page, 'arama-kitap-masada-1280.png');
  await page.keyboard.press('/');
  kontrol('masadayken "/" açmaz', !(await panelAcik(page)));
  await page.close();
} finally {
  await browser.close();
  server.kill();
}
const hata = sonuclar.filter(s => !s.ok);
console.log(`\n${sonuclar.length - hata.length}/${sonuclar.length} kontrol geçti`);
if (hata.length) process.exitCode = 1;
