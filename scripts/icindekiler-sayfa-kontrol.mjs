// 6.K6c: real DOM measurements + screenshots, isolated sample data, no sign-in/Drive.
// node scripts/icindekiler-sayfa-kontrol.mjs [output folder]
// Long/short fixtures are labelled as control data; they are NOT the user's real books.
// Also compares short-page geometry against reader.ts from HEAD.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { transformWithOxc } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4189;
const URL = `http://localhost:${PORT}/?demo&kapsam=dar&sahip=0&kurulum=1&olcum=1&lang=tr`;
const OUT = process.argv[2] ?? join(process.env.USERPROFILE, 'iCloudDrive', 'uni_plan_claude_code', 'Claude outputs', 'kitap-6.K6c');
const wait = ms => new Promise(r => setTimeout(r, ms));
const sizes = [
  ['390', { width: 390, height: 844 }],
  ['820', { width: 820, height: 1180 }],
  ['1180', { width: 1180, height: 820 }],
  ['1920x632', { width: 1920, height: 632 }]
];
const baseline = (await transformWithOxc(
  execFileSync('git', ['show', 'HEAD:src/ui/reader.ts'], { cwd: ROOT, encoding: 'utf8' }),
  'reader.ts'
)).code.replace(/from ["'](\.[^"']+)["']/g, (_, path) =>   // a folder ('../dil', 6.5-2a) → its index.ts
  `from '${new globalThis.URL(path + (existsSync(join(ROOT, 'src', 'ui', path + '.ts')) ? '.ts' : '/index.ts'), 'http://localhost:' + PORT + '/src/ui/reader.ts').href}'`);

async function startDev() {
  const child = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore', windowsHide: true });
  let failed = false;
  child.on('exit', () => { failed = true; });
  for (let i = 0; i < 100; i++) {
    if (failed) throw new Error('Kontrol sunucusu başlatılamadı (4189 portu dolu olabilir).');
    try { if ((await fetch(URL)).ok) return child; } catch { /* starting */ }
    await wait(200);
  }
  child.kill();
  throw new Error('Kontrol sunucusu zamanında başlamadı.');
}

async function context(page, editable) {
  await page.evaluate(async editable => {
    const [ok, reader, bg] = await Promise.all([
      import('/src/okuma/Okuyucu.ts'), import('/src/ui/reader.ts'), import('/src/ui/icindekilerBaglami.ts')
    ]);
    const noWrite = async () => { throw new Error('Kontrolde Drive erişimi yok.'); };
    const drive = Object.fromEntries(['yeniIdler', 'oge', 'islemAra', 'olustur', 'kokCocuklari', 'klasorler',
      'jsonOku', 'degisimZamani', 'jsonYaz'].map(key => [key, noWrite]));
    const { baglam } = bg.icindekilerBaglamiKur({
      drive, kilitAcik: true, hasJson: b => { window.__desk = b; return b.hasJson; },
      secenek: () => ({ kilitAcik: true, kokKaynagi: 'defterKok', kokId: 'kok', yazabilir: () => true,
        surum: 2, kitapKlasorId: 'kb', kitapJsonId: 'kj' }),
      uniteKlasorleri: async b => b.uniteler.map(u => u.klasor ?? null),
      kitap: () => window.__desk, yenile: () => reader.refreshReader(), jsonOku: noWrite, girisYap() {}
    });
    if (editable) ok.setIcindekilerBaglami(baglam);
  }, editable);
}

async function settled(page) {
  await page.waitForFunction(() => document.fonts.status === 'loaded' &&
    !document.querySelector('#spread .leaf, #spread .single-turn, .toc-measure'));
  // Let ResizeObserver/requestAnimationFrame finish before measuring.
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(() => Promise.all(document.querySelector('#spread').getAnimations({ subtree: true })
    .map(a => a.finished.catch(() => {}))));
}

