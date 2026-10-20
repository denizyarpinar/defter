import { agacGecersiz } from '../arama/kitaplikAgaci';
import { listChildren, SessionExpired } from '../drive/drive';
import { drivePdfApi } from '../drive/pdfYazici';
import { penLayerSvg } from '../kalem/cizimKatmani';
import { IdbPendingStore } from '../kalem/bekleyenDepo';
import { remainingDiff, type PendingRecord } from '../kalem/bekleyenFark';
import { PendingSaver } from '../kalem/bekleyenKayit';
import { PenModel, fileIdOf, versionOf, type Place } from '../kalem/cizimModeli';
import { locative } from '../kalem/gecmis';
import { penLayerMode } from '../kalem/defterNotu';
import { PenToolbar, strokeStyle } from '../kalem/kalemCubugu';
import { PenInput } from '../kalem/kalemModu';
import type { PenViewport } from '../kalem/koordinat';
import { DriveUploader, type UploadDeps, type UploadStatus, type Uploaded } from '../kalem/pdfKayit';
import { OZET_ADI, type KonuEklemeOrtami, type KonuyaEklendi } from '../defter/konuyaEkle';
import { SayfaYazmaYok, type EklenenSayfalar } from '../defter/ozeteEkle';
import { bekleyenFotoDepo } from '../defter/bekleyenFoto';
import type { BekleyenFoto, BekleyenJpeg } from '../defter/bekleyenFotoKayit';
import { FotoEkleyici } from '../defter/fotoEkleme';
import { hazirlikAl, hazirlikEkle, mb, olcumAcik, olcumAl, olcumBaslat, olcumBitir } from '../defter/sureOlcum';
import { seritDurumu } from '../defter/fotoEklemeMetin';
import { DOSYA_ACCEPT, dosyaTuru, ILK_BAYT_SAYISI, type DosyaTuruSonucu } from '../defter/dosyaTuru';
import type { HazirDosya } from '../defter/dosyaHazirla';
import type { DosyaPanelKaynak } from '../ui/dosyaPanel';
import type { SecimKarari } from '../defter/gorselListesi';
import type { TekDosyaYolu } from '../defter/dosyaPanelDurumu';
import type { AltKlasor, DosyaEklemeOrtami, DosyaEklendi, DosyaHedefi } from '../defter/konuyaDosyaEkle';
import type { DriveFile } from '../drive/drive';
import type { DriveLocation } from '../drive/driveLibrary';
import { PdfYazilamaz, readDefterStrokes } from '../kalem/pdfNotlari';
import { drivePdfOlusturApi } from '../drive/pdfOlustur';
import { FotoDurumKutusu } from '../ui/fotoDurum';
import type { Book, ChapterStatus, PageMark } from '../model/types';
import { bookUnits, usesUnits } from '../model/units';
import { esc } from '../ui/dom';
import { bosDurumMetni } from '../ui/icindekilerDurumu';
import { copDugmesiGorunur, copSonrasiSecim, dosyaCopHedefi, geriGelenSecim, materyallerdenCikar } from '../kitap/dosyaCop';
import type { DosyaCopIstegi } from '../ui/copAkisi';
import { bosKonuDurumu, konuKurdelesi, kurdeleSecimi, okumaKaydiYazilsinMi, type BosKonuDurumu } from './bosKonu';
import { IcindekilerDuzenleyici, type IcindekilerBaglami } from '../ui/icindekilerDuzenle';
import { fpsCounter } from '../ui/fps';
import { gorunurAlaniDuzelt } from '../ui/gorunurAlan';
import { installOkuyucuKaydirma } from '../ui/okuyucuKaydirma';
import { setCanvasStats } from '../ui/tani';
import { ST } from '../ui/reader';
import { toast } from '../ui/toast';
import { CanvasBudget, deviceLimits, shareBudget } from './canvasButcesi';
import { SingleFlight } from './cizimKuyrugu';
import { getPdf, putPdf } from './pdfOnbellek';
import { SourceResolver } from './kaynakCoz';
import {
  acikIndeks, dosyaEklemeKarari, dosyaGosterHedefi, eklenenMateryal, GOSTER_OTOMATIK, gosterIndeksi, konuBirlestir, sayfaListesiniGenislet,
  yeniIndeks, yenilemeKarari, type EklenenDosya, type GosterHedefi
} from './eklemeYenileme';
import { visiblePages } from './kitapDuzen';
import { BookView } from './kitapModu';
import { buildBookPages, buildSolutionPages, buildTopicPages, type BookPage } from './kitapSayfalari';
import { MATERIAL_LABEL, availableKinds, defaultKind, discoverTopic, emptyMaterials, type MaterialKind, type TopicMaterials } from './konuKesfi';
import { discoverSampleTopic, isSampleId } from './ornekKaynak';
import { autoTopicStatus, cycleStatus, markChapterPage, markTopicPage, type Resume } from './okumaDurumu';
import { MetinOnbellek } from './metinOnbellek';
import type { Dikdortgen } from './metinAra';
import { OkuyucuArama } from './okuyucuArama';
import { PageContent, pageKind } from './sayfaIcerik';
import { PAD_TOP, canvasSize, currentPage, layoutPages, visibleRange, type Layout } from './sanalListe';
import { anchorPoint, covers, detailRect, pdfLeft, tapZone, visiblePart, type Rect } from './yakinlastirma';
import { ZoomController } from './zoomKontrol';

// Full-screen reader. PDF mode (task 3.2): pages one under the other.
// Book mode (task 3.3, kitapModu.ts): two pages side by side, pages turn.
// surum 1: all pages of the book. surum 2 (task 3.2b): one material of one topic, chosen with tabs.
// Only the visible pages ±2 have a canvas / photo; the others are grey boxes of the right size.
// Task 3.4: contents panel, page slider, zoom (zoomKontrol.ts); zoomed pages get a sharp "detail" canvas.
// Task 3.5: the page on screen becomes the ribbon, topics get "okunuyor" / "okundu" (okumaDurumu.ts).
// Task 4.6: pen mode (kalemModu.ts): live drawing into an in-memory model per PDF file (cizimModeli.ts), not saved yet.
// Task 4.7: eraser and undo / redo (one history for the reader session, all files).
// Task 4.8b: the pending strokes are uploaded into the PDF on Drive (pdfKayit.ts).
// Task 4.9d: the ?kalemYaz=1 safety lock is gone (real Drive tests done in 4.8c); the sample library never uploads.

const PEN_LAYER = penLayerMode();   // task 4.5: ?cizimKontrol=1 / ?defterNot=goster
const MAX_WIDTH = 760;   // prototype #pdfView: min(760px, 100vw − 32px)
const SIDE = 16;

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;

interface Mounted {
  release(): void;
  detail?(view: DOMRect | null, maxPx?: number): void;   // zoomed: draw the visible part sharp (≤ maxPx); null: free it
  detailWant?(view: DOMRect): number;                     // pixels that sharp part would like
  wake?(): void;                                          // the page is on screen: draw it if it was freed
  // task 4.6, PDF pages: the page's box, its source, its viewport (once known) and its pen layer drawn again
  box?: HTMLElement;
  pdf?: BookPage;
  vp?: PenViewport;
  layer?(): void;
  ara?(): void;   // task 6.3c: the search highlight drawn again
}

interface Prepared { pages: BookPage[]; ratios: number[] }

// The pages and their sizes stay in memory while the same book is on the desk.
let prepared: { book: Book; folderId: string; pages: BookPage[]; ratios: number[] } | null = null;   // surum 1
const topicCache = new Map<string, Promise<TopicMaterials | null>>();   // surum 2: folder|klasor → materials
const pageCache = new Map<string, Prepared>();                          // surum 2: file id + version → its pages
let resolver: { folderId: string; r: SourceResolver } | null = null;

// surum 2: the open topic and what is shown of it
interface OpenTopic {
  title: string;
  klasor: string;         // the topic's folder, from the book's folder
  materials: TopicMaterials;
  kind: MaterialKind | null;   // task 6.K6a: null = no materials yet (the bar shows only Fotoğraf / Dosya ekle)
  fileIndex: number;      // Übungen / Ödevler: the chosen file
  solution: boolean;      // "Çözümü göster" is on
}
let topic: OpenTopic | null = null;
let current = { unit: 0, topic: 0 };   // surum 2: the topic chosen last (also while it is loading)
let mainCount = 0;                     // surum 2: pages of the material itself (the solution's come after)

type Mode = 'kitap' | 'pdf';
const MODE_KEY = 'defter.okumaModu';
let mode: Mode = loadMode();
let bookView: BookView | null = null;
let zoom: ZoomController;

function loadMode(): Mode {
  try { return localStorage.getItem(MODE_KEY) === 'pdf' ? 'pdf' : 'kitap'; } catch { return 'kitap'; }
}

let open = false;
let session = 0;               // increases on every open/close: late answers of an old one are ignored
let book: Book | null = null;
let folder = '';
let pages: BookPage[] = [];
let ratios: number[] = [];
let content: PageContent | null = null;
let metin: MetinOnbellek | null = null;   // task 6.3b: the pages' text, read on the first search
let arama: OkuyucuArama;                  // task 6.3c: the search bar
let layout: Layout = layoutPages([], 0);
let baseWidth = 0;             // PDF mode: page width at 100 %
let width = 0;                 // … at the current zoom
let pageLeft = 0;              // x of the pages inside the scroll content
let boxes: HTMLElement[] = [];
const mounted = new Map<number, Mounted>();
let onClosed: () => void = () => {};
let sliding = false;
let tocOpen = false;

// Task 6.K5a: the contents' edit mode (a Drive library only: main.ts sets the context, null = the sample library)
let icBaglam: IcindekilerBaglami | null = null;
let icBirak: (() => void) | null = null;
let duzenleyici: IcindekilerDuzenleyici;
// Task 6.K5b-3: opened from the desk's "İçindekileri düzenle" with no topic open (also a book without topics):
// a text in the page area, the contents panel in edit mode; pen, search and Kitap/PDF hidden. A topic opens → off.
let konusuz = false;
// Task 6.K6a: the open topic has no materials (topic.kind null): its buttons and text (bosKonu.ts)
let bosDurum: BosKonuDurumu | null = null;
// Task 6.K6a: main.ts tells whether a missing Uebungen / Oedevler may be made (?kurulum=1 and a root loaded)
let klasorAcma: () => { kokId: string } | null = () => null;
export function setKlasorAcma(f: () => { kokId: string } | null): void { klasorAcma = f; }
// Task 6.K6b: main.ts tells whether the open file may go to the trash (?kurulum=1, a root loaded, a Drive library)
// and runs the dialog (ui/copAkisi.ts)
let dosyaCop: { acik: () => boolean; iste: (d: DosyaCopIstegi) => void } | null = null;
export function setDosyaCop(d: typeof dosyaCop): void { dosyaCop = d; if (open) renderBar(); }

export function setIcindekilerBaglami(b: IcindekilerBaglami | null): void {
  icBirak?.();
  icBaglam = b;
  // task 6.K5a-2: the reader listens all the time (also outside the edit mode): every change of the queue
  // (a write done, "Tekrar dene", "Vazgeç") redraws the open panel the same way
  icBirak = b?.dinle(icindekilerDegisti) ?? null;
  duzenleyici?.kapat();
  if (tocOpen) renderToc();
}

function icindekilerDegisti(): void {
  if (konusuz && book) setMessage(bosDurumMetni(book, !!icBaglam?.hasJson(book)));   // the first topic added: the text changes
  konumuBul();
  if (konuGittiyse()) return;
  adlarDegisti();
  if (tocOpen && book) renderToc(); else duzenleyici?.durumCiz();
}

// The open topic's place again (units / topics moved, e.g. back to Drive's order after "Vazgeç")
function konumuBul(): void {
  const k = topic?.klasor;
  if (!book || !k || !usesUnits(book)) return;
  for (const [ui, u] of book.uniteler.entries()) {
    const ti = u.konular.findIndex(t => (t.klasor ?? '') === k);
    if (ti >= 0) { current = { unit: ui, topic: ti }; return; }
  }
}

// Task 6.K5b: the open topic went to the trash → the topic the context names instead (the next in its unit, else
// the one before, else another unit's; the contents panel stays as it is); none left → the reader closes (the book
// stays on the desk). true: the reader moved on / closed.
function konuGittiyse(): boolean {
  const k = topic?.klasor;
  if (!open || !book || !k || !usesUnits(book)) return false;
  if (book.uniteler.some(u => u.konular.some(t => (t.klasor ?? '') === k))) return false;
  const yeni = icBaglam?.yonlendir(k);
  if (yeni === undefined) return false;   // not gone by the trash
  for (const [ui, u] of book.uniteler.entries()) {
    const ti = u.konular.findIndex(t => (t.klasor ?? '') === yeni);
    if (ti >= 0) {
      void openTopic(ui, ti);
      if (tocOpen) renderToc();
      return true;
    }
  }
  closeOkuyucu();
  return true;
}

// Task 6.K5b: files with pen strokes not in Drive yet (on the device, and in the open reader's memory)
export async function bekleyenKalemIdleri(): Promise<string[]> {
  return [...new Set([...await pendingStore.listIds(), ...penModel.dirtyFileIds()])];
}

// PDF pages are drawn one at a time (iPad memory), the one nearest the current page first.
const queue = new Map<number, () => Promise<void>>();

// Task 3.7: all page canvases together stay under the device's limit (canvasButcesi.ts);
// at most one drawing per page at a time (a new one cancels the old one).
const budget = new CanvasBudget(deviceLimits(navigator.maxTouchPoints || 0), setCanvasStats);
const renders = new SingleFlight<number>();
let drawing = false;

// Task 4.6: pen mode. The model lives while the reader is open (also across tabs / topics).
let penOn = false;
const penModel = new PenModel();
let pen: PenInput;
let toolbar: PenToolbar;

