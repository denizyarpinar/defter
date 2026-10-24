// Local browser checks with fake GIS/Drive only. No real account, document or upload.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const origin = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [device, viewport] of [['laptop', { width: 1365, height: 900 }], ['ipad-emulation', { width: 820, height: 1180 }]]) {
    const context = await browser.newContext({ viewport, hasTouch: device !== 'laptop' });
    const writes = []; let temp; let version = 'v1'; let failCleanup = false; let exports = 0;
    let holdExport = false, releaseExport;
    let exportStartedResolve; const exportStarted = new Promise(r => { exportStartedResolve = r; });
    await context.route(origin + '/__ocr-test', r => r.fulfill({ contentType: 'text/html', body: '<html><body>Local OCR fixture</body></html>' }));
    await context.route('https://accounts.google.com/**', r => r.abort());
    await context.route('https://www.googleapis.com/**', async route => {
      const req = route.request(), url = new URL(req.url());
      const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      if (req.method() !== 'GET') writes.push({ method: req.method(), path: url.pathname, body: req.postData(), auth: req.headers().authorization });
      if (req.method() === 'POST') {
        const metadata = JSON.parse(req.postData().split('\r\n\r\n')[1].split('\r\n--')[0]);
        temp = { ...metadata, id: 'only-created-temp', trashed: false }; return json(temp);
      }
      if (url.pathname.endsWith('/export')) {
        exports++;
        if (holdExport) { exportStartedResolve(); await new Promise(r => { releaseExport = r; }); }
        return route.fulfill({ body: 'aranan el yazısı kelime' });
      }
      if (req.method() === 'PATCH') {
        assert.deepEqual(req.postDataJSON(), { trashed: true });
        if (failCleanup) return route.fulfill({ status: 403, body: '{}' });
        temp.trashed = true; return json(temp);
      }
      if (url.pathname.endsWith('/files/source')) return json({ id: 'source', modifiedTime: version, parents: ['topic'], trashed: false });
      if (url.pathname.endsWith('/files/topic')) return json({ id: 'topic', mimeType: 'application/vnd.google-apps.folder', parents: ['book'], capabilities: { canAddChildren: true }, trashed: false });
      if (url.pathname.endsWith('/files/book')) return json({ id: 'book', mimeType: 'application/vnd.google-apps.folder', trashed: false });
      if (url.pathname.endsWith('/files/only-created-temp')) return json(temp);
      if (url.pathname.endsWith('/files')) return json({ files: temp && url.searchParams.get('q')?.includes(temp.appProperties.ocrIslem) ? [temp] : [] });
      return route.fulfill({ status: 404, body: '{}' });
    });
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/__ocr-test');
    await page.evaluate(async () => {
      window.google = { accounts: { oauth2: {
        initTokenClient: options => ({ requestAccessToken: () => options.callback({ access_token: window.testToken ?? 'fake-account-one', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file' }) }),
        hasGrantedAllScopes: (r, scope) => r.scope.split(' ').includes(scope), revoke: () => {}
      } } };
      const auth = await import('/src/drive/auth.ts'); await auth.signIn();
      const { installReaderOcr } = await import('/src/ocr/okuyucuPanel.ts');
      window.fixture = { file: 'source', version: 'v1', folder: 'book', pages: [1, 2].map((n, i) => ({ index: 7 + i, page: { dosyaId: 'source', modifiedTime: 'v1', pdfSayfa: n, mimeType: 'application/pdf', tur: 'pdf', bolumIndex: 0, ad: 'fake.pdf' } })),
        content: {
          textContent: async p => ({ parcalar: p.pdfSayfa === 2 ? [{ str: 'mevcut kelime' }] : [] }),
          viewport: async () => ({ width: 100, height: 150 }),
          drawPdf: (_p, canvas) => { const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); return { promise: Promise.resolve() }; }
        }, go: index => { window.wentTo = index; }
      };
      installReaderOcr(() => window.fixture);
    });
    const panel = page.locator('#reader-ocr-search'); await panel.locator('summary').click();
    const click = key => panel.locator(`[data-${key}]`).click();
    const status = panel.locator('[data-status]');
    await panel.locator('[data-pages]').fill('1,2'); await click('prepare');
    await panel.locator('[data-count]').filter({ hasText: 'Google’a gönderilecek: 1' }).waitFor();
    assert.equal(writes.length, 0, 'preflight must never upload');
    failCleanup = true; await click('start'); await status.filter({ hasText: 'temizlik tamamlanmadı' }).waitFor();
    assert.equal(exports, 1); assert.equal(writes.filter(w => w.method === 'POST').length, 1);
    assert.match(await panel.locator('[data-cleanup]').innerText(), /TEMİZLENEMEDİ/);
    failCleanup = false; await click('clean'); await panel.locator('[data-cleanup]').filter({ hasText: 'Çöpte doğrulandı' }).waitFor();
    await panel.locator('[data-query]').fill('kelime'); await click('search');
    await panel.locator('[data-results] button').first().waitFor();
    assert.equal(await panel.locator('[data-results] button').count(), 2);
    await panel.locator('[data-results] button').first().click();
    await page.waitForFunction(() => window.wentTo === 7);
    assert.equal(await page.evaluate(() => window.wentTo), 7, 'physical PDF page 1 maps to reader index 7');
    await panel.locator('summary').click();
    version = 'v2'; await click('search'); await status.filter({ hasText: 'sürümü değişti' }).waitFor();
    assert.equal(await panel.locator('[data-results] button').count(), 0);
    assert.equal(writes.filter(w => w.method === 'POST').length, 1);
    // A late export after logout/account change must not populate results or use the new credential for cleanup.
    await page.evaluate(() => { window.fixture.version = 'v2'; for (const p of window.fixture.pages) p.page.modifiedTime = 'v2'; });
    await panel.locator('[data-pages]').fill('1'); await click('prepare');
    await panel.locator('[data-count]').filter({ hasText: 'Google’a gönderilecek: 1' }).waitFor();
    holdExport = true; failCleanup = true; await click('start'); await exportStarted;
    await page.evaluate(async () => { const auth = await import('/src/drive/auth.ts'); auth.signOut(); window.testToken = 'fake-account-two'; await auth.signIn({ chooseAccount: true }); });
    releaseExport(); await panel.locator('[data-cleanup]').filter({ hasText: 'TEMİZLENEMEDİ' }).waitFor();
    await panel.locator('[data-clean]:enabled').waitFor();
    assert.equal(await panel.locator('[data-results] button').count(), 0);
    assert.equal(writes.at(-1).method, 'PATCH'); assert.equal(writes.at(-1).auth, 'Bearer fake-account-one');
    const beforeCleanup = writes.length; await click('clean'); await status.filter({ hasText: 'yeni hesapla temizlik yapılmadı' }).waitFor();
    assert.equal(writes.length, beforeCleanup, 'new account must not clean the old operation');
    assert.equal(await panel.locator('[data-start]').isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log(`${device}: preflight/skip/OCR/cleanup-failure/retry/page-map/version/late-export/logout/account-change passed; POST=2, export=2`);
    await context.close();
  }
} finally { await browser.close(); }
