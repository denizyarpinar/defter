// Task 6.H1: the pen tool bar is one row of fixed height (sample library, ?demo, no sign-in) from the local build.
// Usage: npm run build && node scripts/kalem-cubugu-kontrol.mjs [output folder]
// For every width × mode (book / PDF) × tool (Kalem / Fosforlu / Silgi) × status (clean / unsaved / empty / error):
// the bar's height, its rows, "Kalemi kapat" on screen at the right edge, the page area's top edge.
// Also: pen on / off moves the page being read? (PDF: a page's y on screen; book: the spread's box.)
// Task 6.H1b: the left part must not scroll from 744 px up; at 820 px the colour / width popover is tried
// (opens under the bar, a choice closes it, a tap on the page only closes it, Esc closes it, the bar stays 58 px).
// Screenshots: 1180 px Kalem and Silgi, 820 px Kalem and the colour popover, 390 px.
// Exit code 1 if any height differs, anything moved or a check fails.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4181;
const URL = `http://localhost:${PORT}/?demo`;
const OUT = process.argv[2] ?? 'C:\\Users\\yarpi\\iCloudDrive\\uni_plan_claude_code\\Claude outputs\\kalem-6.H1';
const BOOKCASE = { x: 1040, y: 330 };   // room view at 1600 × 1000 (as in screenshots.mjs)
const PRG_BOOK = { x: 618, y: 350 };    // shelf view: "Programlamaya Giriş"
const TOPIC = 'Değişkenler ve veri tipleri';
const SIZES = [[390, 844], [744, 1133], [820, 1180], [1024, 768], [1180, 820], [1366, 1024]];
const TOOLS = ['kalem', 'fosforlu', 'silgi'];

const wait = (ms) => new Promise(r => setTimeout(r, ms));

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

// the bar now: height, rows (centre lines of the visible items), "Kalemi kapat" at the right edge, area top
function measure(page) {
  return page.evaluate(() => {
    const bar = document.querySelector('#oTools');
    // the items of both parts (task 6.H1b: the left one scrolls, the right one stays)
    const left = bar.querySelector('.o-kaydir');
    const kids = [...bar.querySelectorAll('.o-kaydir > *, .o-sag > *')].filter(e => getComputedStyle(e).display !== 'none');
    const mid = (e) => { const r = e.getBoundingClientRect(); return (r.top + r.bottom) / 2; };
    const close = bar.querySelector('.o-tkapat').getBoundingClientRect(), b = bar.getBoundingClientRect();
    // Kaydet on screen and not under something else (the row scrolled to its start, as when the pen opens)
    const save = bar.querySelector('.o-kaydet'), sr = save.getBoundingClientRect();
    const onTop = document.elementFromPoint(sr.left + sr.width / 2, sr.top + sr.height / 2);
    const area = [...document.querySelectorAll('#oScroll, #oKitap')].find(e => !e.hidden);
    return {
      h: Math.round(b.height * 10) / 10,
      rows: new Set(kids.map(e => Math.round(mid(e) / 12))).size,
      close: close.right <= innerWidth + 0.5 && close.left >= 0 && b.right - parseFloat(getComputedStyle(bar).paddingRight) - close.right < 2,
      scroll: left.scrollWidth > left.clientWidth + 1 || bar.scrollWidth > bar.clientWidth + 1,
      save: sr.left >= 0 && sr.right <= innerWidth + 0.5 && sr.width > 0 && !!onTop && save.contains(onTop),
      areaTop: Math.round(area.getBoundingClientRect().top * 10) / 10,
    };
  });
}

// the status slot's content, forced (a sample library always shows "Örnek"): empty / an error
function forceStatus(page, kind) {
  return page.evaluate((kind) => {
    const slot = document.querySelector('.o-durum-yuva');
    slot.innerHTML = kind === 'bos' ? ''
      : '<span class="o-tdurum hata" title="Kaydedilemedi: deneme"><span class="o-uzun">Kaydedilemedi</span><span class="o-kisa">Hata</span></span>';
  }, kind);
}

