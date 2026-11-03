// EK-3b: real reader refresh and selector, fake additions, 2 viewports × TR/EN; no Drive writes.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4192;
const OUT = process.argv[2] ?? join(ROOT, '..', 'defter-test-dosyalari', 'ek-3b');
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
for (const dil of ['tr', 'en']) for (const [w,h] of [[1180,820],[390,844]]) {
 const ad = `${dil}-${w}x${h}`;
 const {ctx,page} = await okuyucuAc(w,h,dil,ad,{'orijinal.pdf':'orj','ozet-ek-1.pdf':'ek'});
 await sekme(page,'ozet');
 await sayfaHazir(page);
 const addon = {ad:'ozet-ek-1-relationen.pdf',id:'ek3',md5:'0123456789abcdef0123456789abcdef'};
 const setup = async (extra={}) => {
   await sahte(page,{ekler:[addon],sure:100,...extra});
   await page.waitForTimeout(500);
 };
 const band = page.locator('.fd-ek');
 const file = (id,name) => ({id:`ornek:demo/__ek-ozet.pdf#${id}`,name,mimeType:'application/pdf',modifiedTime:'ornek'});
 const first=file('first','ozet.pdf'), second=file('second','ikinci-uzun-ozet-adi.pdf');
 // Regression: creation replaces index 0; the old addition's pages must be replaced too.
 await setup({ozetVarMi:false,yeniOzet:first});
 if((await serit(page)).metin.includes(dil==='tr'?'açık özet:':'open summary:')) throw Error(`${ad}: target shown without summaries`);
 const newPdf=page.waitForRequest(r=>r.url().includes('/demo/__ek-ozet.pdf'),{timeout:4000});
 await band.locator('button').first().click();
 await newPdf;
 await sayfaHazir(page);
 await page.waitForFunction(()=>document.querySelector('.fd-ek').hidden, null, {timeout:4000});
 await page.screenshot({path:join(OUT,`${ad}-yeni-ozet.png`)});
 await setup({ekler:[{...addon,id:'second-target'}],ozetler:[first,second]});
 await page.selectOption('#oFile','1');
 await sayfaHazir(page);
 await page.waitForFunction(()=>!document.querySelector('.fd-ek').hidden, null, {timeout:4000});
 const text=(await serit(page)).metin;
 if(!text.includes(second.name) || (await serit(page)).tasma) throw Error(`${ad}: target missing or overflow: ${text}`);
 await page.screenshot({path:join(OUT,`${ad}-ikinci-ozet.png`)});
 await band.locator('button').nth(1).click();
 await page.waitForFunction(()=>document.querySelector('.fd-ek').hidden);
 const state=await page.evaluate(()=>window.defterEkSahte());
 if(state.hedefId!==second.id) throw Error(`${ad}: wrong target ${state.hedefId}`);
 await setup({ekler:[{...addon,id:'in-first'}],isaretler:['ozet-ek-in-first-0123456789abcdef0123456789abcdef']});
 if(!await band.evaluate(e=>e.hidden)) throw Error(`${ad}: already added visible`);
 await setup({ekler:[{...addon,id:'later'}]});
 await band.locator('button').last().click();
 await page.selectOption('#oFile','0');
 await sayfaHazir(page);
 await page.selectOption('#oFile','1');
 await sayfaHazir(page);
 if(!await band.evaluate(e=>e.hidden)) throw Error(`${ad}: Later lost on summary switch`);
 console.log(`${ad}: creation / second summary / target / marks / overflow OK`);
 await ctx.close();
}
if(bad) throw Error(`${bad} page errors`);
} finally { await browser.close(); dev.kill(); }
