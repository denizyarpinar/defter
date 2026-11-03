// Local-only UI verification. Owner state and API responses are fake; no Google/Redis requests.
// Run with npm run dev active: node scripts/sayac-panel-kontrol.mjs [screenshot-directory]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const origin = process.env.DEFTER_TEST_ORIGIN ?? 'http://localhost:5173';
const output = process.argv[2];
if (output) mkdirSync(output, { recursive: true });
const types = ['cihaz', 'demo', 'giris', 'kitaplik', 'kitap', 'ozet', 'foto'];
const data = { gunler: Array.from({ length: 30 }, (_, index) => ({
  tarih: new Date(Date.UTC(2026, 9, 5 + index)).toISOString().slice(0, 10),
  sayilar: Object.fromEntries(types.map((type, i) => [type, index === 29 ? i + 1 : 0])),
})) };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let checks = 0;
try {
  for (const [size, viewport] of [['phone', { width: 390, height: 844 }], ['ipad', { width: 820, height: 1180 }], ['desktop', { width: 1365, height: 900 }]]) {
    for (const language of ['en', 'tr']) {
      const context = await browser.newContext({ viewport });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await context.route('**/panel-test**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><body><button id="before">Before</button><script type="module">
        import { kullanimPaneliGuncelle } from '/src/ui/kullanimPaneli.ts';
        window.syncPanel = kullanimPaneliGuncelle;
        document.querySelector('#before').focus();
        kullanimPaneliGuncelle();
        window.ready = true;
      </script></body></html>` }));
      await context.route('**/src/drive/auth.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
        export const isSignedIn = () => window.signedIn !== false;
        export const kapsamDurumu = () => ({ sahip: window.owner !== false });
        export const currentToken = () => 'local-fake-only';
      ` }));
      let requests = 0, errorMode = false;
      await context.route('**/api/panel?*', route => {
        requests++;
        assert.equal(route.request().headers().authorization, 'Bearer local-fake-only');
        return route.fulfill({ status: errorMode ? 503 : 200, contentType: 'application/json', body: JSON.stringify(errorMode ? { kod: 'sayac_ayarsiz' } : data) });
      });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      page.on('requestfailed', request => console.error(request.url(), request.failure()?.errorText));
      await page.goto(`${origin}/panel-test?panel=1&lang=${language}`);
      await page.locator('#kullanimPaneli tbody tr').first().waitFor().catch(async error => {
        console.error({ size, language, errors, requests, body: await page.locator('body').innerText() });
        throw error;
      });
      assert.equal(await page.locator('tbody tr').count(), 30);
      assert.equal(await page.locator('thead th').count(), 8);
      assert.equal(await page.locator('.usage-totals dd').first().textContent(), '1');
      assert.equal(await page.locator('.usage-totals dd').last().textContent(), '7');
      assert.equal(await page.locator('#usageTitle').textContent(), language === 'tr' ? 'Kullanım paneli' : 'Usage panel');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no document overflow');
      const box = await page.locator('.usage-card').boundingBox();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1);
      if (output) await page.screenshot({ path: join(output, `usage-${size}-${language}.png`) });
      // Keyboard focus wraps through the table's horizontal-scroll region too.
      await page.locator('.usage-table').focus(); await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), language === 'tr' ? 'Kapat' : 'Close');
      await page.keyboard.press('Escape'); assert.equal(await page.locator('#kullanimPaneli').count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'before');
      await page.evaluate(() => window.syncPanel()); assert.equal(await page.locator('#kullanimPaneli').count(), 0);
      // Sign-out resets the dismissed state; sign-in opens it again. API errors stay translated.
      errorMode = true;
      await page.evaluate(() => { window.signedIn = false; window.syncPanel(); window.signedIn = true; window.syncPanel(); });
      await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes('not configured') || document.querySelector('[role="status"]')?.textContent.includes('ayarlı değil'));
      errorMode = false; await page.locator('.usage-card button').last().click(); await page.locator('tbody tr').first().waitFor();
      await page.evaluate(() => { window.signedIn = false; window.syncPanel(); });
      assert.equal(await page.locator('#kullanimPaneli').count(), 0);
      const before = requests;
      await page.evaluate(() => { window.signedIn = true; window.owner = false; window.syncPanel(); });
      assert.equal(await page.locator('#kullanimPaneli').count(), 0); assert.equal(requests, before);
      assert.deepEqual(errors, []); checks++;
      await context.close();
    }
  }
  console.log(`Panel UI: ${checks} size/language combinations passed; counts, table, focus, Escape, logout, non-owner, errors/retry, overflow.`);
} finally { await browser.close(); }
