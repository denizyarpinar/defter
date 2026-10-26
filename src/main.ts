import './styles.css';
import { gidisPlani } from './arama/aramaPaneliDurumu';
import { agacAl, agacGecersiz } from './arama/kitaplikAgaci';
import { kitaplikAra, type KitaplikSonucu } from './arama/kitaplikAra';
import { ornekAgac, type OrnekAgaci } from './arama/ornekAgac';
import { AuthError, aktifKapsam, isSignedIn, kapsamDurumu, prepareAuth, rememberUser, rememberedUser, setSahip, signIn, signOut } from './drive/auth';
import { darZorlaUrl, girisKapsami, includeGranted, sahipMi, sahipZorlaYok, tamErisimDugmesi } from './drive/kapsam';
import { getUser, setAccountHint, setSessionExpiredHandler } from './drive/drive';
import { LibraryNotFound, loadDriveLibrary, sonKok, type DriveLocation } from './drive/driveLibrary';
import type { KitapIslemi } from './drive/kitapOlustur';
import { driveKurulumApi, kitaplikKur, KurulumIzinYok, webOrnekKaynak } from './drive/kurulum';
import { bekleyenFotoDepo } from './defter/bekleyenFoto';
import { acilisToastMetni } from './defter/fotoEklemeMetin';
import { ReadingSaver, driveReadingApi } from './drive/okumaKaydi';
import { driveIcindekilerApi, uniteKlasorDurumu, type IcindekilerKuyrugu } from './drive/icindekilerYaz';
import { driveKitapCopApi } from './drive/kitapCop';
import { driveDosyaCopApi } from './drive/dosyaCop';
import { icindekilerBaglamiKur, type IcindekilerBaglantisi } from './ui/icindekilerBaglami';
import { copAkisiKur } from './ui/copAkisi';
import { DriveSaver } from './drive/save';
import { daysSinceOpened, shelfOf } from './model/library';
import { loadLocalLibrary, type LoadedLibrary } from './model/localSource';
import { parseLibrary } from './model/parse';
import type { Book, ModeKey } from './model/types';
import { usesUnits } from './model/units';
import { markOpened, setReadingSink, type Resume } from './okuma/okumaDurumu';
import type { MaterialKind } from './okuma/konuKesfi';
import { sampleBookFolder, sampleFolders } from './okuma/ornekKaynak';
import { bekleyenKalemIdleri, closeOkuyucu, forgetBook, fotoYuklemeSuruyor, initOkuyucu, isOkuyucuOpen, kalemKaydiCihazaYaz, kalemYuklemeSuruyor, okuyucuAra, okuyucuKonumu, okuyucuOturumKapandi, openOkuyucu, openOkuyucuDuzenle, sayfaEklemeOrtami, setDosyaCop, setIcindekilerBaglami, setKlasorAcma, setSayfaIsi } from './okuma/Okuyucu';
import { createRoomScene, type LibraryData, type RoomScene, type View } from './scene';
import { canvas, drawWood, noise } from './scene/textures';
import { updateHint } from './ui/hint';
import { initPanel } from './ui/panel';
import { hideSaveState, initFullAccess, initKurulum, initLibError, initSaveState, ornekIstendi, setFullAccess, setKurulum, setLibError, setLibraryLoading, showSaveError, showSaved, showSaving } from './ui/driveStatus';
import { etkinYazici, gecis, gorunum, ilkDurum, type KitaplikDurumu, type KitaplikOlayi } from './ui/kitaplikDurumu';
import { kartSec, KurulumAkisi } from './ui/kurulumDurumu';
import type { SihirbazKilidi } from './ui/kitapSihirbaziDurumu';
import { closeReader, initReader, isReaderOpen, openReader, readerShell, refreshReader } from './ui/reader';
import { initAramaPaneli, type AramaKaynagi } from './ui/aramaPaneli';
import { hideLogin, initLogin, setLoginBusy, setRememberedName, showLogin } from './ui/login';
import { initTopBar, initUserBox, updateCrumb, updateModeButtons, updateUserBox, type LightMode } from './ui/topBar';
import { installErrorBox } from './ui/hataKutusu';
import { installPageZoomGuard } from './ui/sayfaZoom';
import { installGorunurAlan } from './ui/gorunurAlan';
import { toast } from './ui/toast';
import { installKalemOlcumWindow } from './kalem/kalemOlcum';
import { acikSecimVar, adresteLangVar, dil, dilSec, t, type Dil } from './dil';
import { bekleyenOku, bekleyenSil, bekleyenYaz, driveDilOku, tercihKarari, yenilendiMi, yenilendiYaz } from './dil/driveTercih';
import { dilTercihiYaz, driveDilApi } from './drive/dilTercihi';
import { htmlDoldur } from './dil/html';
import { donusAl, donusYaz, type DilDonus } from './dil/donus';
import { dilDugmeleriGuncelle, dilDugmeleriKur } from './ui/dilDugmesi';