// Task 4.8a: strokes not saved to Drive stay on the device (one net difference per file) and come back
// when the file loads again (also in reading mode, also in the sample library).
const pendingStore = new IdbPendingStore();
const pendingIds = new Set<string>();   // file ids with a record on the device
const saver = new PendingSaver(pendingStore, pendingSnapshot, (id, has) => {
  if (!pendingStore.ok) { warnStore(); return; }
  if (has) pendingIds.add(id); else pendingIds.delete(id);
  renderTools();
});
const erasedFiles = new Set<string>();  // the files the eraser drag going on touched
let restoreTold = -1;                   // the session the "restored" toast was shown in
let storeWarned = false;

// Task 4.8b: upload to Drive. When: pen off, another material / topic, reader closed, 30 s after the last
// change, "Kaydet", a file with a record from before opens, back online. Never on pagehide (keepalive
// limit): the record stays on the device.
const uploadDeps: UploadDeps = {
  drive: drivePdfApi,
  bytes: async (id, mt, bilgi) => new Uint8Array(await getPdf(id, mt, bilgi)),   // same version cached → no download; bilgi: ?olcum=1
};
const uploader = new DriveUploader(uploadDeps, { record: uploadSource, done: fileUploaded, status: uploadStatus });
let saveState: UploadStatus = { tur: 'bos' };
let lastSaveToast = '';

export const isOkuyucuOpen = () => open;

// Task 6.3c: search the open reader's material (6.3e: from the library search). Resolves with the number of matches.
export function okuyucuAra(q: string, o: { ilkEslesmeyeGit?: boolean } = {}): Promise<number> {
  return open ? arama.ara(q, o) : Promise.resolve(0);
}

// Task 5.8f: where the Drive library is (main.ts: writer() ? driveLoc : null); the box under the material bar
let driveLocation: () => DriveLocation | null = () => null;
let photoBox: FotoDurumKutusu;

export function initOkuyucu(yer: () => DriveLocation | null): void {
  driveLocation = yer;
  photoBox = new FotoDurumKutusu($('#oBar'));
  // task 4.8c, development only (not in the build): window.defterSurumler() lists the open PDF's revisions
  if (import.meta.env.DEV) {
    void import('../drive/surumler').then(m => m.installRevisionHelper(() => {
      if (!open || !pages.length) return null;
      const p = pages[focusPage()];
      return (p && pageKind(p) === 'pdf' ? p : pages.find(x => pageKind(x) === 'pdf'))?.dosyaId ?? null;
    }));
    // task 6.3b: window.defterMetinAra(q) searches the pages of the open reader
    void import('./metinAraDene').then(m => m.installMetinAra(() => open && metin && pages.length ? { pages, metin } : null));
  }
  $('#oClose').addEventListener('click', closeOkuyucu);
  installOkuyucuKaydirma($('#okuyucu'));   // task 6.K5b-4: the page itself never moves under the reader
  arama = new OkuyucuArama({
    pages: () => pages,
    metin: () => metin,
    focusPage,
    git: goToMatch,
    katmanlariYenile: () => { for (const m of mounted.values()) m.ara?.(); },
  });
  const scroller = $('#oScroll');
  let raf = 0;
  scroller.addEventListener('scroll', () => {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); });
    zoom.settleLater();
  }, { passive: true });
  // capture + stop: Esc must close only the reader, not the book behind it
  // the page hides / closes: what changed is written at once (no 300 ms wait)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void saver.flush(); });
  addEventListener('pagehide', () => { void saver.flush(); });   // no upload here (task 4.8b)
  addEventListener('online', () => { if (open) uploadNow(); });
  void pendingStore.listIds().then(ids => {
    for (const id of ids) pendingIds.add(id);
    // the reader opened before the list came: its pages look again
    if (open && ids.length) for (const m of mounted.values()) m.layer?.();
  });

  addEventListener('keydown', e => {
    // task 5.8a / 5.10e: the panel has the keys; task 6.K6b: so has the trash dialog (Esc closes only it)
    if (!open || document.getElementById('fotoPanel') || document.getElementById('dosyaPanel') || document.getElementById('copOnay')) return;
    // task 6.3c: Ctrl/Cmd+F opens our search box (not the browser's)
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); e.stopPropagation(); if (!konusuz && !bosDurum) arama.ac(); return; }
    if (e.key === 'Escape') { e.stopPropagation(); if (toolbar?.closePopover()) return; if (tocOpen) closeToc(); else if (arama.acik) arama.kapat(); else closeOkuyucu(); return; }
    // pen mode: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z and Ctrl+Y redo (not while typing somewhere)
    if (penOn && (e.ctrlKey || e.metaKey) && !e.altKey && !typing(e.target)) {
      const k = e.key.toLowerCase();
      if (k === 'z' || (k === 'y' && e.ctrlKey && !e.shiftKey)) {
        e.preventDefault();
        undoRedo(k === 'y' || e.shiftKey);
        return;
      }
    }
    if (mode === 'kitap' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')
      && !(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      if (!zoom.zoomed && !pen.isDrawing()) bookView?.flip(e.key === 'ArrowRight' ? 1 : -1);   // zoomed: the page stays
    }
  }, true);
  let rt: number | undefined;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => { if (open) showSelectedTab(); if (open && pages.length) { zoom.reset(); dropDetails(); relayout(); } }, 150);
  });

  // surum 2: tabs, file chooser, solution (all stay on the same topic)
  $('#oTabs').addEventListener('click', e => {
    const kind = (e.target as HTMLElement).closest<HTMLElement>('[data-kind]')?.dataset.kind as MaterialKind | undefined;
    if (!topic || !kind || kind === topic.kind) return;
    topic.kind = kind; topic.fileIndex = 0; topic.solution = false;
    const mark = savedMark(topic);   // the material opens where the reader left it
    void showMaterial(mark && useMark(topic, mark));
  });
  const select = $<HTMLSelectElement>('#oFile');
  select.addEventListener('change', () => {
    if (!topic) return;
    topic.fileIndex = Number(select.value); topic.solution = false;
    void showMaterial();
  });
  $('#oSol').addEventListener('click', () => {
    if (!topic) return;
    topic.solution = !topic.solution;
    void showMaterial();
  });
  // Task 6.K6b: the open file to the trash (only with ?kurulum=1; hidden with the pen on)
  $('#oCop').addEventListener('click', () => { void dosyayiCopeAt(); });
  // Task 5.8a: "Fotoğraf ekle" (draft, writes nothing). The picker opens inside the tap (iPad Safari),
  // the panel (a lazy import) after the photos are chosen.
  const fotoInput = $<HTMLInputElement>('#oFotoInput');
  $('#oFoto').addEventListener('click', () => { if (topic) fotoInput.click(); });
  fotoInput.addEventListener('change', () => {
    const files = [...(fotoInput.files ?? [])];
    fotoInput.value = '';   // the same photo can be chosen again
    if (files.length) openPhotoPanel(files);
  });
  // Task 5.10e: "Dosya ekle" (5.10h: always shown, the ?dosyaEkle=1 lock removed). The picker opens inside the tap; the file is prepared
  // (dosyaHazirla) before the panel: a refused one only gets a toast.
  // Task 5.10g: several files can be chosen; images go to the panel as a list (one PDF).
  const dosyaBtn = $('#oDosya'), dosyaInput = $<HTMLInputElement>('#oDosyaInput');
  dosyaInput.accept = DOSYA_ACCEPT;
  dosyaBtn.addEventListener('click', () => { if (topic) dosyaInput.click(); });
  dosyaInput.addEventListener('change', () => {
    const files = [...(dosyaInput.files ?? [])];
    dosyaInput.value = '';   // the same file can be chosen again
    if (files.length) void chooseFiles(files);
  });

  // Kitap / PDF; the choice is remembered
  $('#oMode').addEventListener('click', e => {
    const m = (e.target as HTMLElement).closest<HTMLElement>('[data-m]')?.dataset.m as Mode | undefined;
    if (m) setMode(m);
  });
  renderMode();

  bookView = new BookView($('#oKitap'), $('#oSpread'), {
    count: () => pages.length,
    ratio: i => ratios[i],
    kind: i => pageKind(pages[i]),
    mount: (i, box, w, h) => mount(i, box, w, h),
    release: i => { mounted.get(i)?.release(); mounted.delete(i); queue.delete(i); },
    changed: () => { showPageNumber(); wakeVisible(); void drain(); },
  });

  // Zoom + book mode taps: a tap on the side turns the page, a swipe too (only at 100 %)
  const area = $('#oKitap');
  zoom = new ZoomController($('#okuyucu'), area, $('#oZoom'), scroller, $('#oPages'), {
    mode: () => mode,
    hasPages: () => open && pages.length > 0,
    pdfZoom: (_z, x, y) => applyPdfZoom(x, y),
    settled: sharpen,
    tap: x => {
      if (penOn) return false;   // pen mode: the page stays (slider, contents, arrow keys still turn it)
      const r = $('#oSpread').getBoundingClientRect();   // the open book (taps turn only at 100 %)
      const zone = tapZone(x, { left: r.left, width: r.width, pages: bookView?.single ? 1 : 2 });
      if (zone === 'middle') return false;
      bookView?.flip(zone === 'next' ? 1 : -1);
      return true;
    },
    swipe: dir => { if (!penOn) bookView?.flip(dir); },
    penOwns: id => pen.owns(id),
    penIgnores: id => pen.ignores(id),
  });

  // Task 4.6: pen button, tool bar, live drawing
  toolbar = new PenToolbar($('#oTools'), {
    close: () => setPen(false),
    undo: () => undoRedo(false),
    redo: () => undoRedo(true),
    save: () => uploadNow(),
    toolChanged: () => { pen.hideCursor(); showTool(); },
  });
  $('#oPenBtn').addEventListener('click', () => setPen(!penOn));
  pen = new PenInput([scroller, area], {
    pageAtPoint: (x, y) => {
      for (const [i, m] of mounted) {
        if (!m.box || !m.vp || !m.pdf || penModel.state(fileKey(m.pdf)) !== 'hazir') continue;
        const r = m.box.getBoundingClientRect();
        if (r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { box: m.box, page: { index: i, viewport: m.vp } };
      }
      return null;
    },
    pageAt: box => {
      for (const [i, m] of mounted) {
        if (m.box === box && m.vp && m.pdf && penModel.state(fileKey(m.pdf)) === 'hazir') return { index: i, viewport: m.vp };
      }
      return null;
    },
    tool: () => toolbar.tool,
    style: () => strokeStyle(toolbar.prefs),
    add: (pg, s) => {
      const p = pages[pg.index];
      if (!p?.pdfSayfa) return;
      penModel.add(fileKey(p), p.pdfSayfa - 1, s);
      changed(p.dosyaId!);
      mounted.get(pg.index)?.layer?.();
      renderTools();
    },
    erase: (pg, from, to, r) => {
      const p = pages[pg.index];
      if (!p?.pdfSayfa) return;
      if (penModel.eraseAt(fileKey(p), p.pdfSayfa - 1, from, to, r)) { erasedFiles.add(p.dosyaId!); relayer(fileKey(p), p.pdfSayfa - 1); }
    },
    eraseEnd: () => {
      penModel.eraseEnd();
      for (const id of erasedFiles) changed(id);
      erasedFiles.clear();
      renderTools();
    },
    eraseCancel: () => {
      erasedFiles.clear();
      for (const c of penModel.eraseCancel()) relayer(c.key, c.page);
      renderTools();
    },
    penSeen: () => $('#okuyucu').classList.remove('kalem-parmak'),
    fingerPan: () => mode === 'pdf' && !pen.penSeen,
    scroller,
  });

  // Page slider: the bubble shows where you'd land, the reader follows while dragging
  const slider = $<HTMLInputElement>('#oSlider');
  let jump = 0;
  slider.addEventListener('input', () => {
    sliding = true;
    showBubble();
    if (!jump) jump = requestAnimationFrame(() => { jump = 0; goToPage(Number(slider.value) - 1); });
  });
  const endSlide = () => {
    if (!sliding) return;
    // a jump still waiting for its frame goes now (fast flick, keyboard), before the value is set back
    if (jump) { cancelAnimationFrame(jump); jump = 0; goToPage(Number(slider.value) - 1); }
    sliding = false;
    $('#oBubble').hidden = true;
    showPageNumber();
  };
  slider.addEventListener('change', endSlide);
  slider.addEventListener('pointerup', endSlide);
  slider.addEventListener('blur', endSlide);

  // Contents: units → topics
  $('#oTocBtn').addEventListener('click', () => { if (tocOpen) closeToc(); else openToc(); });
  $('#oTocClose').addEventListener('click', closeToc);
  $('#oScrim').addEventListener('click', closeToc);
  duzenleyici = new IcindekilerDuzenleyici({
    liste: $('#oTocList'), durum: $('#oTocDurum'), baglam: () => icBaglam, yerDegisti: konumuKoru, yeniden: adlarDegisti
  });
  $('#oTocEdit').addEventListener('click', () => {
    if (!book) return;
    if (duzenleyici.acik) { duzenleyici.kapat(); renderToc(); return; }
    const k = duzenleyici.dugme(book, true);
    if (!k.acik) { if (k.not) duzenleyici.not(k.not); return; }
    duzenleyici.ac(book);
    tocEditDugmesi();
  });
  $('#oTocList').addEventListener('click', e => {
    if (duzenleyici.acik) return;   // the edit mode has its own taps
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-u]');
    if (!b || !book) return;
    // the status icon: next status, the panel stays open
    if ((e.target as HTMLElement).closest('[data-st]')) { cycleStatus(book, Number(b.dataset.u), Number(b.dataset.t)); renderToc(); return; }
    chooseTopic(Number(b.dataset.u), Number(b.dataset.t));
  });
}

function setMode(m: Mode): void {
  if (m === mode) return;
  const cur = pages.length ? focusPage() : 0;
  zoom.reset();
  mode = m;
  try { localStorage.setItem(MODE_KEY, m); } catch { /* private window: not remembered */ }
  renderMode();
  if (!open || !pages.length) { showView(); return; }
  releaseAll();
  enterMode(cur);
}

