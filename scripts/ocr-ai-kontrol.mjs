// 6.4b-AI page check with fake GIS and a fake /api/oku: no real account, no Anthropic request,
// invented sample lines only (no real note text). Usage: node scripts/ocr-ai-kontrol.mjs [origin] [outDir]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright-core';

const origin = process.argv[2] ?? 'http://localhost:5175';
// default: git-ignored ornek-cikti/; pass the iCloud 'Claude outputs' folder as the 2nd argument
const out = process.argv[3] ?? 'ornek-cikti/ocr-ai-6.4b';
mkdirSync(out, { recursive: true });

// synthetic 2600×1800 page so the 2000 px downscale and the rotation are visible
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2600" height="1800"><rect width="100%" height="100%" fill="#fbfaf4"/>
  ${Array.from({ length: 30 }, (_, i) => `<line x1="0" x2="2600" y1="${60 * i}" y2="${60 * i}" stroke="#cfe0ee" stroke-width="2"/>`).join('')}
  <text x="120" y="260" font-size="110" fill="#1f4fbf" font-family="Segoe Script, cursive">Örnek sayfa (uydurma)</text>
  <text x="200" y="520" font-size="96" fill="#1b1b1b" font-family="Segoe Script, cursive">a · b = |a| |b| cos θ</text></svg>`;
const ornek = await sharp(Buffer.from(svg)).png().toBuffer();

const sahteSonuc = {
  'claude-haiku-5-5': {
    satirlar: [
      { metin: 'Örnek sayfa (uydurma)', renk: 'mavi', girinti: 0, tur: 'yazi', ustuCizili: false },
      { metin: 'Skalarprodukt [?] tanımı', renk: 'siyah', girinti: 1, tur: 'yazi', ustuCizili: false },
      { metin: '\\vec{a} \\cdot \\vec{b} = \\lVert\\vec{a}\\rVert \\, \\lVert\\vec{b}\\rVert \\cos\\theta', renk: 'siyah', girinti: 1, tur: 'formul', ustuCizili: false },
      { metin: 'yanlış satır', renk: 'kirmizi', girinti: 2, tur: 'yazi', ustuCizili: true }
    ],
    hamMetin: 'Örnek sayfa (uydurma)\nSkalarprodukt [?] tanımı\n…', sureMs: 3100, kullanim: { input_tokens: 1580, output_tokens: 420 }
  },
  'claude-sonnet-5-5': {
    satirlar: [
      { metin: 'Örnek sayfa (uydurma)', renk: 'mavi', girinti: 0, tur: 'yazi', ustuCizili: false },
      { metin: 'Skalarprodukt ve tanımı', renk: 'siyah', girinti: 1, tur: 'yazi', ustuCizili: false },
      { metin: '\\vec{a} \\cdot \\vec{b} = |\\vec{a}| \\, |\\vec{b}| \\cos\\theta', renk: 'siyah', girinti: 1, tur: 'formul', ustuCizili: false },
      { metin: 'iki vektör ve aradaki açı θ', renk: 'kursun', girinti: 1, tur: 'cizim', ustuCizili: false }
    ],
    hamMetin: 'Örnek sayfa (uydurma)\nSkalarprodukt ve tanımı\n…', sureMs: 7400, kullanim: { input_tokens: 1580, output_tokens: 1250 }
  }
};

const fakeGis = `window.google = { accounts: { oauth2: {
  initTokenClient: o => ({ requestAccessToken: c => { (window.__istemler ??= []).push(c.prompt); o.callback({ access_token: 'sahte-token', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file' }); } }),
  hasGrantedAllScopes: () => false, revoke: () => {} } } };`;

const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [cihaz, viewport] of [['laptop', { width: 1365, height: 900 }], ['ipad', { width: 820, height: 1180 }]]) {
    const context = await browser.newContext({ viewport, hasTouch: cihaz === 'ipad' });
    const istekler = []; let hataModu = false;
    await context.route('https://accounts.google.com/**', r => r.fulfill({ contentType: 'text/javascript', body: fakeGis }));
    const driveIstekleri = [];
    await context.route('**/www.googleapis.com/**', r => {
      const u = new URL(r.request().url());
      driveIstekleri.push(`${r.request().method()} ${u.pathname}?${u.searchParams.get('fields')}`);
      if (u.pathname === '/drive/v3/about') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ user: { displayName: 'Örnek', emailAddress: 'ornek.hesap@example.com' } }) });
      return r.abort();
    });
    await context.route(origin + '/api/oku', r => {
      const body = r.request().postDataJSON();
      istekler.push({ model: body.model, auth: r.request().headers().authorization, bayt: body.gorsel.length });
      if (hataModu) return r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ hata: 'Bu deneme sadece sahip hesabıyla kullanılabilir.' }) });
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...sahteSonuc[body.model], model: body.model }) });
    });
    const page = await context.newPage(); const hatalar = [];
    page.on('pageerror', e => hatalar.push(e.message));
    await page.goto(origin + '/ocr-ai.html');
    await page.locator('#okuIkisi').waitFor();
    assert.equal(await page.locator('#okuIkisi').isDisabled(), true, 'görsel yokken Oku kapalı');
    if (cihaz === 'laptop') await page.screenshot({ path: join(out, 'laptop-1-bos.png'), fullPage: true });

    await page.locator('#giris').click();
    await page.locator('#girisDurum', { hasText: 'Girişli: ornek.hesap@example.com' }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.__istemler), ['select_account'], 'hesap seçme ekranı istendi');
    assert.deepEqual(driveIstekleri, ['GET /drive/v3/about?user(displayName,emailAddress)'], 'Drive’a sadece about (GET)');
    await page.locator('#dosya').setInputFiles({ name: 'ornek.png', mimeType: 'image/png', buffer: ornek });
    await page.locator('#gorselBilgi', { hasText: '2000×1385' }).waitFor();
    await page.locator('[data-donus="90"]').click();
    await page.locator('#gorselBilgi', { hasText: '1385×2000' }).waitFor();
    await page.locator('[data-donus="0"]').click();
    await page.locator('#gorselBilgi', { hasText: '2000×1385' }).waitFor();
    await page.locator('#hedef').fill('Örnek sayfa uydurma Skalarprodukt ve tanımı');

    await page.locator('#okuIkisi').click();
    await page.locator('#durum', { hasText: 'Bitti.' }).waitFor();
    assert.deepEqual(istekler.map(i => i.model), ['claude-haiku-5-5', 'claude-sonnet-5-5'], 'önce Haiku, sonra Sonnet');
    assert.ok(istekler.every(i => i.auth === 'Bearer sahte-token'), 'Google token Authorization başlığında');
    assert.equal(await page.locator('[data-kart="claude-haiku-5-5"] [data-puan]').textContent().then(t => t.startsWith('5/6')), true, 'Haiku hedef puanı 5/6');
    assert.equal(await page.locator('[data-kart="claude-sonnet-5-5"] [data-puan]').textContent().then(t => t.startsWith('6/6')), true, 'Sonnet hedef puanı 6/6');
    assert.match(await page.locator('[data-kart="claude-haiku-5-5"]').textContent(), /tahmini; kesin tutar Claude Console > Usage/);
    assert.equal(await page.locator('.kart mark').count(), 1, '[?] vurgulu');
    assert.equal(await page.locator('.ustu-cizili').count(), 1);
    await page.screenshot({ path: join(out, `${cihaz}-2-sonuc.png`), fullPage: true });

    hataModu = true;
    await page.locator('[data-model="claude-haiku-5-5"]').click();
    await page.locator('.kart .hata', { hasText: 'sadece sahip' }).waitFor();
    if (cihaz === 'laptop') await page.screenshot({ path: join(out, 'laptop-3-hata.png'), fullPage: true });

    const kalici = await page.evaluate(() => ({ ls: Object.keys(localStorage), ss: Object.keys(sessionStorage) }));
    assert.ok(!JSON.stringify(kalici).includes('Skalarprodukt') && kalici.ss.length === 0, 'metin kalıcı depoya yazılmadı');
    assert.equal(driveIstekleri.length, 1, 'about dışında Drive isteği yok');
    assert.ok(!JSON.stringify(kalici).includes('ornek.hesap'), 'e-posta kalıcı depoya yazılmadı');
    const yatay = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(yatay <= 0, `yatay kaydırma yok (${yatay})`);
    assert.deepEqual(hatalar, []);
    console.log(`${cihaz}: geçti (${istekler.length} sahte api isteği)`);
    await context.close();
  }
} finally { await browser.close(); }
