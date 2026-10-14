// Faz 2.6: README screenshots and demo GIF from the local build, in ?demo mode.
//
// Run:  npm run screenshots   (= npm run build && node scripts/screenshots.mjs)
// Needs: Google Chrome (used through playwright-core, no extra browser download), ffmpeg on PATH,
// gifsicle (npm devDependency) for the lossy GIF step, sharp for the PNGs. GIF_KEEP=1 keeps the raw GIF frames.
// PNGs are shot at devicePixelRatio 2 (smooth edges), then scaled to 1600 px and saved with a
// 256-colour palette (< 800 kB each).
//
// Writes to docs/: oda-gunduz.png, oda-aksam.png, raf.png, kitap.png, once-sonra.png, demo.gif.
// Click points are for a 1600×1000 window and the sample library in public/ornek/: if the room
// framing or the books change, check BOOKCASE and BOOK below (run once, look at docs/raf.png).

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import gifsicle from 'gifsicle';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const PORT = 4179;
const URL = `http://localhost:${PORT}/?demo`;
const VIEW = { width: 1600, height: 1000 };
const BOOKCASE = { x: 1040, y: 330 };   // room view: a point on the bookcase
const BOOK = { x: 655, y: 210 };        // shelf view: "Machine Learning Basics" (English, top shelf)
const EMPTY = { x: 300, y: 330 };       // shelf view: wall left of the bookcase → back to the room
const PNG_WIDTH = 1600;
const GIF_WIDTH = 800, GIF_FPS = 15, GIF_MAX_BYTES = 5 * 1024 * 1024;

// GPU: Direct3D 11 through ANGLE, on the fast GPU of a laptop with two.
const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'];

const log = (msg) => console.log(msg);

async function savePng(buf, name) {
  await sharp(buf).resize({ width: PNG_WIDTH, kernel: 'lanczos3' })
    .png({ palette: true, quality: 95, effort: 10, compressionLevel: 9, dither: 1 })
    .toFile(join(DOCS, name));
  log(`docs/${name}`);
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ---- local preview server (vite preview of dist/) ----

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

// ---- app helpers ----

async function openRoom(page, extra = '') {
  await page.goto(URL + extra);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).display === 'none', null, { timeout: 30_000 });
  await page.waitForTimeout(1500);   // fonts, textures, first frames
}

async function setMode(page, label) {
  await page.locator('#modeSeg button', { hasText: label }).click();
  await page.mouse.move(0, 0);       // no hover state on the buttons
  await page.waitForTimeout(2500);   // day ↔ evening transition is 1.5 s
}

async function openShelf(page) {
  await page.mouse.click(BOOKCASE.x, BOOKCASE.y);
  await page.waitForTimeout(2500);
}

async function openBook(page) {
  await page.mouse.click(BOOK.x, BOOK.y);
  await page.waitForSelector('#reader:not([hidden])', { timeout: 10_000 });
  await page.waitForTimeout(1500);
}

async function gpuName(page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'bilinmiyor';
  });
}

// ---- before / after: two shots side by side with a small label each ----

async function beforeAfter(browser, before, after) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 500 }, deviceScaleFactor: 2 });
  const img = (buf, label) => `<figure><img src="data:image/png;base64,${buf.toString('base64')}"><figcaption>${label}</figcaption></figure>`;
  await page.setContent(`<!doctype html><style>
    body { margin: 0; display: flex; background: #e9dcc6 }
    figure { position: relative; margin: 0; width: 800px; height: 500px }
    img { display: block; width: 100%; height: 100% }
    figcaption { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); padding: 4px 12px; border-radius: 999px;
      background: rgba(30, 22, 14, .78); color: #fff; font: 600 15px system-ui, sans-serif; letter-spacing: .02em }
  </style>${img(before, 'Before')}${img(after, 'After')}`);
  await page.waitForFunction(() => [...document.images].every(i => i.complete));
  const out = await page.screenshot();
  await page.close();
  return out;
}

// ---- demo GIF: CDP screencast frames → ffmpeg ----

