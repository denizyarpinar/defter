// Task 6.5-1: the language change comes back to the same place (sample library, ?demo, no sign-in).
// Usage: npm run build && node scripts/dil-donus-kontrol.mjs [output folder]
// 1. A book on the desk → the top bar's language button → after the reload the same book on the desk, in the other language.
// 2. The reader on a topic, a page further on, book and PDF mode → window.defterDilSec (the reader has no button; ?olcum=1
//    turns the hook on in the build) → the same book / topic / material / file / page.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4183;
const ILK_DIL = process.env.DIL === 'en' ? 'en' : 'tr';
const URL = `http://localhost:${PORT}/?demo&olcum=1&lang=${ILK_DIL}`;
const OUT = process.argv[2] ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\dil-6.5-1';
const BOYUTLAR = process.env.GENISLIK === '390' ? [[390, 844]] : [[390, 844], [820, 1180], [1180, 820], [1280, 800]];
const KITAP = 'programlamaya-giris';

// 6.5-2a: the sample library's names follow the language (public/ornek/en.json). The page has no ids, so the names of
// both languages are mapped to one key (the book id, "u<unit>.t<topic>") and compared by that.
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const trKitap = json(`public/ornek/kitaplar/${KITAP}/kitap.json`);
const enKitap = json('public/ornek/en.json').kitaplar[KITAP];
const KIMLIK = new Map([[trKitap.baslik, KITAP], [enKitap.baslik, KITAP]]);
trKitap.uniteler.forEach((u, i) => u.konular.forEach((k, j) => {
  KIMLIK.set(k.baslik, `u${i}.t${j}`);
  KIMLIK.set(enKitap.uniteler[i].konular[j], `u${i}.t${j}`);
}));
const kimlik = (ad) => ad == null ? ad : KIMLIK.get(ad) ?? ad;
// the first topic, in the page's language
const konuAdi = (lang) => lang === 'en' ? enKitap.uniteler[0].konular[0] : trKitap.uniteler[0].konular[0].baslik;
// the same place, in either language
const yer = (d) => ({
  masa: kimlik(d.masa),
  okuyucu: d.okuyucu && { ...d.okuyucu, kitap: kimlik(d.okuyucu.kitap), konu: kimlik(d.okuyucu.konu) },
});

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
      sekme: document.querySelector('#oTabs [aria-selected="true"]')?.dataset.kind ?? null,   // the key, not the label (it follows the language)
      dosya: document.querySelector('#oFiles:not([hidden]) #oFile')?.value ?? null,
      sayfa: document.querySelector('#oPno')?.textContent,
      mod: document.querySelector('#oMode .on, #oMode [aria-pressed="true"]')?.dataset.m ?? null,
    } : null,
  };
});

// the reload the language change starts; then the room again
async function dilDegisti(page, tetikle) {
  await Promise.all([page.waitForNavigation({ timeout: 20_000, waitUntil: 'domcontentloaded' }), tetikle()]);
  await hazir(page);
}

