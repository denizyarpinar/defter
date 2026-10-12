import './styles.css';
import { AuthError, prepareAuth, signIn, signOut } from './drive/auth';
import { getUserName, setSessionExpiredHandler } from './drive/drive';
import { daysSinceOpened, shelfOf } from './model/library';
import { loadLocalLibrary } from './model/localSource';
import type { ModeKey } from './model/types';
import { createRoomScene, type LibraryData, type RoomScene, type View } from './scene';
import { canvas, drawWood, noise } from './scene/textures';
import { updateHint } from './ui/hint';
import { initPanel } from './ui/panel';
import { initReader, isReaderOpen, openReader } from './ui/reader';
import { hideLogin, initLogin, setLoginBusy, setLoginError, showLogin } from './ui/login';
import { initTopBar, initUserBox, updateCrumb, updateModeButtons, updateUserBox, type LightMode } from './ui/topBar';
import { toast } from './ui/toast';

const app = document.querySelector<HTMLElement>('#app')!;
const stageEl = document.querySelector<HTMLElement>('#stage')!;
const loading = document.querySelector<HTMLElement>('#loading')!;

const MODE_FROM_DATA: Record<ModeKey, LightMode> = { otomatik: 'auto', gunduz: 'day', aksam: 'night' };
const MODE_TO_DATA: Record<LightMode, ModeKey> = { auto: 'otomatik', day: 'gunduz', night: 'aksam' };

let data: LibraryData | null = null;
let mode: LightMode = 'auto';
let scene: RoomScene | null = null;
let view: View = 'room';
let openTitle: string | null = null;

const isEvening = () => { const h = new Date().getHours(); return h >= 18 || h < 6; };
const effectiveMode = (): 'day' | 'night' => mode === 'auto' ? (isEvening() ? 'night' : 'day') : mode;

function applyMode(instant = false): void {
  const m = effectiveMode();
  const changed = app.dataset.mode !== m;
  app.dataset.mode = m;
  document.body.style.background = m === 'night' ? '#0e1527' : '#d8c3a2';
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
    if (data) data.library.oda.mod = MODE_TO_DATA[m];   // in memory; saved to Drive in task 1.5
    applyMode();
    if (m === 'auto') toast(isEvening() ? 'Otomatik: saat 18:00\'i geçti, oda akşam modunda.' : 'Otomatik: oda 18:00\'de akşam moduna geçecek.');
  },
  onGoRoom: () => scene?.setView('room')
});

// ---- Google sign-in (task 1.4). The library still comes from public/ornek until Drive reading is added. ----

async function googleSignIn(): Promise<void> {
  showLogin();
  setLoginBusy(true);
  try {
    await signIn();
    const name = await getUserName();
    hideLogin();
    updateUserBox({ kind: 'user', name });
    toast(`Hoş geldin, ${name}.`);
  } catch (e) {
    // our errors carry a Turkish message; a failed fetch (TypeError) means no connection
    const offline = 'Drive\'a bağlanılamadı. İnternet bağlantını kontrol et ve tekrar dene.';
    showLogin(e instanceof TypeError || !(e instanceof Error) ? offline : e.message);
  }
}

initLogin({
  onGoogle: googleSignIn,
  onSample: () => { hideLogin(); updateUserBox({ kind: 'sample' }); }
});
initUserBox({
  onSignIn: googleSignIn,
  onSignOut: () => { signOut(); updateUserBox({ kind: 'none' }); showLogin(); }
});
setSessionExpiredHandler(() => {
  updateUserBox({ kind: 'none' });
  showLogin('Oturumun süresi doldu. Devam etmek için tekrar Google ile giriş yap.');
});

// First visit: the card is shown over the room. Load Google's script now so the popup opens right on the click.
showLogin();
prepareAuth().catch((e: unknown) => { if (e instanceof AuthError) setLoginError(e.message); });

initReader(() => {
  scene?.setPaused(false);
  scene?.closeBook();
});

// Wooden desk + paper texture for the reading view (same as the prototype).
function readerTextures(): void {
  const deskURL = canvas(1024, 1024, (g, w, h) => drawWood(g, w, h, '#8a6444', '#3a2414', 23, 220)).toDataURL('image/jpeg', .85);
  document.querySelector<HTMLElement>('#reader')!.style.setProperty('--deskImg', `url(${deskURL})`);
  const paperURL = canvas(256, 256, (g, w, h) => { g.fillStyle = '#fbf7ef'; g.fillRect(0, 0, w, h); noise(g, w, h, 9, 3); }).toDataURL();
  app.style.setProperty('--paperImg', `url(${paperURL})`);
}

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

  scene = createRoomScene(stageEl, {
    data: d,
    night: effectiveMode() === 'night',
    onViewChange: v => { view = v; updateChrome(); },
    onBookOpening: id => { openTitle = d.books.get(id)!.baslik; updateChrome(); },
    onBookOnDesk: id => {
      const b = d.books.get(id)!;
      const shelf = shelfOf(d.library, id);
      openReader(b, { shelfName: shelf >= 0 ? d.library.raflar[shelf].ad : null, daysSinceOpened: daysSinceOpened(b) });
      b.sonAcilis = new Date().toISOString();   // in memory only in phase 1
      setTimeout(() => { if (isReaderOpen()) scene?.setPaused(true); }, 400);
    },
    onBookClosed: () => { openTitle = null; updateChrome(); },
    onToast: toast
  });

  initPanel(d, {
    shelvesChanged: () => scene?.shelvesChanged(),
    bookChanged: id => scene?.refreshBook(id),
    roomChanged: () => scene?.applyRoom(d.library.oda)
  });
  readerTextures();

  // clock + automatic evening switch
  setInterval(() => { scene?.updateClock(); if (mode === 'auto') applyMode(); }, 20000);

  let rt: number | undefined;
  addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => scene?.resize(), 120); });

  loading.hidden = true;
}

boot();