function renderMode(): void {
  $('#oMode').querySelectorAll<HTMLElement>('[data-m]').forEach(b => {
    b.classList.toggle('on', b.dataset.m === mode);
    b.setAttribute('aria-pressed', String(b.dataset.m === mode));
  });
}

// Only the view of the current mode is shown.
function showView(): void {
  $('#oScroll').hidden = mode !== 'pdf';
  $('#oKitap').hidden = mode !== 'kitap';
  // task 6.H1: book mode keeps the pen bar's room while the pen is off (styles.css), so the book never moves
  $('#okuyucu').classList.toggle('mod-kitap', mode === 'kitap');
}

// Build the current mode's view of `pages`, starting at page `start`.
function enterMode(start: number): void {
  showView();
  if (mode === 'pdf') {
    bookView?.clear();
    build();
    $('#oScroll').scrollTop = layout.tops[start] - PAD_TOP;
    update();
  } else {
    $('#oPages').replaceChildren();
    $('#oPages').style.height = '0';
    boxes = [];
    bookView?.show(start, book?.kapak.renk ?? '#24476b');
  }
}

// The page the reader is on (PDF: the one crossing the top third; book: the left / only page).
function focusPage(): number {
  if (mode === 'kitap') return bookView?.idx ?? 0;
  const s = $('#oScroll');
  return currentPage(layout, s.scrollTop, s.clientHeight);
}

function showPageNumber(): void {
  if (!open || !pages.length) return;
  const cur = focusPage(), n = pages.length;
  // surum 1: the chapter of the current page; surum 2: the topic's title stays
  if (!topic) $('#oChap').textContent = book!.bolumler[pages[cur].bolumIndex]?.baslik ?? '';
  const v = mode === 'kitap' ? visiblePages(cur, bookView?.single ?? true, n) : [cur];
  $('#oPno').textContent = v.length > 1 ? `${v[0] + 1}–${v[1] + 1} / ${n}` : `${cur + 1} / ${n}`;
  $('#oFoot').hidden = n < 2;
  const slider = $<HTMLInputElement>('#oSlider');
  slider.max = String(n);
  if (!sliding) slider.value = String(cur + 1);
  recordReading(cur, v);
}

// ---- reading state (task 3.5) ----

// The material whose last page makes the topic "okundu": Özet, else Orijinal.
const readKind = (m: TopicMaterials): MaterialKind | null => m.ozet.length ? 'ozet' : m.orijinal.length ? 'orijinal' : null;

// cur: the page the reader is on; shown: the pages on screen (book mode: one or two).
function recordReading(cur: number, shown: number[]): void {
  const b = book, p = pages[cur];
  if (!b || !p) return;
  // PDF mode: a page counts as seen when it is the current one, the last one also when the list is at its end
  const s = $('#oScroll');
  const atEnd = mode === 'pdf' && s.scrollTop + s.clientHeight >= s.scrollHeight - 2;
  const seen = (i: number) => shown.includes(i) || (atEnd && i === pages.length - 1);
  if (topic) {
    if (!okumaKaydiYazilsinMi(topic.kind)) return;   // task 6.K6a: no material, nothing written
    if (p.ad && p.pdfSayfa) markTopicPage(b, current.unit, current.topic, topic.kind, { dosya: p.ad, sayfa: p.pdfSayfa });
    if (topic.kind === readKind(topic.materials) && mainCount && seen(mainCount - 1)) autoTopicStatus(b, current.unit, current.topic, 'bitti');
  } else if (!usesUnits(b)) {
    const bolum = p.bolumIndex;
    markChapterPage(b, bolum, cur - pages.findIndex(q => q.bolumIndex === bolum) + 1);
    autoTopicStatus(b, 0, bolum, 'girildi');
    // the last page of a chapter on screen: that chapter is read
    pages.forEach((q, i) => { if (seen(i) && pages[i + 1]?.bolumIndex !== q.bolumIndex) autoTopicStatus(b, 0, q.bolumIndex, 'bitti'); });
  }
}

// ---- page slider ----

function pageTitle(i: number): string {
  if (topic) return topic.title;
  return book?.bolumler[pages[i]?.bolumIndex]?.baslik ?? '';
}

function showBubble(): void {
  const slider = $<HTMLInputElement>('#oSlider'), b = $('#oBubble');
  const i = Number(slider.value) - 1, n = pages.length;
  const title = pageTitle(i);
  b.textContent = title ? `s. ${i + 1} · ${title}` : `s. ${i + 1}`;
  b.hidden = false;
  // above the thumb (≈ 22 px wide), but not off the screen
  const w = slider.clientWidth, half = b.offsetWidth / 2;
  const x = 11 + (n > 1 ? i / (n - 1) : 0) * (w - 22);
  b.style.left = Math.max(half - 12, Math.min(w - half + 12, x)) + 'px';
}

// Jump to page i (slider, contents): back to 100 % first.
function goToPage(i: number): void {
  if (!open || !pages.length || pen.isDrawing()) return;
  i = Math.max(0, Math.min(pages.length - 1, i));
  resetZoom();
  if (mode === 'pdf') {
    $('#oScroll').scrollTop = layout.tops[i] - PAD_TOP;
    update();
  } else bookView?.goTo(i);
}

// Task 6.3c: show a search match (k: its box, fractions of the page). PDF mode: the match near the middle
// of the screen (zoomed: sideways too, the zoom stays). Book mode: its spread (back to 100 % first).
function goToMatch(i: number, k: Dikdortgen | null): void {
  if (!open || !pages.length || pen.isDrawing() || i < 0 || i >= pages.length) return;
  if (mode === 'pdf') {
    const s = $('#oScroll'), h = layout.heights[i];
    s.scrollTop = k ? layout.tops[i] + (k.y + k.h / 2) * h - s.clientHeight / 2 : layout.tops[i] - PAD_TOP;
    if (k && zoom.zoomed) s.scrollLeft = pageLeft + (k.x + k.w / 2) * width - s.clientWidth / 2;
    update();
  } else if (!isVisible(i)) {
    resetZoom();
    bookView?.goTo(i);
  }
}

// ---- contents panel ----

const STATUS_ICON: Record<ChapterStatus, string> = { okunmadi: '•', okunuyor: '◐', okundu: '●', calisildi: '✓', tekrar: '↻' };

function openToc(): void {
  if (!book) return;
  renderToc();
  $('#oToc').hidden = $('#oScrim').hidden = false;
  tocOpen = true;
  $('#oTocBtn').setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => {
    $('#okuyucu').classList.add('toc-open');
    $('#oToc').querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'center' });
  });
}

function closeToc(): void {
  if (!tocOpen) return;
  tocOpen = false;
  if (duzenleyici.acik) { duzenleyici.kapat(); tocEditDugmesi(); }
  $('#okuyucu').classList.remove('toc-open');
  $('#oTocBtn').setAttribute('aria-expanded', 'false');
  setTimeout(() => { if (!tocOpen) $('#oToc').hidden = $('#oScrim').hidden = true; }, 260);
}

// surum 2: the topic chosen last; surum 1: the chapter of the page on screen.
function currentTopic(): { unit: number; topic: number } {
  if (!book || usesUnits(book) || !pages.length) return current;
  return { unit: 0, topic: pages[focusPage()].bolumIndex };
}

// Task 6.K5a: "Düzenle" / "Bitti" (grey with a note when the book can't be edited; hidden in the sample library)
function tocEditDugmesi(): void {
  const btn = $<HTMLButtonElement>('#oTocEdit');
  const k = book ? duzenleyici.dugme(book, true) : null;
  btn.hidden = !k?.goster;
  btn.classList.toggle('gri', !!k && !k.acik);
  btn.setAttribute('aria-disabled', String(!!k && !k.acik));
  if (k?.not) btn.title = k.not; else btn.removeAttribute('title');
  btn.textContent = duzenleyici.acik ? 'Bitti' : 'Düzenle';
  btn.setAttribute('aria-pressed', String(duzenleyici.acik));
}

// Units / topics moved: the open topic keeps its place in the reader (its unit / topic index)
function konumuKoru(fn: () => void): void {
  const b = book;
  const t = b?.uniteler[current.unit]?.konular[current.topic];
  fn();
  if (!b || !t) return;
  for (const [ui, u] of b.uniteler.entries()) {
    const ti = u.konular.indexOf(t);
    if (ti >= 0) { current = { unit: ui, topic: ti }; return; }
  }
}

// A name changed: the open topic's title in the top bar
function adlarDegisti(): void {
  const t = book?.uniteler[current.unit]?.konular[current.topic];
  if (topic && t && topic.klasor === (t.klasor ?? '') && topic.title !== t.baslik) {
    topic.title = t.baslik;
    $('#oChap').textContent = t.baslik;
  }
}

function renderToc(): void {
  tocEditDugmesi();
  if (duzenleyici.acik) { duzenleyici.ciz(); return; }
  duzenleyici.durumCiz();
  const b = book!, cur = currentTopic(), v1 = !usesUnits(b);
  const html = bookUnits(b).map((u, ui) => `<section><h3>${esc(u.baslik)}</h3><ol>${u.konular.map((t, ti) => {
    const [cls, label] = ST[t.durum];
    const on = cur.unit === ui && cur.topic === ti;
    const empty = v1 && !t.kaynaklar?.length;
    return `<li><button type="button" data-u="${ui}" data-t="${ti}"${on ? ' aria-current="true"' : ''}${empty ? ' class="empty"' : ''}>`
      + `<span class="o-tst st ${cls}" data-st title="${label} · değiştirmek için dokun" aria-label="${label}">${STATUS_ICON[t.durum]}</span><span>${esc(t.baslik)}</span></button></li>`;
  }).join('')}</ol></section>`).join('');
  $('#oTocList').innerHTML = html || '<p class="o-msg">Bu kitapta henüz konu yok.</p>';
}

function chooseTopic(unit: number, ti: number): void {
  const b = book!;
  if (usesUnits(b)) { closeToc(); void openTopic(unit, ti); return; }
  // surum 1: every chapter is in the same page list
  if (!bookUnits(b)[unit]?.konular[ti]?.kaynaklar?.length) { toast('Bu bölümde henüz kaynak yok.'); return; }
  const i = pages.findIndex(p => p.bolumIndex === ti);
  if (i < 0) return;   // pages are still loading
  closeToc();
  goToPage(i);
}

// The book left the desk (or the library was reloaded): forget its pages.
export function forgetBook(): void {
  prepared = null;
  topicCache.clear();
  pageCache.clear();
  resolver = null;
}

// unit / topicIndex: as in bookUnits (surum 1: unit 0 "Genel", topic = chapter).
// resume: "Kaldığın yerden devam" (the ribbon's material, file and page).
export async function openOkuyucu(b: Book, folderId: string, unit: number, topicIndex: number, closed: () => void, resume?: Resume): Promise<void> {
  if (open) return;
  const t = bookUnits(b)[unit]?.konular[topicIndex];
  if (!t) return;
  const v2 = usesUnits(b);
  if (!v2 && !t.kaynaklar?.length) { toast('Bu bölümde henüz kaynak yok.'); return; }
  open = true;
  const my = ++session;
  book = b; folder = folderId; onClosed = closed;
  current = { unit, topic: topicIndex };
  content = new PageContent();
  metin = new MetinOnbellek(content);
  topic = null;
  zoom.reset();

  $('#oBook').textContent = b.baslik;
  $('#oChap').textContent = t.baslik;
  $('#oPno').textContent = '';
  clearPages();
  renderBar();
  setMessage(v2 ? 'Konu açılıyor…' : 'Sayfalar hazırlanıyor…');
  const el = $('#okuyucu');
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  gorunurAlaniDuzelt('okuyucu açıldı');   // task 6.K5b-4: a page moved before (not while the keyboard is open)
  startFps();

  if (v2) { await openTopic(unit, topicIndex, resume); return; }
  autoTopicStatus(b, 0, topicIndex, 'girildi');

  try {
    if (!prepared || prepared.book !== b || prepared.folderId !== folderId) {
      const p = await buildBookPages(b, folderId);
      if (my !== session) return;
      const r = await content.ratios(p);
      if (my !== session) return;
      prepared = { book: b, folderId, pages: p, ratios: r };
    }
  } catch (e) {
    if (my === session) loadFailed(e);
    return;
  }

  const first = prepared.pages.findIndex(p => p.bolumIndex === topicIndex);
  // resume: page `sayfa` of the chapter (if the chapter still has that many)
  const at = resume && first >= 0 && prepared.pages[first + resume.sayfa - 1]?.bolumIndex === topicIndex ? first + resume.sayfa - 1 : first;
  showPages(prepared.pages, prepared.ratios, Math.max(0, at), 'Bu kitapta gösterilecek sayfa yok.');
}

// Task 6.K5b-3: the desk's "İçindekileri düzenle": the reader without a topic, the contents panel in edit mode.
// A topic tapped in the panel (after "Bitti") opens as usual (chooseTopic → openTopic).
export function openOkuyucuDuzenle(b: Book, folderId: string, closed: () => void): void {
  if (open) return;
  open = true;
  ++session;
  book = b; folder = folderId; onClosed = closed;
  current = { unit: -1, topic: -1 };   // no topic marked in the panel
  content = new PageContent();
  metin = new MetinOnbellek(content);
  topic = null;
  zoom.reset();
  $('#oBook').textContent = b.baslik;
  $('#oChap').textContent = 'İçindekiler';
  clearPages();
  renderBar();
  konusuzMod(true);
  setMessage(bosDurumMetni(b, !!icBaglam?.hasJson(b)));
  const el = $('#okuyucu');
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  gorunurAlaniDuzelt('okuyucu açıldı');
  startFps();
  openToc();
  if (duzenleyici.dugme(b, true).acik) { duzenleyici.ac(b); tocEditDugmesi(); }
}

