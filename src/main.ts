import './styles.css';
import { AuthError, prepareAuth, rememberUser, rememberedUser, signIn, signOut } from './drive/auth';
import { getUser, setAccountHint, setSessionExpiredHandler } from './drive/drive';
import { LibraryNotFound, loadDriveLibrary, type DriveLocation } from './drive/driveLibrary';
import { bekleyenFotoDepo } from './defter/bekleyenFoto';
import { acilisToastMetni } from './defter/fotoEklemeMetin';
import { ReadingSaver, driveReadingApi } from './drive/okumaKaydi';
import { DriveSaver } from './drive/save';
import { daysSinceOpened, shelfOf } from './model/library';
import { loadLocalLibrary, type LoadedLibrary } from './model/localSource';
import { parseLibrary } from './model/parse';
import type { ModeKey } from './model/types';
import { usesUnits } from './model/units';
import { markOpened, setReadingSink } from './okuma/okumaDurumu';
import { sampleBookFolder } from './okuma/ornekKaynak';
import { closeOkuyucu, forgetBook, fotoYuklemeSuruyor, initOkuyucu, openOkuyucu, sayfaEklemeOrtami } from './okuma/Okuyucu';
import { createRoomScene, type LibraryData, type RoomScene, type View } from './scene';
import { canvas, drawWood, noise } from './scene/textures';
import { updateHint } from './ui/hint';
import { initPanel } from './ui/panel';
import { hideSaveState, initLibError, initNotFound, initSaveState, setLibError, setLibraryLoading, setNotFound, showSaveError, showSaved, showSaving } from './ui/driveStatus';
import { etkinYazici, gecis, gorunum, ilkDurum, type KitaplikDurumu, type KitaplikOlayi } from './ui/kitaplikDurumu';
import { closeReader, initReader, isReaderOpen, openReader, refreshReader } from './ui/reader';
import { hideLogin, initLogin, setLoginBusy, setRememberedName, showLogin } from './ui/login';
import { initTopBar, initUserBox, updateCrumb, updateModeButtons, updateUserBox, type LightMode } from './ui/topBar';
import { installErrorBox } from './ui/hataKutusu';
import { installPageZoomGuard } from './ui/sayfaZoom';
import { installGorunurAlan } from './ui/gorunurAlan';
import { toast } from './ui/toast';

const app = document.querySelector<HTMLElement>('#app')!;
const stageEl = document.querySelector<HTMLElement>('#stage')!;
const loading = document.querySelector<HTMLElement>('#loading')!;

// ?fps=1: errors in a small box on screen (the iPad has no console); first, so it sees everything
installErrorBox();

// iPad: the browser must not zoom the page (the viewport tag alone doesn't stop it); see ui/sayfaZoom.ts.
installPageZoomGuard(() => scene?.resize());

// iPad: after the keyboard / photo picker the page must not stay moved up (task 5.10g-ek, ui/gorunurAlan.ts);
// ?olcum=1: the numbers in a small box (also on Vercel, for the iPad test)
installGorunurAlan();
if (new URLSearchParams(location.search).get('olcum') === '1') void import('./ui/olcum').then(m => m.installOlcum());

// dev only (task 5.3, 5.8c): ?gorselTest=1 photo → JPEG trial panel; writes nothing, not in the build
if (import.meta.env.DEV && new URLSearchParams(location.search).get('gorselTest') === '1') {
  import('./defter/gorselTest').then(m => m.acGorselTest()).catch(e => toast(`Görsel testi açılamadı: ${e}`));
}

const MODE_FROM_DATA: Record<ModeKey, LightMode> = { otomatik: 'auto', gunduz: 'day', aksam: 'night' };
const MODE_TO_DATA: Record<LightMode, ModeKey> = { auto: 'otomatik', day: 'gunduz', night: 'aksam' };

let data: LibraryData | null = null;
let mode: LightMode = 'auto';
let scene: RoomScene | null = null;
let view: View = 'room';
let openTitle: string | null = null;
let saver: DriveSaver | null = null;   // set while the library comes from Drive
let reading: ReadingSaver | null = null;   // with saver: ribbon, topic status, last opened (task 3.5)
let driveLoc: DriveLocation | null = null;   // with saver: where the book folders are
let deskBook: string | null = null;    // id of the book open on the desk
let ownerName: string | null = null;    // signed-in user (title page: "<ad>'in kitaplığından")

// ---- which library is on screen (task 5.1, ui/kitaplikDurumu.ts) ----
// The sample library only when chosen (or ?demo); signing in / loading: empty, faded, locked shelves.

