import './styles.css';
import { AuthError, prepareAuth, rememberUser, rememberedUser, signIn, signOut } from './drive/auth';
import { getUser, setAccountHint, setSessionExpiredHandler } from './drive/drive';
import { LibraryNotFound, loadDriveLibrary, type DriveLocation } from './drive/driveLibrary';
import { DriveSaver } from './drive/save';
import { daysSinceOpened, shelfOf } from './model/library';
import { loadLocalLibrary } from './model/localSource';
import type { ModeKey } from './model/types';
import { closeOkuyucu, forgetBook, initOkuyucu, openOkuyucu } from './okuma/Okuyucu';
import { createRoomScene, type LibraryData, type RoomScene, type View } from './scene';
import { canvas, drawWood, noise } from './scene/textures';
import { updateHint } from './ui/hint';
import { initPanel } from './ui/panel';
import { hideSaveState, initNotFound, initSaveState, setLibraryLoading, setNotFound, showSaveError, showSaved, showSaving } from './ui/driveStatus';
import { closeReader, initReader, isReaderOpen, openReader } from './ui/reader';
import { hideLogin, initLogin, setLoginBusy, setLoginError, setRememberedName, showLogin } from './ui/login';
import { initTopBar, initUserBox, updateCrumb, updateModeButtons, updateUserBox, type LightMode } from './ui/topBar';
import { toast } from './ui/toast';

const app = document.querySelector<HTMLElement>('#app')!;
const stageEl = document.querySelector<HTMLElement>('#stage')!;
const loading = document.querySelector<HTMLElement>('#loading')!;

// Safari: two-finger pinch would zoom the whole page (the viewport tag alone doesn't stop it).
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });

const MODE_FROM_DATA: Record<ModeKey, LightMode> = { otomatik: 'auto', gunduz: 'day', aksam: 'night' };
const MODE_TO_DATA: Record<LightMode, ModeKey> = { auto: 'otomatik', day: 'gunduz', night: 'aksam' };

let data: LibraryData | null = null;
let mode: LightMode = 'auto';
let scene: RoomScene | null = null;
let view: View = 'room';
let openTitle: string | null = null;
let saver: DriveSaver | null = null;   // set while the library comes from Drive
let driveLoc: DriveLocation | null = null;   // with saver: where the book folders are
let deskBook: string | null = null;    // id of the book open on the desk
let ownerName: string | null = null;    // signed-in user (title page: "<ad>'in kitaplığından")

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
    saver?.libraryChanged();
    applyMode();
    if (m === 'auto') toast(isEvening() ? 'Otomatik: saat 18:00\'i geçti, oda akşam modunda.' : 'Otomatik: oda 18:00\'de akşam moduna geçecek.');
  },
  onGoRoom: () => scene?.setView('room')
});

// ---- library source: sample (public/ornek) or Drive ----

const offline = "Drive'a bağlanılamadı. İnternet bağlantını kontrol et ve tekrar dene.";
const errorText = (e: unknown) => e instanceof TypeError || !(e instanceof Error) ? offline : e.message;

// Put new data into the shared holder and rebuild the room.
async function useData(next: { library: LibraryData['library']; books: LibraryData['books'] }, newSaver: DriveSaver | null, loc: DriveLocation | null): Promise<void> {
  await ready;
  if (!data || !scene) return;
  closeOkuyucu();
  forgetBook();
  if (isReaderOpen()) { closeReader(); await new Promise(r => setTimeout(r, 1900)); }   // let the book fly home first
  data.library = next.library;
  data.books = next.books;
  saver = newSaver;
  driveLoc = loc;
  hideSaveState();
  scene.reload();
  if (location.hash !== '#aksam') { mode = MODE_FROM_DATA[data.library.oda.mod]; applyMode(); }
}

async function loadFromDrive(): Promise<void> {
  await ready;
  setNotFound(false);
  setLibraryLoading(true);
  try {
    const r = await loadDriveLibrary();
    // the saver reads from the shared holder, whose contents useData replaces
    await useData(r, new DriveSaver(r.loc, data!, { saving: showSaving, saved: showSaved, failed: showSaveError }), r.loc);
    if (r.warnings.length) toast(r.warnings[0]);
    // dev only: ?test=pdf (&kitap=<kod>) checks the PDF pipeline (task 3.1); not in the build
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('test') === 'pdf') {
      import('./okuma/testPdf').then(m => m.runPdfTest(r)).catch(e => console.error('[test=pdf]', e));
    }
  } catch (e) {
    if (e instanceof LibraryNotFound) setNotFound(true);
    else toast(errorText(e));
  } finally {
    setLibraryLoading(false);
  }
}

async function useSample(): Promise<void> {
  try { await useData(await loadLocalLibrary(), null, null); } catch { toast('Örnek kitaplık yüklenemedi. Sayfayı yenile.'); }
}

initNotFound({
  onRetry: loadFromDrive,
  onSample: () => { setNotFound(false); void useSample(); }
});
initSaveState();
addEventListener('beforeunload', e => { if (saver?.hasUnsaved) e.preventDefault(); });

// ---- Google sign-in ----

