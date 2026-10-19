// Task 6.H2b: screenshots of the pen comparison page (?kalemTest=1, development only: it runs the vite dev server).
// Usage: node scripts/kalem-test-kontrol.mjs [record file] [output folder]
// The built-in samples (u, s with a repeated move, A, a tight highlighter curl), then every stroke of the
// record (window.defterKalemOlcum() JSON; default: Claude outputs\kalem-zoom.txt, skipped if missing).
// One PNG per stroke: ESKİ | YENİ at 1× and 4×. Exit code 1 if the page shows an error.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4182;
const URL = `http://localhost:${PORT}/?demo&kalemTest=1`;
const OUTPUTS = 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs';
const RECORD = process.argv[2] ?? join(OUTPUTS, 'kalem-zoom.txt');
const OUT = process.argv[3] ?? join(OUTPUTS, 'kalem-6.H2b');

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

async function shots(page, prefix) {
  await page.waitForSelector('#ktListe .kt-cizgi, #ktListe .kt-hata');
  const errors = await page.$$eval('#ktListe .kt-hata', els => els.map(e => e.textContent));
  const sections = await page.$$('#ktListe .kt-cizgi');
  const lines = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const info = await s.$eval('.kt-bilgi', e => e.textContent);
    const name = await s.$eval('b', e => e.textContent);
    lines.push(`${name}: ${info}`);
    await s.screenshot({ path: join(OUT, `${prefix}-${String(i + 1).padStart(2, '0')}.png`) });
  }
  return { errors, lines };
}

mkdirSync(OUT, { recursive: true });
const dev = await startDev();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto(URL);
  const ornek = await shots(page, 'ornek');
  console.log('Örnekler:\n  ' + ornek.lines.join('\n  '));
  if (ornek.errors.length) { failed = true; console.log('HATA:', ornek.errors); }
  if (existsSync(RECORD)) {
    await page.fill('#kalemTest textarea', readFileSync(RECORD, 'utf8'));
    await page.click('#kalemTest .kt-arac button');
    const kayit = await shots(page, 'kayit');
    console.log(`Kayıt (${RECORD}):\n  ` + kayit.lines.join('\n  '));
    if (kayit.errors.length) { failed = true; console.log('HATA:', kayit.errors); }
  } else {
    console.log(`Kayıt yok, atlandı: ${RECORD}`);
  }
  console.log(`Görüntüler: ${OUT}`);
} finally {
  await browser.close();
  dev.kill();
}
process.exit(failed ? 1 : 0);