// task 6.5-1: index.html's fixed texts in the chosen language, before anything shows them
htmlDoldur();

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
// task 6.H2: window.defterKalemOlcum() — the last 50 pen strokes as JSON (development, and ?olcum=1)
installKalemOlcumWindow();

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

// dev only (task 6.K2a): window.defterKokDurumu() (reads only), window.defterKurulumDene() (requires a signed-in, writable context)
if (import.meta.env.DEV) void import('./drive/kurulumDene').then(m => m.installKurulumDene(() => aktifKapsam(), () => isSignedIn() && durum.tur !== 'demo'));
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
// dev only (task 6.3d): window.defterKitaplikAra(q) — library search (tree + names + Drive fullText); GET requests only
if (import.meta.env.DEV) void import('./arama/kitaplikAraDene').then(m => m.installKitaplikAra(() => driveLoc && data ? { loc: driveLoc, books: data.books, library: data.library } : null));
// dev only (task 6.3f): window.defterDizinOlc(kelime) — how long until Drive's fullText finds a new file; GET requests only
if (import.meta.env.DEV) void import('./arama/dizinOlc').then(m => m.installDizinOlc(() => driveLoc && data ? { loc: driveLoc, books: data.books, library: data.library } : null));
// dev only (task 6.4c-3 A): window.defterOcrDizinOlc(kelime?) — does fullText find the words in the .ocr.json files; GET requests only
if (import.meta.env.DEV) void import('./arama/ocrDizinOlc').then(m => m.installOcrDizinOlc(() => driveLoc && data ? { loc: driveLoc, books: data.books, library: data.library } : null));
// dev only (task 5.8e): window.defterBekleyenFoto() lists the pending photo records; .dene() / .hata(id) / .sil(id); no Drive
if (import.meta.env.DEV) void import('./defter/bekleyenFotoDene').then(m => m.installBekleyenFoto());
// dev only (task 5.8b): ?kirpTest=1 compares two page-cropping methods on real photos; writes nothing
if (import.meta.env.DEV && new URLSearchParams(location.search).get('kirpTest') === '1') {
  import('./defter/kirp/kirpTest').then(m => m.acKirpTest()).catch(e => toast(`Kırpma testi açılamadı: ${e}`));
}
// dev only (task 6.H2b): ?kalemTest=1 draws pen records (or samples) the old and the new way side by side; writes nothing
if (import.meta.env.DEV && new URLSearchParams(location.search).get('kalemTest') === '1') {
  import('./kalem/kalemTest').then(m => m.acKalemTest()).catch(e => toast(`Kalem testi açılamadı: ${e}`));
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
  setKurulum(v.kurulum);
  setFullAccess(v.kart === 'tamErisim', v.tamErisimMesgul, v.tamErisimHata);
  setLibError(v.hataMesaji);
  if (v.kilitli) app.dataset.kilit = ''; else delete app.dataset.kilit;
  scene?.setLocked(v.kilitli);
  bosIpucu();
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
  bosIpucu();
}

// ---- task 6.K4a: "Yeni kitap" wizard (only in a Drive library, never in the sample one) ----
// Task 6.K4b: "Oluştur" writes the book (kitapOlustur.ts) — in the app's own root (defterKok), after a user action.
// Task 6.K4c: also in the owner's "Kitaplık" (with the same root validation).

function yeniKitapAcik(): boolean {
  return durum.tur === 'drive' && !!data;
}

function yeniKitapAc(): void {
  const d = data;
  if (!yeniKitapAcik() || !d) return;
  import('./ui/kitapSihirbazi')
    .then(m => m.kitapSihirbaziAc({
      raflar: d.library.raflar.map(s => ({ id: s.id, ad: s.ad })), mevcutIdler: [...d.books.keys()], olcum: OLCUM,
      kilit: sihirbazKilidi(), olustur: kitapOlusturDugmesi, girisYap: () => googleSignIn(),
      yarimCopeAt: (ad, klasorId) => copAkisi.yarimCopeAt(ad, klasorId)
    }))
    .catch(e => toast(t('kitaplik.sihirbazAcilamadi', { hata: String(e) })));
}

const OLCUM = new URLSearchParams(location.search).get('olcum') === '1';