async function snapshot(page) {
  return page.evaluate(() => {
    const shown = element => getComputedStyle(element).visibility !== 'hidden' && !!element.getClientRects().length;
    const pages = [...document.querySelectorAll('#spread > .slot > .page')].map(p => {
      const rows = [...p.querySelectorAll('[data-t]')];
      const folio = p.querySelector('.folio');
      const legend = p.querySelector('.legend');
      const inside = p.querySelector('.in');
      const bottom = inside ? inside.getBoundingClientRect().bottom - parseFloat(getComputedStyle(inside).paddingBottom) : 0;
      const line = Math.min(bottom, folio?.getBoundingClientRect().top ?? Infinity,
        legend?.getBoundingClientRect().top ?? Infinity);
      return {
        folio: folio?.textContent ?? null,
        heading: p.querySelector('h2')?.textContent,
        units: [...p.querySelectorAll('h3')].map(h => h.textContent),
        rows: rows.map(r => `${r.dataset.u}:${r.dataset.t}`),
        overflow: rows.some(r => r.getBoundingClientRect().bottom > line + 0.75),
        orphan: [...p.querySelectorAll('h3')].some(h => !h.nextElementSibling?.querySelector('li')),
        edit: p.querySelectorAll('[data-duzenle]').length,
        resume: p.querySelectorAll('.resume').length,
        blank: p.classList.contains('blank')
      };
    });
    return { pages, counter: document.querySelector('#pno').textContent,
      arrows: ['prev', 'next'].map(id => shown(document.getElementById(id))),
      prevDisabled: document.querySelector('#prev').disabled, nextDisabled: document.querySelector('#next').disabled };
  });
}

async function geometry(page) {
  return page.evaluate(() => [...document.querySelectorAll('#spread > .slot > .toc :is(h2,h3,li,.resume,.tocedit,.legend,.folio)')]
    .map(e => { const r = e.getBoundingClientRect(); return {
      text: e.textContent.replace(/\s+/g, ' ').trim(), box: [r.x, r.y, r.width, r.height]
    }; }));
}

