// Local-only browser checks. All Google/GIS/API traffic is replaced with fixtures.
// Run against the dev server with a dummy VITE_GOOGLE_CLIENT_ID; never a real account.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const ORIGIN = process.env.DUYURU_TEST_ORIGIN || 'http://127.0.0.1:5179';
const OUT = process.argv[2];
if (!OUT) throw Error('Output directory required');
mkdirSync(OUT, { recursive: true });
const FOLDER = 'application/vnd.google-apps.folder';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ID = 'gelecek-ozellikler-v1';
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];

async function fixture({ lang = 'tr', viewport = { width: 1180, height: 820 }, missing = false, brokenImage = false, blockStorage = false } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 1200 });
  context.setDefaultTimeout(15000);
  const errors = [], writes = [];
  await context.addInitScript(({ lang, blockStorage }) => {
    localStorage.setItem('defter-dil', lang);
    if (blockStorage) {
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      Storage.prototype.getItem = function(key) { if (key.startsWith('defter-duyuru-')) throw Error('blocked'); return get.call(this, key); };
      Storage.prototype.setItem = function(key, value) { if (key.startsWith('defter-duyuru-')) throw Error('blocked'); return set.call(this, key, value); };
    }
  }, { lang, blockStorage });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (url.origin === ORIGIN) {
      if (url.pathname.startsWith('/models/')) return route.abort(); // Fast procedural room, no missing untracked assets.
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, body: '{}' });
      if (brokenImage && url.pathname === '/duyurular/gelecek-ozellikler-v1.webp') return route.fulfill({ status: 404, body: '' });
      return route.continue();
    }
    if (url.hostname === 'accounts.google.com') return route.fulfill({ contentType: 'application/javascript', body: `window.google={accounts:{oauth2:{initTokenClient:options=>({requestAccessToken:()=>options.callback({access_token:'local-only-fixture',expires_in:3600,scope:'${SCOPE}'})}),hasGrantedAllScopes:(response,scope)=>response.scope.split(' ').includes(scope),revoke:()=>{}}}};` });
    if (url.hostname === 'www.googleapis.com') {
      if (req.method() !== 'GET') { writes.push(req.method()); return route.fulfill({ status: 403, body: '{}' }); }
      if (url.pathname.endsWith('/about')) return json({ user: { displayName: 'Local test', emailAddress: 'fixture@example.invalid' } });
      if (url.pathname.endsWith('/files/library-json')) return json({ surum: 1, raflar: [{ id: 'raf-1', ad: 'Shelf', kitaplar: [] }], oda: {}, ayarlar: { dil: lang } });
      if (url.pathname.endsWith('/files')) {
        const q = url.searchParams.get('q') || '';
        if (q.includes("key='defterKok'")) return json({ files: missing ? [] : [{ id: 'library-root', name: 'Defter Library', mimeType: FOLDER }] });
        if (q.includes("'library-root' in parents")) return json({ files: [{ id: 'books', name: 'kitaplar', mimeType: FOLDER }, { id: 'library-json', name: 'kitaplik.json', mimeType: 'application/json' }] });
        return json({ files: [] });
      }
      return route.fulfill({ status: 404, body: '{}' });
    }
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  async function start(path = '/') {
    await page.goto(ORIGIN + path);
    await page.locator('#loading').waitFor({ state: 'hidden', timeout: 30000 });
  }
  async function signIn() {
    await page.locator('#loginGoogle').click();
    await page.locator(missing ? '#kurulum:not([hidden])' : '#bosKitaplik:not([hidden])').waitFor();
  }
  async function clean() { assert.deepEqual(errors, [], 'no uncaught page errors'); assert.deepEqual(writes, [], 'no Drive mutations'); await context.close(); }
  return { context, page, start, signIn, clean, errors, writes };
}