function konusuzMod(on: boolean): void {
  konusuz = on;
  $('#okuyucu').classList.toggle('o-konusuz', on);
}

// Task 6.K6a: a topic without materials (pen, search and Kitap/PDF hidden in CSS); null: off
function materyalsizMod(d: BosKonuDurumu | null): void {
  bosDurum = d;
  $('#okuyucu').classList.toggle('o-materyalsiz', !!d);
}

// Task 6.K5b-3: the desk's contents page shows "İçindekileri düzenle" by the same rule as the panel's "Düzenle"
export function icindekilerDugmesi(b: Book): ReturnType<IcindekilerDuzenleyici['dugme']> {
  return duzenleyici.dugme(b, true);
}

function loadFailed(e: unknown): void {
  closeOkuyucu();
  if (e instanceof SessionExpired) return;
  console.error(e);
  toast(e instanceof TypeError || !(e instanceof Error)
    ? 'Sayfalar yüklenemedi. İnternet bağlantını kontrol et ve tekrar dene.'
    : e.message);
}

// ---- surum 2: topic materials ----

function discover(folderId: string, klasor: string): Promise<TopicMaterials | null> {
  const key = `${folderId}|${klasor}`;
  let p = topicCache.get(key);
  if (!p) {
    if (isSampleId(folderId)) p = discoverSampleTopic(folderId, klasor);   // sample library: no Drive
    else {
      if (resolver?.folderId !== folderId) resolver = { folderId, r: new SourceResolver(folderId) };
      p = discoverTopic(resolver.r, klasor);
    }
    p.catch(() => topicCache.delete(key));   // don't remember a failed request
    topicCache.set(key, p);
  }
  return p;
}

// Open a topic (first open, or from the contents) with its default material,
// or with the ribbon's material and page (resume).
async function openTopic(unit: number, topicIndex: number, resume?: Resume): Promise<void> {
  const t = book ? bookUnits(book)[unit]?.konular[topicIndex] : undefined;
  if (!t || !book) return;
  const my = ++session;
  current = { unit, topic: topicIndex };
  konusuzMod(false);
  materyalsizMod(null);
  topic = null;
  photoBox.seritGoster(null);
  zoom.reset();
  releaseAll();
  clearPages();
  renderBar();
  $('#oChap').textContent = t.baslik;
  setMessage('Konu açılıyor…');
  try {
    const m = await discover(folder, t.klasor ?? '');
    if (my !== session) return;
    const kind = m ? resume?.materyal && m[resume.materyal].length ? resume.materyal : defaultKind(m) : null;
    topic = { title: t.baslik, klasor: t.klasor ?? '', materials: m ?? emptyMaterials(), kind, fileIndex: 0, solution: false };
    if (!kind) {
      // task 6.K6a: no materials (or no folder): the bar with Fotoğraf / Dosya ekle; nothing of the reading state written
      const klasorYokMetni = m ? undefined : `Konu klasörü bulunamadı: ${t.klasor}. Drive'da kitabın klasöründe bu klasörü oluştur ve yenile.`;
      materyalsizMod(bosKonuDurumu({ klasorVar: !!m && !!t.klasor?.trim(), klasorYokMetni }));
      renderBar();
      setMessage(bosDurum!.metin);
      if (m) void photoStrip(topic);
      return;
    }
    autoTopicStatus(book, unit, topicIndex, 'girildi');   // task 6.K6a: only once there is a material
    void photoStrip(topic);
  } catch (e) {
    if (my === session) loadFailed(e);
    return;
  }
  const mark = resume?.dosya && resume.materyal === topic.kind ? { dosya: resume.dosya, sayfa: resume.sayfa } : savedMark(topic);
  await showMaterial(mark && useMark(topic, mark));
}

// The ribbon of the open topic's current material.
function savedMark(t: OpenTopic): PageMark | null {
  return konuKurdelesi(book?.uniteler[current.unit]?.konular[current.topic]?.kurdeleler, t.kind);
}

// Übungen / Ödevler: the mark chooses the file (and the solution, if it was in it). null: its file is gone.
function useMark(t: OpenTopic, mark: PageMark): PageMark | null {
  const r = kurdeleSecimi(t.materials, t.kind, mark);
  if (r.fileIndex !== undefined) { t.fileIndex = r.fileIndex; t.solution = !!r.solution; }
  return r.mark;
}

// The chosen material of the open topic (+ its solution below it, when "Çözümü göster" is on).
// start: open at this page (a ribbon); otherwise at the start (or at the solution).
async function showMaterial(start?: PageMark | null): Promise<void> {
  if (!topic || !content || topic.kind === null) return;
  const t = topic, kind = topic.kind, my = ++session;
  materyalsizMod(null);
  uploadNow();   // task 4.8b: another material / topic
  mainCount = 0;
  zoom.reset();
  releaseAll();
  clearPages();
  renderBar();
  setMessage('Sayfalar hazırlanıyor…');

  const material = t.kind === 'uebungen' || t.kind === 'oedevler' ? t.materials[t.kind][t.fileIndex] : null;
  const files = material ? [material.file] : t.materials[kind].map(m => m.file);
  const cozum = t.solution ? material?.cozum ?? null : null;
  const key = (list: { id: string; modifiedTime: string }[]) => list.map(f => `${f.id}@${f.modifiedTime}`).join(',');
  const at = (list: BookPage[], def: number) => {
    const i = start ? list.findIndex(p => p.ad === start.dosya && p.pdfSayfa === start.sayfa) : -1;
    return i >= 0 ? i : def;
  };
  try {
    const main = await cached(key(files), () => buildTopicPages(t.materials, kind, t.fileIndex), my);
    if (my !== session) return;
    mainCount = main.pages.length;
    if (!cozum) { showPages(main.pages, main.ratios, at(main.pages, 0), 'Bu materyalde gösterilecek sayfa yok.'); return; }
    const sol = await cached(key([cozum]), () => buildSolutionPages(cozum), my);
    if (my !== session) return;
    const all = [...main.pages, ...sol.pages];
    showPages(all, [...main.ratios, ...sol.ratios], at(all, main.pages.length), 'Bu materyalde gösterilecek sayfa yok.');
  } catch (e) {
    if (my === session) loadFailed(e);
  }
}

// Pages + sizes, remembered only when they were made for the current view (a closed reader gives A4 sizes).
async function cached(key: string, build: () => Promise<BookPage[]>, my: number): Promise<Prepared> {
  const hit = pageCache.get(key);
  if (hit) return hit;
  const pages = await build();
  if (my !== session || !content) return { pages: [], ratios: [] };
  const ratios = await content.ratios(pages);
  const result = { pages, ratios };
  if (my === session) pageCache.set(key, result);
  return result;
}

// Tabs (only the materials that exist), file chooser and solution button.
// Task 5.10g: on a narrow bar the tabs scroll in their strip; the open one is kept in sight
function showSelectedTab(): void {
  const tabs = $('#oTabs'), sel = tabs.querySelector<HTMLElement>('[aria-selected="true"]');
  if (!sel || tabs.scrollWidth <= tabs.clientWidth) return;
  const t = tabs.getBoundingClientRect(), r = sel.getBoundingClientRect();
  if (r.left < t.left) tabs.scrollLeft += r.left - t.left;
  else if (r.right > t.right) tabs.scrollLeft += r.right - t.right;
}

function renderBar(): void {
  const bar = $('#oBar');
  bar.hidden = !topic;
  if (!topic) return;
  const t = topic;
  // task 6.K6a: a topic without materials: the add buttons by bosKonu.ts (grey without a folder)
  for (const [id, d] of [['#oFoto', bosDurum?.foto], ['#oDosya', bosDurum?.dosya]] as const) {
    const btn = $<HTMLButtonElement>(id);
    btn.disabled = t.kind === null && !!d && !d.aktif;
    btn.title = (btn.disabled && d?.not) || (id === '#oFoto' ? 'Fotoğraf ekle' : 'Dosya ekle');
  }
  $('#oTabs').replaceChildren(...availableKinds(t.materials).map(k => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'o-tab';
    b.dataset.kind = k;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(k === t.kind));
    b.textContent = MATERIAL_LABEL[k];
    return b;
  }));
  showSelectedTab();
  $('#oCop').hidden = !copDugmesiGorunur({
    kilitAcik: !!dosyaCop?.acik(), drive: !isSampleId(folder) && !!driveLocation(),
    surum2: !!book && usesUnits(book) && book.hasJson && book.surum >= 2, materyal: t.kind !== null, kalem: penOn
  });
  const list = t.kind === 'uebungen' || t.kind === 'oedevler' ? t.materials[t.kind] : null;
  $('#oFiles').hidden = !list;
  if (!list) return;
  const select = $<HTMLSelectElement>('#oFile');
  select.replaceChildren(...list.map((m, i) => new Option(m.file.name.replace(/\.pdf$/i, ''), String(i))));
  select.value = String(t.fileIndex);
  const sol = $('#oSol');
  sol.hidden = !list[t.fileIndex]?.cozum;
  // task 5.10g: narrow bar: only "Çözüm" (the rest hides in CSS); the full text for screen readers
  const solText = t.solution ? 'Çözümü gizle' : 'Çözümü göster';
  const uzun = document.createElement('span');
  uzun.className = 'o-uzun';
  uzun.textContent = solText.slice('Çözüm'.length);
  sol.replaceChildren('Çözüm', uzun);
  sol.setAttribute('aria-label', solText);
  sol.title = solText;
  sol.setAttribute('aria-pressed', String(t.solution));
}

// Task 5.8a: the photo panel, with what the reader already knows about the topic (no Drive request).
function openPhotoPanel(files: File[]): void {
  const t = topic;
  if (!t || !open) return;
  const onScreen = t.kind === 'ozet' ? pages[focusPage()]?.dosyaId ?? null : null;
  const ctx = {
    konuAdi: t.title,
    ozetDosyalari: t.materials.ozet.map(m => m.file),
    acikDosyaId: onScreen,
    sayfaSayisi: knownPageCount,
    ornek: isSampleId(folder),
    // task 5.8f: saved on the device first (a failure rejects: the panel stays open), then to Drive
    ekle: async (jpegler: BekleyenJpeg[], hedef: DriveFile | null) => {
      const basildi = olcumAcik() ? performance.now() : undefined;   // task 6.2e-1: "Ekle" pressed
      const b = book;
      if (!driveLocation() || !b) throw new SayfaYazmaYok();
      const konuKlasorId = await topicFolderId(t);
      await photoAdder.baslat({ kitapAdi: b.id, konuKlasorId, konuBaslik: t.title, hedefFileId: hedef?.id, hedefAd: hedef?.name ?? OZET_ADI, jpegler }, basildi);
    }
  };
  import('../ui/fotoPanel').then(m => m.acFotoPanel(ctx, files)).catch(e => { console.warn(e); toast('Fotoğraf paneli açılamadı. Sayfayı yenileyip tekrar dene.'); });
}

// Task 5.10g: what the chosen files are (first bytes) → images: the panel's list; one other file:
// dosyaHazirla's way (5.10e, unchanged); a mix / several PDFs: a toast
async function chooseFiles(files: File[]): Promise<void> {
  const t = topic;
  if (!t || !open) return;
  let karar: SecimKarari;
  let ilk: DosyaTuruSonucu;
  try {
    const [{ secimKarari }, turler] = await Promise.all([
      import('../defter/gorselListesi'),
      Promise.all(files.map(async f => ({ ad: f.name, tur: dosyaTuru(f.name, f.type, new Uint8Array(await f.slice(0, ILK_BAYT_SAYISI).arrayBuffer())) }))),
    ]);
    karar = secimKarari(turler);
    ilk = turler[0].tur;
  } catch (e) {
    console.warn('Dosya okunamadı.', e);
    toast('Dosya okunamadı. Sayfayı yenileyip tekrar dene.');
    return;
  }
  if (topic !== t || !open) return;
  if (karar.tur === 'ret') toast(karar.metin);
  else if (karar.tur === 'gorseller') openFilePanel(t, { tur: 'gorseller', dosyalar: files });
  else void prepareFile(files[0], ilk);
}

// Task 5.10e: the chosen file → PDF bytes (dosyaHazirla, lazy) → the panel; refused: a toast.
// Task 6.1c: Word / PowerPoint in the Drive library → the panel at once, it converts (no lock since 6.1e).
async function prepareFile(file: File, tur: DosyaTuruSonucu): Promise<void> {
  const t = topic;
  if (!t || !open) return;
  if (tur.tur === 'ofis') {
    let yol: TekDosyaYolu;
    try {
      const { tekDosyaYolu } = await import('../defter/dosyaPanelDurumu');
      yol = tekDosyaYolu(tur, { drive: !!driveLocation() && !isSampleId(folder), bayt: file.size });
    } catch (e) {
      console.warn(e);
      toast('Dosya hazırlanamadı. Sayfayı yenileyip tekrar dene.');
      return;
    }
    if (topic !== t || !open) return;
    if (yol.yol === 'ret') { toast(yol.metin); return; }
    if (yol.yol === 'ofis') { openFilePanel(t, { tur: 'ofis', dosya: file, alt: yol.alt }); return; }
  }
  photoBox.durum('Dosya hazırlanıyor…');
  let hazir: HazirDosya;
  try {
    const t0 = olcumAcik() ? performance.now() : null;   // task 6.2e-1
    const m = await import('../defter/dosyaHazirla');
    try {
      hazir = await m.dosyaHazirla(file);
      if (t0 !== null) hazirlikEkle({ ad: `dosya hazırla ${file.name}`, ms: performance.now() - t0, grup: 'hazirlik', ek: { giris: mb(file.size), cikis: mb(hazir.bytes.byteLength), tur: hazir.kaynak } });
    } catch (e) {
      if (e instanceof m.DosyaHazirlanamadi) { toast(e.message); return; }
      throw e;
    }
  } catch (e) {
    console.warn('Dosya hazırlanamadı.', e);
    toast('Dosya hazırlanamadı. Sayfayı yenileyip tekrar dene.');
    return;
  } finally {
    photoBox.durum(null);
  }
  if (topic !== t || !open) return;
  openFilePanel(t, { tur: 'pdf', hazir });
}