mkdirSync(OUT, { recursive: true });
const server = await startPreview();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const rapor = [];
try {
  for (const [width, height] of BOYUTLAR) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('Sayfa hatası:', e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await hazir(page);
  await page.waitForTimeout(1500);
  await page.locator('#araBtn').click();
  await page.locator('#aramaPaneli input').fill('program');
  await page.locator('#aramaPaneli .ap-satir').first().waitFor();
  await page.waitForTimeout(300);
  await page.locator('#aramaPaneli .ap-satir').first().click();
  await page.waitForSelector('#reader:not([hidden])', { timeout: 10_000 });
  await page.waitForTimeout(1500);

  // 1. the book on the desk: the top bar's button (is it reachable over the desk?)
  const once1 = await durum(page);
  const hedef1 = once1.lang === 'en' ? 'tr' : 'en';
  const dugme = page.locator('#dilBtn');
  let yol = 'üst çubuk düğmesi';
  try { await dugme.click({ trial: true, timeout: 2000 }); } catch { yol = 'defterDilSec (düğme masanın altında kaldı)'; }
  await dilDegisti(page, () => yol.startsWith('üst') ? dugme.click() : page.evaluate(d => window.defterDilSec(d), hedef1));
  await page.waitForSelector('#reader:not([hidden])', { timeout: 15_000 });
  await page.waitForTimeout(1500);
  const sonra1 = await durum(page);
  await page.screenshot({ path: join(OUT, `${width}-${hedef1}-donus-masa.png`) });
  rapor.push({ adim: `1. masadaki kitap (${yol})`, once: once1, sonra: sonra1 });
  assert.equal(sonra1.lang, hedef1);
  assert.ok(!sonra1.adres.includes('lang='), '?lang adresten kalkmalı');
  assert.equal(kimlik(sonra1.masa), KITAP);
  assert.equal(kimlik(once1.masa), KITAP);

  // 2. the reader: a topic, two spreads further (book mode), then the language
  for (const mod of ['kitap', 'pdf']) {
    const topic = page.locator('#reader [data-t]', { hasText: konuAdi(await page.evaluate(() => document.documentElement.lang)) }).first();
    if (!await topic.isVisible() && await page.locator('#next').isEnabled()) { await page.locator('#next').click(); await page.waitForTimeout(700); }
    await topic.click();
    await page.waitForSelector('#okuyucu:not([hidden])', { timeout: 15_000 });
    await page.waitForFunction(() => /\d+ \/ \d+/.test(document.querySelector('#oPno')?.textContent ?? ''), null, { timeout: 20_000 });
    // Portrait original + an explicit page avoids an ambiguous centre point when several landscape slides
    // fit in a phone viewport. Keep the exact before/after assertions, including material, mode and page.
    if (mod === 'pdf') {
      await page.locator('#oTabs [data-kind="orijinal"]').click();
      await page.waitForFunction(() => document.querySelector('#oTabs [data-kind="orijinal"]')?.getAttribute('aria-selected') === 'true' && /\/ 64$/.test(document.querySelector('#oPno')?.textContent ?? ''), null, { timeout: 20_000 });
    }
    await page.locator(`#oMode [data-m="${mod}"]`).click();
    await page.waitForTimeout(1200);
    if (mod === 'kitap') { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(900); await page.keyboard.press('ArrowRight'); }
    else await page.locator('#oSlider').evaluate(e => { e.value = '20'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(2500);   // the page is recorded as read
    const once = await durum(page);
    const hedef = once.lang === 'en' ? 'tr' : 'en';
    await dilDegisti(page, () => page.evaluate(d => window.defterDilSec(d), hedef));
    await page.waitForSelector('#okuyucu:not([hidden])', { timeout: 20_000 });
    await page.waitForFunction(() => /\d+ \/ \d+/.test(document.querySelector('#oPno')?.textContent ?? ''), null, { timeout: 20_000 });
    await page.waitForTimeout(2000);
    const sonra = await durum(page);
    await page.screenshot({ path: join(OUT, `${width}-${hedef}-donus-okuyucu-${mod}.png`) });
    rapor.push({ adim: `2. okuyucu, ${mod} modu → ${hedef}`, once, sonra });
    assert.equal(sonra.lang, hedef);
    assert.deepEqual(yer(sonra).okuyucu, yer(once).okuyucu);
    assert.equal(yer(sonra).okuyucu.konu, 'u0.t0');
    // back to the desk for the next round
    await page.locator('#oClose').click();
    await page.waitForTimeout(1200);
  }
  await page.close();
  console.log(`OK dil dönüşü: başlangıç ${ILK_DIL}, genişlik ${width}`);
  }
  console.log(JSON.stringify(rapor, null, 2));
  console.log('\nGEÇTİ: masadaki kitap ve okuyucu (kitap + PDF modu) dil değişince aynı yerde açıldı.');
} finally {
  await browser.close();
  server.kill();
}