// what the reader shows: PDF → the y of the first page on screen; book → the spread's box
function anchor(page) {
  return page.evaluate(() => {
    const kitap = document.querySelector('#oKitap');
    if (!kitap.hidden) { const r = document.querySelector('#oSpread').getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`; }
    const s = document.querySelector('#oScroll').getBoundingClientRect();
    const p = [...document.querySelectorAll('.o-page')].find(e => e.getBoundingClientRect().bottom > s.top + 1);
    return p ? `${p.dataset.i ?? ''}@${Math.round(p.getBoundingClientRect().top)}` : '-';
  });
}

async function setTool(page, t) {
  await page.locator(`#oTools [data-arac="${t}"]`).click();
  await page.waitForTimeout(150);
}

// one stroke over the middle of the reading area (clean → unsaved)
async function draw(page) {
  const box = await page.evaluate(() => {
    const area = [...document.querySelectorAll('#oScroll, #oKitap')].find(e => !e.hidden).getBoundingClientRect();
    return { x: area.left + area.width * 0.35, y: area.top + area.height / 2 };
  });
  await page.mouse.move(box.x - 30, box.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x - 30 + i * 8, box.y + (i % 2) * 6);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

// Task 6.H1b: the colour / width popover at this width (pen on, Kalem chosen)
async function popoverTest(page, shotName) {
  const state = () => page.evaluate(() => ({
    open: !document.querySelector('.o-balon').hidden,
    h: Math.round(document.querySelector('#oTools').getBoundingClientRect().height * 10) / 10,
    color: document.querySelector('#oTools [data-pop="renk"]')?.style.getPropertyValue('--c'),
    undo: document.querySelector('#oTools [data-geri]').disabled,
    reader: !document.querySelector('#okuyucu').hidden,
  }));
  const before = await state();
  await page.locator('#oTools [data-pop="renk"]').click();
  await page.waitForTimeout(250);
  const opened = await state();
  const inBalloon = await page.locator('.o-balon [data-renk]').count();
  if (shotName) await shot(page, shotName);
  await page.locator('.o-balon [data-renk]').nth(2).click();
  await page.waitForTimeout(200);
  const chose = await state();
  // again; a tap (and drag) on the page only closes it, no stroke
  await page.locator('#oTools [data-pop="boy"]').click();
  await page.waitForTimeout(200);
  const opened2 = await state();
  await draw(page);
  const tapped = await state();
  // Esc closes the popover, not the reader
  await page.locator('#oTools [data-pop="renk"]').click();
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const esc = await state();
  // back to the colour it had
  await page.locator('#oTools [data-pop="renk"]').click();
  await page.locator(`.o-balon [data-renk="${before.color}"]`).click();
  await page.waitForTimeout(200);
  const ok = {
    'açılır': opened.open && opened.h === before.h && inBalloon >= 5,
    'seçince kapanır': !chose.open && chose.color !== before.color,
    'sayfaya dokunma sadece kapatır': opened2.open && !tapped.open && tapped.undo === opened2.undo,
    'Esc kapatır (okuyucu açık)': !esc.open && esc.reader,
    'çubuk 58 px': [before, opened, chose, tapped, esc].every(x => x.h === before.h),
  };
  return ok;
}

async function shot(page, name) {
  await page.mouse.move(0, 0);
  const file = join(OUT, name);
  await page.screenshot({ path: file });
  console.log(file);
}

mkdirSync(OUT, { recursive: true });
const server = await startPreview();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let bad = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => { bad++; console.error('Sayfa hatası:', e.message); });
  await page.goto(URL);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).display === 'none', null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.mouse.click(BOOKCASE.x, BOOKCASE.y);
  await page.waitForTimeout(2500);
  await page.mouse.click(PRG_BOOK.x, PRG_BOOK.y);
  await page.waitForSelector('#reader:not([hidden])', { timeout: 10_000 });
  await page.waitForTimeout(1500);
  await page.locator('[data-t]', { hasText: TOPIC }).first().click();
  await page.waitForSelector('#oFoto', { state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(2000);

  const heights = new Set();
  console.log('\nGenişlik | mod | araç | rozet | çubuk px | satır | Kalemi kapat sağda | Kaydet ekranda | yana kayar | alan üstü');
  const moves = [], pops = [];
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    for (const mode of ['kitap', 'pdf']) {
      await page.locator(`#oMode [data-m="${mode}"]`).click();
      await page.waitForTimeout(1200);
      if (mode === 'pdf') {   // somewhere in the middle of the list, not at its very top
        await page.evaluate(() => { const s = document.querySelector('#oScroll'); s.scrollTop = Math.min(900, s.scrollHeight / 3); });
        await page.waitForTimeout(500);
      }
      // pen on / off: does the page being read move?
      const a0 = await anchor(page);
      await page.locator('#oPenBtn').click();
      await page.waitForTimeout(700);
      const a1 = await anchor(page);
      const tops = new Set();
      if (w === 820) {
        await page.waitForTimeout(3800);   // the "Kalem açık" toast goes away first
        await setTool(page, 'kalem');
        const ok = await popoverTest(page, mode === 'pdf' ? 'kalem-820-renk.png' : null);
        for (const [k, v] of Object.entries(ok)) { if (!v) bad++; pops.push(`${w} | ${mode} | ${k} | ${v ? 'evet' : 'HAYIR'}`); }
      }
      for (const t of TOOLS) {
        await setTool(page, t);
        const rows = [];
        if (t !== 'silgi') {
          rows.push(['temiz', await measure(page)]);
          await draw(page);
          rows.push(['kaydedilmedi', await measure(page)]);
          await page.locator('#oTools [data-geri]').click();
          await page.waitForTimeout(200);
        } else rows.push(['örnek', await measure(page)]);
        await forceStatus(page, 'bos'); rows.push(['boş', await measure(page)]);
        await forceStatus(page, 'hata'); rows.push(['hata', await measure(page)]);
        if (w === 1180 && mode === 'pdf' && t !== 'fosforlu') { await setTool(page, t); await shot(page, `kalem-1180-${t}.png`); }
        if (w === 820 && mode === 'pdf' && t === 'kalem') { await setTool(page, t); await shot(page, 'kalem-820-kalem.png'); }
        if (w === 390 && mode === 'pdf' && t === 'kalem') { await setTool(page, t); await draw(page); await shot(page, 'kalem-390.png'); await page.locator('#oTools [data-geri]').click(); }
        await setTool(page, t);   // the real status again
        for (const [r, m] of rows) {
          heights.add(m.h); tops.add(m.areaTop);
          if (m.rows !== 1 || !m.close || !m.save || (w >= 744 && m.scroll)) bad++;
          console.log(`${w} | ${mode} | ${t} | ${r} | ${m.h} | ${m.rows} | ${m.close ? 'evet' : 'HAYIR'} | ${m.save ? 'evet' : 'HAYIR'} | ${m.scroll ? 'evet' : 'hayır'} | ${m.areaTop}`);
        }
      }
      await page.locator('#oPenBtn').click();
      await page.waitForTimeout(700);
      const a2 = await anchor(page);
      if (tops.size !== 1) bad++;
      if (a0 !== a1 || a1 !== a2) bad++;
      moves.push(`${w} | ${mode} | ${a0} | ${a1} | ${a2} | ${a0 === a1 && a1 === a2 ? 'kaymadı' : 'KAYDI'} | alan üstü ${[...tops].join('/')}`);
    }
  }
  console.log('\nKalem aç/kapa: genişlik | mod | kapalı | açık | tekrar kapalı | sonuç   (PDF: sayfa@y, kitap: x,y g×y)');
  for (const m of moves) console.log(m);
  console.log('\nRenk / kalınlık balonu: genişlik | mod | kontrol | sonuç');
  for (const p of pops) console.log(p);
  console.log(`\nÇubuk yükseklikleri: ${[...heights].join(', ')} px`);
  if (heights.size !== 1) bad++;
  await page.close();
} finally {
  await browser.close();
  server.kill();
}
console.log(bad ? `\n${bad} sorun var.` : '\nHepsi tamam.');
process.exit(bad ? 1 : 0);