const startWithSample = new URLSearchParams(location.search).has('demo');
let durum: KitaplikDurumu = ilkDurum(startWithSample);

// Every write to Drive goes through this: null unless the Drive library is on screen.
const writer = () => etkinYazici(durum, saver);

// dev only (task 5.5): window.defterDosyaDene(kitapAdi) creates a test PDF
if (import.meta.env.DEV) void import('./drive/dosyaDene').then(m => m.installDosyaDene(() => writer() ? driveLoc : null));
// dev only (task 5.6): window.defterSayfaDene(kitapAdi, dosyaAdi) adds 2 test pages at the end
if (import.meta.env.DEV) void import('./drive/sayfaDene').then(m => m.installSayfaDene(() => writer() ? driveLoc : null, sayfaEklemeOrtami));
// dev only (task 5.7): window.defterOzetDurum(kitapAdi), window.defterOzetDene(kitapAdi, konuYolu)
if (import.meta.env.DEV) void import('./drive/ozetDene').then(m => m.installOzetDene(() => writer() ? driveLoc : null, () => data?.books ?? null, sayfaEklemeOrtami));
// dev only (task 5.10c/d): window.defterDosyaEkleDene(kitapAdi, konuYolu, hedef, ad?) adds a file from the computer (PDF or image → PDF, via dosyaHazirla)
if (import.meta.env.DEV) void import('./drive/dosyaEkleDene').then(m => m.installDosyaEkleDene(() => writer() ? driveLoc : null, () => data?.books ?? null, sayfaEklemeOrtami));
// dev only (task 6.1b): window.defterOfisCevirDene(kitapAdi, konuYolu) converts with ofisuPdfeCevir; adds nothing to a topic
if (import.meta.env.DEV) void import('./drive/ofisCevirDene').then(m => m.installOfisCevirDene(() => writer() ? driveLoc : null, () => data?.books ?? null));
// dev only (task 6.3a): window.defterAramaDene(q), window.defterAramaHepsi(elYazisi?) — search discovery; GET requests only
if (import.meta.env.DEV) void import('./drive/aramaDene').then(m => m.installAramaDene(() => driveLoc, () => data?.books ?? null));
// dev only (task 6.3-0a): window.defterTemizlikListesi() — the test files left in Drive, as a list; GET requests only
if (import.meta.env.DEV) void import('./drive/temizlikListesi').then(m => m.installTemizlikListesi(() => driveLoc, () => data?.books ?? null));
// dev only (task 6.3-0b), only with ?temizlik=1: window.defterTemizlikUygula() dry run, ({ gercek: true }) the one-time cleanup
if (import.meta.env.DEV && new URLSearchParams(location.search).get('temizlik') === '1') void import('./drive/temizlikUygula').then(m => m.installTemizlikUygula(() => writer() ? driveLoc : null, () => data?.books ?? null));
// dev only (task 5.8e): window.defterBekleyenFoto() lists the pending photo records; .dene() / .hata(id) / .sil(id); no Drive
if (import.meta.env.DEV) void import('./defter/bekleyenFotoDene').then(m => m.installBekleyenFoto());
// dev only (task 5.8b): ?kirpTest=1 compares two page-cropping methods on real photos; writes nothing
if (import.meta.env.DEV && new URLSearchParams(location.search).get('kirpTest') === '1') {
  import('./defter/kirp/kirpTest').then(m => m.acKirpTest()).catch(e => toast(`Kırpma testi açılamadı: ${e}`));
}
// dev only (task 6.2a): ?filtreTest=1 shows document filters A–D side by side on real photos; writes nothing
if (import.meta.env.DEV && new URLSearchParams(location.search).get('filtreTest') === '1') {
  import('./defter/filtre/filtreTest').then(m => m.acFiltreTest()).catch(e => toast(`Filtre testi açılamadı: ${e}`));
}

function olay(o: KitaplikOlayi): void {
  durum = gecis(durum, o);
  showState();
}

function showState(): void {
  const v = gorunum(durum);
  if (v.kart === 'giris') { showLogin(v.girisHata ?? undefined); setLoginBusy(v.girisMesgul); }
  else hideLogin();
  setLibraryLoading(v.yukleniyor);
  setNotFound(v.kart === 'bulunamadi');
  setLibError(v.hataMesaji);
  if (v.kilitli) app.dataset.kilit = ''; else delete app.dataset.kilit;
  scene?.setLocked(v.kilitli);
}