// The loaded root: our own (defterKok) or the owner's "Kitaplık" (by name, 6.K4c); both require a signed-in Drive context
function kokKaynagi(): 'defterKok' | 'ad' | null {
  const k = sonKok();
  return !k || k.tur === 'yok' ? null : k.tur === 'cokKok' ? 'defterKok' : k.kaynak;
}

function sihirbazKilidi(): SihirbazKilidi {
  return isSignedIn() && durum.tur === 'drive' && kokKaynagi() !== null ? 'acik' : 'kilitli';
}

// dev only: window.defterSihirbazHata = n → a made-up network error at item n (once); -n: after writing it
function yapayHata(): number | undefined {
  if (!import.meta.env.DEV) return undefined;
  const w = window as { defterSihirbazHata?: unknown };
  const n = w.defterSihirbazHata;
  delete w.defterSihirbazHata;
  return typeof n === 'number' && n !== 0 ? n : undefined;
}

// Errors go back to the wizard (it stays open); success: the library again, then the toast
async function kitapOlusturDugmesi(islem: KitapIslemi, ilerleme: (i: number, n: number) => void): Promise<void> {
  // a shelf change not written yet would write the old shelves over the new entry
  if (saver?.hasUnsaved) throw new Error(t('kitaplik.rafKaydediliyor'));
  const loc = driveLoc;
  const { driveKitapOlusturApi, kitapOlustur, KitapOlusturYazmaYok } = await import('./drive/kitapOlustur');
  if (!loc || durum.tur !== 'drive') throw new KitapOlusturYazmaYok();
  const sonuc = await kitapOlustur(driveKitapOlusturApi, islem, {
    kilitAcik: sihirbazKilidi() === 'acik', kokKaynagi: kokKaynagi(), kokId: loc.rootId,
    yazabilir: () => isSignedIn() && durum.tur === 'drive', ilerleme, yapayHata
  });
  const baslik = String(islem.plan.kitapJson.baslik);
  try {
    await kitaplikYenile();
    toast(sonuc.kitaplikYok ? t('kitaplik.olusturulduRafsiz', { ad: baslik }) : t('kitaplik.olusturuldu', { ad: baslik }));
  } catch (e) {
    console.warn('Kitaplık yenilenemedi.', e);
    toast(t('kitaplik.olusturulduYenilenemedi', { ad: baslik }));
  }
}

// The room's hint; an empty Drive library shows "Kitaplığın boş · ＋ Yeni kitap" in its place
function bosIpucu(): void {
  updateHint(view, openTitle !== null);
  const btn = document.querySelector<HTMLElement>('#bosKitaplik');
  if (!btn) return;
  const v = gorunum(durum);
  const goster = yeniKitapAcik() && data!.books.size === 0 && view === 'room' && openTitle === null && !v.kilitli && v.kart === null;
  btn.hidden = !goster;
  if (goster) document.querySelector<HTMLElement>('#hint')!.hidden = true;
}
document.querySelector('#bosKitaplik')?.addEventListener('click', yeniKitapAc);

initTopBar({
  onSearch: () => aramaPaneli.ac(),
  onModeChange: m => {
    mode = m;
    if (data) data.library.oda.mod = MODE_TO_DATA[m];
    writer()?.libraryChanged();
    applyMode();
    if (m === 'auto') toast(t(isEvening() ? 'ustCubuk.mod.otomatikAksam' : 'ustCubuk.mod.otomatikGunduz'));
  },
  onGoRoom: () => scene?.setView('room')
});

// ---- library source: sample (public/ornek) or Drive ----

const errorText = (e: unknown) => e instanceof TypeError || !(e instanceof Error) ? t('genel.agHatasi') : e.message;

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
  agacGecersiz();   // task 6.3d: the search tree is built again from the new library
  // reading state: written only to a Drive library (the sample library has no writer)
  reading?.dispose();
  reading = loc ? new ReadingSaver(id => loc.bookFileIds.get(id), driveReadingApi, { saving: () => {}, saved: showSaved, failed: showSaveError }) : null;
  const r = reading;
  setReadingSink(r ? (id, patch) => r.change(id, patch) : null);
  icindekilerKur(loc);
  hideSaveState();
  scene.reload();
  bosIpucu();
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
    const r = await loadDriveLibrary(aktifKapsam() === 'tam' ? 'tam' : 'dar');
    if (!current()) return;
    // the saver reads from the shared holder, whose contents useData replaces
    if (!await useData(r, driveSaver(r.loc), r.loc)) return;
    olay({ tur: 'driveGeldi' });
    if (dilTercihiUygula(r.library.extra, r.loc)) return;   // task 6.5-2b: reloading in Drive's language
    if (r.warnings.length) uyar(r.warnings[0]);
    remindPendingPhotos();
    donusUygula('drive');
  } catch (e) {
    if (!current()) return;
    if (!(e instanceof LibraryNotFound)) { olay({ tur: 'driveHata', mesaj: errorText(e) }); return; }
    // task 6.K2b: no root / half set up → "Kitaplığını kur" (the owner with drive.file: the full access card first)
    if (e.kok.tur !== 'yok' && e.kok.uyari) uyar(e.kok.uyari);
    const k = kartSec({ sahip: kapsamDurumu().sahip === true, aktif: aktifKapsam(), kok: e.kok, kilitAcik: isSignedIn() });
    if (k.kart === 'tamErisim') { olay({ tur: 'tamErisimGerekli' }); return; }
    kurulum.yeniKart();
    olay({ tur: 'kurulumGerekli', dugme: k.kart === 'kurulum' ? k.dugme : e.dugme, kilitli: !isSignedIn() });
  }
}