// The file panel, with what the reader knows about the topic. The new PDF's bytes go into the cache, the
// topics are listed again (konuDegisti: only topicCache.clear()); the open reader follows in afterFileAdded (5.10f).
function openFilePanel(t: OpenTopic, kaynak: DosyaPanelKaynak): void {
  if (document.getElementById('dosyaPanel')) return;   // one panel at a time (acDosyaPanel checks it too)
  const kapanis = new AbortController();
  filePanelClose = kapanis;
  const ctx = {
    konuAdi: t.title,
    materials: t.materials,
    acikSekme: t.kind,
    ornek: isSampleId(folder),
    klasorAcabilir: !isSampleId(folder) && !!driveLocation() && !!klasorAcma(),
    klasorler: async () => {
      if (isSampleId(folder) || !driveLocation()) return null;
      try {
        const [{ altKlasorBul }, kok] = await Promise.all([import('../defter/konuyaDosyaEkle'), topicFolderId(t).then(listChildren)]);
        return { Uebungen: !!altKlasorBul(kok, 'Uebungen'), Oedevler: !!altKlasorBul(kok, 'Oedevler') };
      } catch (e) {
        console.warn('Konu klasörü listelenemedi.', e);
        return null;
      }
    },
    ekle: async (hedef: DosyaHedefi, ad: string, islemId: string, bytes: Uint8Array) => {
      // task 6.2e-1: ?olcum=1 → measured until the toast (afterFileAdded)
      const om = olcumAcik() ? olcumBaslat(islemId, 'Dosya ekle') : undefined;
      if (om) { om.bilgi.ad = ad; om.bilgi.boyut = mb(bytes.byteLength); om.adimlar.push(...hazirlikAl()); fileMeasureId = islemId; }
      try {
        const [{ konuyaDosyaEkle }, konu] = await Promise.all([import('../defter/konuyaDosyaEkle'), topicFolderId(t)]);
        const ortam: DosyaEklemeOrtami = {
          yer: driveLocation(), olusturDrive: drivePdfOlusturApi, yeniDosya: sayfaEklemeOrtami().yeniDosya, konuDegisti: sayfaEklemeOrtami().konuDegisti,
          altKlasorAc: (konuId, klasor, islemId) => altKlasoruAc(t, konuId, klasor, islemId),
        };
        return await (om ? konuyaDosyaEkle({ konu, hedef, ad, bytes, islemId }, ortam, { olcum: om }) : konuyaDosyaEkle({ konu, hedef, ad, bytes, islemId }, ortam));
      } catch (e) {
        if (om) { om.bilgi.hata = e instanceof Error ? e.message.slice(0, 80) : 'hata'; olcumBitir(islemId); }
        throw e;
      }
    },
    bitti: (r: DosyaEklendi, hedef: DosyaHedefi) => { agacGecersiz(); void afterFileAdded(t, hedef, r); },
    // task 6.1c: the temporary Google file goes into the topic folder; a new islemId for every try
    cevir: async (dosya: File, signal: AbortSignal) => {
      const [{ ofisuPdfeCevir }, klasorId] = await Promise.all([import('../drive/ofisCevir'), topicFolderId(t)]);
      const r = await ofisuPdfeCevir({ dosya, ad: dosya.name, klasorId, islemId: crypto.randomUUID(), signal }, driveLocation());
      return r.bytes;
    },
    kapanis: kapanis.signal,
  };
  import('../ui/dosyaPanel').then(m => m.acDosyaPanel(ctx, kaynak)).catch(e => { console.warn(e); toast('Dosya paneli açılamadı. Sayfayı yenileyip tekrar dene.'); });
}

// Task 6.K6a: the topic's missing Uebungen / Oedevler (drive/altKlasorAc.ts, lazy); the lock asked again at "Ekle"
async function altKlasoruAc(t: OpenTopic, konuId: string, klasor: AltKlasor, islemId: string): Promise<string> {
  const m = await import('../drive/altKlasorAc');
  const kilit = isSampleId(folder) || !driveLocation() ? null : klasorAcma();
  return m.altKlasorAc(await m.driveAltKlasorApi(), { konuId, konuYolu: t.klasor, kitapKlasorId: folder, kokId: kilit?.kokId ?? '', klasor, islemId }, { kilitAcik: !!kilit });
}

// Task 6.1c: closing the reader cancels a conversion in the file panel (and closes it)
let filePanelClose: AbortController | null = null;
// Task 6.2e-1: the measured "Dosya ekle" (?olcum=1), ended at its toast
let fileMeasureId: string | null = null;

// Task 5.8f: adding the photos (fotoEkleme.ts) with the pen's queue and caches (sayfaEklemeOrtami).
// The result is a toast; an error a card under the material bar (or a toast when the reader is closed).
const photoAdder = new FotoEkleyici({
  depo: bekleyenFotoDepo,
  ortam: () => ({ yer: driveLocation(), dosyaDrive: drivePdfOlusturApi, olusturDrive: drivePdfOlusturApi, ...sayfaEklemeOrtami() }),
  ui: {
    durum: m => photoBox?.durum(m),
    basari: (k, m, r) => { agacGecersiz(); photoBox?.kartKaldir(k.islemId); void afterAdding(k, m, r); },
    hata: (k, m) => {
      if (open && photoBox) photoBox.kartGoster(k.islemId, m, () => photoAdder.sirayaKoy(k));
      else toast(m);
    },
  },
});

// Task 6.2e-2: photos still going to Drive (main.ts: the beforeunload warning)
export const fotoYuklemeSuruyor = (): boolean => photoAdder.calisanlar().size > 0;

// The open topic's folder id (the resolver has it from opening the topic: no request)
async function topicFolderId(t: OpenTopic): Promise<string> {
  let id: string | null;
  try {
    id = resolver && resolver.folderId === folder ? await resolver.r.resolveFolder(t.klasor) : null;
  } catch (e) {
    throw e instanceof TypeError ? new Error('Konu klasörüne ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.') : e;
  }
  if (!id) throw new Error(`Konu klasörü Drive'da bulunamadı: ${t.klasor}. Kitaplığı yenileyip tekrar dene.`);
  return id;
}

// A topic opened: its photos waiting on the device → the strip. Only where adding is possible.
async function photoStrip(t: OpenTopic): Promise<void> {
  if (!open || isSampleId(folder) || !driveLocation() || !t.klasor.trim()) return;
  let ks;
  try {
    ks = await bekleyenFotoDepo.konuIcin(await topicFolderId(t));
  } catch (e) {
    console.warn('Bekleyen fotoğraflara bakılamadı.', e);
    return;
  }
  if (topic !== t || !open) return;
  const d = seritDurumu(ks, photoAdder.calisanlar(), photoBox.kartliIdler());
  photoBox.seritGoster(d.goster ? {
    metin: d.metin,
    simdi: () => { photoBox.seritGoster(null); for (const k of d.kayitlar) photoAdder.sirayaKoy(k); },
    sonra: () => photoBox.seritGoster(null),
  } : null);
}

// ---- task 5.8g: the open reader after an adding (decisions: eklemeYenileme.ts) ----

// The newest version of each file this session wrote or created (its bytes are in the PDF cache)
const latestVersion = new Map<string, string>();

// The adding worked: toast (+ "Göster"); the open topic's page list or tabs follow at once.
// Reader closed / another topic open: only the toast.
async function afterAdding(k: BekleyenFoto, metin: string, r: KonuyaEklendi): Promise<void> {
  const t = topic;
  let same = false;
  if (t && open) {
    try { same = await topicFolderId(t) === k.konuKlasorId; } catch { same = false; }
  }
  const live = !!t && open && topic === t;
  const karar = yenilemeKarari(r, {
    acik: live, ayniKonu: same,
    odakDosyaId: live && pages.length ? pages[focusPage()]?.dosyaId ?? null : null,
    konuOzetIdleri: t ? t.materials.ozet.map(m => m.file.id) : [],
  });
  let ready: Promise<void> = Promise.resolve();
  if (karar.yenile === 'liste') ready = refreshList(t!, r.fileId, r.yeniSayfa);
  else if (karar.yenile === 'konu') ready = refreshTopic(t!);
  ready = ready.catch(e => {
    if (e instanceof SessionExpired) return;
    console.warn('Okuyucu yeni sayfalarla yenilenemedi; konuyu kapatıp açınca görünür.', e);
  });
  measureToast(k.islemId, ready);
  const g = karar.goster;
  if (!g) { toast(metin); return; }
  const go = () => { void ready.then(() => showAdded(t!, g)); };
  if (GOSTER_OTOMATIK) { toast(metin); go(); } else toast(metin, { etiket: 'Göster', calistir: go });
}

// The file on screen got pages at the end: the list grows, the reader stays where it is.
// Runs in the pen's queue (after the file's pending strokes, never next to an upload of the same file).
// The pen may stay on: the list changes between two strokes, the model moves to the new version
// (unsaved strokes stay; the old pages keep their numbers, so the strokes stay on their pages).
function refreshList(t: OpenTopic, fileId: string, total: number): Promise<void> {
  const still = () => open && topic === t && !!content;
  return uploader.sirada(fileId, async () => {
    const newMt = latestVersion.get(fileId);
    const shown = pages.find(p => p.dosyaId === fileId && pageKind(p) === 'pdf');
    if (!still() || !newMt || !shown?.modifiedTime) return;
    const oldMt = shown.modifiedTime, c = content!;
    const oldKey = `${fileId}@${oldMt}`, newKey = `${fileId}@${newMt}`;
    if (oldMt !== newMt) {
      // the pen model, when loaded: the strokes in the new version (from the cache, no download)
      if (penModel.state(oldKey) === 'yukleniyor') await penModel.ensure(oldKey, () => Promise.reject(new Error('—')));
      const inFile = penModel.state(oldKey) === 'hazir' ? await readDefterStrokes(new Uint8Array(await getPdf(fileId, newMt))) : null;
      if (!still() || pages.find(p => p.dosyaId === fileId)?.modifiedTime !== oldMt) return;
      // one step, no await: the model, the pages and the caches move together (the pdf.js document: pagesAdded)
      if (inFile) penModel.rebase(oldKey, newKey, inFile, penModel.diff(oldKey));
      moveVersion(fileId, oldMt, newMt);
      for (const list of Object.values(t.materials)) for (const it of list) for (const f of [it.file, it.cozum]) if (f?.id === fileId) f.modifiedTime = newMt;
      if (inFile) {
        for (const m of mounted.values()) if (m.pdf && fileKey(m.pdf) === newKey) m.layer?.();
        saver.changed(fileId);   // the device's record follows the new version
        void saver.flush();
      }
    }
    // the new pages and their sizes
    const make = (pdfSayfa: number, o: BookPage): BookPage => ({ ...o, pdfSayfa });
    const plan = sayfaListesiniGenislet(pages, fileId, total, make);
    if (!plan) { showPageNumber(); return; }
    const extra = await c.ratios(plan.pages.slice(plan.ekYeri, plan.ekYeri + plan.eklenen));
    // a stroke / eraser drag going on: wait for it (the pages' places may change)
    while (still() && pen.isDrawing()) await new Promise(r => setTimeout(r, 100));
    if (!still()) return;
    const g = sayfaListesiniGenislet(pages, fileId, total, make);
    if (!g || g.ekYeri !== plan.ekYeri || g.eklenen !== extra.length) return;   // the list changed meanwhile
    applyGrowth(g.pages, g.ekYeri, extra, g.sonaMi);
    if (!t.solution && t.kind === 'ozet') pageCache.set(t.materials.ozet.map(m => `${m.file.id}@${m.file.modifiedTime}`).join(','), { pages: [...pages], ratios: [...ratios] });
  });
}

// The new list on screen. At the end: the boxes / canvases there stay, only new ones come.
// In the middle (brifing + sorular): built again at the same page and the same spot of it.
function applyGrowth(next: BookPage[], at: number, extra: number[], atEnd: boolean): void {
  const g = { ekYeri: at, eklenen: extra.length };
  const oldCount = pages.length, cur = focusPage();
  const lastShown = isVisible(oldCount - 1);
  const s = $('#oScroll');
  const into = mode === 'pdf' && layout.heights[cur] ? (s.scrollTop - layout.tops[cur]) / layout.heights[cur] : 0;
  pages = next;
  ratios.splice(at, 0, ...extra);
  if (mainCount && at <= mainCount) mainCount += extra.length;
  if (mode === 'pdf') {
    if (atEnd) {
      const added = pages.slice(at).map(pageBox);
      boxes.push(...added);
      $('#oPages').append(...added);
      setPdfGeometry();
    } else {
      releaseAll();
      build();
      const i = yeniIndeks(cur, g);
      s.scrollTop = layout.tops[i] + into * layout.heights[i];
    }
    update();
  } else if (atEnd && !lastShown) {
    showPageNumber();
  } else {
    // the spread on screen changes (its empty side gets a page, or pages moved)
    releaseAll();
    bookView?.show(yeniIndeks(cur, g), book?.kapak.renk ?? '#24476b');
  }
  arama.listeDegisti(old => yeniIndeks(old, g));   // task 6.3c: the current match stays where its page went
}

// A new file in the topic (a new summary, task 5.10f: any material): its folders are listed again, the tabs
// and file lists show it at once. The tab and file on screen stay (by id); the pages on screen stay as they are.
async function refreshTopic(t: OpenTopic): Promise<void> {
  topicCache.delete(`${folder}|${t.klasor}`);
  const m = await discover(folder, t.klasor);
  if (!m || !open || topic !== t) return;
  const list = (x: TopicMaterials) => t.kind === 'uebungen' || t.kind === 'oedevler' ? x[t.kind] : null;
  const next = konuBirlestir(t.materials, m);
  const old = list(t.materials), now = list(next);
  if (old && now) t.fileIndex = acikIndeks(old, now, t.fileIndex);
  t.materials = next;
  // task 6.K6a: the topic had no materials: the first one opens at once (the bar as usual again)
  const ilk = t.kind === null ? defaultKind(next) : null;
  if (ilk && book) {
    t.kind = ilk; t.fileIndex = 0; t.solution = false;
    autoTopicStatus(book, current.unit, current.topic, 'girildi');
    await showMaterial();
    return;
  }
  renderBar();
}

