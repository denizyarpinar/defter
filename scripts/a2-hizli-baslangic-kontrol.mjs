// Real main.ts + existing Drive writers against an isolated, in-memory GIS/Drive.
// No real account, token or Google network traffic. Chromium emulation is not physical Safari.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2];
assert.ok(out, 'Output directory required');
mkdirSync(out, { recursive: true });
const origin = 'http://localhost:4192';
const dev = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', '4192', '--strictPort'], {
  cwd: root, stdio: 'ignore', env: { ...process.env, VITE_GOOGLE_CLIENT_ID: 'a2-fixture', VITE_SAHIP_EPOSTA: 'fixture@example.invalid' },
});
const pause = ms => new Promise(r => setTimeout(r, ms));
const folder = 'application/vnd.google-apps.folder';
const pdf = readFileSync(join(root, 'public/demo/demo-dikey.pdf'));
const cases = [], failures = [], screens = [];
let browser;
const verify = (name, actual, expected = true) => {
  cases.push({ name, actual, expected });
  try { assert.deepEqual(actual, expected); } catch { failures.push({ name, actual, expected }); }
};
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    await pause(200);
  }
  browser = await chromium.launch({ channel: 'chrome' });
  for (const lang of ['tr', 'en']) for (const [width, height] of [[390,844],[820,1180],[1180,820],[1280,800]]) {
    const label = `${lang}-${width}x${height}`;
    if (process.env.A2_CASE && !process.env.A2_CASE.split(',').includes(label)) continue;
    console.log(label);
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: width !== 1280 });
    ctx.setDefaultTimeout(15000);
    const files = new Map(), writes = [], unexpected = [], errors = [], consoleErrors = [];
    let serial = 0, failCreate = false, failPdf = false, failRefresh = false;
    const add = (id, name, parent, mimeType = folder, content, properties = {}) => files.set(id, {
      id, name, parents: [parent], mimeType, content, appProperties: { defter: '1', ...properties },
      modifiedTime: '2026-11-04T10:00:00Z', headRevisionId: 'revision', trashed: false,
      capabilities: { canAddChildren: true }, size: mimeType === 'application/pdf' ? String(pdf.length) : undefined,
    });
    const reset = state => {
      files.clear(); writes.length = 0; unexpected.length = 0;
      if (state === 'missing') return;
      add('root', 'Defter Library', 'drive-root', folder, undefined, { defterKok: '1' });
      add('books', 'kitaplar', 'root');
      add('library', 'kitaplik.json', 'root', 'application/json', { raflar: [{ id: 'r1', ad: 'Raf 1', kitaplar: state === 'empty' ? [] : ['existing'] }, {id:'r2',ad:'Raf 2',kitaplar:[]}], ayarlar: { dil: lang } });
      if (state !== 'empty') {
        add('existing', 'existing', 'books', folder, undefined, state === 'sample' ? { defterOrnek: '1' } : {});
        add('existing-json', 'kitap.json', 'existing', 'application/json', { surum: 2, baslik: 'Existing book', uniteler: [{ baslik: 'Unit', klasor: 'Unit', konular: [{baslik:'Topic',klasor:'Unit/Topic',durum:'okunmadi'}] }] });
        add('unit', 'Unit', 'existing'); add('topic', 'Topic', 'unit');
        add('existing-pdf', 'orijinal.pdf', 'topic', 'application/pdf');
      }
    };
    await ctx.addInitScript(lang => {
      localStorage.setItem('defter-dil', lang); localStorage.setItem('defter-duyuru-gizle:gelecek-ozellikler-v1', '1');
    }, lang);
    await ctx.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      if (url.origin === origin) {
        if (url.pathname.startsWith('/models/')) return route.fulfill({contentType:'application/octet-stream',body:''});
        if (url.pathname.startsWith('/api/')) return json({ erisim: false });
        return route.continue();
      }
      if (url.hostname === 'accounts.google.com') return route.fulfill({ contentType: 'application/javascript', body: `window.google={accounts:{oauth2:{initTokenClient:o=>({requestAccessToken:r=>o.callback({access_token:'isolated-a2-fixture',expires_in:3600,scope:r.scope})}),hasGrantedAllScopes:(r,s)=>r.scope.split(' ').includes(s),revoke:(t,cb)=>cb?.()}}};` });
      if (url.hostname !== 'www.googleapis.com') return route.fulfill({ body: '' });
      if (req.method() === 'GET') {
        if (url.pathname.endsWith('/about')) return json({user:{displayName:'Local fixture',emailAddress:'fixture@example.invalid'}});
        if (url.pathname.endsWith('/generateIds')) return json({ids:Array.from({length:Number(url.searchParams.get('count')||1)},()=>`new-${++serial}`)});
        if (url.pathname.endsWith('/files')) {
          const q = url.searchParams.get('q') || '';
          if (failRefresh && q.includes("key='defterKok'")) { failRefresh = false; return route.fulfill({status:500,body:'{}'}); }
          const parent = /'([^']+)' in parents/.exec(q)?.[1], name = /name = '([^']+)'/.exec(q)?.[1];
          const props = [...q.matchAll(/key='([^']+)' and value='([^']+)'/g)];
          return json({files:[...files.values()].filter(f=>(!parent||f.parents.includes(parent))&&(!name||f.name===name)&&(!q.includes(`mimeType = '${folder}'`)||f.mimeType===folder)&&props.every(([,k,v])=>f.appProperties?.[k]===v)).map(({content,...meta})=>meta)});
        }
        const file = files.get(url.pathname.split('/').at(-1));
        if (file) return url.searchParams.get('alt') === 'media'
          ? file.mimeType === 'application/pdf' ? route.fulfill({contentType:'application/pdf',body:pdf}) : json(file.content)
          : json(file);
      } else {
        writes.push({method:req.method(),path:url.pathname});
        const raw = req.postDataBuffer()?.toString('utf8') || '';
        if (req.method() === 'POST') {
          const parts = [...raw.matchAll(/Content-Type: application\/json[^\r]*\r\n\r\n([\s\S]*?)(?=\r\n--)/gi)].map(m=>JSON.parse(m[1]));
          const meta = parts[0] || JSON.parse(raw);
          if (failCreate || (failPdf && meta.mimeType === 'application/pdf')) return route.fulfill({status:403,body:'{}'});
          if (files.has(meta.id)) return route.fulfill({status:409,body:'already exists'});
          add(meta.id,meta.name,meta.parents[0],meta.mimeType,parts[1],meta.appProperties);
          return json(files.get(meta.id));
        }
        if (req.method() === 'PATCH') {
          const f = files.get(url.pathname.split('/').at(-1));
          if (f) { f.content = JSON.parse(raw); return json(f); }
        }
      }
      unexpected.push(`${req.method()} ${url.pathname}`);
      return route.fulfill({status:404,body:'{}'});
    });
    const page = await ctx.newPage();
    const activate = locator => width === 1280 ? locator.click() : locator.tap();
    page.on('pageerror', e=>errors.push(e.message));
    page.on('console', m=>{
      if(m.type() !== 'error') return;
      const url=m.location().url;
      // Explicitly injected Drive permission/refresh failures and nonexistent-id probes are expected.
      if(url.startsWith('https://www.googleapis.com/') && /Failed to load resource/.test(m.text())) return;
      consoleErrors.push({text:m.text(),url});
    });
    const screen = async name => {
      // visualViewport resize and the panel's handler settle on the next frame.
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const bounds = await page.evaluate(() => {
        const visible = e=> e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
        const cards = [...document.querySelectorAll('#kitapSihirbazi .fp-kart,#dosyaPanel .fp-kart,#oPdfStart,#newBookShortcut')].filter(visible);
        return {horizontal:document.documentElement.scrollWidth>innerWidth, clipped:cards.some(e=>{const r=e.getBoundingClientRect();return r.left < -1 || r.right > innerWidth+1 || r.top < -1 || r.bottom>innerHeight+1 || e.scrollWidth>e.clientWidth+1;})};
      });
      verify(`${label}/${name}/bounds`,bounds,{horizontal:false,clipped:false});
      const file = `${label}-${name}.png`; await page.screenshot({path:join(out,file)}); screens.push(file);
    };
    const start = async (state='empty', suffix='', owner=false) => {
      reset(state); failCreate=failPdf=failRefresh=false;
      if(page.url().startsWith(origin)) await page.evaluate(()=>sessionStorage.clear());
      await page.goto(`${origin}/?lang=${lang}${suffix}${owner?'':'&sahip=0&kapsam=dar'}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
      await page.locator('#login').waitFor({state:'visible'});
    };
    const login = async () => {
      await page.locator('#loginGoogle').click();
      await page.waitForFunction(()=>!document.querySelector('#signOutBtn').hidden);
      await page.waitForFunction(()=>document.querySelector('#libLoading').hidden);
      const announcement=page.locator('#defterDuyuru[open]');
      if(await announcement.count()) await page.locator('.duyuru-back').click();
    };
    const wizard = async () => {
      const large=page.locator('#bosKitaplik');
      if(await large.isVisible()) await activate(large); else await activate(page.locator('#newBookShortcut'));
      await page.locator('#kitapSihirbazi').waitFor();
    };
    const nameInput=()=>page.locator('#kitapSihirbazi .ks-adalan input');
    const firstInput=()=>page.locator('#kitapSihirbazi .ks-first input');
    const create=()=>page.locator('#kitapSihirbazi .fp-ekle');
    try {
      if (process.env.A2_REVIEW_ONLY === '1') {
        await start(); await login(); await wizard();
        await nameInput().fill('Details toggle'); await firstInput().fill('Same topic');
        const before = await page.locator('.ks-metin').inputValue();
        await activate(page.locator('.ks-details')); await activate(page.locator('.ks-details'));
        verify(`${label}/details-toggle-preserves-topic`, await page.locator('.ks-metin').inputValue(), before);
        await create().click(); await page.locator('#kitapSihirbazi').waitFor({state:'detached'});
        const opened = await page.locator('#oPdfStart').waitFor({state:'visible',timeout:6000}).then(()=>true,()=>false);
        verify(`${label}/details-toggle-auto-topic`, opened);
        if (opened) verify(`${label}/details-toggle-correct-topic`, await page.locator('#oChap').innerText(), 'Same topic');
        await ctx.close(); continue;
      }
      await start(); verify(`${label}/signed-out-shortcut`,await page.locator('#newBookShortcut').isVisible(),false);
      await login(); await page.locator('#bosKitaplik').waitFor({state:'visible'});
      verify(`${label}/empty-no-double`,await page.locator('#newBookShortcut').isVisible(),false);
      await wizard(); await screen('quick-empty');
      verify(`${label}/first-topic-language`,await page.locator('.ks-first').innerText(),lang==='tr'?'İlk konu':'First topic');
      verify(`${label}/details-language`,await page.locator('.ks-details').innerText(),lang==='tr'?'Ayrıntılar':'Details');
      verify(`${label}/create-language`,await create().innerText(),lang==='tr'?'Kitabı oluştur':'Create book');
      verify(`${label}/quick-disabled`,await create().isDisabled());
      await nameInput().fill('Mathe A2');
      await firstInput().pressSequentially('First topic');
      verify(`${label}/typing-spaces`,await firstInput().inputValue(),'First topic');
      await screen('quick-filled');
      await page.setViewportSize({width,height:420});
      await screen('keyboard-space-emulation');
      verify(`${label}/create-accessible-short-height`,await create().evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1;}));
      await page.setViewportSize({width,height});
      await activate(page.locator('.ks-details'));
      verify(`${label}/first-preserved`,await page.locator('.ks-metin').inputValue(),`# ${lang==='tr'?'Genel':'General'}\n- First topic`);
      const multi='# A\n- One\n- Two\n\n# Empty\n\n# B\n- Three';
      await page.locator('.ks-metin').fill(multi); await page.locator('.ks-rafalan select').selectOption('r2');
      await page.locator('[data-c="#2f5d50"]').click(); await screen('details');
      await page.locator('.ks-details').click(); await screen('collapsed-multi');
      verify(`${label}/multi-first-hidden`,await firstInput().isVisible(),false);
      verify(`${label}/summary-all-topics`,await page.locator('.ks-summary').innerText().then(x=>['A','One','Two','Empty','B','Three'].every(s=>x.includes(s))));
      await page.locator('.ks-details').click(); verify(`${label}/raw-preserved`,await page.locator('.ks-metin').inputValue(),multi);
      if (process.env.A2_FORM_ONLY === '1') { await ctx.close(); continue; }
      await page.locator('.ks-details').click(); await create().click();
      await page.locator('#kitapSihirbazi').waitFor({state:'detached'});
      const made=[...files.values()].find(f=>f.name==='kitap.json'&&f.id!=='existing-json');
      verify(`${label}/visible-equals-created`,made?.content?.uniteler.map(u=>[u.baslik,u.konular.map(k=>k.baslik)]),[['A',['One','Two']],['Empty',[]],['B',['Three']]]);
      verify(`${label}/shelf-preserved`,files.get('library').content.raflar[1].kitaplar.length,1);
      verify(`${label}/color-preserved`,made?.content?.kapak.renk,'#2f5d50');

      await start('sample'); await login(); await page.locator('#newBookShortcut').waitFor({state:'visible'}); await screen('sample-shortcut');
      verify(`${label}/shortcut-clear-of-hint`,await page.evaluate(()=>{
        const a=document.querySelector('#newBookShortcut').getBoundingClientRect(), b=document.querySelector('#hint').getBoundingClientRect();
        return a.bottom<=b.top || a.top>=b.bottom || a.right<=b.left || a.left>=b.right;
      }));
      await start('existing'); await login(); await page.locator('#newBookShortcut').waitFor({state:'visible'});
      const old=JSON.stringify(files.get('existing-json').content); await wizard(); await nameInput().fill('Quick A2'); await firstInput().fill('First topic');
      await activate(page.locator('.ks-details')); await activate(page.locator('.ks-details'));
      await create().click(); await page.locator('#oPdfStart').waitFor({state:'visible',timeout:30000});
      verify(`${label}/automatic-topic`,await page.locator('#oChap').innerText(),'First topic'); await screen('empty-topic');
      verify(`${label}/existing-untouched`,JSON.stringify(files.get('existing-json').content),old);
      const picker=await Promise.all([page.waitForEvent('filechooser'),activate(page.locator('#oPdfStart'))]).then(r=>r[0]);
      verify(`${label}/pdf-filter`,await page.locator('#oDosyaInput').getAttribute('accept'),'.pdf,application/pdf');
      verify(`${label}/pdf-single`,picker.isMultiple(),false);
      // Simulate cancel, then the general picker: no cancel-event dependency.
      await picker.setFiles([]);
      const general=await Promise.all([page.waitForEvent('filechooser'),page.locator('#oDosya').click()]).then(r=>r[0]);
      verify(`${label}/general-multiple`,general.isMultiple());
      verify(`${label}/general-types`,await page.locator('#oDosyaInput').getAttribute('accept').then(x=>x.includes('.docx')&&x.includes('image/jpeg')));
      await general.setFiles({name:'first.pdf',mimeType:'application/pdf',buffer:pdf});
      await page.locator('#dosyaPanel').waitFor(); await screen('pdf-panel');
      failPdf=true; await page.locator('#dosyaPanel .fp-ekle').click();
      await page.waitForFunction(()=>!document.querySelector('#dosyaPanel .fp-ekle').disabled);
      verify(`${label}/pdf-error-panel-stays`,await page.locator('#dosyaPanel').isVisible()); await screen('pdf-error');
      failPdf=false; await page.locator('#dosyaPanel .fp-ekle').click();
      await page.locator('#dosyaPanel').waitFor({state:'detached'});
      await page.locator('#okuyucu canvas:visible').first().waitFor({state:'visible',timeout:30000});
      verify(`${label}/pdf-open-without-show`,await page.locator('#oPdfStart').isVisible(),false); await screen('first-pdf');
      await page.locator('#oClose').click(); await page.locator('#okuyucu').waitFor({state:'hidden'});
      verify(`${label}/desk-return`,await page.locator('#reader').isVisible());
      await page.locator('#rClose').click(); await page.locator('#newBookShortcut').waitFor({state:'visible'});
      verify(`${label}/shelf-return`,await page.locator('#okuyucu').isVisible(),false);

      await start(); await login(); await wizard(); await nameInput().fill('Retry book'); await firstInput().fill('Retry topic');
      failCreate=true; await create().click();
      await page.waitForFunction(()=>document.querySelector('.ks-neden').classList.contains('fp-hata'));
      verify(`${label}/create-error-no-reader`,await page.locator('#okuyucu').isVisible(),false); await screen('create-error');
      failCreate=false; await create().click(); // permission error asks sign-in first
      await create().click();
      await page.locator('#oPdfStart').waitFor({state:'visible',timeout:30000});
      verify(`${label}/pdf-language`,await page.locator('#oPdfStart').innerText(),lang==='tr'?'PDF ekle':'Add PDF');
      verify(`${label}/retry-no-duplicate`,[...files.values()].filter(f=>f.name==='kitap.json').length,1);

      await start(); await login(); await wizard(); await nameInput().fill('Partial book'); await firstInput().fill('Topic');
      await page.evaluate(()=>{window.defterSihirbazHata=3;}); await create().click();
      await page.waitForFunction(()=>document.querySelector('.ks-neden').classList.contains('fp-hata'));
      verify(`${label}/partial-no-reader`,await page.locator('#okuyucu').isVisible(),false);
      verify(`${label}/partial-has-folders`,[...files.values()].filter(f=>f.appProperties?.defterIslem).length>0);
      await create().click(); await page.locator('#oPdfStart').waitFor({state:'visible',timeout:30000});
      verify(`${label}/partial-retry-no-duplicate`,[...files.values()].filter(f=>f.name==='kitap.json').length,1);

      await start(); await login(); await wizard(); await nameInput().fill('Refresh failure'); await firstInput().fill('Topic');
      failRefresh=true; await create().click(); await page.locator('#kitapSihirbazi').waitFor({state:'detached'});
      verify(`${label}/refresh-error-keeps-book`,[...files.values()].filter(f=>f.name==='kitap.json').length,1);
      verify(`${label}/refresh-error-no-reader`,await page.locator('#okuyucu').isVisible(),false);
      await page.locator('#toast button').click(); await page.locator('#oPdfStart').waitFor({state:'visible',timeout:30000});
      verify(`${label}/refresh-retry-no-duplicate`,[...files.values()].filter(f=>f.name==='kitap.json').length,1);

      await start(); await login(); await wizard(); await nameInput().fill('Cancel transition'); await firstInput().fill('Topic');
      await create().click(); await page.locator('#kitapSihirbazi').waitFor({state:'detached'});
      await page.locator('#signOutBtn').click(); await pause(2100);
      verify(`${label}/signout-cancels-transition`,await page.locator('#okuyucu').isVisible(),false);

      await start(); await login(); await wizard(); await nameInput().fill('No topic'); await page.locator('.ks-details').click();
      await page.locator('.ks-metin').fill('# Empty'); await page.locator('.ks-details').click(); await create().click();
      await page.locator('#kitapSihirbazi').waitFor({state:'detached'});
      verify(`${label}/no-topic-no-reader`,await page.locator('#okuyucu').isVisible(),false);

      await start('empty','&hizliKitap=0'); await login(); await wizard();
      verify(`${label}/rollback-no-first`,await firstInput().count(),0);
      verify(`${label}/rollback-list-visible`,await page.locator('.ks-metin').isVisible());
      await nameInput().fill('Legacy'); await page.locator('.ks-metin').fill('# Empty'); await screen('rollback');
      await create().click(); await page.locator('#kitapSihirbazi').waitFor({state:'detached'});
      verify(`${label}/rollback-no-auto`,await page.locator('#okuyucu').isVisible(),false);
      verify(`${label}/rollback-shortcut-hidden`,await page.locator('#newBookShortcut').isVisible(),false);

      await start('existing','',true); await login();
      if(await page.locator('#fullAccess').isVisible()) await page.locator('#faOpen').click();
      await page.locator('#newBookShortcut').waitFor({state:'visible'}); await wizard();
      await nameInput().fill('Owner book'); await firstInput().fill('Owner topic'); await create().click();
      await page.locator('#oPdfStart').waitFor({state:'visible',timeout:30000});
      verify(`${label}/owner-auto-topic`,await page.locator('#oChap').innerText(),'Owner topic');

      await start('missing'); await login(); await page.locator('#kurulum').waitFor({state:'visible'});
      verify(`${label}/setup-no-shortcut`,await page.locator('#newBookShortcut').isVisible(),false);
      await start(); await page.locator('#loginSample').click();
      await page.waitForFunction(()=>document.querySelector('#login').hidden);
      verify(`${label}/demo-no-shortcut`,await page.locator('#newBookShortcut').isVisible(),false);
      verify(`${label}/demo-no-writes`,writes.length,0);
      verify(`${label}/unexpected-requests`,unexpected,[]);
      verify(`${label}/page-errors`,errors,[]);
      verify(`${label}/console-errors`,consoleErrors,[]);
    } catch(e) { console.log(String(e)); failures.push({name:label,error:String(e),stack:e.stack}); await page.screenshot({path:join(out,`${label}-FAIL.png`)}).catch(()=>{}); }
    writeFileSync(join(out,'rapor.json'),JSON.stringify({cases,failures,screens,physicalIPad:false,realGoogleAccess:false},null,2));
    await ctx.close();
  }
} finally {
  await browser?.close(); dev.kill();
  const report={cases,failures,screens,physicalIPad:false,realGoogleAccess:false};
  writeFileSync(join(out,'rapor.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({checks:cases.length,failures:failures.length,screens:screens.length}));
}
if(failures.length) process.exitCode=1;
