// Task 6.5-1: the language change comes back to the same place (sample library, ?demo, no sign-in).
// Usage: npm run build && node scripts/dil-donus-kontrol.mjs [output folder]
// 1. A book on the desk → the top bar's language button → after the reload the same book on the desk, in the other language.
// 2. The reader on a topic, a page further on, book and PDF mode → window.defterDilSec (the reader has no button; ?olcum=1
//    turns the hook on in the build) → the same book / topic / material / file / page.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4183;
const URL = `http://localhost:${PORT}/?demo&olcum=1&lang=tr`;
const OUT = process.argv[2] ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\dil-6.5-1';
const BOOKCASE = { x: 1040, y: 330 };   // room view at 1600 × 1000 (as in screenshots.mjs)
const PRG_BOOK = { x: 618, y: 350 };    // shelf view: "Programlamaya Giriş"
const TOPIC = 'Değişkenler ve veri tipleri';

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

const hazir = (page) => page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).display === 'none', null, { timeout: 30_000 });

// the desk and the reader as they look now
const durum = (page) => page.evaluate(() => {
  const vis = (s) => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; };
  return {
    lang: document.documentElement.lang,
    adres: location.search,
    masa: vis('#reader') ? document.querySelector('#rBook')?.textContent : null,
    okuyucu: vis('#okuyucu') ? {
      kitap: document.querySelector('#oBook')?.textContent,
      konu: document.querySelector('#oChap')?.textContent,
      sekme: document.querySelector('#oTabs [aria-selected="true"]')?.dataset.k ?? document.querySelector('#oTabs [aria-selected="true"]')?.textContent,
      dosya: document.querySelector('#oFiles:not([hidden]) #oFile')?.value ?? null,
      sayfa: document.querySelector('#oPno')?.textContent,
      mod: document.querySelector('#oMode .on, #oMode [aria-pressed="true"]')?.dataset.m ?? null,
    } : null,
  };
});

// the reload the language change starts; then the room again
async function dilDegisti(page, tetikle) {
  await Promise.all([page.waitForNavigation({ timeout: 20_000 }), tetikle()]);
  await hazir(page);
}

mkdirSync(OUT, { recursive: true });
const server = await startPreview();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const rapor = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('Sayfa hatası:', e.message));
  await page.goto(URL);
  await hazir(page);
  await page.waitForTimeout(1500);
  await page.mouse.click(BOOKCASE.x, BOOKCASE.y);
  await page.waitForTimeout(2500);
  await page.mouse.click(PRG_BOOK.x, PRG_BOOK.y);
  await page.waitForSelector('#reader:not([hidden])', { timeout: 10_000 });
  await page.waitForTimeout(1500);

  // 1. the book on the desk: the top bar's button (is it reachable over the desk?)
  const once1 = await durum(page);
  const dugme = page.locator('#dilBtn');
  let yol = 'üst çubuk düğmesi';
  try { await dugme.click({ trial: true, timeout: 2000 }); } catch { yol = 'defterDilSec (düğme masanın altında kaldı)'; }
  await dilDegisti(page, () => yol.startsWith('üst') ? dugme.click() : page.evaluate(() => window.defterDilSec('en')));
  await page.waitForSelector('#reader:not([hidden])', { timeout: 15_000 });
  await page.waitForTimeout(1500);
  const sonra1 = await durum(page);
  await page.screenshot({ path: join(OUT, 'donus-masa-en.png') });
  rapor.push({ adim: `1. masadaki kitap (${yol})`, once: once1, sonra: sonra1 });
  assert.equal(sonra1.lang, 'en');
  assert.ok(!sonra1.adres.includes('lang='), '?lang adresten kalkmalı');
  assert.equal(sonra1.masa, once1.masa);

  // 2. the reader: a topic, two spreads further (book mode), then the language
  for (const mod of ['kitap', 'pdf']) {
    await page.locator('#reader [data-t]', { hasText: TOPIC }).first().click();
    await page.waitForSelector('#okuyucu:not([hidden])', { timeout: 15_000 });
    await page.waitForFunction(() => /\d+ \/ \d+/.test(document.querySelector('#oPno')?.textContent ?? ''), null, { timeout: 20_000 });
    await page.locator(`#oMode [data-m="${mod}"]`).click();
    await page.waitForTimeout(1200);
    if (mod === 'kitap') { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(900); await page.keyboard.press('ArrowRight'); }
    else await page.locator('#oScroll').evaluate(e => { e.scrollTop = e.scrollHeight * 0.45; });
    await page.waitForTimeout(2500);   // the page is recorded as read
    const once = await durum(page);
    const hedef = once.lang === 'en' ? 'tr' : 'en';
    await dilDegisti(page, () => page.evaluate(d => window.defterDilSec(d), hedef));
    await page.waitForSelector('#okuyucu:not([hidden])', { timeout: 20_000 });
    await page.waitForFunction(() => /\d+ \/ \d+/.test(document.querySelector('#oPno')?.textContent ?? ''), null, { timeout: 20_000 });
    await page.waitForTimeout(2000);
    const sonra = await durum(page);
    await page.screenshot({ path: join(OUT, `donus-okuyucu-${mod}-${hedef}.png`) });
    rapor.push({ adim: `2. okuyucu, ${mod} modu → ${hedef}`, once, sonra });
    assert.equal(sonra.lang, hedef);
    assert.deepEqual(sonra.okuyucu, once.okuyucu);
    // back to the desk for the next round
    await page.locator('#oClose').click();
    await page.waitForTimeout(1200);
  }
  console.log(JSON.stringify(rapor, null, 2));
  console.log('\nGEÇTİ: masadaki kitap ve okuyucu (kitap + PDF modu) dil değişince aynı yerde açıldı.');
} finally {
  await browser.close();
  server.kill();
}