const driveSaver = (loc: DriveLocation) => new DriveSaver(loc, data!, { saving: showSaving, saved: showSaved, failed: showSaveError, warn: toast });

// Task 6.K4b: the Drive library read again (a new book), the state stays 'drive'
async function kitaplikYenile(): Promise<void> {
  const r = await loadDriveLibrary(aktifKapsam() === 'tam' ? 'tam' : 'dar');
  if (durum.tur !== 'drive') return;
  await useData(r, driveSaver(r.loc), r.loc);
  if (r.warnings.length) uyar(r.warnings[0]);
}

// ---- task 6.K5a: the contents' edit mode (the reader's panel; drive/icindekilerYaz.ts) ----
// Only a Drive library; writing requires a signed-in, writable context. Before every write the book's other kitap.json writers
// (ribbon / status, cover) finish what is waiting, so they don't write over each other.

let icKuyruk: IcindekilerKuyrugu | null = null;
let icBaglanti: IcindekilerBaglantisi | null = null;

// task 6.K5a-2: the queue and the panel's context in ui/icindekilerBaglami.ts (one refresh way for every write)
function icindekilerKur(loc: DriveLocation | null): void {
  if (!loc) { icKuyruk = null; icBaglanti = null; setIcindekilerBaglami(null); return; }
  const baglanti = icindekilerBaglamiKur({
    drive: driveIcindekilerApi,
    secenek: kitapId => ({
      kilitAcik: sihirbazKilidi() === 'acik', kokKaynagi: kokKaynagi(), kokId: loc.rootId,
      yazabilir: () => isSignedIn() && durum.tur === 'drive' && driveLoc === loc,
      surum: data?.books.get(kitapId)?.surum ?? 0,
      kitapKlasorId: loc.bookFolderIds.get(kitapId), kitapJsonId: loc.bookFileIds.get(kitapId),
      oncesi: async () => { await reading?.flush(); await saver?.bekleyenleriYaz(); }
    }),
    // useData binds the panel before the loading state changes to 'drive'.
    // Each operation still checks the current Drive state through secenek().yazabilir.
    kilitAcik: isSignedIn() && kokKaynagi() !== null,
    hasJson: b => b.hasJson && loc.bookFileIds.has(b.id),
    uniteKlasorleri: async b => {
      const id = loc.bookFolderIds.get(b.id);
      return id ? uniteKlasorDurumu(driveIcindekilerApi, id, b.uniteler) : b.uniteler.map(() => null);
    },
    kitap: id => data?.books.get(id),
    yenile: () => { agacGecersiz(); refreshReader(); },   // the search tree knows the new topic / name
    jsonOku: async id => {
      const fileId = loc.bookFileIds.get(id);
      if (!fileId) throw new Error('kitap.json yok');
      return driveIcindekilerApi.jsonOku(fileId);
    },
    girisYap: () => { void googleSignIn(); },
    copIste: (b, hedef) => copAkisi.copIste(b, hedef)
  });
  icBaglanti = baglanti;
  icKuyruk = baglanti.kuyruk;
  setIcindekilerBaglami(baglanti.baglam);
}

// ---- task 6.K5b: a topic / unit / book / half-made book to the trash (ui/copAkisi.ts; validated Drive context) ----
const copAkisi = copAkisiKur({
  kilitAcik: () => sihirbazKilidi() === 'acik',
  kokKaynagi,
  yazabilir: () => isSignedIn() && durum.tur === 'drive',
  loc: () => driveLoc,
  icApi: driveIcindekilerApi,
  kitapApi: driveKitapCopApi,
  dosyaApi: driveDosyaCopApi,
  baglanti: () => icBaglanti,
  bekleyenKalem: bekleyenKalemIdleri,
  bekleyenFoto: async () => (await bekleyenFotoDepo.hepsi()).map(k => k.konuKlasorId),
  oncesi: async () => { await reading?.flush(); await saver?.bekleyenleriYaz(); },
  mesgul: () => icKuyruk?.hasUnsaved ? t('kitaplik.icindekilerKaydediliyor') : null,
  kitaplikYenile,
  girisYap: () => googleSignIn()
});