try {
  const sizes = [[320,568],[390,844],[820,1180],[1180,820],[1920,1080],[844,390]];
  for (const lang of ['tr', 'en']) for (const [width,height] of sizes) {
    const f = await fixture({ lang, viewport: { width,height } });
    const { page } = f;
    await f.start();
    assert.equal(await page.locator('#defterDuyuru').count(), 0, 'no announcement before sign-in');
    await f.signIn();
    await page.locator('#defterDuyuru[open]').waitFor();
    assert.equal(await page.locator('#duyuruTitle').innerText(), lang === 'tr' ? 'Öğrenmeye biraz\nsihir kat.' : 'Add a little magic\nto learning.');
    const geometry = await page.locator('#defterDuyuru').evaluate(dialog => {
      const bounds=dialog.getBoundingClientRect();
      const overflow=[...dialog.querySelectorAll('h2,p,li,label,button')].filter(el => el.scrollWidth > el.clientWidth+2).map(el=>el.tagName);
      const controls=[...dialog.querySelectorAll('button,input')].map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
      return {left:bounds.left,right:bounds.right,top:bounds.top,bottom:bounds.bottom,overflow,controls};
    });
    assert(geometry.left >= 0 && geometry.right <= width+1 && geometry.top >= 0 && geometry.bottom <= height+1, 'dialog fits viewport');
    assert.deepEqual(geometry.overflow, [], 'copy fits');
    assert(geometry.right-geometry.left <= 561,'announcement remains a compact card');
    assert(Math.abs((geometry.left+geometry.right)/2-width/2)<2,'card is horizontally centered');
    assert(Math.abs((geometry.top+geometry.bottom)/2-height/2)<2,'card is vertically centered');
    assert(geometry.controls.every(r=>r.left>=0 && r.right<=width && r.top>=0 && r.bottom<=height), 'all controls visible');
    await page.screenshot({ path: join(OUT, `${width}x${height}-${lang}.png`) });
    if (process.argv.includes('--layout-only')) {
      results.push({case:'compact-layout',lang,width,height});await f.clean();console.log(`Passed compact layout ${lang} ${width}x${height}`);continue;
    }
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.className), 'duyuru-back');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.className), 'duyuru-close');
    await page.keyboard.press('/');
    assert.equal(await page.locator('#aramaPaneli').isVisible(), false, 'search shortcut stays inactive');
    await page.locator('.duyuru-close').click();
    assert.equal(await page.locator('#defterDuyuru').count(), 0);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'araBtn','focus returns to an available room control');
    await page.reload();
    await page.locator('#bosKitaplik:not([hidden])').waitFor().catch(async error=>{
      console.log('Reload UI:',await page.locator('#login,#kurulum,#libError,#libLoading,#bosKitaplik').evaluateAll(nodes=>nodes.map(el=>({id:el.id,hidden:el.hidden,text:el.innerText.slice(0,200)}))));
      console.log('Page errors:',f.errors);
      await page.screenshot({path:join(OUT,'reload-error.png')});throw error;
    });
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#defterDuyuru').count(), 0, 'reload restores auth without repeating announcement');
    results.push({ case:'main-layout-and-reload',lang,width,height });
    await f.clean();
    console.log(`Passed layout ${lang} ${width}x${height}`);
  }
  if (!process.argv.includes('--layout-only')) {
  {
    const f = await fixture(); await f.start(); await f.signIn();
    await f.page.locator('#defterDuyuru[open]').waitFor();
    await f.page.locator('#defterDuyuru input').check();
    await f.page.locator('.duyuru-back').click();
    assert.equal(await f.page.evaluate(id=>localStorage.getItem('defter-duyuru-gizle:'+id),ID),'1');
    await f.page.evaluate(id=>sessionStorage.removeItem('defter-duyuru-gosterildi:'+id),ID);
    await f.page.reload(); await f.page.locator('#bosKitaplik:not([hidden])').waitFor(); await f.page.waitForTimeout(300);
    assert.equal(await f.page.locator('#defterDuyuru').count(),0,'persistent hide survives fresh tab session');
    results.push({case:'persistent-hide'}); await f.clean();
  }
  for (const kind of ['missing-library','demo','image-error','blocked-storage','panel-delay','sign-out','restored-first']) {
    const f=await fixture({missing:kind==='missing-library',brokenImage:kind==='image-error',blockStorage:kind==='blocked-storage'});
    const p=f.page;
    if (kind==='restored-first') await f.context.addInitScript(scope=>sessionStorage.setItem('defter-oturum',JSON.stringify({value:'local-only-fixture',expiresAt:Date.now()+3600000,aktif:'dar',scopes:[scope]})),SCOPE);
    await f.start(kind==='demo'?'/?demo':'/');
    if (kind==='panel-delay') await p.locator('#panel').evaluate(el=>el.hidden=false);
    if (kind!=='demo' && kind!=='restored-first') await f.signIn();
    if (['missing-library','demo','image-error','panel-delay'].includes(kind)) {
      await p.waitForTimeout(500);
      assert.equal(await p.locator('#defterDuyuru').count(),0,kind);
      if(kind==='panel-delay') { await p.locator('#panel').evaluate(el=>el.hidden=true);await p.locator('#defterDuyuru[open]').waitFor(); }
    } else {
      await p.locator('#defterDuyuru[open]').waitFor();
      if(kind==='sign-out') {
        await p.evaluate(async()=>{const auth=await import('/src/drive/auth.ts');auth.signOut();});
        // Use the public app sign-out action to run normal state cleanup as well.
        await p.locator('#signOutBtn').evaluate(el=>el.click());
        await p.locator('#defterDuyuru').waitFor({state:'detached'});
      } else { await p.keyboard.press('Escape'); assert.equal(await p.locator('#defterDuyuru').count(),0); }
    }
    results.push({case:kind});await f.clean();console.log('Passed '+kind);
  }
  {
    const f=await fixture();await f.start();const p=f.page;
    await p.locator('#panel').evaluate(el=>el.hidden=false);
    await f.signIn();
    await p.evaluate(async()=>{
      const {loadLocalLibrary}=await import('/src/model/localSource.ts');
      const {openReader}=await import('/src/ui/reader.ts');
      const sample=await loadLocalLibrary();
      openReader([...sample.books.values()][0],{shelfName:null,daysSinceOpened:null,owner:null});
      document.querySelector('#panel').hidden=true;
    });
    await p.waitForTimeout(500);
    assert.equal(await p.locator('#defterDuyuru').count(),0,'actual desk reader blocks automatic opening');
    await p.evaluate(async()=>{const {closeReader}=await import('/src/ui/reader.ts');closeReader();});
    await p.locator('#defterDuyuru[open]').waitFor();
    assert.equal(await p.locator('#reader').isVisible(),false,'wait until reader closing animation finishes');
    results.push({case:'reader-delay'});await f.clean();
  }
  // Independent browser exercises of controller timing and sign-out cleanup.
  {
    const f=await fixture();await f.start('/?demo');const p=f.page;
    await p.evaluate(async()=>{
      const {createAnnouncement}=await import('/src/ui/duyuru.ts');
      window.__announcementActive=true;
      window.__announcementReady=false;
      window.__announcement=createAnnouncement({active:()=>window.__announcementActive,roomReady:()=>window.__announcementReady});
      window.__announcement.request();
    });
    await p.waitForTimeout(250);assert.equal(await p.locator('#defterDuyuru').count(),0);
    await p.evaluate(()=>{window.__announcementActive=false;window.__announcement.refresh();window.__announcementReady=true;});
    await p.waitForTimeout(250);assert.equal(await p.locator('#defterDuyuru').count(),0,'cancelled pending request stays cancelled');
    await p.evaluate(()=>{window.__announcementActive=true;window.__announcement.request();});
    await p.locator('#defterDuyuru[open]').waitFor();
    await p.evaluate(()=>{window.__announcementActive=false;window.__announcement.refresh();});
    assert.equal(await p.locator('#defterDuyuru').count(),0,'active modal cleaned on logout');
    results.push({case:'pending-cancel-and-close'});await f.clean();
  }
  }
  writeFileSync(join(OUT,'rapor.json'),JSON.stringify({cases:results,realGoogleAccess:false,physicalIPad:false},null,2));
  console.log(`Passed ${results.length} browser scenarios; 12 screenshots.`);
} finally { await browser.close(); }