// "Göster": the first new page. In the list now → there; else the Özet tab opens at that page.
function showAdded(t: OpenTopic, g: GosterHedefi): void {
  if (!open || topic !== t) return;
  const i = gosterIndeksi(pages, g);
  if (i >= 0) { goToPage(i); return; }
  if (!t.materials.ozet.some(m => m.file.id === g.fileId)) { toast('Yeni sayfalar bulunamadı. Konuyu kapatıp yeniden aç.'); return; }
  // the file's newest version (its bytes are in the cache)
  const mt = latestVersion.get(g.fileId);
  if (mt) for (const m of t.materials.ozet) if (m.file.id === g.fileId) m.file.modifiedTime = mt;
  t.kind = 'ozet'; t.fileIndex = 0; t.solution = false;
  void showMaterial({ dosya: g.ad, sayfa: g.sayfa });
}

// ---- task 6.K6b: the open file to the trash (ui/copAkisi.ts; decisions: kitap/dosyaCop.ts) ----

async function dosyayiCopeAt(): Promise<void> {
  const t = topic, b = book, d = dosyaCop;
  if (!t || !b || !open || penOn || !d?.acik()) return;
  const odak = focusPage();
  const h = dosyaCopHedefi(t, pages[odak]?.dosyaId ?? null, odak, mainCount);
  if (!h) return;
  let konuKlasorId: string;
  try {
    konuKlasorId = await topicFolderId(t);
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e));
    return;
  }
  if (topic !== t || !open) return;
  d.iste({
    kitap: b, konu: t.klasor, konuKlasorId, hedef: h,
    kalemYukleniyor: id => uploader.bekliyorMu(id),
    bitti: giden => { void dosyaGitti(t, giden); },
    geriGeldi: gelen => { void dosyaGeldi(t, b, gelen); }
  });
}

// The file went: the same kind's next file (else another kind); nothing left → the empty topic (6.K6a).
// The list follows without a request (Drive may still list a file just trashed); the next open lists again.
async function dosyaGitti(t: OpenTopic, giden: readonly string[]): Promise<void> {
  agacGecersiz();   // the search tree knew the file
  topicCache.delete(`${folder}|${t.klasor}`);
  if (!open || topic !== t) return;
  const eski = t.kind;
  t.materials = materyallerdenCikar(t.materials, giden);
  const s = copSonrasiSecim(t.kind, t.fileIndex, t.materials);
  if (!s) {
    ++session;   // a page still loading is not shown
    t.kind = null; t.fileIndex = 0; t.solution = false;
    mainCount = 0;
    if (arama.acik) arama.kapat();
    zoom.reset();
    releaseAll();
    clearPages();
    $('#oPno').textContent = '';
    materyalsizMod(bosKonuDurumu({ klasorVar: true }));
    renderBar();
    setMessage(bosDurum!.metin);
    void photoStrip(t);
    return;
  }
  t.kind = s.kind; t.fileIndex = s.fileIndex; t.solution = false;
  const mark = s.kind !== eski ? savedMark(t) : null;   // another kind opens at its ribbon
  await showMaterial(mark && useMark(t, mark));
}

// "Geri al" done: the topic is listed again and the file that came back opens; its pen record goes now
async function dosyaGeldi(t: OpenTopic, b: Book, gelen: readonly string[]): Promise<void> {
  agacGecersiz();
  topicCache.delete(`${folder}|${t.klasor}`);
  void uploader.request(gelen);
  if (!open || topic !== t || book !== b) return;
  let m: TopicMaterials | null;
  try {
    m = await discover(folder, t.klasor);
  } catch (e) {
    if (!(e instanceof SessionExpired)) console.warn('Konu yeniden listelenemedi; konuyu kapatıp açınca görünür.', e);
    return;
  }
  if (!m || !open || topic !== t) return;
  t.materials = m;
  const s = geriGelenSecim(m, gelen);
  if (!s) { renderBar(); return; }
  const bosKonu = t.kind === null;
  t.kind = s.kind; t.fileIndex = s.fileIndex; t.solution = s.solution;
  if (bosKonu) autoTopicStatus(b, current.unit, current.topic, 'girildi');
  await showMaterial();
}

// ---- task 5.10f: the open reader after "Dosya ekle" (decisions: eklemeYenileme.ts) ----

// The file was added: toast (+ "Göster"); the open topic's tabs and lists follow at once.
// Reader closed / another topic open: only the toast.
async function afterFileAdded(t: OpenTopic, hedef: DosyaHedefi, r: DosyaEklendi): Promise<void> {
  let metin = `Eklendi: ${r.ad}`;
  try { metin = (await import('../defter/dosyaPanelDurumu')).eklendiMetni(r.ad, r.uyari); } catch (e) { console.warn(e); }
  const e = eklenenMateryal(hedef, r, t.materials);
  const bosKonu = t.kind === null;   // task 6.K6a: the topic's first file: it opens at once (refreshTopic), no "Göster"
  const karar = dosyaEklemeKarari(e, { acik: open, ayniKonu: topic === t });
  const olcumId = fileMeasureId;
  fileMeasureId = null;
  if (!karar.yenile) { if (olcumId) measureToast(olcumId, Promise.resolve()); toast(metin); return; }
  const ready = refreshTopic(t).catch(err => {
    if (err instanceof SessionExpired) return;
    console.warn('Okuyucu yeni dosyayla yenilenemedi; konuyu kapatıp açınca görünür.', err);
  });
  if (olcumId) measureToast(olcumId, ready);
  if (!karar.goster || bosKonu) { toast(metin); return; }
  const go = () => { void ready.then(() => showAddedFile(t, e)); };
  if (GOSTER_OTOMATIK) { toast(metin); go(); } else toast(metin, { etiket: 'Göster', calistir: go });
}

// Task 6.2e-1 (?olcum=1): the toast comes now (what the user waited for); the reader's refresh is timed
// after it, then the measurement ends (console + the box). No measurement for this id: nothing.
function measureToast(islemId: string, ready: Promise<void>): void {
  const om = olcumAl(islemId);
  if (!om) return;
  om.isaret('toast');
  const r0 = om.zaman();
  void ready.then(() => { om.adim('okuyucu yenileme (toast\'tan sonra)', om.zaman() - r0, 'diger'); olcumBitir(islemId); });
}

// "Göster": the new file's tab and file (a solution: its X with "Çözümü göster" on, at the solution's first page)
function showAddedFile(t: OpenTopic, e: EklenenDosya): void {
  if (!open || topic !== t) return;
  const h = dosyaGosterHedefi(e, t.materials);
  if (!h) { toast('Eklenen dosya bulunamadı. Konuyu kapatıp yeniden aç.'); return; }
  if (t.kind === h.kind && t.fileIndex === h.fileIndex && t.solution === h.solution && pages.length) {
    goToPage(h.solution ? mainCount : 0);
    return;
  }
  t.kind = h.kind; t.fileIndex = h.fileIndex; t.solution = h.solution;
  void showMaterial();
}

// Pages of a summary file in its current version, when the reader has made its pages already.
function knownPageCount(fileId: string): number | undefined {
  const file = topic?.materials.ozet.find(m => m.file.id === fileId)?.file;
  if (!file) return undefined;
  const version = `${file.id}@${file.modifiedTime}`;
  for (const [key, prep] of pageCache) {
    if (key.split(',').includes(version)) return prep.pages.filter(p => p.dosyaId === fileId).length;
  }
  return undefined;
}

// ---- showing a page list ----

function clearPages(): void {
  pages = []; ratios = []; boxes = [];
  layout = layoutPages([], 0);
  $('#oPages').replaceChildren();
  $('#oPages').style.height = '0';
  bookView?.clear();
  $('#oPno').textContent = '';
  $('#oFoot').hidden = true;
  arama?.bosalt();   // task 6.3c: the query stays for the next list
}

function showPages(p: BookPage[], r: number[], scrollTo: number, emptyText: string): void {
  pages = p;
  ratios = [...r];
  if (!pages.length) { setMessage(emptyText); return; }
  setMessage(null);
  enterMode(scrollTo);
  arama.listeDegisti();   // task 6.3c: the same query in the new list
}

export function closeOkuyucu(): void {
  if (!open) return;
  open = false;
  session++;
  cancelAnimationFrame(fpsRaf); fpsRaf = 0;
  setPen(false);
  const dirty = penModel.dirtyFileIds();
  void saver.flush();   // task 4.8a: the records are taken now, before the model goes
  void uploader.request(dirty);   // task 4.8b: goes on after the reader closed (from the device's records)
  penModel.clear();     // the strokes and the undo history are gone (the unsaved ones are on the device)
  penFileNames.clear();
  renderTools();
  closeToc();
  arama.kapat();   // task 6.3c
  photoBox.temizle();   // task 5.8f: the uploads go on; their records stay on the device
  filePanelClose?.abort();   // task 6.1c
  filePanelClose = null;
  releaseAll();
  zoom.reset();
  void content?.close();
  content = null;
  metin?.kapat();
  metin = null;
  topic = null;
  konusuzMod(false);
  materyalsizMod(null);
  const el = $('#okuyucu');
  el.classList.remove('show');
  setTimeout(() => {
    if (open) return;
    el.hidden = true;
    $('#oPages').replaceChildren();
    bookView?.clear();
    boxes = [];
  }, 300);
  pages = []; ratios = []; book = null;
  $('#oFoot').hidden = true;
  onClosed();
}

// ?fps=1 (task 3.6): the reader is DOM, not the paused 3D loop, so it ticks the counter itself.
// Every animation frame counts: the number shows whether scrolling / drawing blocks the page.
let fpsRaf = 0;
function startFps(): void {
  const fps = fpsCounter();
  if (!fps || fpsRaf) return;
  const tick = (now: number) => { fps.tick(now); fpsRaf = requestAnimationFrame(tick); };
  fpsRaf = requestAnimationFrame(tick);
}

function setMessage(text: string | null): void {
  const m = $('#oMsg');
  m.hidden = text === null;
  m.textContent = text ?? '';
}

// ---- layout ----

function measureWidth(): number {
  return Math.max(120, Math.min(MAX_WIDTH, $('#oScroll').clientWidth - 2 * SIDE));
}

function build(): void {
  baseWidth = measureWidth();
  boxes = pages.map(pageBox);
  $('#oPages').replaceChildren(...boxes);
  setPdfGeometry();
}

function pageBox(p: BookPage): HTMLElement {
  const box = document.createElement('div');
  box.className = 'o-page';
  box.dataset.kind = pageKind(p);
  return box;
}

// PDF mode: page width = 100 % width × zoom; wider than the screen → the list scrolls sideways too.
function setPdfGeometry(): void {
  width = Math.round(baseWidth * zoom.z);
  layout = layoutPages(ratios, width);
  const g = pdfLeft($('#oScroll').clientWidth, width, SIDE);
  pageLeft = g.left;
  const holder = $('#oPages');
  holder.style.width = g.holder + 'px';
  holder.style.height = layout.total + 'px';
  boxes.forEach(place);
}

function place(box: HTMLElement, i: number): void {
  box.style.top = layout.tops[i] + 'px';
  box.style.height = layout.heights[i] + 'px';
  box.style.left = pageLeft + 'px';
  box.style.width = width + 'px';
}

// New width (rotation) or a page got its real size: stay on the same spot of the same page.
function relayout(): void {
  if (mode === 'kitap') { releaseAll(); bookView?.layout(); return; }
  const s = $('#oScroll');
  const cur = currentPage(layout, s.scrollTop, s.clientHeight);
  const into = (s.scrollTop - layout.tops[cur]) / Math.max(1, layout.heights[cur]);
  const newBase = measureWidth();
  const sizeChanged = newBase !== baseWidth;
  baseWidth = newBase;
  setPdfGeometry();
  if (sizeChanged) releaseAll();   // canvases were drawn for the old width
  s.scrollTop = layout.tops[cur] + into * layout.heights[cur];
  update();
}

// ---- zoom ----

// Back to 100 % (jump to another page). PDF mode lays the pages out at their normal width again.
function resetZoom(): void {
  if (!zoom.zoomed) return;
  zoom.reset();
  dropDetails();
  if (mode === 'pdf' && boxes.length) relayout();
}

// PDF mode, zoom changed (zoom.z): wider pages, the point under the finger stays where it is.
// The canvases stay (drawn at 100 %, stretched by CSS) until sharpen() draws the visible part.
function applyPdfZoom(cx: number, cy: number): void {
  if (mode !== 'pdf' || !boxes.length) return;
  const s = $('#oScroll'), r = s.getBoundingClientRect();
  const ox = cx - r.left, oy = cy - r.top;
  const from = { layout, left: pageLeft, width };
  const p = { x: s.scrollLeft + ox, y: s.scrollTop + oy };
  setPdfGeometry();
  const q = anchorPoint(from, { layout, left: pageLeft, width }, p);
  s.scrollLeft = q.x - ox;
  s.scrollTop = q.y - oy;
  update();
}

// The gesture is over: zoomed → visible PDF pages get a sharp canvas; 100 % → those are freed.
function sharpen(): void {
  if (!open) return;
  const view = zoom.zoomed ? (mode === 'pdf' ? $('#oScroll') : $('#oKitap')).getBoundingClientRect() : null;
  if (!view) { for (const m of mounted.values()) m.detail?.(null); return; }
  // task 3.7: the visible pages (two in book mode) share what the budget has left for sharp parts
  budget.markVisible(isVisible);
  for (const [i, m] of mounted) if (!isVisible(i)) m.detail?.(null);
  const list = [...mounted].filter(([i, m]) => m.detail && isVisible(i));
  const wants = list.map(([, m]) => m.detailWant?.(view) ?? 0);
  // room for the new sharp parts: off-screen pages go first (only as much as needed)
  budget.makeRoom(wants.reduce((a, b) => a + b, 0) - budget.usedBy('detay'), focusPage());
  const caps = shareBudget(budget.limits.total - budget.usedBy('ana'), wants);
  list.forEach(([, m], k) => m.detail!(view, caps[k] || undefined));
}

