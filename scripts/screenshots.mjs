// Faz 2.6: README screenshots and demo GIF from the local build, in ?demo mode.
//
// Run:  npm run screenshots   (= npm run build && node scripts/screenshots.mjs)
// Needs: Google Chrome (used through playwright-core, no extra browser download), ffmpeg on PATH,
// gifsicle (npm devDependency) for the lossy GIF step, sharp for the PNGs. GIF_KEEP=1 keeps the raw GIF frames.
// PNGs are shot at devicePixelRatio 2 (smooth edges), then scaled to 1600 px and saved with a
// 256-colour palette (< 800 kB each).
//
// Writes to docs/: oda-gunduz.png, oda-aksam.png, raf.png, kitap.png, once-sonra.png, demo.gif,
// and (Faz 5.12) foto-ekle.png, kose-duzelt.png, dosya-ekle.png from made-up images (no lecture material).
// SHOTS=faz5 makes only the three Faz 5 images (no ffmpeg needed; the other files stay as they are).
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

// ---- Faz 5.12: photo panel, corner editor, file panel (sample library: "Ekle" stays off) ----

// Made-up input images (nothing from a lecture): a notebook page lying a bit skewed on a dark desk,
// and three "board" images for the file panel's list. Written to a temp folder, never to the repo.
async function faz5Inputs(dir) {
  const W = 2400, H = 1800;
  const page = [[620, 170], [1830, 250], [1760, 1650], [540, 1580]];   // corners, clockwise
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a3222"/><stop offset="1" stop-color="#2c1d13"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#w)"/>`;
  for (let y = 40; y < H; y += 90) s += `<path d="M0 ${y} Q ${W / 2} ${y + 25} ${W} ${y - 10}" stroke="#5a3d2a" stroke-width="10" fill="none" opacity=".5"/>`;
  s += `<polygon points="${page.map(p => p.join(',')).join(' ')}" fill="#000" opacity=".35" transform="translate(18,22)"/>`;
  s += `<polygon points="${page.map(p => p.join(',')).join(' ')}" fill="#fbf8ef"/>`;
  // lines, margin and text in the page's own frame (a 1200×1400 sheet), mapped with an affine fit of three corners
  const [p0, p1, , p3] = page, sw = 1200, sh = 1400;
  const m = [(p1[0] - p0[0]) / sw, (p1[1] - p0[1]) / sw, (p3[0] - p0[0]) / sh, (p3[1] - p0[1]) / sh, p0[0], p0[1]];
  s += `<g transform="matrix(${m.join(' ')})">`;
  for (let y = 150; y < sh - 40; y += 56) s += `<line x1="0" y1="${y}" x2="${sw}" y2="${y}" stroke="#a9c8e8" stroke-width="3"/>`;
  s += `<line x1="140" y1="0" x2="140" y2="${sh}" stroke="#e08a8a" stroke-width="4"/>`;
  const hand = 'font-family="Segoe Print, Segoe Script, Comic Sans MS, cursive" fill="#1d3557"';
  const lines = ['Aussagenlogik – özet', '', 'Aussage: wahr oder falsch (doğru/yanlış)', 'Junktoren: ¬  ∧  ∨  →  ↔', 'De Morgan: ¬(a ∧ b) ≡ ¬a ∨ ¬b', '', 'a  b  | a → b', '0  0  |   1', '0  1  |   1', '1  0  |   0', '1  1  |   1'];
  lines.forEach((t, i) => { if (t) s += `<text x="170" y="${140 + i * 56}" font-size="${i ? 36 : 50}" ${hand}${i ? '' : ' font-weight="700"'}>${t}</text>`; });
  s += `<ellipse cx="560" cy="${140 + 9 * 56 - 12}" rx="150" ry="34" stroke="#d62828" stroke-width="5" fill="none"/></g></svg>`;
  const files = [join(dir, 'defter-foto.jpg')];
  await sharp(Buffer.from(s)).jpeg({ quality: 88 }).toFile(files[0]);
  const boards = [['#264653', 'Übung 3 – Aufgabe 1'], ['#2a9d8f', 'Übung 3 – Aufgabe 2'], ['#e76f51', 'Übung 3 – Lösungsskizze']];
  for (const [i, [bg, t]] of boards.entries()) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="${bg}"/>
      <text x="120" y="220" font-family="Segoe Print, Comic Sans MS, cursive" font-size="90" fill="#fff">${t}</text>
      <path d="M140 420 L 700 420 M140 560 L 1100 560 M140 700 L 900 700" stroke="#fff" stroke-width="14" stroke-linecap="round" opacity=".85"/>
      <circle cx="1250" cy="850" r="190" stroke="#fff" stroke-width="14" fill="none" opacity=".85"/></svg>`;
    const f = join(dir, `tahta-${i + 1}.jpg`);
    await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(f);
    files.push(f);
  }
  return files;
}

const PRG_BOOK = { x: 618, y: 350 };   // shelf view: "Programlamaya Giriş"
const TOPIC = 'Değişkenler ve veri tipleri';

async function faz5Shots(browser) {
  const dir = mkdtempSync(join(tmpdir(), 'defter-faz5-'));
  try {
    const [photo, ...boards] = await faz5Inputs(dir);
    const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
    await openRoom(page);
    await setMode(page, 'Gündüz');
    await openShelf(page);
    await page.mouse.click(PRG_BOOK.x, PRG_BOOK.y);
    await page.waitForSelector('#reader:not([hidden])', { timeout: 10_000 });
    await page.waitForTimeout(1500);
    await page.locator('[data-t]', { hasText: TOPIC }).first().click();
    await page.waitForSelector('#oFoto', { state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(2500);   // the summary's first pages

    // 1. photo panel: the notebook photo (cropped) and one board image
    await page.setInputFiles('#oFotoInput', [photo, boards[0]]);
    await page.waitForSelector('#fotoPanel .fp-oge:nth-child(2)', { timeout: 30_000 });
    await page.waitForFunction(() => !document.querySelector('#fotoPanel .fp-mesgul') && !document.querySelector('#fotoPanel .fp-durum:not([hidden])'), null, { timeout: 30_000 });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(500);
    await savePng(await page.screenshot(), 'foto-ekle.png');

    // 2. corner editor of the first photo
    await page.locator('#fotoPanel .fp-duzelt').first().click();
    await page.waitForSelector('.kd', { timeout: 10_000 });
    await page.waitForFunction(() => { const y = document.querySelector('.kd-yukleniyor'); return !y || y.hidden || getComputedStyle(y).display === 'none'; }, null, { timeout: 30_000 });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(800);
    await savePng(await page.screenshot(), 'kose-duzelt.png');
    await page.keyboard.press('Escape');   // the editor
    await page.waitForTimeout(400);
    await page.locator('#fotoPanel .fp-vazgec').click();
    await page.waitForSelector('#fotoPanel', { state: 'detached', timeout: 10_000 });

    // 3. file panel with three images (one PDF)
    await page.setInputFiles('#oDosyaInput', boards);
    await page.waitForSelector('#dosyaPanel', { timeout: 30_000 });
    await page.waitForTimeout(2500);   // thumbnails
    await page.mouse.move(0, 0);
    await savePng(await page.screenshot(), 'dosya-ekle.png');
    await page.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- main ----

const server = await startPreview();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: GPU_ARGS });
if (process.env.SHOTS === 'faz5') {
  // only the three Faz 5 images (no GIF, no ffmpeg; the other files in docs/ stay as they are)
  try {
    await faz5Shots(browser);
  } finally {
    await browser.close();
    server.kill();
  }
  process.exit(0);
}
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

  await faz5Shots(browser);

  log('demo.gif kaydediliyor…');
  await recordGif(browser);
  log('docs/demo.gif');
  for (const f of readdirSync(DOCS)) log(`  ${f}: ${(statSync(join(DOCS, f)).size / 1024 / 1024).toFixed(2)} MB`);
} finally {
  await browser.close();
  server.kill();
}