// ---- task 6.K6a: "Dosya ekle" may make a topic's missing Uebungen / Oedevler (in a validated Drive context) ----
setKlasorAcma(() => driveLoc && sihirbazKilidi() === 'acik' ? { kokId: driveLoc.rootId } : null);

// ---- task 6.K6b: the reader's open file to the trash (validated Drive context; ui/copAkisi.ts) ----
setDosyaCop({
  acik: () => !!driveLoc && sihirbazKilidi() === 'acik',
  iste: d => copAkisi.dosyaCopIste(d)
});

// ---- task 6.S-4: a blank page between pages: kitap.json's ribbons follow (the reader's job, drive/jsonDegistir.ts) ----
setSayfaIsi({
  kitapJsonId: id => driveLoc?.bookFileIds.get(id),
  jsonDrive: driveDosyaCopApi,
  kitap: id => data?.books.get(id),
  oncesi: async () => { await reading?.flush(); await saver?.bekleyenleriYaz(); }
});

// The same warning (e.g. two "Defter Library" roots) only once per page load
const uyarilar = new Set<string>();
function uyar(metin: string): void {
  if (uyarilar.has(metin)) return;
  uyarilar.add(metin);
  toast(metin);
}

// ---- task 6.K2b: "Kitaplığını kur" (kurulum.ts; starts only on a user click) ----

const kurulum = new KurulumAkisi(() => crypto.randomUUID());

function kitaplikKurDugmesi(): void {
  if (durum.tur !== 'kurulum' || !kurulum.basla(isSignedIn())) return;   // signed out or running: no request
  olay({ tur: 'kurulumBasladi' });
  const yazabilir = () => isSignedIn() && durum.tur !== 'demo';   // as the K2a dev helper
  // task 6.K3: the box checked → the sample book too, with its progress on the button
  const ornek = ornekIstendi() ? { kaynak: webOrnekKaynak(), ilerleme: (i: number, n: number) => olay({ tur: 'kurulumIlerleme', i, n }) } : undefined;
  kitaplikKur(driveKurulumApi, { islemId: kurulum.islemId, mod: aktifKapsam() === 'tam' ? 'tam' : 'dar', kilitAcik: yazabilir(), yazabilir, ornek,
    dil: adresteLangVar() ? undefined : dil() })   // task 6.5-2b: a shared link's ?lang is not written
    .then(async r => {
      kurulum.bitti();
      if (r.uyari) uyar(r.uyari);
      if (r.ornekHata) console.warn('Örnek kitap eklenemedi:', r.ornekHata);
      olay({ tur: 'kurulumBitti' });
      await loadFromDrive();
      if (durum.tur === 'drive') toast(r.ornekHata ? t('kitaplik.hazirOrneksiz') : t('kitaplik.hazir'));
    }, (e: unknown) => {
      kurulum.bitti();
      olay({ tur: 'kurulumHata', mesaj: errorText(e), izinYok: e instanceof KurulumIzinYok });
    });
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
  try { if (await useData(await loadLocalLibrary(), null, null)) donusUygula('demo'); } catch { olay({ tur: 'demoHata', mesaj: t('kitaplik.ornekYuklenemedi') }); }
}

initKurulum({ onSetup: kitaplikKurDugmesi, onSignIn: () => void googleSignIn(), onSample: () => void useSample() });
initLibError({ onRetry: retryDrive, onSample: () => void useSample() });
initSaveState();
// task 6.2e-2: photos still uploading too (they stay on the device either way)
addEventListener('beforeunload', e => { if (saver?.hasUnsaved || icKuyruk?.hasUnsaved || fotoYuklemeSuruyor()) e.preventDefault(); });
// tab hidden / page closed: write the reading state now (keepalive: may finish after the page is gone)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void reading?.flush(true); });
addEventListener('pagehide', () => { void reading?.flush(true); });

// ---- Google sign-in ----

// Task 6.K1: everyone drive.file, the owner (VITE_SAHIP_EPOSTA) full drive. Not security: it only picks the
// permission to ask for. Test switches: ?kapsam=dar (drive.file only), ?sahip=0 (not the owner).
const SAHIP_EPOSTA = import.meta.env.VITE_SAHIP_EPOSTA as string | undefined;
const DAR_ZORLA = darZorlaUrl(location.search);
const SAHIP_YOK = sahipZorlaYok(location.search);
let girisEposta: string | undefined;