// Task 3.7: is page i on screen now (book mode: the open spread; PDF mode: inside the list's view)?
function isVisible(i: number): boolean {
  if (mode === 'kitap') return visiblePages(bookView?.idx ?? 0, bookView?.single ?? true, pages.length).includes(i);
  const s = $('#oScroll');
  const [a, b] = visibleRange(layout, s.scrollTop, s.clientHeight, 0);
  return i >= a && i <= b;
}

// Pages that came on screen get their canvas back if the budget had taken it.
function wakeVisible(): void {
  budget.markVisible(isVisible);
  for (const [i, m] of mounted) if (isVisible(i)) m.wake?.();
  loadVisibleFiles();
}

function dropDetails(): void {
  for (const m of mounted.values()) m.detail?.(null);
}

// ---- virtual list ----

function update(): void {
  if (!open || !pages.length || mode !== 'pdf') return;
  const s = $('#oScroll');
  const [first, last] = visibleRange(layout, s.scrollTop, s.clientHeight);
  for (const [i, m] of mounted) if (i < first || i > last) { m.release(); mounted.delete(i); queue.delete(i); }
  // the canvas is drawn at 100 % size; zoom makes it sharp separately
  for (let i = first; i <= last; i++) if (!mounted.has(i)) mount(i, boxes[i], width / zoom.z, layout.heights[i] / zoom.z);
  wakeVisible();
  showPageNumber();
  void drain();
}

function releaseAll(): void {
  pen?.cancel();   // a stroke on a page that goes away
  for (const m of mounted.values()) m.release();
  mounted.clear();
  queue.clear();
  renders.cancelAll();
}

// Draws page i into box, shown at w × h CSS px (a box of the PDF list, or the fitted page of book mode).
function mount(i: number, box: HTMLElement, w: number, h: number): void {
  const p = pages[i];
  switch (pageKind(p)) {
    case 'pdf': return mountPdf(i, p, box, w, h);
    case 'image': return mountImage(i, p, box);
    case 'link': return mountCard(i, box, linkCard(p.link ?? ''));
    case 'missing': return mountCard(i, box,
      `<p class="o-big">Dosya bulunamadı: ${esc(p.eksik ?? '')}</p><p>Drive'da kitabın klasörüne bu adla yükle ve yenile.</p>`);
    case 'unsupported': return mountCard(i, box,
      `<p class="o-big">Bu dosya türü henüz gösterilemiyor: ${esc(p.ad ?? '')}</p><p>Şimdilik PDF, JPG ve PNG dosyaları okunabiliyor.</p>`);
  }
}

function mountCard(i: number, box: HTMLElement, html: string): void {
  const card = document.createElement('div');
  card.className = 'o-card';
  card.innerHTML = html;
  box.append(card);
  box.classList.add('ready');
  mounted.set(i, { release: () => { card.remove(); box.classList.remove('ready'); } });
}

function linkCard(url: string): string {
  const safe = /^https?:\/\//i.test(url.trim());
  if (!safe) return `<p class="o-big">Bağlantı açılamıyor.</p><p>Adres http:// ya da https:// ile başlamalı: ${esc(url)}</p>`;
  return `<p class="o-label">Bağlantı</p><p class="o-url">${esc(url)}</p>
    <a class="o-open" href="${esc(url.trim())}" target="_blank" rel="noopener noreferrer">Bağlantıyı aç ↗</a>`;
}

interface Detail { canvas: HTMLCanvasElement; rect: Rect; pageW: number; job: { cancel(): void } | null }

const freeCanvas = (c: HTMLCanvasElement) => { c.width = c.height = 0; c.remove(); };