// 5 empty shelves (as a Drive library without kitaplik.json), no books; nothing is fetched
const emptyLibrary = (): LoadedLibrary => ({ library: parseLibrary({ raflar: [{}, {}, {}, {}, {}] }), books: new Map() });

const isEvening = () => { const h = new Date().getHours(); return h >= 18 || h < 6; };
const effectiveMode = (): 'day' | 'night' => mode === 'auto' ? (isEvening() ? 'night' : 'day') : mode;

function applyMode(instant = false): void {
  const m = effectiveMode();
  const changed = app.dataset.mode !== m;
  app.dataset.mode = m;
  document.body.style.background = m === 'night' ? '#0e1527' : '#d8c3a2';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', m === 'night' ? '#0e1527' : '#d8c3a2');
  updateModeButtons(mode);
  if (scene && (changed || instant)) scene.setNight(m === 'night', instant);
}

function updateChrome(): void {
  app.dataset.view = view;
  updateCrumb(view, openTitle);
  updateHint(view, openTitle !== null);
}

initTopBar({
  onModeChange: m => {
    mode = m;
    if (data) data.library.oda.mod = MODE_TO_DATA[m];
    writer()?.libraryChanged();
    applyMode();
    if (m === 'auto') toast(isEvening() ? 'Otomatik: saat 18:00\'i geçti, oda akşam modunda.' : 'Otomatik: oda 18:00\'de akşam moduna geçecek.');
  },
  onGoRoom: () => scene?.setView('room')
});

// ---- library source: sample (public/ornek) or Drive ----

const offline = "Drive'a bağlanılamadı. İnternet bağlantını kontrol et ve tekrar dene.";
const errorText = (e: unknown) => e instanceof TypeError || !(e instanceof Error) ? offline : e.message;

let dataSeq = 0;

// Put new data into the shared holder and rebuild the room.
// false: a newer call replaced it meanwhile (e.g. signed out while the book flew home), nothing changed.
async function useData(next: LoadedLibrary, newSaver: DriveSaver | null, loc: DriveLocation | null): Promise<boolean> {
  const seq = ++dataSeq;
  await ready;
  if (!data || !scene || seq !== dataSeq) return false;
  closeOkuyucu();
  forgetBook();
  if (isReaderOpen()) { closeReader(); await new Promise(r => setTimeout(r, 1900)); }   // let the book fly home first
  if (seq !== dataSeq) return false;
  data.library = next.library;
  data.books = next.books;
  saver = newSaver;
  driveLoc = loc;
  // reading state: written only to a Drive library (the sample library has no writer)
  reading?.dispose();
  reading = loc ? new ReadingSaver(id => loc.bookFileIds.get(id), driveReadingApi, { saving: () => {}, saved: showSaved, failed: showSaveError }) : null;
  const r = reading;
  setReadingSink(r ? (id, patch) => r.change(id, patch) : null);
  hideSaveState();
  scene.reload();
  if (location.hash !== '#aksam') { mode = MODE_FROM_DATA[data.library.oda.mod]; applyMode(); }
  return true;
}

let loadSeq = 0;

// State must be 'yukleniyor'. A late answer (signed out / sample chosen meanwhile, or an older try) is ignored.
async function loadFromDrive(): Promise<void> {
  const seq = ++loadSeq;
  const current = () => seq === loadSeq && durum.tur === 'yukleniyor';
  await ready;
  try {
    const r = await loadDriveLibrary();
    if (!current()) return;
    // the saver reads from the shared holder, whose contents useData replaces
    if (!await useData(r, new DriveSaver(r.loc, data!, { saving: showSaving, saved: showSaved, failed: showSaveError, warn: toast }), r.loc)) return;
    olay({ tur: 'driveGeldi' });
    if (r.warnings.length) toast(r.warnings[0]);
    remindPendingPhotos();
  } catch (e) {
    if (!current()) return;
    olay(e instanceof LibraryNotFound ? { tur: 'bulunamadi' } : { tur: 'driveHata', mesaj: errorText(e) });
  }
}

// Task 5.8f: photos waiting on the device → one short toast per page load, once the Drive library is here
// (after the welcome / warning toasts).
let photosReminded = false;
function remindPendingPhotos(): void {
  if (photosReminded) return;
  photosReminded = true;
  bekleyenFotoDepo.hepsi().then(ks => {
    const text = acilisToastMetni(ks);
    if (text) setTimeout(() => toast(text), 4000);
  }, e => console.warn('Bekleyen fotoğraflara bakılamadı.', e));
}

function retryDrive(): void {
  olay({ tur: 'tekrarDene' });
  void loadFromDrive();
}

