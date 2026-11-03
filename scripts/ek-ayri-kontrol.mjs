// EK-3: real reader, fake additions, 3 viewports × TR/EN; no Drive writes.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4191;
const OUT = process.argv[2] ?? join(ROOT, '..', 'defter-test-dosyalari', 'ek-ayri');
const KONU = 'Unite-01-Temeller/Konu-01-Degiskenler';
const EN_JSON = JSON.parse(readFileSync(join(ROOT, 'public', 'ornek', 'en.json'), 'utf8'));
const TOPIC = { tr: 'Değişkenler ve veri tipleri', en: EN_JSON.kitaplar['programlamaya-giris'].uniteler[0].konular[0] };
const ARA = { tr: 'programlamaya', en: 'introduction to programming' };
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
let bad = 0;

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
  await page.goto(`http://localhost:${PORT}/?demo&ekSahte=1&lang=${dil}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#loading')?.hidden, null, { timeout: 30_000 });
  await wait(1200);
  await page.evaluate(() => { try { localStorage.setItem('defter.okumaModu', 'pdf'); } catch { /* */ } });
  await page.locator('#araBtn').click();
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
const sahte = (page, o) => page.evaluate(o => window.defterEkSahte(o), o);
const sekme = (page, kind) => page.locator(`#oTabs [data-kind="${kind}"]`).click();


try {
for (const dil of ['tr', 'en']) for (const [w,h] of [[390,844],[1180,820],[1920,1080]]) {
 const ad = `${dil}-${w}x${h}`;
 const {ctx,page} = await okuyucuAc(w,h,dil,ad,{'orijinal.pdf':'orj','ozet.pdf':'ozet'});
 await sekme(page,'ozet');
 await sayfaHazir(page);
 const addon = {ad:'ozet-ek-1-relationen.pdf',id:'ek3',md5:'0123456789abcdef0123456789abcdef'};
 const setup = async (extra={}) => {
   await sahte(page,{ekler:[addon],sure:100,...extra});
   await page.waitForTimeout(500);
 };
 await setup();
 const band = page.locator('.fd-ek');
 if(await band.locator('button').count() !== 3) { await page.screenshot({path:join(OUT,`${ad}-debug.png`)}); console.log(await page.locator('#oTabs').innerText()); throw Error(`${ad}: expected 3 buttons`); }
 if((await serit(page)).tasma) throw Error(`${ad}: overflow`);
 await page.screenshot({path:join(OUT,`${ad}-ozet-var.png`)});
 await band.locator('button').first().click();
 await page.waitForFunction(()=>document.querySelector('.fd-ek').hidden);
 await setup({ozetVarMi:false,ekler:[{...addon,id:'no-summary'}]});
 if(await band.locator('button').count() !== 2) throw Error(`${ad}: expected Add + Later`);
 if((await serit(page)).tasma) throw Error(`${ad}: overflow without summary`);
 await page.screenshot({path:join(OUT,`${ad}-ozet-yok.png`)});
 await band.locator('button').first().click();
 await page.waitForFunction(()=>document.querySelector('.fd-ek').hidden);
 await setup({ekler:[{...addon,id:'already'}],dosyalar:[{id:'saved',name:'relationen.pdf',mimeType:'application/pdf',modifiedTime:'',appProperties:{defterIslem:'ozet-ek-already-0123456789abcdef0123456789abcdef'}}]});
 if(!await band.evaluate(e=>e.hidden)) throw Error(`${ad}: already added visible`);
 await page.screenshot({path:join(OUT,`${ad}-eklenmis.png`)});
 await setup({ekler:[{...addon,id:'retry'}],sonuc:'hata'});
 await band.locator('button').first().click();
 await page.waitForSelector('.fd-ek .fd-hata');
 await page.screenshot({path:join(OUT,`${ad}-hata.png`)});
 console.log(`${ad}: summary / no summary / properties / retry / overflow OK`);
 await ctx.close();
}
if(bad) throw Error(`${bad} page errors`);
} finally { await browser.close(); dev.kill(); }
