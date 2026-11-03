// K-1: real sample reader, Chromium, frame-by-frame live path bounds.
// node scripts/tahmin-kontrol.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const origin = 'http://localhost:4194';
const dev = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '4194', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(origin)).ok) break; } catch { /* starting */ }
    if (i === 99) throw new Error('Vite başlamadı');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const rollback of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(`${origin}/?demo&lang=tr&olcum=1${rollback ? '&tahmin=1' : ''}`);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).display === 'none');
    await page.evaluate(async () => {
      const [ok, parse, sample, reader] = await Promise.all([
        import('/src/okuma/Okuyucu.ts'), import('/src/model/parse.ts'),
        import('/src/okuma/ornekKaynak.ts'), import('/src/ui/reader.ts')
      ]);
      const book = parse.parseBook('programlamaya-giris', await (await fetch('/ornek/kitaplar/programlamaya-giris/kitap.json')).json());
      reader.readerShell(true);
      await ok.openOkuyucu(book, sample.sampleBookFolder(book.id), 0, 0, () => {});
    });
    await page.locator('#oPenBtn').click();
    await page.waitForFunction(() => document.querySelector('.o-page canvas')?.width > 0 && !document.querySelector('#oTools')?.hidden);
    await page.waitForTimeout(500);
    const bounds = await page.locator('.o-page').first().boundingBox();
    assert(bounds);
    const x = Math.max(bounds.x + 80, 200), y = Math.max(bounds.y + 100, 250);
    await page.evaluate(() => {
      window.__check = { reads: 0, calls: 0, frames: 0, overflow: 0, points: [], active: false };
      // A deliberately bad browser prediction makes the old tail reproducible.
      Object.defineProperty(PointerEvent.prototype, 'getPredictedEvents', { configurable: true, get() {
        window.__check.reads++;
        return function () {
          window.__check.calls++;
          return [new PointerEvent('pointermove', { clientX: this.clientX + 120, clientY: this.clientY, pointerType: this.pointerType })];
        };
      } });
      document.addEventListener('pointerdown', e => {
        if (!e.target.closest('.o-page')) return;
        window.__check.points = [[e.clientX, e.clientY]];
        window.__check.active = true;
      }, true);
      document.addEventListener('pointermove', e => {
        if (window.__check.active) window.__check.points.push([e.clientX, e.clientY]);
      }, true);
      const frame = () => {
        const s = window.__check, p = document.querySelector('.o-cizim.canli path');
        if (s.active && p?.getAttribute('d') && s.points.length) {
          s.frames++;
          const r = p.getBoundingClientRect(), xs = s.points.map(p => p[0]), ys = s.points.map(p => p[1]);
          s.overflow = Math.max(s.overflow, Math.min(...xs) - r.left, r.right - Math.max(...xs), Math.min(...ys) - r.top, r.bottom - Math.max(...ys));
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForSelector('.o-cizim.canli path');
    for (let i = 1; i <= 40; i++) {
      await page.mouse.move(x + i * 4, y + (i % 2 ? 35 : 0));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    const result = await page.evaluate(() => ({ ...window.__check, points: window.__check.points.length }));
    await page.mouse.up();
    assert(result.frames >= 40, 'live path sampled on every frame');
    if (rollback) {
      assert(result.calls > 0, 'rollback reads predictions');
      assert(result.overflow > 3, 'control detects old tail');
    } else {
      assert.equal(result.reads, 0, 'mouse never even reads getPredictedEvents');
      assert(result.overflow <= 3, `path exceeds retained mouse bounds: ${result.overflow}px`);
      // Pen still uses the same prediction path (synthetic pen, real reader).
      await page.evaluate(({ x, y }) => {
        const box = document.querySelector('.o-page');
        for (const [type, dx] of [['pointerdown', 0], ['pointermove', 20], ['pointerup', 20]]) {
          box.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 42, pointerType: 'pen',
            isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 0.5, clientX: x + dx, clientY: y }));
        }
      }, { x, y });
      assert(await page.evaluate(() => window.__check.calls > 0), 'pen keeps predictions');
    }
    console.log(JSON.stringify({ mode: rollback ? 'rollback mouse (old tail detected)' : 'mouse + pen preserved', ...result }));
    await context.close();
  }
} finally {
  await browser?.close();
  dev.kill();
}