// chooseAccount: "Başka bir hesapla giriş yap" (ignore the remembered account)
async function googleSignIn(chooseAccount = false): Promise<void> {
  const fromSample = durum.tur === 'demo';
  olay({ tur: 'girisBasladi' });
  try {
    const remembered = chooseAccount ? null : rememberedUser();
    const kapsam = girisKapsami({ sahipEposta: SAHIP_EPOSTA, hatirlananEposta: remembered?.email, darZorla: DAR_ZORLA, sahipYok: SAHIP_YOK });
    // first: the popup opens on the tap
    const signedIn = signIn({ hint: remembered?.email, chooseAccount, kapsam, includeGranted: includeGranted(DAR_ZORLA) });
    if (fromSample) { updateUserBox({ kind: 'none' }); void useData(emptyLibrary(), null, null); }   // no sample books while signing in
    await signedIn;
    if (durum.tur !== 'giriliyor' && durum.tur !== 'drive') return;   // the sample library was chosen meanwhile
    const user = await getUser();
    rememberUser(user);              // name + e-mail only; the token stays in memory
    setAccountHint(user.email);
    girisEposta = user.email;
    const sahip = sahipMi(user.email, SAHIP_EPOSTA, SAHIP_YOK);
    setSahip(sahip);
    ownerName = user.name;
    updateUserBox({ kind: 'user', name: user.name });
    olay({ tur: 'girisBasarili' });
    toast(t('giris.hosgeldin', { ad: user.name }));
    // signing in again after the session expired: the Drive library is already here (state 'drive')
    if (!gorunum(durum).yukleniyor) return;
    // the owner with drive.file only: offer full access (no popup here, only on the card's tap)
    if (tamErisimDugmesi({ sahip, aktif: aktifKapsam() })) { olay({ tur: 'tamErisimGerekli' }); return; }
    await loadFromDrive();
  } catch (e) {
    // our errors carry a Turkish message; a failed fetch (TypeError) means no connection
    olay({ tur: 'girisHata', mesaj: errorText(e) });
  }
}

// "Tam erişimi aç": the popup opens right on the tap; earlier grants included (also with ?kapsam=dar)
function openFullAccess(): void {
  olay({ tur: 'tamErisimBasladi' });
  signIn({ kapsam: 'tam', hint: girisEposta, includeGranted: true }).then(async () => {
    if (aktifKapsam() !== 'tam') {
      olay({ tur: 'tamErisimHata', mesaj: t('tamErisim.verilmedi') });
      return;
    }
    olay({ tur: 'tamErisimVerildi' });
    await loadFromDrive();
  }, (e: unknown) => olay({ tur: 'tamErisimHata', mesaj: errorText(e) }));
}

initFullAccess({ onOpen: openFullAccess, onSample: () => void useSample() });

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
    okuyucuOturumKapandi();   // task 6.4e-2: handwriting records and the atlas belong to this account
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
  olay({ tur: 'oturumDoldu', mesaj: t('kitaplik.oturumDoldu') });
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
}, konuAc, () => {
  // task 6.K5b-3: "İçindekileri düzenle" (also a book without topics: + Ünite, Kitabı çöpe at)
  const b = deskBook ? data?.books.get(deskBook) : undefined;
  const folderId = b && bookFolder(b);
  if (!b || !folderId) return;
  scene?.setPaused(true);
  openOkuyucuDuzenle(b, folderId, okuyucuClosed);
});

// A topic of the book on the desk in the full-screen reader (the contents page, the ribbon, the language change's return)
function konuAc(unit: number, topic: number, resume?: Resume): void {
  const b = deskBook ? data?.books.get(deskBook) : undefined;
  if (!b) return;
  const folderId = bookFolder(b);
  if (!folderId) { toast(t('kitaplik.ornekteDosyaYok')); return; }
  // the room is behind the reader: don't draw it (it stays paused under the contents page too)
  scene?.setPaused(true);
  void openOkuyucu(b, folderId, unit, topic, okuyucuClosed, resume);
}

// ---- task 6.5-1: the language change (a reload) and the way back to the same place ----
// Before the reload: the reading state, the shelves / cover and the pen's records are written (the button is off while
// something is still being saved). After it: the book on the desk again, the reader on the same topic / material / page.

let donus: DilDonus | null = donusAl();
let bekleyenOkuyucu: (DilDonus['okuyucu'] & { kitapId: string }) | null = null;

