// E-1: real reader/toolbar, sample PDFs only; run while Vite serves localhost:5173.
// node scripts/el-modu-kontrol.mjs [screenshot directory] [Vite URL]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? 'C:\\Users\\yarpi\\Projeler\\defter-test-dosyalari\\el-modu';
const base = process.argv[3] ?? 'http://127.0.0.1:5173';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

async function openReader(page, lang, extra = '') {
  await page.goto(`${base}/?demo&lang=${lang}${extra}`);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).display === 'none');
  await page.evaluate(async () => {
    const { loadLocalLibrary } = await import('/src/model/localSource.ts');
    const { openOkuyucu } = await import('/src/okuma/Okuyucu.ts');
    const { readerShell } = await import('/src/ui/reader.ts');
    const { books } = await loadLocalLibrary();
    readerShell(true);
    await openOkuyucu(books.get('programlamaya-giris'), 'ornek:programlamaya-giris', 0, 0, () => {});
  });
  await page.locator('#oMode [data-m="pdf"]').click();
  await page.locator('.o-page canvas:visible').first().waitFor();
  await page.locator('#oPenBtn').click();
  await page.waitForFunction(() => !document.querySelector('#oTools [data-arac="kalem"]').disabled);
}

async function pressed(page) {
  return page.locator('[data-elmodu]').getAttribute('aria-pressed');
}

// Dispatch into the actual page listeners and inspect the actual SVG preview.
async function pointer(page, type, pointerType, id, width = 20) {
  return page.evaluate(({ type, pointerType, id, width }) => {
    const box = [...document.querySelectorAll('.o-page')].find(e => e.getBoundingClientRect().width > 0);
    const r = box.getBoundingClientRect();
    box.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
      pointerType, pointerId: id, isPrimary: id === 1, button: 0, buttons: type === 'pointerup' ? 0 : 1,
      width, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pressure: .5 }));
    return box.querySelectorAll('.canli').length;
  }, { type, pointerType, id, width });
}

try {
  for (const lang of ['en', 'tr']) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await context.addInitScript(() => localStorage.setItem('defter-kalem-var', '1'));
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await openReader(page, lang);
    assert.equal(await pressed(page), 'false');
    for (const [width, height] of [[390, 844], [1180, 820], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      await page.locator('[data-elmodu]').click();
      assert.equal(await pressed(page), 'true');
      await page.waitForTimeout(600); // resize/render settles before measuring and capturing
      const layout = await page.evaluate(() => {
        const bar = document.querySelector('#oTools'), b = bar.getBoundingClientRect();
        const items = [...bar.querySelectorAll('.o-kaydir > *, .o-sag > *')].filter(e => getComputedStyle(e).display !== 'none');
        const close = bar.querySelector('[data-kapat]').getBoundingClientRect();
        const span = bar.querySelector('[data-elmodu] span');
        return { height: b.height, rows: new Set(items.map(e => Math.round((e.getBoundingClientRect().top + e.getBoundingClientRect().bottom) / 24))).size,
          overflow: bar.scrollWidth > bar.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth,
          close: close.right <= innerWidth && close.left >= 0,
          iconOnly: getComputedStyle(span).display === 'none', fingerClass: document.querySelector('#okuyucu').classList.contains('kalem-parmak') };
      });
      assert.equal(layout.height, 58); assert.equal(layout.rows, 1); assert.equal(layout.overflow, false);
      assert.equal(layout.close, true); assert.equal(layout.iconOnly, width <= 1024); assert.equal(layout.fingerClass, true);
      await page.screenshot({ path: join(out, `${lang}-${width}x${height}.png`) });
      console.log(`${lang} ${width}x${height}: ${JSON.stringify(layout)}`);
      await page.locator('[data-elmodu]').click();
    }
    await page.locator('[data-elmodu]').click();
    await openReader(page, lang); // reload keeps the preference
    assert.equal(await pressed(page), 'true');
    await page.waitForTimeout(500); // allow the sample PDF's stroke model to load
    assert.equal(await pointer(page, 'pointerdown', 'touch', 1, 104), 1);
    assert.equal(await pointer(page, 'pointerdown', 'touch', 2), 0);
    await pointer(page, 'pointerup', 'touch', 1); await pointer(page, 'pointerup', 'touch', 2);
    assert.equal(await pointer(page, 'pointerdown', 'pen', 1), 1); // the very first Pencil stroke starts normally
    assert.equal(await pressed(page), 'false');
    assert.equal(await page.evaluate(() => localStorage.getItem('defter-el-modu')), null);
    assert.equal(await page.locator('#okuyucu').evaluate(e => e.classList.contains('kalem-parmak')), false);
    await pointer(page, 'pointercancel', 'pen', 1);
    await openReader(page, lang, '&elModu=0');
    assert.equal(await page.locator('[data-elmodu]').count(), 0);
    console.log(`${lang}: reload, broad finger, second-finger cancel, first Pencil stroke, rollback OK`);
    await context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await openReader(page, 'en');
  assert.equal(await page.locator('[data-elmodu]').count(), 0);
  console.log('No remembered Pencil: button hidden');
  await context.close();
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
