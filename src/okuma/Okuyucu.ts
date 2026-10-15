import { SessionExpired } from '../drive/drive';
import type { Book } from '../model/types';
import { bookUnits, usesUnits } from '../model/units';
import { esc } from '../ui/dom';
import { toast } from '../ui/toast';
import { SourceResolver } from './kaynakCoz';
import { buildBookPages, buildSolutionPages, buildTopicPages, type BookPage } from './kitapSayfalari';
import { MATERIAL_LABEL, availableKinds, defaultKind, discoverTopic, type MaterialKind, type TopicMaterials } from './konuKesfi';
import { PageContent, pageKind } from './sayfaIcerik';
import { PAD_TOP, canvasSize, currentPage, layoutPages, visibleRange, type Layout } from './sanalListe';

// Full-screen reader, PDF mode (task 3.2). Pages one under the other.
// surum 1: all pages of the book. surum 2 (task 3.2b): one material of one topic, chosen with tabs.
// Only the visible pages ±2 have a canvas / photo; the others are grey boxes of the right size.

const MAX_WIDTH = 760;   // prototype #pdfView: min(760px, 100vw − 32px)
const SIDE = 16;

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;

interface Mounted { release(): void }

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

let open = false;
let session = 0;               // increases on every open/close: late answers of an old one are ignored
let book: Book | null = null;
let pages: BookPage[] = [];
let ratios: number[] = [];
let content: PageContent | null = null;
let layout: Layout = layoutPages([], 0);
let width = 0;
let boxes: HTMLElement[] = [];
const mounted = new Map<number, Mounted>();
let onClosed: () => void = () => {};

// PDF pages are drawn one at a time (iPad memory), the one nearest the current page first.
const queue = new Map<number, () => Promise<void>>();
let drawing = false;

export const isOkuyucuOpen = () => open;

export function initOkuyucu(): void {
  $('#oClose').addEventListener('click', closeOkuyucu);
  const scroller = $('#oScroll');
  let raf = 0;
  scroller.addEventListener('scroll', () => {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); });
  }, { passive: true });
  // capture + stop: Esc must close only the reader, not the book behind it
  addEventListener('keydown', e => {
    if (open && e.key === 'Escape') { e.stopPropagation(); closeOkuyucu(); }
  }, true);
  let rt: number | undefined;
  addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => { if (open && pages.length) relayout(); }, 150); });

  // surum 2: tabs, file chooser, solution (all stay on the same topic)
  $('#oTabs').addEventListener('click', e => {
    const kind = (e.target as HTMLElement).closest<HTMLElement>('[data-kind]')?.dataset.kind as MaterialKind | undefined;
    if (!topic || !kind || kind === topic.kind) return;
    topic.kind = kind; topic.fileIndex = 0; topic.solution = false;
    void showMaterial();
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
}

// The book left the desk (or the library was reloaded): forget its pages.
export function forgetBook(): void {
  prepared = null;
  topicCache.clear();
  pageCache.clear();
  resolver = null;
}

// unit / topicIndex: as in bookUnits (surum 1: unit 0 "Genel", topic = chapter).
export async function openOkuyucu(b: Book, folderId: string, unit: number, topicIndex: number, closed: () => void): Promise<void> {
  if (open) return;
  const t = bookUnits(b)[unit]?.konular[topicIndex];
  if (!t) return;
  const v2 = usesUnits(b);
  if (!v2 && !t.kaynaklar?.length) { toast('Bu bölümde henüz kaynak yok.'); return; }
  open = true;
  const my = ++session;
  book = b; onClosed = closed;
  content = new PageContent();
  topic = null;

  $('#oBook').textContent = b.baslik;
  $('#oChap').textContent = t.baslik;
  $('#oPno').textContent = '';
  clearPages();
  renderBar();
  setMessage(v2 ? 'Konu açılıyor…' : 'Sayfalar hazırlanıyor…');
  const el = $('#okuyucu');
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));

  if (v2) {
    try {
      const m = await discover(folderId, t.klasor ?? '');
      if (my !== session) return;
      if (!m) { setMessage(`Konu klasörü bulunamadı: ${t.klasor}. Drive'da kitabın klasöründe bu klasörü oluştur ve yenile.`); return; }
      const kind = defaultKind(m);
      if (!kind) { setMessage('Henüz materyal yok.'); return; }
      topic = { title: t.baslik, materials: m, kind, fileIndex: 0, solution: false };
    } catch (e) {
      if (my === session) loadFailed(e);
      return;
    }
    await showMaterial();
    return;
  }

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

  showPages(prepared.pages, prepared.ratios, Math.max(0, prepared.pages.findIndex(p => p.bolumIndex === topicIndex)), 'Bu kitapta gösterilecek sayfa yok.');
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
    if (resolver?.folderId !== folderId) resolver = { folderId, r: new SourceResolver(folderId) };
    p = discoverTopic(resolver.r, klasor);
    p.catch(() => topicCache.delete(key));   // don't remember a failed request
    topicCache.set(key, p);
  }
  return p;
}