let dilYaziliyor = false;   // task 6.5-2b: the choice is being written to Drive (at most DIL_YAZ_MS)

const dilMesgul = (): boolean => !!(dilYaziliyor || saver?.hasUnsaved || icKuyruk?.hasUnsaved || fotoYuklemeSuruyor() || kalemYuklemeSuruyor());

async function dilDegistir(d: Dil): Promise<void> {
  if (dilMesgul()) { toast(t('dil.mesgul')); return; }
  try {
    await reading?.flush();
    await saver?.bekleyenleriYaz();
    await kalemKaydiCihazaYaz();
  } catch (e) { console.warn('Dil değişmeden önce kayıt yazılamadı.', e); }
  // a reload now would lose what is still only in memory
  if (reading?.hasUnsaved || saver?.hasUnsaved) { toast(t('dil.mesgul')); return; }
  const k = okuyucuKonumu();
  const kitapId = k?.kitapId ?? deskBook;
  if (kitapId && (durum.tur === 'demo' || durum.tur === 'drive')) {
    donusYaz({
      kaynak: durum.tur, kitapId,
      okuyucu: k ? { unit: k.unit, topic: k.topic, materyal: k.materyal, dosya: k.dosya, sayfa: k.sayfa, mod: k.mod } : undefined
    });
  }
  dilYaziliyor = true;
  dilDugmeleriGuncelle();
  await dilDriveYaz(d);
  dilSec(d);
}

// ---- task 6.5-2b: the language choice in kitaplik.json (ayarlar.dil; dil/driveTercih.ts decides) ----

const DIL_YAZ_MS = 3000;

// Before the reload: the choice into the signed-in Drive library, waiting at most 3 s. It is remembered as
// waiting ("bekleyen", tied to this kitaplik.json) until Drive has it: a failure or a timeout doesn't stop the
// change, the next opening writes it. The sample library / signed out: nothing.
async function dilDriveYaz(d: Dil): Promise<void> {
  const fileId = writer() ? driveLoc?.libraryFileId : null;
  if (!fileId) return;
  bekleyenYaz({ dil: d, fileId });
  let zaman = 0;
  try {
    await Promise.race([
      dilTercihiYaz(driveDilApi, fileId, d),
      new Promise((_, red) => { zaman = window.setTimeout(() => red(new Error('timeout')), DIL_YAZ_MS); })
    ]);
    bekleyenSil();
  } catch (e) {
    console.warn("Dil tercihi Drive'a yazılamadı; bir sonraki açılışta yeniden denenecek.", e);
  } finally {
    clearTimeout(zaman);
  }
}

// After the Drive library is on screen. true: the page is reloading in Drive's language (nothing else to do).
function dilTercihiUygula(extra: Record<string, unknown>, loc: DriveLocation): boolean {
  const fileId = loc.libraryFileId;
  const k = tercihKarari({
    driveDil: driveDilOku(extra), yerelDil: dil(), yerelAcikSecim: acikSecimVar(), yerelBekleyen: bekleyenOku(),
    fileId, adresteLang: adresteLangVar(), buOturumdaYenilendi: yenilendiMi()
  });
  if (k.bekleyenSil) bekleyenSil();
  if (k.eylem === 'yenile' && k.dil) {
    if (!yenilendiYaz()) return false;   // the flag can't be kept (private window): no reload, it could repeat
    if (donus) donusYaz(donus);          // a way back not used yet stays for after the reload
    dilSec(k.dil);
    return true;
  }
  if (k.eylem === 'driveYaz' && k.dil && fileId && writer()) {
    const yaz = k.dil;
    dilTercihiYaz(driveDilApi, fileId, yaz).then(() => {
      const b = bekleyenOku();
      if (b && b.fileId === fileId && b.dil === yaz) bekleyenSil();
    }, e => console.warn("Dil tercihi Drive'a yazılamadı; bir sonraki açılışta yeniden denenecek.", e));
  }
  return false;
}

// The library of that kind is on screen: the book flies to the desk (once; another kind keeps it for later)
function donusUygula(kaynak: DilDonus['kaynak']): void {
  if (!donus || donus.kaynak !== kaynak) return;
  const d = donus;
  donus = null;
  if (!data?.books.has(d.kitapId)) return;
  bekleyenOkuyucu = d.okuyucu ? { ...d.okuyucu, kitapId: d.kitapId } : null;
  if (!scene?.openBook(d.kitapId)) bekleyenOkuyucu = null;
}

