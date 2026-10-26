// Task 6.K2b: control screenshots of the "Kitaplığını kur" card, without signing in and without Drive.
// Usage: node scripts/kurulum-karti-kontrol.mjs [output folder]
// A Vite dev server on its own port; the page imports the app's own driveStatus.ts (the same module the app
// uses) and puts the card into each state with setKurulum. No request goes to Google or Drive.
// Shots: locked, unlocked, busy, error, half set up (1280 × 800) and the unlocked card at 390 px.
// Task 6.K3: the box "Örnek bir kitap da koy" (checked, unchecked) and the busy button with the sample's progress.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4182;
const URL = `http://localhost:${PORT}/?lang=tr`;
const OUT = process.argv[2] ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\kurulum-6.K3';

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

const DURUMLAR = [
  ['kilitli.png', { dugme: 'kur', kilitli: true, mesgul: false, hata: null, izinYok: false }],
  ['kilitsiz.png', { dugme: 'kur', kilitli: false, mesgul: false, hata: null, izinYok: false }],
  ['kutusuz.png', { dugme: 'kur', kilitli: false, mesgul: false, hata: null, izinYok: false }, { kutu: false }],
  ['kuruluyor.png', { dugme: 'kur', kilitli: false, mesgul: true, hata: null, izinYok: false }],
  ['kuruluyor-ornek.png', { dugme: 'kur', kilitli: false, mesgul: true, hata: null, izinYok: false, ilerleme: { i: 7, n: 18 } }],
  ['hata.png', { dugme: 'kur', kilitli: false, mesgul: false, izinYok: false,
    hata: 'Kurulum bitmedi: Drive\'a bağlanılamadı ya da Drive meşgul. İnternet bağlantını kontrol edip tekrar dene; tekrar denemede çift klasör oluşmaz.' }],
  ['hata-izin.png', { dugme: 'kur', kilitli: false, mesgul: false, izinYok: true,
    hata: 'Drive klasör oluşturmaya izin vermedi. Google girişinde Drive iznini onayladığından emin ol, sonra tekrar dene.' }],
  ['yarim.png', { dugme: 'tamamla', kilitli: false, mesgul: false, hata: null, izinYok: false }],
];

async function kart(page, k, { kutu = true } = {}) {
  await page.evaluate(async ([k, kutu]) => {
    const [{ setKurulum }, { hideLogin }] = await Promise.all([import('/src/ui/driveStatus.ts'), import('/src/ui/login.ts')]);
    hideLogin();
    document.querySelector('#kuOrnek').checked = kutu;
    setKurulum({ ilerleme: null, ...k });
  }, [k, kutu]);
  await wait(300);
}

const dev = await startDev();
const browser = await chromium.launch({ channel: 'chrome' });
try {
  mkdirSync(OUT, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(URL);
  await page.waitForFunction(() => document.querySelector('#loading')?.hidden, null, { timeout: 30_000 });
  for (const [ad, k, secenek] of DURUMLAR) {
    await kart(page, k, secenek);
    const metin = await page.evaluate(() => ({
      dugme: document.querySelector('#kuKur').textContent, kapali: document.querySelector('#kuKur').disabled,
      ornekKapali: document.querySelector('#kuSample').disabled, not: !document.querySelector('#kuKilit').hidden,
      kutu: document.querySelector('#kuOrnek').checked, kutuKapali: document.querySelector('#kuOrnek').disabled
    }));
    console.log(ad.padEnd(20), JSON.stringify(metin));
    await page.screenshot({ path: join(OUT, ad) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await kart(page, DURUMLAR[1][1]);
  await page.screenshot({ path: join(OUT, 'telefon-390.png') });
  await kart(page, DURUMLAR[4][1]);
  await page.screenshot({ path: join(OUT, 'telefon-390-kuruluyor.png') });
  const tasma = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log('390 px yatay taşma:', tasma ? 'VAR' : 'yok');
  console.log('Görüntüler:', OUT);
} finally {
  await browser.close();
  dev.kill();
}