// chooseAccount: "Başka bir hesapla giriş yap" (ignore the remembered account)
async function googleSignIn(chooseAccount = false): Promise<void> {
  showLogin();
  setLoginBusy(true);
  try {
    const remembered = chooseAccount ? null : rememberedUser();
    await signIn({ hint: remembered?.email, chooseAccount });
    const user = await getUser();
    rememberUser(user);              // name + e-mail only; the token stays in memory
    setAccountHint(user.email);
    hideLogin();
    ownerName = user.name;
    updateUserBox({ kind: 'user', name: user.name });
    toast(`Hoş geldin, ${user.name}.`);
    // signing in again after the session expired: the Drive library is already here
    if (!saver) await loadFromDrive();
  } catch (e) {
    // our errors carry a Turkish message; a failed fetch (TypeError) means no connection
    showLogin(errorText(e));
  }
}

initLogin({
  onGoogle: () => googleSignIn(),
  onOtherAccount: () => googleSignIn(true),
  onSample: () => { hideLogin(); updateUserBox({ kind: 'sample' }); }
});
initUserBox({
  onSignIn: () => googleSignIn(),
  onSignOut: () => {
    signOut(); rememberUser(null); setAccountHint(undefined); setRememberedName(null);
    ownerName = null;
    updateUserBox({ kind: 'none' }); showLogin();
    if (saver) void useSample();   // don't leave the Drive library on screen
  }
});
setSessionExpiredHandler(() => {
  updateUserBox({ kind: 'none' });
  showLogin('Oturumun süresi doldu. Devam etmek için tekrar Google ile giriş yap.');
});

// The card is shown over the room: first visit "Google ile giriş yap", after a reload "<ad> olarak devam et".
// Google's script is loaded now so the popup opens right on the tap.
setRememberedName(rememberedUser()?.name ?? null);
setAccountHint(rememberedUser()?.email);
// ?demo (portfolio link): skip the card and open the sample library right away
if (new URLSearchParams(location.search).has('demo')) updateUserBox({ kind: 'sample' });
else showLogin();
prepareAuth().catch((e: unknown) => { if (e instanceof AuthError) setLoginError(e.message); });

initReader(() => {
  closeOkuyucu();
  forgetBook();
  deskBook = null;
  scene?.setPaused(false);
  scene?.closeBook();
}, bolumIndex => {
  const b = deskBook ? data?.books.get(deskBook) : undefined;
  if (!b) return;
  const folderId = driveLoc?.bookFolderIds.get(b.id);
  if (!folderId) { toast('Sayfaları görmek için Google ile giriş yap. Örnek kitaplıkta dosya yok.'); return; }
  // the room is behind the reader: don't draw it (it stays paused under the contents page too)
  scene?.setPaused(true);
  void openOkuyucu(b, folderId, bolumIndex, () => scene?.setPaused(isReaderOpen()));
});
initOkuyucu();

// Wooden desk + paper texture for the reading view (same as the prototype).
function readerTextures(): void {
  const deskURL = canvas(1024, 1024, (g, w, h) => drawWood(g, w, h, '#8a6444', '#3a2414', 23, 220)).toDataURL('image/jpeg', .85);
  document.querySelector<HTMLElement>('#reader')!.style.setProperty('--deskImg', `url(${deskURL})`);
  const paperURL = canvas(256, 256, (g, w, h) => { g.fillStyle = '#fbf7ef'; g.fillRect(0, 0, w, h); noise(g, w, h, 9, 3); }).toDataURL();
  app.style.setProperty('--paperImg', `url(${paperURL})`);
}

let ready: Promise<void>;

async function boot(): Promise<void> {
  try {
    data = await loadLocalLibrary();
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
    onBookOpening: id => { openTitle = d.books.get(id)!.baslik; updateChrome(); },
    onBookOnDesk: id => {
      const b = d.books.get(id)!;
      deskBook = id;
      const shelf = shelfOf(d.library, id);
      openReader(b, { shelfName: shelf >= 0 ? d.library.raflar[shelf].ad : null, daysSinceOpened: daysSinceOpened(b), owner: saver ? ownerName : null });
      b.sonAcilis = new Date().toISOString();   // in memory only in phase 1
      setTimeout(() => { if (isReaderOpen()) scene?.setPaused(true); }, 400);
    },
    onBookClosed: () => { openTitle = null; updateChrome(); },
    onLibraryChanged: () => saver?.libraryChanged(),
    onToast: toast
  });

  // dev only: ?export=oda downloads the room for Blender (Faz 2)
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('export') === 'oda') {
    scene.exportRoom()
      .then(() => toast('oda-kaynak.glb indirildi. blender/assets/ klasörüne taşı.'))
      .catch(() => toast('Oda dışa aktarılamadı. Konsoldaki hataya bak.'));
  }

  initPanel(d, {
    shelvesChanged: () => { scene?.shelvesChanged(); saver?.libraryChanged(); },
    bookChanged: id => { scene?.refreshBook(id); saver?.coverChanged(id); },
    roomChanged: () => { scene?.applyRoom(d.library.oda); saver?.libraryChanged(); }
  });
  readerTextures();

  // clock + automatic evening switch
  setInterval(() => { scene?.updateClock(); if (mode === 'auto') applyMode(); }, 20000);

  let rt: number | undefined;
  addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => scene?.resize(), 120); });

  loading.hidden = true;
}

ready = boot();