// The book landed on the desk: the reader where it was (after the contents page has opened)
function donusOkuyucu(id: string): void {
  const k = bekleyenOkuyucu;
  if (!k || k.kitapId !== id) return;
  bekleyenOkuyucu = null;
  const resume: Resume | undefined = k.materyal
    ? { unit: k.unit, topic: k.topic, materyal: k.materyal as MaterialKind, dosya: k.dosya, sayfa: k.sayfa ?? 1, label: '' }
    : undefined;
  setTimeout(() => { if (deskBook === id && !isOkuyucuOpen()) konuAc(k.unit, k.topic, resume); }, 700);
}

dilDugmeleriKur({ sec: d => void dilDegistir(d), mesgul: dilMesgul });
// the reader has no language button: the return test calls this (development, and ?olcum=1)
if (import.meta.env.DEV || OLCUM) (window as { defterDilSec?: (d: Dil) => void }).defterDilSec = d => void dilDegistir(d);

// The full-screen reader closed: back to the desk (its contents page) or, opened from the search, the library
function okuyucuClosed(): void {
  readerShell(false);
  scene?.setPaused(isReaderOpen());
  void reading?.flush();
  refreshReader();   // status / ribbon on the contents page
}

// sample library: surum 2 books open the demo PDFs in public/demo (task 3.6); surum 1 ones have no files
const bookFolder = (b: Book) => driveLoc ? driveLoc.bookFolderIds.get(b.id) : usesUnits(b) ? sampleBookFolder(b.id) : undefined;

// ---- task 6.3e: library search ----

let ornekAgaci: { books: Map<string, Book>; agac: OrnekAgaci } | null = null;

function aramaKaynagi(): AramaKaynagi | null {
  if (!data) return null;
  const d = data;
  if (driveLoc) {
    const o = { loc: driveLoc, books: d.books, library: d.library };
    return { anahtar: d.books, ornek: false, agac: () => agacAl(o), metin: (q, signal) => kitaplikAra(q, o, { signal }) };
  }
  if (durum.tur !== 'demo') return null;
  return {
    anahtar: d.books, ornek: true,
    agac: async () => {
      if (ornekAgaci?.books !== d.books) ornekAgaci = { books: d.books, agac: ornekAgac(d.library, d.books, sampleFolders()) };
      return ornekAgaci.agac;
    },
    metin: () => Promise.reject(new Error(t('arama.ornekteMetinYok'))),
  };
}

// A result: the book as if tapped; a topic or a file in the full-screen reader (the right tab and file).
// A text result: the reader searches q and goes to the first match.
function aramaSonucunaGit(s: KitaplikSonucu, q: string): void {
  const b = data?.books.get(s.kitapId);
  const p = b ? gidisPlani(s, b) : null;
  if (!b || !p) { toast(t('arama.sonucAcilamadi')); return; }
  if (p.tur === 'kitap') {
    if (deskBook === b.id) return;
    if (!scene?.openBook(b.id)) toast(t('arama.kitapAcilamiyor'));
    return;
  }
  const folderId = bookFolder(b);
  if (!folderId) { toast(t('kitaplik.ornekteDosyaYok')); return; }
  scene?.setPaused(true);
  readerShell(true);
  const resume = p.dosya ? { unit: p.unit, topic: p.topic, materyal: p.dosya.materyal, dosya: p.dosya.ad, sayfa: 1, label: '' } : undefined;
  void openOkuyucu(b, folderId, p.unit, p.topic, okuyucuClosed, resume);
  if (!isOkuyucuOpen()) { okuyucuClosed(); return; }   // it said why (a toast)
  if (p.uyari) toast(p.uyari);
  if (p.metinAra) {
    void okuyucuAra(q, { ilkEslesmeyeGit: true }).then(n => {
      if (n === 0 && isOkuyucuOpen()) toast(t('arama.isaretlenemedi'));
    });
  }
}

const aramaPaneli = initAramaPaneli({
  kaynak: aramaKaynagi,
  acilabilir: () => !isOkuyucuOpen() && !isReaderOpen() && !gorunum(durum).kilitli && gorunum(durum).kart === null && !!scene
    && !document.getElementById('kitapSihirbazi'),
  git: aramaSonucunaGit,
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
    loading.textContent = t('yukleme.ornekHata');
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

  loading.textContent = t('yukleme.oda');
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
      donusOkuyucu(id);
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
    roomChanged: () => { scene?.applyRoom(d.library.oda); writer()?.libraryChanged(); },
    yeniKitap: { acik: yeniKitapAcik, ac: yeniKitapAc }
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
  // task 6.5-1: back from a language change — the sample library again (also without ?demo)
  if (startWithSample) donusUygula('demo');
  else if (donus?.kaynak === 'demo') void useSample();
}

ready = boot();