const report = [];
const dev = await startDev();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' });
  mkdirSync(OUT, { recursive: true });
  for (const [size, viewport] of sizes) {
    for (const variant of ['uzun', 'kisa', 'bos', 'ornek']) {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1,
        hasTouch: size !== '1920x632', isMobile: size !== '1920x632' });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      // There must be no Drive request, even if a test accidentally clicks a writing control.
      await page.route('https://www.googleapis.com/**', route => { errors.push('Unexpected Google request'); return route.abort(); });
      let expected = [];
      await page.route('**/ornek/kitaplar/programlamaya-giris/kitap.json', async route => {
        const json = await (await route.fetch()).json();
        if (variant === 'uzun') {
          json.baslik = 'Uzun liste · kontrol verisi';
          json.uniteler = ['Ünite A', 'Ünite B', 'Ünite C'].map((baslik, u) => ({
            baslik,
            konular: Array.from({ length: u === 1 ? 14 : 8 }, (_, t) => ({
              baslik: `${baslik} · Konu ${t + 1}${t % 3 === 1 ? ': Uzun başlık ve birden fazla satırın ölçülmesi' : ''}`,
              klasor: `Unite-${u}/Konu-${t}`, durum: ['okunmadi', 'okunuyor', 'calisildi'][t % 3]
            }))
          }));
          json.kurdele = { konu: 'Unite-1/Konu-2', materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 3 };
        }
        if (variant === 'kisa') json.baslik = 'Kısa liste · kontrol verisi';
        if (variant === 'bos') { json.baslik = 'Konusuz · kontrol verisi'; json.uniteler = []; json.kurdele = null; }
        expected = json.uniteler.flatMap((u, ui) => u.konular.map((_, ti) => `${ui}:${ti}`));
        await route.fulfill({ json });
      });
      await page.goto(URL);
      await page.waitForFunction(() => document.querySelector('#loading')?.hidden, null, { timeout: 45000 });
      await context(page, variant !== 'ornek');
      await page.keyboard.press('/');
      await page.locator('#aramaPaneli .ap-kutu').fill(variant === 'ornek' ? 'Programlamaya Giriş' :
        variant === 'uzun' ? 'Uzun liste' : variant === 'kisa' ? 'Kısa liste' : 'Konusuz');
      await page.locator('#aramaPaneli .ap-satir').first().click();
      await page.waitForSelector('#reader.show', { timeout: 15000 });
      await settled(page);

      const rows = [], folios = [];
      let spreads = 0, sawContinued = false;
      while (true) {
        await settled(page);
        const state = await snapshot(page);
        for (const p of state.pages) {
          assert.equal(p.overflow, false, `${size}/${variant}/${p.folio}: row overlaps footer`);
          assert.equal(p.orphan, false, `${size}/${variant}/${p.folio}: orphan heading`);
          rows.push(...p.rows);
          if (p.folio) folios.push(Number(p.folio));
          if (Number(p.folio) === 2) {
            assert.equal(p.edit, variant === 'ornek' ? 0 : 1);
            assert.equal(p.resume, variant === 'bos' ? 0 : 1);
          }
          if (Number(p.folio) > 2) {
            assert.equal(p.heading, 'İçindekiler (devam)');
            assert.equal(p.edit, 0);
            assert.equal(p.resume, 0);
            sawContinued ||= p.units.some(h => h.endsWith('(devam)'));
          }
        }
        assert.deepEqual(state.arrows, [true, true].map(() => viewport.width < 760 || variant === 'uzun'));
        if (variant === 'uzun' || variant === 'kisa' || spreads === 0) {
          await page.screenshot({ path: join(OUT, `${size}-${variant}-${spreads + 1}.png`),
            style: '#olcum { visibility: hidden !important }' });
        }
        report.push({ size, variant, ...state });
        if (state.nextDisabled) break;
        assert.ok(++spreads < 50, 'pagination must terminate');
        if (spreads % 2) await page.locator('#next').click();
        else await page.keyboard.press('ArrowRight');
      }
      assert.deepEqual(rows, expected, `${size}/${variant}: topic coverage/order`);
      assert.deepEqual(folios, Array.from({ length: folios.length }, (_, i) => i + 1));
      assert.equal(folios.length > 2, variant === 'uzun');
      if (variant === 'uzun') {
        assert.ok(sawContinued);
        // A topic on a continuation page opens the existing full-screen reader at that topic.
        const button = page.locator('#spread > .slot [data-t]').first();
        const label = await button.locator('.tt').textContent();
        await button.locator('.tt').click();
        await page.waitForSelector('#okuyucu.show');
        await page.waitForFunction(label => document.querySelector('#oChap').textContent.includes(label), label);
        await page.locator('#oClose').click();
        await page.waitForFunction(() => !document.querySelector('#okuyucu').classList.contains('show'));
        await settled(page);
        const before = await snapshot(page);
        assert.ok(before.pages.some(p => p.rows.includes(rows.at(-1))));
        // Rotation and changing one/two-page mode retain the visible topic.
        const anchor = before.pages.flatMap(p => p.rows)[0];
        await page.setViewportSize(viewport.width < 760 ? { width: 1180, height: 820 } : { width: 390, height: 844 });
        await settled(page);
        assert.ok((await snapshot(page)).pages.some(p => p.rows.includes(anchor)), 'resize keeps visible topic');
        await page.setViewportSize(viewport);
        await settled(page);
        // Resize during a turn must not leave a stale leaf or a locked navigation button.
        await page.keyboard.press('ArrowLeft');
        await page.setViewportSize({ ...viewport, height: viewport.height - 20 });
        await settled(page);
        await page.setViewportSize(viewport);
        await settled(page);
        for (let i = 0; i < 50 && !(await snapshot(page)).prevDisabled; i++) {
          if (i % 2) await page.locator('#prev').click();
          else await page.keyboard.press('ArrowLeft');
          await settled(page);
        }
        assert.equal((await snapshot(page)).prevDisabled, true);
      }
      if (variant === 'kisa') {
        const current = await geometry(page);
        const b = Buffer.from(baseline).toString('base64');
        await page.evaluate(async code => {
          const old = await import('data:text/javascript;base64,' + code);
          window.__oldReader = old;
          old.openReader(window.__desk, { shelfName: 'Raf 1', daysSinceOpened: null, owner: null });
        }, b);
        await wait(1600);
        // The old narrow reader needs its own click callback; it was deliberately not initialised twice.
        if (viewport.width < 760) {
          // Initialise the old controls only in this disposable page, then move to page two.
          await page.evaluate(() => window.__oldReader.initReader(() => {}, () => {}, () => {}));
          await page.locator('#next').click();
          await wait(600);
        }
        const old = await geometry(page);
        assert.equal(current.length, old.length, 'short page element count matches HEAD');
        current.forEach((e, i) => {
          assert.equal(e.text, old[i].text);
          e.box.forEach((v, j) => assert.ok(Math.abs(v - old[i].box[j]) < 0.8,
            `${size}: short page geometry changed at ${e.text}, ${v} vs ${old[i].box[j]}`));
        });
        await page.screenshot({ path: join(OUT, `${size}-kisa-once.png`),
          style: '#olcum { visibility: hidden !important }' });
      }
      assert.deepEqual(errors, [], `${size}/${variant}: browser errors`);
      await ctx.close();
      console.log(`${size} ${variant}: ${folios.length} sayfa, ${rows.length} konu, taşma yok`);
    }
  }
  writeFileSync(join(OUT, 'olcum.json'), JSON.stringify(report, null, 2));
  console.log(`Kontrol görüntüleri: ${OUT}`);
} finally {
  await browser?.close();
  dev.kill();
}