// "Örnek kitaplıkla dene" (sign-in card, error cards)
async function useSample(): Promise<void> {
  olay({ tur: 'demoSecildi' });
  if (durum.tur !== 'demo') return;
  updateUserBox({ kind: 'sample' });
  try { await useData(await loadLocalLibrary(), null, null); } catch { olay({ tur: 'demoHata', mesaj: 'Örnek kitaplık yüklenemedi. Sayfayı yenile.' }); }
}

initNotFound({ onRetry: retryDrive, onSample: () => void useSample() });
initLibError({ onRetry: retryDrive, onSample: () => void useSample() });
initSaveState();
// task 6.2e-2: photos still uploading too (they stay on the device either way)
addEventListener('beforeunload', e => { if (saver?.hasUnsaved || fotoYuklemeSuruyor()) e.preventDefault(); });
// tab hidden / page closed: write the reading state now (keepalive: may finish after the page is gone)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void reading?.flush(true); });
addEventListener('pagehide', () => { void reading?.flush(true); });

// ---- Google sign-in ----

// chooseAccount: "Başka bir hesapla giriş yap" (ignore the remembered account)
async function googleSignIn(chooseAccount = false): Promise<void> {
  const fromSample = durum.tur === 'demo';
  olay({ tur: 'girisBasladi' });
  try {
    const remembered = chooseAccount ? null : rememberedUser();
    const signedIn = signIn({ hint: remembered?.email, chooseAccount });   // first: the popup opens on the tap
    if (fromSample) { updateUserBox({ kind: 'none' }); void useData(emptyLibrary(), null, null); }   // no sample books while signing in
    await signedIn;
    if (durum.tur !== 'giriliyor' && durum.tur !== 'drive') return;   // the sample library was chosen meanwhile
    const user = await getUser();
    rememberUser(user);              // name + e-mail only; the token stays in memory
    setAccountHint(user.email);
    ownerName = user.name;
    updateUserBox({ kind: 'user', name: user.name });
    olay({ tur: 'girisBasarili' });
    toast(`Hoş geldin, ${user.name}.`);
    // signing in again after the session expired: the Drive library is already here (state 'drive')
    if (gorunum(durum).yukleniyor) await loadFromDrive();
  } catch (e) {
    // our errors carry a Turkish message; a failed fetch (TypeError) means no connection
    olay({ tur: 'girisHata', mesaj: errorText(e) });
  }
}

initLogin({
  onGoogle: () => googleSignIn(),
  onOtherAccount: () => googleSignIn(true),
  onSample: () => void useSample()
});
initUserBox({
  onSignIn: () => googleSignIn(),
  onSignOut: async () => {
    await reading?.flush();   // while the token is still there
    signOut(); rememberUser(null); setAccountHint(undefined); setRememberedName(null);
    ownerName = null;
    updateUserBox({ kind: 'none' });
    // don't leave the Drive library on screen: empty shelves under the card
    // (pending pen strokes stay on the device, in IndexedDB; nothing here touches them)
    olay({ tur: 'cikis' });
    void useData(emptyLibrary(), null, null);
  }
});
setSessionExpiredHandler(() => {
  updateUserBox({ kind: 'none' });
  olay({ tur: 'oturumDoldu', mesaj: 'Oturumun süresi doldu. Devam etmek için tekrar Google ile giriş yap.' });
});

// The card is shown over the room: first visit "Google ile giriş yap", after a reload "<ad> olarak devam et".
// Google's script is loaded now so the popup opens right on the tap.
setRememberedName(rememberedUser()?.name ?? null);
setAccountHint(rememberedUser()?.email);
// ?demo (portfolio link): skip the card and open the sample library right away
if (startWithSample) updateUserBox({ kind: 'sample' });
showState();
prepareAuth().catch((e: unknown) => { if (e instanceof AuthError) olay({ tur: 'girisHata', mesaj: e.message }); });

initReader(() => {
  closeOkuyucu();
  forgetBook();
  deskBook = null;
  void reading?.flush();
  scene?.setPaused(false);
  scene?.closeBook();
}, (unit, topic, resume) => {
  const b = deskBook ? data?.books.get(deskBook) : undefined;
  if (!b) return;
  // sample library: surum 2 books open the demo PDFs in public/demo (task 3.6); surum 1 ones have no files
  const folderId = driveLoc ? driveLoc.bookFolderIds.get(b.id) : usesUnits(b) ? sampleBookFolder(b.id) : undefined;
  if (!folderId) { toast('Sayfaları görmek için Google ile giriş yap. Örnek kitaplıkta bu kitabın dosyası yok.'); return; }
  // the room is behind the reader: don't draw it (it stays paused under the contents page too)
  scene?.setPaused(true);
  void openOkuyucu(b, folderId, unit, topic, () => {
    scene?.setPaused(isReaderOpen());
    void reading?.flush();
    refreshReader();   // status / ribbon on the contents page
  }, resume);
});
initOkuyucu(() => writer() ? driveLoc : null);