// A PDF page: its canvas at 100 % (drawn in turn, nearest first) and, zoomed, a sharp "detail" canvas.
// Task 3.7: every canvas is in the budget. An off-screen page may "sleep" (no canvas, grey box)
// when the budget needs the room; it wakes up when it comes on screen.
function mountPdf(i: number, p: BookPage, box: HTMLElement, cssW: number, cssH: number): void {
  const key = `ana${i}`, dKey = `detay${i}`, pKey = `detay${i}+`;
  let canvas: HTMLCanvasElement | null = null;
  let job: { cancel(): void } | null = null;
  let gone = false;
  // zoomed: a second canvas over the page with only the visible part, drawn at the zoomed size
  let shown: Detail | null = null, pending: Detail | null = null;
  const dropPending = () => { if (pending) { pending.job?.cancel(); freeCanvas(pending.canvas); pending = null; budget.delete(pKey); } };
  const dropDetail = () => { dropPending(); if (shown) { freeCanvas(shown.canvas); shown = null; budget.delete(dKey); } };
  // no canvas, but still mounted (the budget took the room; wake() draws it again)
  const sleep = () => {
    dropDetail();
    job?.cancel(); job = null;
    queue.delete(i);
    if (canvas) freeCanvas(canvas);   // Safari frees the canvas memory only like this
    canvas = null;
    budget.delete(key);
    box.classList.remove('ready');
  };
  // Task 4.5: Defter's strokes, an SVG layer over the canvases (no pixels: it stays while the page sleeps)
  let penLayer: Element[] = [];
  const dropLayer = () => { for (const e of penLayer) e.remove(); penLayer = []; };
  // task 6.3c: the search highlight (an SVG over the canvases, under the pen layer)
  const araKatman = arama.katman(i, box);
  const release = () => { gone = true; sleep(); dropLayer(); araKatman.kaldir(); };
  const mine = () => !gone && mounted.get(i)?.release === release;

  const draw = () => {
    const want = canvasSize(cssW, cssH, devicePixelRatio, budget.limits.perCanvas);
    const visible = isVisible(i);
    budget.markVisible(isVisible);
    const cap = budget.reserve(want.w * want.h, visible, focusPage());
    if (!cap) return;   // off screen and no room: stays grey until it is visible
    const { w, h } = cap < want.w * want.h ? canvasSize(cssW, cssH, devicePixelRatio, cap) : want;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    canvas = c;
    budget.set(key, { page: i, kind: 'ana', px: w * h, visible }, sleep);
    queue.set(i, async () => {
      if (!content || canvas !== c) return;
      const d = renders.start(i, content.drawPdf(p, c));
      job = d;
      try {
        await d.promise;
        if (mine() && canvas === c && !d.cancelled()) {
          box.prepend(c); box.classList.add('ready');
          if (zoom.zoomed) zoom.settleLater();   // drawn while zoomed: make it sharp too
        }
      } catch (e) {
        if (e instanceof SessionExpired) { closeOkuyucu(); return; }
        console.warn(`Sayfa ${i + 1} çizilemedi.`, e);
        if (mine()) {
          release(); mounted.delete(i);
          mountCard(i, box, '<p class="o-big">Bu sayfa çizilemedi.</p><p>Sayfayı yenileyip tekrar dene.</p>');
        }
      } finally {
        renders.done(i, d);
        if (job === d) job = null;
      }
    });
  };
  const wake = () => { if (mine() && !canvas) draw(); };

  // pixels the sharp part would like (for sharing the budget between the visible pages)
  const detailWant = (view: DOMRect) => {
    const b = box.getBoundingClientRect();
    const vis = visiblePart(b, view);
    if (!vis || !box.classList.contains('ready')) return 0;
    const r = detailRect(vis, b.width, b.height, devicePixelRatio, budget.limits.perCanvas);
    return r.pw * r.ph;
  };
  const detail = (view: DOMRect | null, maxPx = budget.limits.perCanvas) => {
    if (!mine()) return;
    const b = box.getBoundingClientRect();
    const vis = view && visiblePart(b, view);
    if (!vis || !content || !box.classList.contains('ready')) { dropDetail(); return; }
    const have = pending ?? shown;
    if (have && Math.abs(have.pageW - b.width) < 2 && covers(have.rect, vis)) return;
    dropPending();
    const r = detailRect(vis, b.width, b.height, devicePixelRatio, Math.min(maxPx, budget.limits.perCanvas));
    // the old sharp part and the new one together would be over the budget: drop the old one first
    if (shown && budget.used + r.pw * r.ph > budget.limits.total) { freeCanvas(shown.canvas); shown = null; budget.delete(dKey); }
    const c = document.createElement('canvas');
    c.className = 'o-detail';
    c.width = r.pw; c.height = r.ph;
    Object.assign(c.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' });
    const d = renders.start(i, content.drawPdf(p, c, r));
    const it: Detail = { canvas: c, rect: r, pageW: b.width, job: d };
    pending = it;
    budget.set(pKey, { page: i, kind: 'detay', px: r.pw * r.ph, visible: true }, dropDetail);
    d.promise.then(() => {
      if (pending !== it || d.cancelled()) { freeCanvas(c); return; }
      pending = null; it.job = null;
      budget.delete(pKey);
      box.append(c);
      if (shown) freeCanvas(shown.canvas);
      shown = it;
      budget.set(dKey, { page: i, kind: 'detay', px: r.pw * r.ph, visible: true }, dropDetail);
    }, e => {
      if (pending === it) { pending = null; budget.delete(pKey); }
      freeCanvas(c);
      if (!(e instanceof SessionExpired)) console.warn(`Sayfa ${i + 1} keskin çizilemedi.`, e);
    }).finally(() => renders.done(i, d));
  };
  // The pen layer: from the pen model once the file's strokes are loaded (task 4.6, also after the
  // pen is turned off: unsaved strokes stay on screen), else from pdf.js getAnnotations (task 4.5).
  // Task 4.7c: a file with Defter notes gets its model loaded in reading mode too (pressure).
  let layerGen = 0;
  const showLayer = (g: number, svg: string, vp: PenViewport) => {
    if (g !== layerGen || !mine()) return;
    m.vp = vp;
    dropLayer();
    if (!svg) return;
    box.insertAdjacentHTML('beforeend', svg);
    penLayer = [...box.querySelectorAll(':scope > svg.o-cizim:not(.canli)')];
  };
  const failed = (e: unknown) => {
    // the page is shown without its strokes (warned in sayfaIcerik)
    if (e instanceof SessionExpired && mine()) closeOkuyucu();
  };
  const layer = () => {
    if (!content || !mine()) return;
    const g = ++layerGen, key = fileKey(p);
    if (penModel.state(key) === 'hazir') {
      const svg = (vp: PenViewport) => penLayerSvg(penModel.inks(key, p.pdfSayfa! - 1), vp, 'normal');
      // viewport known: at once, so a finished stroke doesn't blink between the live path and the layer
      if (m.vp) showLayer(g, svg(m.vp), m.vp);
      else content.viewport(p).then(vp => showLayer(g, svg(vp), vp), failed);
    } else if (PEN_LAYER !== 'kapali') {
      // task 4.8a: strokes waiting on the device → the file's model (pdf-lib), even without Defter notes
      if (PEN_LAYER === 'normal' && pendingIds.has(p.dosyaId!)) loadFile(p, true);
      content.defterNotes(p).then(n => {
        showLayer(g, penLayerSvg(n.inks, n.viewport, PEN_LAYER), n.viewport);
        // task 4.7c: Defter notes here → the file's strokes with their pressure (pdf-lib, loaded only now)
        if (n.inks.length && PEN_LAYER === 'normal' && mine()) loadFile(p, true);
      }, failed);
    }
  };
  const m: Mounted = { release, detail, detailWant, wake, box, pdf: p, layer, ara: araKatman.ciz };
  mounted.set(i, m);
  draw();
  layer();
  araKatman.ciz();
}

function mountImage(i: number, p: BookPage, box: HTMLElement): void {
  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  let url: string | null = null, gone = false;
  mounted.set(i, {
    release: () => {
      gone = true;
      img.removeAttribute('src'); img.remove();
      if (url) URL.revokeObjectURL(url);
      box.classList.remove('ready');
    }
  });
  const my = session;
  content!.image(p).then(blob => {
    if (gone || my !== session) return;
    url = URL.createObjectURL(blob);
    img.onload = () => {
      if (gone) return;
      box.append(img); box.classList.add('ready');
      // Drive didn't know the size, or the photo's turn differs: fix the box
      const r = img.naturalHeight / img.naturalWidth;
      if (r && Math.abs(r - ratios[i]) > 0.01) {
        ratios[i] = r;
        if (prepared?.pages === pages) prepared.ratios[i] = r;
        if (mode === 'pdf') relayout(); else bookView?.refit(i);
      }
    };
    img.onerror = () => {
      if (gone) return;
      mounted.get(i)?.release(); mounted.delete(i);
      mountCard(i, box, '<p class="o-big">Bu resim gösterilemiyor.</p><p>Dosya JPG ya da PNG olmalı.</p>');
    };
    img.src = url;
  }).catch(e => {
    if (gone || my !== session) return;
    if (e instanceof SessionExpired) { closeOkuyucu(); return; }
    console.warn(`Resim ${i + 1} indirilemedi.`, e);
    mounted.get(i)?.release(); mounted.delete(i);
    mountCard(i, box, '<p class="o-big">Resim indirilemedi.</p><p>İnternet bağlantını kontrol et ve sayfayı yenile.</p>');
  });
}

async function drain(): Promise<void> {
  if (drawing) return;
  drawing = true;
  try {
    while (open && queue.size) {
      const cur = focusPage();
      let best = -1;
      for (const i of queue.keys()) if (best < 0 || Math.abs(i - cur) < Math.abs(best - cur)) best = i;
      const job = queue.get(best)!;
      queue.delete(best);
      await job();
    }
  } finally {
    drawing = false;
  }
}

// ---- pen mode (task 4.6) ----

const fileKey = (p: BookPage) => `${p.dosyaId}@${p.modifiedTime}`;

function setPen(on: boolean): void {
  if (on === penOn) return;
  if (on && !pages.some(p => pageKind(p) === 'pdf')) { toast('Bu sayfalarda çizilecek PDF yok.'); return; }
  const listTop = $('#oScroll').getBoundingClientRect().top;
  penOn = on;
  pen.active = on;
  if (!on) { pen.cancel(); pen.hideCursor(); toolbar.closePopover(); }
  if (!on && open) uploadNow();   // task 4.8b: pen off
  const el = $('#okuyucu');
  el.classList.toggle('kalem', on);
  // no Apple Pencil seen yet: one finger draws, so the list must not scroll under it
  el.classList.toggle('kalem-parmak', on && !pen.penSeen);
  showTool();
  const btn = $('#oPenBtn');
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', String(on));
  $('#oTools').hidden = !on;
  if (on) {
    penModel.retryFailed();
    loadVisibleFiles();
    toast('Kalem açık. Sayfa çevirmek için alttaki kaydırıcıyı ya da ok tuşlarını kullan.');
  }
  renderTools();
  // Task 6.H1: the page being read stays where it is on screen. Book mode: the bar's room is always kept
  // (nothing to do). PDF mode: the bar takes room from the list, so the list scrolls by as much.
  if (open && pages.length && mode === 'pdf') {
    relayout();
    const s = $('#oScroll');
    s.scrollTop += s.getBoundingClientRect().top - listTop;
  }
}

function renderTools(): void {
  const dirty = penModel.dirty;
  const kilit = isSampleId(folder) ? 'ornek' : 'acik';
  toolbar?.set({ preparing: penOn && penModel.loading, dirty, onDevice: pendingStore.ok, canUndo: penModel.canUndo, canRedo: penModel.canRedo, kayit: { kilit, durum: saveState } });
  // reading mode (no tool bar): a dot on the pen button
  const btn = document.querySelector<HTMLElement>('#oPenBtn');
  if (btn) {
    btn.classList.toggle('bekleyen', dirty);
    btn.title = dirty ? `Kalem · Kaydedilmemiş çizim var${pendingStore.ok ? ' (cihazda)' : ''}` : 'Kalem';
  }
}

// Task 4.8a: the file's record now (bekleyenKayit.ts); null: its strokes aren't loaded
function pendingSnapshot(fileId: string): PendingRecord | null {
  const key = penModel.keyOf(fileId);
  if (!key) return null;
  const prev = penModel.restored(key);
  const rec: PendingRecord = {
    fileId, kaynakModifiedTime: versionOf(key), dosyaAdi: penFileNames.get(key) ?? prev?.dosyaAdi ?? '',
    ...penModel.diff(key), guncelleme: new Date().toISOString()
  };
  if (prev?.baskaSurum) rec.baskaSurum = prev.baskaSurum;
  return rec;
}

// A file's strokes changed: on the device in 300 ms, to Drive 30 s after the last change
function changed(fileId: string): void {
  saver.changed(fileId);
  uploader.soon(fileId);
}

// Task 4.8b: upload these files (default: the loaded ones with unsaved strokes) now
function uploadNow(fileIds: string[] = penModel.dirtyFileIds()): void {
  if (fileIds.length) void uploader.request(fileIds);
}

// The record to upload: from the model when it has the file (freshest), else the device's
async function uploadSource(fileId: string): Promise<PendingRecord | null> {
  const snap = pendingSnapshot(fileId);
  if (snap) return snap;
  await saver.flush();
  return pendingStore.get(fileId);
}

// The upload worked. The cache gets the new bytes; then, without an await in between, everything in
// memory moves to the new version: the pages (their key → the model's key), the caches, the model
// (rebase: what was drawn / erased during the upload stays unsaved). The pdf.js document that is open
// is NOT reloaded: only Defter's notes changed, and the canvas doesn't draw those (noView); the pen layer
// draws them from the model. Reloading would redraw every canvas (blinking, iPad memory) for nothing.
async function fileUploaded(u: Uploaded): Promise<void> {
  await putPdf(u.fileId, u.modifiedTime, u.bytes);
  latestVersion.set(u.fileId, u.modifiedTime);
  const id = u.fileId, oldKey = `${id}@${u.kaynakModifiedTime}`, newKey = `${id}@${u.modifiedTime}`;
  moveVersion(id, u.kaynakModifiedTime, u.modifiedTime);
  if (penModel.state(oldKey) === 'hazir') {
    penModel.rebase(oldKey, newKey, u.pages, remainingDiff(u.sent, penModel.diff(oldKey), u.removed));
    for (const m of mounted.values()) if (m.pdf && fileKey(m.pdf) === newKey) m.layer?.();
    saver.changed(id);
    void saver.flush();   // the record follows the model now (nothing left: it goes)
  } else {
    void saver.uploaded(id, u.modifiedTime, u.sent, u.removed);
  }
  renderTools();
}

// The file id's version oldMt → newMt everywhere in memory (pages, page cache, topic cache, file names)
function moveVersion(id: string, oldMt: string, newMt: string): void {
  if (oldMt === newMt) return;
  metin?.unut(id);   // task 6.3b: read again on the next search
  const move = (f: { modifiedTime?: string } | null) => { if (f?.modifiedTime === oldMt) f.modifiedTime = newMt; };
  const movePage = (p: BookPage) => { if (p.dosyaId === id) move(p); };
  pages.forEach(movePage);
  prepared?.pages.forEach(movePage);
  const from = `${id}@${oldMt}`, to = `${id}@${newMt}`;
  for (const [k, v] of [...pageCache]) {
    v.pages.forEach(movePage);
    const nk = k.split(',').map(x => x === from ? to : x).join(',');
    if (nk !== k) { pageCache.delete(k); pageCache.set(nk, v); }
  }
  for (const t of topicCache.values()) {
    t.then(m => {
      if (m) for (const list of Object.values(m)) for (const it of list) for (const f of [it.file, it.cozum]) if (f?.id === id) move(f);
    }, () => {});
  }
  const name = penFileNames.get(from);
  if (name !== undefined) { penFileNames.delete(from); penFileNames.set(to, name); }
}

// Task 5.6: adding pages at the end of a file (ozeteEkle.ts) goes through the pen's queue and cache.
// Task 5.7: a new ozet.pdf (konuyaEkle.ts): its bytes into the cache, the topics are listed again.
export function sayfaEklemeOrtami(): Pick<KonuEklemeOrtami, 'deps' | 'sirada' | 'degisti' | 'yeniDosya' | 'konuDegisti'> {
  return {
    deps: uploadDeps, sirada: (id, job) => uploader.sirada(id, job), degisti: pagesAdded,
    yeniDosya: async f => { await putPdf(f.id, f.modifiedTime, f.bytes); latestVersion.set(f.id, f.modifiedTime); },
    // a topic folder got a new file: every topic is listed again when it opens (a cheap listing).
    // An open reader on that topic lists it again after the adding (task 5.8g, refreshTopic).
    konuDegisti: () => topicCache.clear(),
  };
}

// Pages were added at the end of a file: its new bytes go into the cache (the old version goes), the page
// lists made from the old version are forgotten (the page count changed), the topics' file entries
// follow the new version: the file opens with its new pages next time. The page list on screen grows in
// afterAdding (task 5.8g, refreshList); the pen record is fine: the old pages keep their numbers.
async function pagesAdded(s: EklenenSayfalar): Promise<void> {
  await putPdf(s.fileId, s.modifiedTime, s.bytes);
  latestVersion.set(s.fileId, s.modifiedTime);
  // task 5.8g: an open reader draws this file from the new version (the old pages are the same in it)
  content?.newVersion(s.fileId, s.modifiedTime);
  metin?.unut(s.fileId);   // task 6.3b
  const has = (p: BookPage) => p.dosyaId === s.fileId;
  for (const [k, v] of [...pageCache]) if (v.pages.some(has)) pageCache.delete(k);
  if (prepared?.pages.some(has)) prepared = null;
  for (const t of topicCache.values()) {
    t.then(m => {
      if (m) for (const list of Object.values(m)) for (const it of list) for (const f of [it.file, it.cozum]) if (f?.id === s.fileId) f.modifiedTime = s.modifiedTime;
    }, () => {});
  }
}

// The uploader's status → tool bar; errors and "offline" told once as a toast, success when the reader is closed
function uploadStatus(s: UploadStatus): void {
  saveState = s;
  if (s.tur === 'hata' || s.tur === 'cevrimdisi') {
    const text = s.tur === 'hata' ? s.mesaj : 'İnternet yok. Çizimler bu cihazda; bağlanınca Drive\'a kaydedilecek.';
    if (text !== lastSaveToast) { lastSaveToast = text; toast(text); }
  } else if (s.tur === 'kaydedildi') {
    lastSaveToast = '';
    if (!open) toast('Çizimler Drive\'a kaydedildi.');
  }
  renderTools();
}

// The device's store failed: told once (the strokes stay in memory while the reader is open)
function warnStore(): void {
  if (storeWarned) return;
  storeWarned = true;
  toast('Çizimler bu cihaza kaydedilemiyor. Okuyucuyu ya da sekmeyi kapatırsan kaybolur.');
  renderTools();
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement
  || (t instanceof HTMLElement && t.isContentEditable);

// The pen layers of the mounted pages showing this file's page (pdfPage: 0-based) are drawn again
function relayer(key: string, pdfPage: number): void {
  for (const [i, m] of mounted) if (m.pdf && fileKey(m.pdf) === key && pages[i].pdfSayfa === pdfPage + 1) m.layer?.();
}

// Task 4.7: undo (redo = false) / redo. A stroke being drawn (or an eraser drag) is dropped first.
// The page isn't turned to: when the change is not on screen, a toast says where it was.
function undoRedo(redo: boolean): void {
  if (!open) return;
  pen.cancel();
  const c = redo ? penModel.redo() : penModel.undo();
  renderTools();
  if (!c) return;
  for (const key of new Set(c.places.map(p => p.key))) changed(fileIdOf(key));
  for (const p of c.places) relayer(p.key, p.page);
  if (c.places.length && !c.places.some(onScreen)) toast(`${whereText(c.places[0])} ${redo ? 'yinelendi' : 'geri alındı'}.`);
}

// Task 4.7b: the tool on #okuyucu (the cursor over the pages, styles.css)
function showTool(): void {
  const el = $('#okuyucu'), t = toolbar.tool;
  for (const k of ['kalem', 'fosforlu', 'silgi'] as const) el.classList.toggle(`arac-${k}`, penOn && t === k);
}

function onScreen(c: Place): boolean {
  return [...mounted.keys()].some(i => {
    const p = pages[i];
    return isVisible(i) && !!p.pdfSayfa && fileKey(p) === c.key && p.pdfSayfa === c.page + 1;
  });
}

// "Sayfa 12'de": the reader's page number; a file not open now: its PDF page and its name
function whereText(c: Place): string {
  const i = pages.findIndex(p => p.pdfSayfa === c.page + 1 && pageKind(p) === 'pdf' && fileKey(p) === c.key);
  if (i >= 0) return `Sayfa ${locative(i + 1)}`;
  const name = penFileNames.get(c.key);
  return name ? `${name}, sayfa ${locative(c.page + 1)}` : `Sayfa ${locative(c.page + 1)}`;
}

// Pen mode: the files of the pages on screen get their strokes loaded (once per file);
// until then, and if it fails, the pen doesn't draw on that file's pages.
function loadVisibleFiles(): void {
  if (!penOn) return;
  for (const [i, m] of mounted) if (m.pdf && isVisible(i)) loadFile(m.pdf);
}

// file key → its name (for the undo toast when the file is not open now)
const penFileNames = new Map<string, string>();

// quiet (task 4.7c): reading mode, the file has Defter notes; it is read for the Apple Pencil's
// pressure (only pdf-lib gives it), its layer then draws from the model. A failure there is not
// told (the page keeps the pdf.js strokes) until the pen is turned on.
function loadFile(p: BookPage, quiet = false): void {
  const key = fileKey(p);
  if (p.ad) penFileNames.set(key, p.ad);
  if (penModel.state(key)) {
    if (!quiet) tellError(p, key);   // it failed in reading mode: told now, once
    return;
  }
  const my = session;
  void penModel.ensure(key, async () => new Uint8Array(await getPdf(p.dosyaId!, p.modifiedTime!)), () => pendingStore.get(p.dosyaId!)).then(() => {
    if (!open || my !== session) return;
    if (penModel.state(key) === 'hata') {
      if (!quiet || penOn) tellError(p, key);
    } else {
      for (const m of mounted.values()) if (m.pdf && fileKey(m.pdf) === key) m.layer?.();
      // task 4.8a: a pending record was applied
      const r = penModel.restored(key);
      if (r) {
        if (restoreTold !== session) { restoreTold = session; toast('Kaydedilmemiş çizimler geri yüklendi.'); }
        // made against another version: written again (now against this one, marked baskaSurum)
        if (r.kaynakModifiedTime !== p.modifiedTime) saver.changed(p.dosyaId!);
        uploadNow([p.dosyaId!]);   // task 4.8b: left from before → tried once now
      }
    }
    renderTools();
  });
  renderTools();
}

// The file's error, once (takeError)
function tellError(p: BookPage, key: string): void {
  const err = penModel.takeError(key);
  if (err instanceof SessionExpired) { closeOkuyucu(); return; }
  if (!err) return;
  console.warn(`Kalem: "${p.ad}" okunamadı.`, err);
  const name = p.ad ?? 'PDF';
  toast(err instanceof PdfYazilamaz
    ? `Kalem bu dosyada çalışmıyor (${name}). ${err.message}`
    : `Kalem bu dosyada açılamadı (${name}). İnternet bağlantını kontrol et; kalemi kapatıp açınca tekrar denenir.`);
}
