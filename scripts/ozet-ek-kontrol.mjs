// Task 6.EK-2: the summary addition band and the read-only addition, without signing in and without Drive.
// Usage: node scripts/ozet-ek-kontrol.mjs [output folder]   (Turkish and English, 390 × 844, 820 × 1180, 1280 × 800)
// A Vite dev server on its own port with the sample library (?demo). The topic "Değişkenler ve veri tipleri" gets test
// PDFs made here (page.route; not in the repo).
// A. Band (orijinal.pdf + ozet.pdf): window.defterEkSahte (dev only, src/okuma/ekSahte.ts) gives the reader made-up
//    additions and marks: goster, Sonra (the next addition comes), Ekle → "Ekleniyor… %" → bitti (the next addition
//    comes), guncellendi, yazilamaz (grey + reason), an error ("Tekrar dene"), "already going"; another tab → no band.
// B. K3 (orijinal.pdf + ozet-ek.pdf, no summary): the Özet tab shows the addition, the pen button is grey with its
//    reason. The Orijinal tab gets a writable copy in memory (window.defterBosSayfaSahte), the pen draws a stroke there,
//    then the Özet tab opens with the pen on: the pen goes off, the stroke is written to Orijinal (the fake Drive's
//    PDF gets it) and never to the addition; the page popover is grey with "Ek dosya salt okunur".
// No request goes to Google or Drive. Exit code 1 if anything fails.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4191;
const OUT = process.argv.slice(2).find(a => !a.startsWith('--')) ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\ek-6.EK2';
const KONU = 'Unite-01-Temeller/Konu-01-Degiskenler';
const EN_JSON = JSON.parse(readFileSync(join(ROOT, 'public', 'ornek', 'en.json'), 'utf8'));
const TOPIC = { tr: 'Değişkenler ve veri tipleri', en: EN_JSON.kitaplar['programlamaya-giris'].uniteler[0].konular[0] };
const ARA = { tr: 'programlamaya', en: 'introduction to programming' };
// the texts checked, as the dictionaries have them (src/dil/tr.ts, en.ts)
const METIN = {
  tr: { yeni: 'Yeni ek var: ', guncel: 'Güncellenmiş ek: ', salt: 'Ek dosya salt okunur', suruyor: 'Bu dosya şu an ekleniyor', tekrar: 'Tekrar dene', yuzde: 'Ekleniyor… %', sifreli: 'şifreli' },
  en: { yeni: 'New add-on: ', guncel: 'Updated add-on: ', salt: 'Add-on file is read-only', suruyor: 'This file is being added right now', tekrar: 'Try again', yuzde: 'Adding… ', sifreli: 'encrypted' },
};
const SIZES = [[390, 844], [820, 1180], [1280, 800]];
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function testPdf(etiket, n) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= n; i++) {
    const p = doc.addPage([595.28, 841.89]);
    p.drawRectangle({ x: 1, y: 1, width: 593.28, height: 839.89, borderColor: rgb(0.2, 0.3, 0.6), borderWidth: 2 });
    p.drawText(`${etiket} ${i}`, { x: 150, y: 420, size: 40, font, color: rgb(0.1, 0.2, 0.5) });
  }
  return Buffer.from(await doc.save());
}

async function startDev() {
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/`)).ok) return child; } catch { /* not up yet */ }
    await wait(200);
  }
  child.kill();
  throw new Error(`vite ${PORT} portunda başlamadı.`);
}

const PDF = { orj: await testPdf('Orijinal', 2), ozet: await testPdf('Ozet', 2), ek: await testPdf('Ek', 2) };
mkdirSync(OUT, { recursive: true });
const dev = await startDev();
const browser = await chromium.launch({ channel: 'chrome' });
const rows = [];
let bad = 0;
const kontrol = (ad, adim, kosul, not = '') => { rows.push([ad, adim, !!kosul, not]); if (!kosul) bad++; };

// A new browser page with the reader open on the topic (PDF mode). files: the topic folder's names → test PDF
async function okuyucuAc(w, h, dil, ad, files) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 1000, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => { bad++; console.error(`${ad} sayfa hatası:`, e.message); });
  page.on('dialog', d => void d.accept());
  await page.route('**/ornek/index.json', async route => {
    const json = await (await route.fetch()).json();
    json.klasorler['programlamaya-giris'][KONU] = Object.fromEntries(Object.entries(files).map(([n, k]) => [n, `demo/__ek-${k}.pdf`]));
    await route.fulfill({ json });
  });
  await page.route('**/ornek/kitaplar/programlamaya-giris/kitap.json', async route => {
    const json = await (await route.fetch()).json();
    await route.fulfill({ json: { ...json, kurdele: null } });
  });
  await page.route('**/demo/__ek-*.pdf', route => route.fulfill({ contentType: 'application/pdf', body: PDF[route.request().url().match(/__ek-(\w+)\.pdf/)[1]] }));
  await page.goto(`http://localhost:${PORT}/?demo&lang=${dil}`);
  await page.waitForFunction(() => document.querySelector('#loading')?.hidden, null, { timeout: 30_000 });
  await wait(1200);
  await page.evaluate(() => { try { localStorage.setItem('defter.okumaModu', 'pdf'); } catch { /* */ } });
  await page.keyboard.press('/');
  await page.locator('#aramaPaneli .ap-kutu').fill(ARA[dil]);
  await page.waitForFunction(() => document.querySelectorAll('#aramaPaneli .ap-satir').length > 0, null, { timeout: 10_000 });
  await page.locator('#aramaPaneli .ap-satir').first().click();
  await page.waitForSelector('#reader.show', { timeout: 15_000 });
  await wait(2500);
  if (!await page.locator('#reader [data-t]', { hasText: TOPIC[dil] }).first().isVisible() && await page.locator('#next').isEnabled()) { await page.click('#next'); await wait(700); }
  await page.locator('#reader [data-t]', { hasText: TOPIC[dil] }).first().click();
  await sayfaHazir(page);
  return { ctx, page };
}