// Wooden desk + paper texture for the reading view (same as the prototype).
function readerTextures(): void {
  const deskURL = canvas(1024, 1024, (g, w, h) => drawWood(g, w, h, '#8a6444', '#3a2414', 23, 220)).toDataURL('image/jpeg', .85);
  document.querySelector<HTMLElement>('#reader')!.style.setProperty('--deskImg', `url(${deskURL})`);
  const paperURL = canvas(256, 256, (g, w, h) => { g.fillStyle = '#fbf7ef'; g.fillRect(0, 0, w, h); noise(g, w, h, 9, 3); }).toDataURL();
  app.style.setProperty('--paperImg', `url(${paperURL})`);
}

let ready: Promise<void>;

async function boot(): Promise<void> {
  // task 5.1: the sample library only with ?demo; otherwise empty shelves until the visitor chooses
  try {
    data = startWithSample ? await loadLocalLibrary() : emptyLibrary();
  } catch {
    loading.textContent = 'Örnek kitaplık yüklenemedi. Sayfayı yenile; düzelmezse terminalde npm run dev çalışıyor mu bak.';
    return;
  }
  const d = data;
  mode = location.hash === '#aksam' ? 'night' : MODE_FROM_DATA[d.library.oda.mod];
  applyMode(true);

  // canvas textures draw text, so wait for the fonts (max 2.5 s); include Turkish letters
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 20px Figtree', 'AZ ÂÜİĞŞÇÖ'),
        document.fonts.load('600 20px "Cormorant Garamond"', 'AZ ÂÜİĞŞÇÖ'),
        document.fonts.load('700 20px "Cormorant Garamond"', 'AZ ÂÜİĞŞÇÖ')
      ]),
      new Promise(r => setTimeout(r, 2500))
    ]);
  } catch { /* fonts are optional */ }

  loading.textContent = 'Oda yükleniyor…';
  scene = await createRoomScene(stageEl, {
    data: d,
    night: effectiveMode() === 'night',
    onViewChange: v => { view = v; updateChrome(); },
    // the book may be gone (library replaced meanwhile): then do nothing
    onBookOpening: id => { const b = d.books.get(id); if (!b) return; openTitle = b.baslik; updateChrome(); },
    onBookOnDesk: id => {
      const b = d.books.get(id);
      if (!b) return;
      deskBook = id;
      const shelf = shelfOf(d.library, id);
      openReader(b, { shelfName: shelf >= 0 ? d.library.raflar[shelf].ad : null, daysSinceOpened: daysSinceOpened(b), owner: saver ? ownerName : null });
      markOpened(b);
      setTimeout(() => { if (isReaderOpen()) scene?.setPaused(true); }, 400);
    },
    onBookClosed: () => { openTitle = null; updateChrome(); },
    onLibraryChanged: () => writer()?.libraryChanged(),
    onToast: toast
  });
  scene.setLocked(gorunum(durum).kilitli);

  // dev only: ?export=oda downloads the room for Blender (Faz 2)
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('export') === 'oda') {
    scene.exportRoom()
      .then(() => toast('oda-kaynak.glb indirildi. blender/assets/ klasörüne taşı.'))
      .catch(() => toast('Oda dışa aktarılamadı. Konsoldaki hataya bak.'));
  }

  initPanel(d, {
    shelvesChanged: () => { scene?.shelvesChanged(); writer()?.libraryChanged(); },
    bookChanged: id => { scene?.refreshBook(id); writer()?.coverChanged(id); },
    roomChanged: () => { scene?.applyRoom(d.library.oda); writer()?.libraryChanged(); }
  });
  readerTextures();

  // clock + automatic evening switch
  setInterval(() => { scene?.updateClock(); if (mode === 'auto') applyMode(); }, 20000);

  // the stage's own size, not only window resize: iPad toolbars and rotation change it too
  let rt: number | undefined;
  const resized = () => { clearTimeout(rt); rt = window.setTimeout(() => scene?.resize(), 120); };
  addEventListener('resize', resized);
  new ResizeObserver(resized).observe(stageEl);

  loading.hidden = true;
}

ready = boot();
