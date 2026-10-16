import { SessionExpired } from '../drive/drive';
import { penLayerSvg } from '../kalem/cizimKatmani';
import { IdbPendingStore } from '../kalem/bekleyenDepo';
import type { PendingRecord } from '../kalem/bekleyenFark';
import { PendingSaver } from '../kalem/bekleyenKayit';
import { PenModel, fileIdOf, versionOf, type Place } from '../kalem/cizimModeli';
import { locative } from '../kalem/gecmis';
import { penLayerMode } from '../kalem/defterNotu';
import { PenToolbar, strokeStyle } from '../kalem/kalemCubugu';
import { PenInput } from '../kalem/kalemModu';
import type { PenViewport } from '../kalem/koordinat';
import { PdfYazilamaz } from '../kalem/pdfNotlari';
import type { Book, ChapterStatus, PageMark } from '../model/types';
import { bookUnits, usesUnits } from '../model/units';
import { esc } from '../ui/dom';
import { fpsCounter } from '../ui/fps';
import { setCanvasStats } from '../ui/tani';
import { ST } from '../ui/reader';
import { toast } from '../ui/toast';
import { CanvasBudget, deviceLimits, shareBudget } from './canvasButcesi';
import { SingleFlight } from './cizimKuyrugu';
import { getPdf } from './pdfOnbellek';
import { SourceResolver } from './kaynakCoz';
import { visiblePages } from './kitapDuzen';
import { BookView } from './kitapModu';
import { buildBookPages, buildSolutionPages, buildTopicPages, type BookPage } from './kitapSayfalari';
import { MATERIAL_LABEL, availableKinds, defaultKind, discoverTopic, type MaterialKind, type TopicMaterials } from './konuKesfi';
import { discoverSampleTopic, isSampleId } from './ornekKaynak';
import { autoTopicStatus, cycleStatus, markChapterPage, markTopicPage, type Resume } from './okumaDurumu';
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
  materials: TopicMaterials;
  kind: MaterialKind;
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
let layout: Layout = layoutPages([], 0);
let baseWidth = 0;             // PDF mode: page width at 100 %
let width = 0;                 // … at the current zoom
let pageLeft = 0;              // x of the pages inside the scroll content
let boxes: HTMLElement[] = [];
const mounted = new Map<number, Mounted>();
let onClosed: () => void = () => {};
let sliding = false;
let tocOpen = false;

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

export const isOkuyucuOpen = () => open;