// The chosen material of the open topic (+ its solution below it, when "Çözümü göster" is on).
async function showMaterial(): Promise<void> {
  if (!topic || !content) return;
  const t = topic, my = ++session;
  releaseAll();
  clearPages();
  renderBar();
  setMessage('Sayfalar hazırlanıyor…');

  const material = t.kind === 'uebungen' || t.kind === 'oedevler' ? t.materials[t.kind][t.fileIndex] : null;
  const files = material ? [material.file] : t.materials[t.kind].map(m => m.file);
  const cozum = t.solution ? material?.cozum ?? null : null;
  const key = (list: { id: string; modifiedTime: string }[]) => list.map(f => `${f.id}@${f.modifiedTime}`).join(',');
  try {
    const main = await cached(key(files), () => buildTopicPages(t.materials, t.kind, t.fileIndex), my);
    if (my !== session) return;
    if (!cozum) { showPages(main.pages, main.ratios, 0, 'Bu materyalde gösterilecek sayfa yok.'); return; }
    const sol = await cached(key([cozum]), () => buildSolutionPages(cozum), my);
    if (my !== session) return;
    showPages([...main.pages, ...sol.pages], [...main.ratios, ...sol.ratios], main.pages.length, 'Bu materyalde gösterilecek sayfa yok.');
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
  $('#oPno').textContent = '';
}

function showPages(p: BookPage[], r: number[], scrollTo: number, emptyText: string): void {
  pages = p;
  ratios = [...r];
  if (!pages.length) { setMessage(emptyText); return; }
  setMessage(null);
  build();
  $('#oScroll').scrollTop = layout.tops[scrollTo] - PAD_TOP;
  update();
}

export function closeOkuyucu(): void {
  if (!open) return;
  open = false;
  session++;
  releaseAll();
  void content?.close();
  content = null;
  topic = null;
  const el = $('#okuyucu');
  el.classList.remove('show');
  setTimeout(() => {
    if (open) return;
    el.hidden = true;
    $('#oPages').replaceChildren();
    boxes = [];
  }, 300);
  pages = []; ratios = []; book = null;
  onClosed();
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
  width = measureWidth();
  layout = layoutPages(ratios, width);
  const holder = $('#oPages');
  holder.style.width = width + 'px';
  holder.style.height = layout.total + 'px';
  boxes = pages.map((p, i) => {
    const box = document.createElement('div');
    box.className = 'o-page';
    box.dataset.kind = pageKind(p);
    place(box, i);
    return box;
  });
  holder.replaceChildren(...boxes);
}

function place(box: HTMLElement, i: number): void {
  box.style.top = layout.tops[i] + 'px';
  box.style.height = layout.heights[i] + 'px';
}

// New width (rotation) or a page got its real size: stay on the same spot of the same page.
function relayout(): void {
  const s = $('#oScroll');
  const cur = currentPage(layout, s.scrollTop, s.clientHeight);
  const into = (s.scrollTop - layout.tops[cur]) / Math.max(1, layout.heights[cur]);
  const newWidth = measureWidth();
  const sizeChanged = newWidth !== width;
  width = newWidth;
  layout = layoutPages(ratios, width);
  $('#oPages').style.width = width + 'px';
  $('#oPages').style.height = layout.total + 'px';
  boxes.forEach(place);
  if (sizeChanged) releaseAll();   // canvases were drawn for the old width
  s.scrollTop = layout.tops[cur] + into * layout.heights[cur];
  update();
}

// ---- virtual list ----

function update(): void {
  if (!open || !pages.length) return;
  const s = $('#oScroll');
  const [first, last] = visibleRange(layout, s.scrollTop, s.clientHeight);
  for (const [i, m] of mounted) if (i < first || i > last) { m.release(); mounted.delete(i); queue.delete(i); }
  for (let i = first; i <= last; i++) if (!mounted.has(i)) mount(i);

  const cur = currentPage(layout, s.scrollTop, s.clientHeight);
  // surum 1: the chapter of the current page; surum 2: the topic's title stays
  if (!topic) $('#oChap').textContent = book!.bolumler[pages[cur].bolumIndex]?.baslik ?? '';
  $('#oPno').textContent = `${cur + 1} / ${pages.length}`;
  void drain();
}

function releaseAll(): void {
  for (const m of mounted.values()) m.release();
  mounted.clear();
  queue.clear();
}

function mount(i: number): void {
  const p = pages[i], box = boxes[i];
  switch (pageKind(p)) {
    case 'pdf': return mountPdf(i, p, box);
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

function mountPdf(i: number, p: BookPage, box: HTMLElement): void {
  const canvas = document.createElement('canvas');
  const { w, h } = canvasSize(width, layout.heights[i], devicePixelRatio);
  canvas.width = w; canvas.height = h;
  let job: { cancel(): void } | null = null;
  const release = () => {
    job?.cancel(); job = null;
    canvas.width = canvas.height = 0;   // Safari frees the canvas memory only like this
    canvas.remove();
    box.classList.remove('ready');
  };
  mounted.set(i, { release });
  queue.set(i, async () => {
    if (!content) return;
    const d = content.drawPdf(p, canvas);
    job = d;
    try {
      await d.promise;
      if (mounted.get(i)?.release === release) { box.append(canvas); box.classList.add('ready'); }
    } catch (e) {
      if (e instanceof SessionExpired) { closeOkuyucu(); return; }
      console.warn(`Sayfa ${i + 1} çizilemedi.`, e);
      if (mounted.get(i)?.release === release) {
        release(); mounted.delete(i);
        mountCard(i, box, '<p class="o-big">Bu sayfa çizilemedi.</p><p>Sayfayı yenileyip tekrar dene.</p>');
      }
    } finally { job = null; }
  });
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
      if (r && Math.abs(r - ratios[i]) > 0.01) { ratios[i] = r; if (prepared?.pages === pages) prepared.ratios[i] = r; relayout(); }
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
      const s = $('#oScroll');
      const cur = currentPage(layout, s.scrollTop, s.clientHeight);
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