async function recordGif(browser) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await openRoom(page);
  await setMode(page, 'Gündüz');

  const dir = mkdtempSync(join(tmpdir(), 'defter-gif-'));
  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: VIEW.width, maxHeight: VIEW.height });

  // oda → kitaplık → kitap aç → geri dön (≈ 11 s)
  const start = Date.now();
  await page.waitForTimeout(800);
  await openShelf(page);
  await openBook(page);
  await page.waitForTimeout(500);
  await page.locator('#rClose').click();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(2000);   // the book flies back to the shelf
  await page.mouse.click(EMPTY.x, EMPTY.y);
  await page.waitForTimeout(1500);
  const end = Date.now();
  await cdp.send('Page.stopScreencast');
  await ctx.close();
  log(`  ${frames.length} kare, ${((end - start) / 1000).toFixed(1)} sn`);

  // each frame lasts until the next one; the last one until the end of the recording
  const lastT = frames[0].t + (end - start) / 1000;
  const list = frames.map((f, i) => `file '${f.file.replace(/\\/g, '/')}'\nduration ${((frames[i + 1]?.t ?? lastT) - f.t).toFixed(4)}`);
  list.push(`file '${frames.at(-1).file.replace(/\\/g, '/')}'`);
  const listFile = join(dir, 'list.txt');
  writeFileSync(listFile, list.join('\n'));

  // ffmpeg: full 256-colour palette with ordered dither (stable between frames), then gifsicle
  // lossy compression, a bit stronger each time, until the GIF fits under 5 MB
  const raw = join(dir, 'raw.gif'), out = join(DOCS, 'demo.gif');
  const vf = `fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b];` +
    '[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle';
  const ff = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', vf, '-loop', '0', raw], { stdio: 'inherit' });
  if (ff.error || ff.status !== 0) throw new Error("ffmpeg çalışmadı. ffmpeg kurulu ve PATH'te mi?");
  for (const lossy of [40, 60, 80, 100]) {
    const gs = spawnSync(gifsicle, ['-O3', `--lossy=${lossy}`, raw, '-o', out], { stdio: 'inherit' });
    if (gs.error || gs.status !== 0) throw new Error('gifsicle çalışmadı. "npm install" ile tekrar kur.');
    const size = statSync(out).size;
    log(`  demo.gif: lossy ${lossy} → ${(size / 1024 / 1024).toFixed(2)} MB`);
    if (size <= GIF_MAX_BYTES) break;
  }
  if (process.env.GIF_KEEP) log(`  kareler: ${dir}`); else rmSync(dir, { recursive: true, force: true });
}

// ---- main ----

const server = await startPreview();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: GPU_ARGS });
try {
  mkdirSync(DOCS, { recursive: true });
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
  await openRoom(page);
  const gpu = await gpuName(page);
  log(`GPU: ${gpu}`);
  if (/swiftshader|llvmpipe|basic render|software/i.test(gpu)) {
    log('UYARI: GPU kullanılmıyor, yazılım çizimi. Görüntüler bulanık ya da yavaş olabilir.');
  }

  await setMode(page, 'Gündüz');
  const day = await page.screenshot();
  await savePng(day, 'oda-gunduz.png');
  await setMode(page, 'Akşam');
  await savePng(await page.screenshot(), 'oda-aksam.png');

  await setMode(page, 'Gündüz');
  await openShelf(page);
  await savePng(await page.screenshot(), 'raf.png');
  await openBook(page);
  await savePng(await page.screenshot(), 'kitap.png');

  await openRoom(page, '&oda=eski');
  await setMode(page, 'Gündüz');
  const old = await page.screenshot();
  await page.close();
  await savePng(await beforeAfter(browser, old, day), 'once-sonra.png');

  log('demo.gif kaydediliyor…');
  await recordGif(browser);
  log('docs/demo.gif');
  for (const f of readdirSync(DOCS)) log(`  ${f}: ${(statSync(join(DOCS, f)).size / 1024 / 1024).toFixed(2)} MB`);
} finally {
  await browser.close();
  server.kill();
}