const sayfaHazir = async (page) => { await page.waitForSelector('#okuyucu.show .o-page.ready', { timeout: 20_000 }); await wait(800); };
const serit = (page) => page.evaluate(() => {
  const s = document.querySelector('.fd-ek');
  if (!s || s.hidden || s.closest('[hidden]')) return null;
  const [ekle, sonra] = s.querySelectorAll('button');
  return {
    metin: s.querySelector('.fd-metin')?.textContent ?? '', neden: s.querySelector('.fd-neden')?.textContent ?? null, hata: s.querySelector('.fd-hata')?.textContent ?? null,
    ekle: ekle?.textContent ?? '', ekleKapali: !!ekle?.disabled, sonraKapali: !!sonra?.disabled,
    tasma: s.scrollWidth > s.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1,
  };
});
const seritBekle = (page, f, timeout = 10_000) => page.waitForFunction(f, null, { timeout, polling: 100 }).then(() => true, () => false);
const sahte = (page, o) => page.evaluate(o => window.defterEkSahte(o), o);
const sekme = (page, kind) => page.locator(`#oTabs [data-kind="${kind}"]`).click();

for (const dil of ['tr', 'en']) {
  const M = METIN[dil];
  for (const [w, h] of SIZES) {
    const ad = `${dil} ${w}×${h}`, dosya = `${dil}-${w}x${h}`;
    const shot = (page, n) => page.screenshot({ path: join(OUT, `${dosya}-${n}.png`) });

    // ---- A. the band ----
    if (!process.argv.includes('--b')) {
      const { ctx, page } = await okuyucuAc(w, h, dil, ad, { 'orijinal.pdf': 'orj', 'ozet.pdf': 'ozet' });
      kontrol(ad, 'örnek kitaplıkta sahte olmadan bant yok', await serit(page) === null);
      const md5 = (c) => c.repeat(32);
      await sahte(page, { ekler: [{ ad: 'ozet-ek.pdf', id: 's1' }, { ad: 'ozet-ek-2.pdf', id: 's2' }] });
      let ok = await seritBekle(page, () => !!document.querySelector('.fd-ek:not([hidden])'));
      let s = await serit(page);
      kontrol(ad, 'goster: "Yeni ek var: ozet-ek.pdf", Ekle açık', ok && s?.metin.startsWith(M.yeni + 'ozet-ek.pdf') && !s.ekleKapali, s?.metin);
      kontrol(ad, 'şerit taşmıyor', s && !s.tasma);
      await shot(page, '01-goster');
      await page.locator('.fd-ek .fd-ikinci').click();
      ok = await seritBekle(page, () => document.querySelector('.fd-ek .fd-metin')?.textContent.includes('ozet-ek-2.pdf'));
      kontrol(ad, 'Sonra → sıradaki ek (ozet-ek-2.pdf)', ok, (await serit(page))?.metin);
      await shot(page, '02-sonra-siradaki');

      await sahte(page, { ekler: [{ ad: 'ozet-ek.pdf', id: 'e1' }, { ad: 'ozet-ek-2.pdf', id: 'e2' }], sure: 3200 });
      await seritBekle(page, () => document.querySelector('.fd-ek .fd-metin')?.textContent.includes('ozet-ek.pdf'));
      await page.locator('.fd-ek .fd-ana').click();
      ok = await seritBekle(page, (t) => document.querySelector('.fd-ek .fd-ana')?.textContent.includes('%'));
      s = await serit(page);
      kontrol(ad, 'ekleniyor: "Ekleniyor… %", iki düğme kapalı', ok && s?.ekle.startsWith(M.yuzde.trim().slice(0, 6)) && s.ekleKapali && s.sonraKapali, s?.ekle);
      await shot(page, '03-ekleniyor');
      ok = await seritBekle(page, () => document.querySelector('.fd-ek .fd-metin')?.textContent.includes('ozet-ek-2.pdf') && !document.querySelector('.fd-ek .fd-ana')?.disabled, 15_000);
      const durum = await page.evaluate(() => window.defterEkSahte());
      kontrol(ad, 'bitti: işaret eklendi, sıradaki ek çıktı', ok && durum.eklenen.length === 1 && durum.eklenen[0].startsWith('ozet-ek-e1-'), JSON.stringify(durum.eklenen));
      await shot(page, '04-bitti-siradaki');

      await sahte(page, { ekler: [{ ad: 'ozet-ek.pdf', id: 'g1', md5: md5('b') }], isaretler: [`ozet-ek-g1-${md5('a')}`] });
      ok = await seritBekle(page, (p) => document.querySelector('.fd-ek .fd-metin')?.textContent.includes('ozet-ek.pdf') && !document.querySelector('.fd-ek .fd-metin')?.textContent.includes('2.pdf'));
      s = await serit(page);
      kontrol(ad, 'guncellendi: "Güncellenmiş ek: …"', ok && s?.metin.startsWith(M.guncel + 'ozet-ek.pdf'), s?.metin);
      await shot(page, '05-guncellendi');

      await sahte(page, { ekler: [{ ad: 'ozet-ek.pdf', id: 'y1' }], isaretler: 'yazilamaz' });
      ok = await seritBekle(page, () => !!document.querySelector('.fd-ek .fd-neden'));
      s = await serit(page);
      kontrol(ad, 'yazilamaz: Ekle gri, neden yazılı', ok && s?.ekleKapali && s.neden?.includes(M.sifreli), s?.neden);
      await shot(page, '06-yazilamaz');

      await sahte(page, { ekler: [{ ad: 'ozet-ek.pdf', id: 'h1' }], sonuc: 'hata', sure: 400 });
      await seritBekle(page, () => !document.querySelector('.fd-ek .fd-neden') && !document.querySelector('.fd-ek .fd-ana')?.disabled);
      await page.locator('.fd-ek .fd-ana').click();
      ok = await seritBekle(page, () => !!document.querySelector('.fd-ek .fd-hata'));
      s = await serit(page);
      kontrol(ad, 'hata: hata metni + "Tekrar dene"', ok && s?.ekle === M.tekrar && !s.ekleKapali, `${s?.hata} · ${s?.ekle}`);
      await shot(page, '07-hata');

      await sahte(page, { ekler: [{ ad: 'ozet-ek.pdf', id: 'r1' }], sonuc: 'suruyor' });
      await seritBekle(page, () => !document.querySelector('.fd-ek .fd-hata'));
      await page.locator('.fd-ek .fd-ana').click();
      ok = await seritBekle(page, () => !!document.querySelector('.fd-ek .fd-hata'));
      s = await serit(page);
      kontrol(ad, 'EklemeSuruyor: panelin metni', ok && s?.hata?.includes(M.suruyor), s?.hata);

      await sahte(page, { ekler: [{ ad: 'ozet-ek.pdf', id: 't1' }] });
      await seritBekle(page, () => !document.querySelector('.fd-ek .fd-hata') && !!document.querySelector('.fd-ek:not([hidden])'));
      await sekme(page, 'orijinal');
      await sayfaHazir(page);
      kontrol(ad, 'başka sekme (Orijinal): bant yok', await serit(page) === null);
      await sekme(page, 'ozet');
      await sayfaHazir(page);
      kontrol(ad, 'Özet sekmesine dönünce bant yine var', await seritBekle(page, () => !!document.querySelector('.fd-ek:not([hidden])')));
      await page.evaluate(() => window.defterEkSahte(false));
      await ctx.close();
    }

    // ---- B. K3: the addition is the summary, read only; the pen's strokes go to their own file ----
    {
      const { ctx, page } = await okuyucuAc(w, h, dil, ad, { 'orijinal.pdf': 'orj', 'ozet-ek.pdf': 'ek' });
      const kalem = () => page.evaluate(() => { const b = document.querySelector('#oPenBtn'); return { kapali: b.disabled, title: b.title, acik: b.getAttribute('aria-pressed') === 'true' }; });
      const sekmeSecili = await page.locator('#oTabs [data-kind="ozet"][aria-selected="true"]').count();
      let k = await kalem();
      kontrol(ad, 'K3: Özet sekmesi eki gösteriyor, bant yok', sekmeSecili === 1 && await serit(page) === null);
      kontrol(ad, 'K3: kalem düğmesi gri, neden "Ek dosya salt okunur"', k.kapali && k.title === M.salt, k.title);
      await shot(page, '08-k3-kalem-gri');

      await sekme(page, 'orijinal');
      await sayfaHazir(page);
      await page.evaluate(() => window.defterBosSayfaSahte({}));
      await sayfaHazir(page);
      k = await kalem();
      kontrol(ad, 'Orijinal: kalem açılabilir', !k.kapali, k.title);
      await page.locator('#oPenBtn').click();
      await wait(1500);
      await page.locator('#oTools [data-arac="kalem"]').click().catch(() => {});
      const kutu = await page.evaluate(() => {
        // book or PDF mode: the visible page with the most room on screen
        let best = null;
        for (const b of document.querySelectorAll('#okuyucu .o-page.ready')) {
          const r = b.getBoundingClientRect();
          const x = Math.max(r.left, 0), y = Math.max(r.top, 0), w = Math.min(r.right, innerWidth) - x, h = Math.min(r.bottom, innerHeight) - y;
          if (w > 40 && h > 40 && (!best || w * h > best.w * best.h)) best = { x, y, w, h };
        }
        return best;
      });
      if (kutu) {
        const x0 = kutu.x + kutu.w * 0.25, y0 = kutu.y + kutu.h * 0.4;
        await page.mouse.move(x0, y0); await page.mouse.down();
        for (let i = 1; i <= 14; i++) { await page.mouse.move(x0 + i * kutu.w * 0.03, y0 + Math.sin(i / 2) * 12); await wait(16); }
        await page.mouse.up();
        await wait(800);
      }
      const once = await page.evaluate(() => window.defterBosSayfaSahte());
      kontrol(ad, 'Orijinal: çizgi çizildi, henüz yüklenmedi', !!kutu && once.surum === 1, `sürüm ${once.surum}`);
      await sekme(page, 'ozet');
      await sayfaHazir(page);
      k = await kalem();
      kontrol(ad, 'eke geçince kalem kapandı ve gri', !k.acik && k.kapali && k.title === M.salt, JSON.stringify(k));
      const yazildi = await page.waitForFunction(async () => (await window.defterBosSayfaSahte()).surum > 1, null, { timeout: 20_000, polling: 200 }).then(() => true, () => false);
      const sonra = await page.evaluate(async () => {
        const d = await window.defterBosSayfaSahte();
        const n = await import('/src/kalem/pdfNotlari.ts');
        const s = await n.readDefterStrokes(d.bytes);
        return { surum: d.surum, log: d.log, cizgi: [...s.values()].reduce((a, l) => a + l.length, 0) };
      });
      kontrol(ad, 'bekleyen çizgi Orijinal\'e yazıldı (eke değil)', yazildi && sonra.cizgi === 1 && sonra.log.every(x => x.startsWith('pdf t')), JSON.stringify(sonra));
      await page.locator('#oPenBtn').click({ force: true }).catch(() => {});
      await wait(400);
      kontrol(ad, 'ekte kalem düğmesine basınca açılmıyor', !(await kalem()).acik);
      await shot(page, '09-k3-kalem-kapandi');
      if (await page.locator('#oSayfaEkle').isVisible()) {
        await page.locator('#oSayfaEkle').click();
        await wait(1200);
        const balon = await page.evaluate(() => {
          const b = document.querySelector('.o-sekle-balon');
          const desen = [...(b?.querySelectorAll('[data-desen]') ?? [])];
          return { metin: b?.textContent ?? '', kapali: desen.length > 0 && desen.every(x => x.disabled), sil: [...(b?.querySelectorAll('[data-sil]') ?? [])].every(x => x.disabled) };
        });
        kontrol(ad, 'ekte sayfa balonu: desenler ve sil gri, neden yazılı', balon.kapali && balon.sil && balon.metin.includes(M.salt), balon.metin.slice(0, 120));
        await shot(page, '10-k3-balon-gri');
      } else kontrol(ad, 'ekte sayfa balonu düğmesi görünür (sahte Drive)', false);
      await ctx.close();
    }
  }
}

await browser.close();
dev.kill();
const sutun = (s, n) => String(s).padEnd(n).slice(0, n);
for (const [ad, adim, ok, not] of rows) console.log(`${ok ? 'OK  ' : 'HATA'} ${sutun(ad, 15)} ${sutun(adim, 62)} ${not ?? ''}`);
console.log(`\n${rows.filter(r => r[2]).length}/${rows.length} kontrol geçti; ekran görüntüleri: ${OUT}`);
process.exit(bad ? 1 : 0);