export function initOkuyucu(): void {
  $('#oClose').addEventListener('click', closeOkuyucu);
  const scroller = $('#oScroll');
  let raf = 0;
  scroller.addEventListener('scroll', () => {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); });
    zoom.settleLater();
  }, { passive: true });
  // capture + stop: Esc must close only the reader, not the book behind it
  // the page hides / closes: what changed is written at once (no 300 ms wait)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void saver.flush(); });
  addEventListener('pagehide', () => { void saver.flush(); });
  void pendingStore.listIds().then(ids => {
    for (const id of ids) pendingIds.add(id);
    // the reader opened before the list came: its pages look again
    if (open && ids.length) for (const m of mounted.values()) m.layer?.();
  });

  addEventListener('keydown', e => {
    if (!open) return;
    if (e.key === 'Escape') { e.stopPropagation(); if (tocOpen) closeToc(); else closeOkuyucu(); return; }
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
    rt = window.setTimeout(() => { if (open && pages.length) { zoom.reset(); dropDetails(); relayout(); } }, 150);
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
      saver.changed(p.dosyaId!);
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
      for (const id of erasedFiles) saver.changed(id);
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
  $('#oTocList').addEventListener('click', e => {
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
  $('#okuyucu').classList.remove('toc-open');
  $('#oTocBtn').setAttribute('aria-expanded', 'false');
  setTimeout(() => { if (!tocOpen) $('#oToc').hidden = $('#oScrim').hidden = true; }, 260);
}

// surum 2: the topic chosen last; surum 1: the chapter of the page on screen.
function currentTopic(): { unit: number; topic: number } {
  if (!book || usesUnits(book) || !pages.length) return current;
  return { unit: 0, topic: pages[focusPage()].bolumIndex };
}

function renderToc(): void {
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
  autoTopicStatus(book, unit, topicIndex, 'girildi');
  topic = null;
  zoom.reset();
  releaseAll();
  clearPages();
  renderBar();
  $('#oChap').textContent = t.baslik;
  setMessage('Konu açılıyor…');
  try {
    const m = await discover(folder, t.klasor ?? '');
    if (my !== session) return;
    if (!m) { setMessage(`Konu klasörü bulunamadı: ${t.klasor}. Drive'da kitabın klasöründe bu klasörü oluştur ve yenile.`); return; }
    const kind = resume?.materyal && m[resume.materyal].length ? resume.materyal : defaultKind(m);
    if (!kind) { setMessage('Henüz materyal yok.'); return; }
    topic = { title: t.baslik, materials: m, kind, fileIndex: 0, solution: false };
  } catch (e) {
    if (my === session) loadFailed(e);
    return;
  }
  const mark = resume?.dosya && resume.materyal === topic.kind ? { dosya: resume.dosya, sayfa: resume.sayfa } : savedMark(topic);
  await showMaterial(mark && useMark(topic, mark));
}

// The ribbon of the open topic's current material.
function savedMark(t: OpenTopic): PageMark | null {
  return book?.uniteler[current.unit]?.konular[current.topic]?.kurdeleler[t.kind] ?? null;
}

// Übungen / Ödevler: the mark chooses the file (and the solution, if it was in it). null: its file is gone.
function useMark(t: OpenTopic, mark: PageMark): PageMark | null {
  const list = t.kind === 'uebungen' || t.kind === 'oedevler' ? t.materials[t.kind] : null;
  if (!list) return mark;
  const i = list.findIndex(m => m.file.name === mark.dosya || m.cozum?.name === mark.dosya);
  if (i < 0) return null;
  t.fileIndex = i;
  t.solution = list[i].cozum?.name === mark.dosya;
  return mark;
}

// The chosen material of the open topic (+ its solution below it, when "Çözümü göster" is on).
// start: open at this page (a ribbon); otherwise at the start (or at the solution).
async function showMaterial(start?: PageMark | null): Promise<void> {
  if (!topic || !content) return;
  const t = topic, my = ++session;
  mainCount = 0;
  zoom.reset();
  releaseAll();
  clearPages();
  renderBar();
  setMessage('Sayfalar hazırlanıyor…');

  const material = t.kind === 'uebungen' || t.kind === 'oedevler' ? t.materials[t.kind][t.fileIndex] : null;
  const files = material ? [material.file] : t.materials[t.kind].map(m => m.file);
  const cozum = t.solution ? material?.cozum ?? null : null;
  const key = (list: { id: string; modifiedTime: string }[]) => list.map(f => `${f.id}@${f.modifiedTime}`).join(',');
  const at = (list: BookPage[], def: number) => {
    const i = start ? list.findIndex(p => p.ad === start.dosya && p.pdfSayfa === start.sayfa) : -1;
    return i >= 0 ? i : def;
  };
  try {
    const main = await cached(key(files), () => buildTopicPages(t.materials, t.kind, t.fileIndex), my);
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
function renderBar(): void {
  const bar = $('#oBar');
  bar.hidden = !topic;
  if (!topic) return;
  const t = topic;
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
  const list = t.kind === 'uebungen' || t.kind === 'oedevler' ? t.materials[t.kind] : null;
  $('#oFiles').hidden = !list;
  if (!list) return;
  const select = $<HTMLSelectElement>('#oFile');
  select.replaceChildren(...list.map((m, i) => new Option(m.file.name.replace(/\.pdf$/i, ''), String(i))));
  select.value = String(t.fileIndex);
  const sol = $('#oSol');
  sol.hidden = !list[t.fileIndex]?.cozum;
  sol.textContent = t.solution ? 'Çözümü gizle' : 'Çözümü göster';
  sol.setAttribute('aria-pressed', String(t.solution));
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
}

function showPages(p: BookPage[], r: number[], scrollTo: number, emptyText: string): void {
  pages = p;
  ratios = [...r];
  if (!pages.length) { setMessage(emptyText); return; }
  setMessage(null);
  enterMode(scrollTo);
}

export function closeOkuyucu(): void {
  if (!open) return;
  open = false;
  session++;
  cancelAnimationFrame(fpsRaf); fpsRaf = 0;
  setPen(false);
  void saver.flush();   // task 4.8a: the records are taken now, before the model goes
  penModel.clear();     // the strokes and the undo history are gone (the unsaved ones are on the device)
  penFileNames.clear();
  renderTools();
  closeToc();
  releaseAll();
  zoom.reset();
  void content?.close();
  content = null;
  topic = null;
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
  boxes = pages.map(p => {
    const box = document.createElement('div');
    box.className = 'o-page';
    box.dataset.kind = pageKind(p);
    return box;
  });
  $('#oPages').replaceChildren(...boxes);
  setPdfGeometry();
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
  const release = () => { gone = true; sleep(); dropLayer(); };
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
  const m: Mounted = { release, detail, detailWant, wake, box, pdf: p, layer };
  mounted.set(i, m);
  draw();
  layer();
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
  penOn = on;
  pen.active = on;
  if (!on) { pen.cancel(); pen.hideCursor(); }
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
  if (open && pages.length) relayout();   // the tool bar takes room from the pages
}

function renderTools(): void {
  const dirty = penModel.dirty;
  toolbar?.set({ preparing: penOn && penModel.loading, dirty, onDevice: pendingStore.ok, canUndo: penModel.canUndo, canRedo: penModel.canRedo });
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
  for (const key of new Set(c.places.map(p => p.key))) saver.changed(fileIdOf(key));
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
