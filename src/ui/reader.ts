import type { Book, ChapterStatus, SourceType } from '../model/types';
import { bookUnits, topicCount, usesUnits } from '../model/units';
import { cycleStatus, resumeOf, type Resume } from '../okuma/okumaDurumu';
import { icindekilerDugmesi, isOkuyucuOpen } from '../okuma/Okuyucu';
import { isDark } from '../scene/units';
import { esc } from './dom';
import { viewSize } from './ekran';
import { measureContents } from './icindekilerOlcum';
import type { ContentsPage } from './icindekilerSayfalama';

// Open book on the desk (2D overlay): title + measured contents pages.
// PDF pages belong to the separate full-screen reader, never to this page list.

const PAGE_AR = 1.4142;   // A4, same as a PDF page

const ICON: Record<SourceType, string> = {
  pdf: '<svg viewBox="0 0 16 16"><path d="M4 1h6l3 3v11H4z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 1v3h3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  defter: '<svg viewBox="0 0 16 16"><rect x="3" y="1.5" width="10" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 5h5M5.5 8h5M5.5 11h3" stroke="currentColor" stroke-width="1.2"/></svg>',
  claude: '<svg viewBox="0 0 16 16"><path d="M8 1.5v13M1.5 8h13M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  link: '<svg viewBox="0 0 16 16"><path d="M6.5 9.5l3-3M7 4.5l1.5-1.5a2.8 2.8 0 0 1 4 4L11 8.5M9 11.5L7.5 13a2.8 2.8 0 0 1-4-4L5 7.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
};
const SRC_LABEL: Record<SourceType, string> = { pdf: 'PDF', defter: 'Defter', claude: 'Claude', link: 'Link' };
export const ST: Record<ChapterStatus, [cls: string, label: string]> = {
  okunmadi: ['todo', 'Okunmadı'], okunuyor: ['reading', 'Okunuyor'], okundu: ['read', 'Okundu'],
  calisildi: ['done', 'Çalışıldı'], tekrar: ['review', 'Tekrar']
};

export interface ReaderContext {
  shelfName: string | null;     // null = "Yeni gelenler"
  daysSinceOpened: number | null;
  owner: string | null;         // null = sample library
}

// Turkish genitive with apostrophe: Deniz'in, Ayşe'nin, Umut'un, Gül'ün.
function genitive(name: string): string {
  const first = name.trim().split(/\s+/)[0] || name;
  const lower = first.toLocaleLowerCase('tr-TR');
  const vowels = [...lower].filter(c => 'aeıioöuü'.includes(c));
  const last = vowels.at(-1) ?? 'e';
  const v = 'aı'.includes(last) ? 'ı' : 'ei'.includes(last) ? 'i' : 'ou'.includes(last) ? 'u' : 'ü';
  return `${first}'${'aeıioöuü'.includes(lower.at(-1)!) ? 'n' : ''}${v}n`;
}

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;

let book: Book | null = null;
let ctx: ReaderContext = { shelfName: null, daysSinceOpened: null, owner: null };
let idx = 0, pw = 0, single = false, busy = false;
let onClose: () => void = () => {};
let onChapter: (unit: number, topic: number, resume?: Resume) => void = () => {};
let onEdit: () => void = () => {};
let contents: ContentsPage[] = [[]];
let anchor: string | null = null;
let layoutTicket = 0, layoutFrame = 0, turnTimer = 0;
let opening = false, measuredSize = '';
const motionTimers = new Set<number>();
const pageCount = () => 1 + contents.length;
const pageStep = () => single ? 1 : 2;
const spreadStart = (i: number) => single ? i : i - i % 2;

function el(tag: string, cls: string, parent?: HTMLElement, html?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

// chapter(unit, topic): indices as in bookUnits (surum 1: unit 0 "Genel", topic = chapter)
// resume: "Kaldığın yerden devam" (task 3.5)
// edit (6.K5b-3): "İçindekileri düzenle" → the full-screen reader with no topic, its contents panel in edit mode
export function initReader(close: () => void, chapter: (unit: number, topic: number, resume?: Resume) => void, edit: () => void): void {
  onClose = close;
  onChapter = chapter;
  onEdit = edit;
  $('#rClose').addEventListener('click', closeReader);
  $('#prev').addEventListener('click', () => flipTo(idx - pageStep()));
  $('#next').addEventListener('click', () => flipTo(idx + pageStep()));
  addEventListener('keydown', e => {
    if (!book || isOkuyucuOpen()) return;   // the full-screen reader is on top
    if (e.key === 'Escape') closeReader();
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      flipTo(idx + (e.key === 'ArrowRight' ? 1 : -1) * pageStep());
    }
  });
  addEventListener('resize', requestLayout);
  addEventListener('orientationchange', requestLayout);
  document.fonts.addEventListener('loadingdone', requestLayout);
  const resize = new ResizeObserver(() => {
    if (book && layoutSize() !== measuredSize) requestLayout();
  });
  for (const selector of ['#reader', '.r-top', '.r-bottom']) resize.observe($(selector));
  // swipe left/right to turn the page (as in the prototype)
  let swipe: { x: number; y: number } | null = null;
  $('#spreadWrap').addEventListener('pointerdown', e => { swipe = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointerup', e => {
    if (!swipe || !book || isOkuyucuOpen()) { swipe = null; return; }
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) flipTo(idx + (dx < 0 ? 1 : -1) * pageStep());
  });
}

export const isReaderOpen = () => book !== null;

// The reading state changed (the full-screen reader closed): draw the pages again.
export function refreshReader(): void {
  requestLayout();
}

// ---- layout ----

function layoutSize(): string {
  const { w, h } = viewSize();
  return `${w}:${h}:${$('.r-top').offsetHeight}:${$('.r-bottom').offsetHeight}`;
}

function requestLayout(): void {
  if (!book) return;
  const ticket = ++layoutTicket;
  cancelAnimationFrame(layoutFrame);
  void document.fonts.ready.then(() => {
    if (!book || ticket !== layoutTicket) return;
    layoutFrame = requestAnimationFrame(() => {
      if (!book || ticket !== layoutTicket) return;
      renderAll();
      if (opening) { opening = false; animateCover(book); }
    });
  });
}

function later(fn: () => void, ms: number): void {
  const timer = window.setTimeout(() => { motionTimers.delete(timer); fn(); }, ms);
  motionTimers.add(timer);
}

function stopMotion(): void {
  clearTimeout(turnTimer);
  motionTimers.forEach(clearTimeout);
  motionTimers.clear();
  busy = false;
  const spread = $('#spread');
  spread.querySelectorAll('.leaf, .single-turn').forEach(e => e.remove());
  spread.classList.remove('closed');
  spread.style.transition = 'none';
  spread.style.transform = '';
  void spread.offsetWidth; // cancel an interrupted cover translation without another animation
  spread.style.transition = '';
}

function measure(): void {
  const r = $('#reader');
  const topH = r.querySelector<HTMLElement>('.r-top')!.offsetHeight;
  const botH = r.querySelector<HTMLElement>('.r-bottom')!.offsetHeight;
  const { w: vw, h: vh } = viewSize();   // not innerWidth: wrong on a browser-zoomed iPad
  const avH = vh - topH - botH - 34;
  single = vw < 760;
  const w = single ? Math.min(vw - 40, avH / PAGE_AR) : Math.min((vw - 60) / 2, avH / PAGE_AR);
  pw = Math.max(140, Math.floor(w));
  const spread = $('#spread');
  spread.style.width = (single ? pw : pw * 2) + 'px';
  spread.style.height = Math.round(pw * PAGE_AR) + 'px';
  spread.classList.toggle('single', single);
  spread.style.setProperty('--bookc', book!.kapak.renk);
  measuredSize = layoutSize();
}

function slot(side: 'l' | 'r'): HTMLElement {
  const spread = $('#spread');
  let s = spread.querySelector<HTMLElement>('.slot.' + side);
  if (!s) s = el('div', 'slot ' + side, spread);
  s.style.width = pw + 'px';
  s.style.left = (side === 'r' && !single ? pw : 0) + 'px';
  return s;
}

function fill(side: 'l' | 'r', i: number): void {
  const s = slot(side);
  s.replaceChildren(renderPage(i, side));
}

function renderAll(): void {
  stopMotion();
  $('#reader').classList.add('show');
  measure();
  const units = bookUnits(book!);
  const all: ContentsPage = units.map((u, unit) => ({ unit, start: 0, end: u.konular.length, continued: false }));
  // The probes share the real page's containing width (cqw fonts and padding included).
  const probe = el('div', 'toc-measure', $('#reader'));
  probe.setAttribute('aria-hidden', 'true');
  probe.inert = true;
  probe.style.width = pw + 'px';
  probe.style.height = Math.round(pw * PAGE_AR) + 'px';
  try {
    const first = renderPage(1, 'r', all);
    const next = renderPage(2, 'l', all.map(p => ({ ...p, continued: true })));
    probe.append(first, next);
    contents = measureContents(first, next);
  } finally {
    probe.remove();
  }
  if (anchor) {
    const page = contents.findIndex(parts => parts.some(p =>
      units[p.unit].konular.slice(p.start, p.end).some((_, t) => topicAnchor(p.unit, p.start + t) === anchor)));
    if (page >= 0) idx = page + 1;
  }
  idx = spreadStart(Math.max(0, Math.min(idx, pageCount() - 1)));
  drawSlots();
}

function topicAnchor(unit: number, topic: number): string {
  const t = bookUnits(book!)[unit]?.konular[topic];
  return t?.klasor || `${unit}:${topic}:${t?.baslik ?? ''}`;
}

function drawSlots(): void {
  $('#spread').querySelectorAll('.slot').forEach(s => s.remove());
  if (single) fill('l', idx);
  else { fill('l', idx); fill('r', idx + 1); }
  updateChrome();
}

function updateChrome(): void {
  const n = pageCount(), b = book!;
  const a = idx + 1, z = Math.min(n, idx + (single ? 1 : 2));
  $('#pno').textContent = single || a === z ? `s. ${a} / ${n}` : `s. ${a}–${z} / ${n}`;
  const size = usesUnits(b) ? `${b.uniteler.length} ünite · ${topicCount(b)} konu` : `${b.bolumler.length} bölüm`;
  $('#rChap').textContent = [b.ders, size].filter(Boolean).join(' · ');
  ($('#prev') as HTMLButtonElement).disabled = idx === 0;
  ($('#next') as HTMLButtonElement).disabled = idx + (single ? 1 : 2) >= n;
  // Keep the existing footer height/book size when a single spread needs no controls.
  $('.r-bottom').classList.toggle('no-turn', !single && n <= 2);
  const first = idx > 0 ? contents[idx - 1]?.find(p => p.end > p.start) : undefined;
  anchor = first ? topicAnchor(first.unit, first.start) : null;
}

// ---- pages ----

function lastOpenedText(d: number | null): string {
  if (d === null) return 'ilk kez';
  return d === 0 ? 'bugün' : `${d} gün önce`;
}

function contentsHtml(parts: ContentsPage, continuation: boolean): string {
  const b = book!;
  const resume = resumeOf(b);
  const duzenle = icindekilerDugmesi(b).goster
    ? '<button type="button" class="tocedit" data-duzenle><span aria-hidden="true">✎</span> İçindekileri düzenle</button>' : '';
  let html = continuation
    ? '<div class="tochead continued"><h2>İçindekiler (devam)</h2></div>'
    : `<div class="src">Kitap · içindekiler</div><div class="tochead"><h2>İçindekiler</h2>${duzenle}</div>`;
  if (!continuation && resume) html += `<button class="resume" data-ribbon><span class="rib" aria-hidden="true"></span><span>Kaldığın yerden devam: <b>${esc(resume.label)}</b></span></button>`;
  const units = bookUnits(b);
  if (!units.some(u => u.konular.length)) {
    return html + `<p class="empty">${b.hasJson ? 'Bu kitapta henüz konu yok.' : 'Bu klasörde kitap.json yok. Drive\'da klasöre bir kitap.json ekleyince bölümler burada görünür.'}</p>`;
  }
  for (const part of parts) {
    const u = units[part.unit];
    html += `<h3 class="unit">${esc(u.baslik)}${part.continued ? ' (devam)' : ''}</h3><ol>`;
    for (let ti = part.start; ti < part.end; ti++) {
      const t = u.konular[ti];
      const kinds = [...new Set((t.kaynaklar ?? []).map(s => s.tur))];
      const [cls, label] = ST[t.durum];
      html += `<li><button data-u="${part.unit}" data-t="${ti}"><span class="num">${ti + 1}</span><span><span class="tt">${esc(t.baslik)}</span>
        <span class="icons">${kinds.map(k => `<span class="ic">${ICON[k]}${SRC_LABEL[k]}</span>`).join('')}<span class="st ${cls}" data-st title="Durumu değiştirmek için dokun">${label}</span></span></span></button></li>`;
    }
    html += '</ol>';
  }
  return html + '<div class="legend">Konuya dokun: oraya git · Duruma dokun: değiştir</div>';
}

function renderPage(i: number, side: 'l' | 'r', measuredParts?: ContentsPage): HTMLElement {
  const b = book!;
  const kind = i === 0 ? 'title' : 'toc';
  const resume = resumeOf(b);
  const p = el('div', `page ${kind === 'title' ? 'tp' : 'toc'} ${side === 'r' ? 'rightp' : 'leftp'}`);
  if (!measuredParts && i >= pageCount()) {
    p.classList.add('blank');
    p.setAttribute('aria-hidden', 'true');
    return p; // the unnumbered back of an odd final page
  }
  p.dataset.page = String(i + 1);
  const inn = el('div', 'in', p);
  el('div', 'folio', p, String(i + 1));
  if (kind === 'title') {
    const total = b.bolumler.reduce((a, c) => a + c.kaynaklar.length, 0);
    const size = usesUnits(b)
      ? `<dt>Ünite</dt><dd>${b.uniteler.length}</dd><dt>Konu</dt><dd>${topicCount(b)}</dd>`
      : `<dt>Bölüm</dt><dd>${b.bolumler.length}</dd><dt>Kaynak</dt><dd>${total} dosya</dd>`;
    inn.innerHTML = `<div class="shelf">${ctx.shelfName ? esc(ctx.shelfName) + ' rafı' : 'Yeni gelenler'}</div>
      <h1>${esc(b.baslik)}</h1>
      <dl class="meta"><dt>Ders / alan</dt><dd>${esc(b.ders || '—')}</dd>${size}
      <dt>Son açılış</dt><dd>${lastOpenedText(ctx.daysSinceOpened)}</dd></dl>
      ${resume ? `<button class="go" data-ribbon>Kaldığın yer: ${esc(resume.label)} →</button>` : ''}
      <div class="exl">${ctx.owner ? esc(genitive(ctx.owner)) + ' kitaplığından' : 'Örnek kitaplıktan'}</div>`;
  } else {
    inn.innerHTML = contentsHtml(measuredParts ?? contents[i - 1], i > 1);
  }
  if (measuredParts) return p; // invisible measurement copies have no behaviour
  p.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const ch = t.closest<HTMLElement>('[data-t]');
    if (t.closest('[data-duzenle]')) onEdit();
    else if (ch && t.closest('[data-st]')) {
      cycleStatus(b, Number(ch.dataset.u), Number(ch.dataset.t));
      requestLayout(); // the new label may wrap and change its row height
    } else if (ch) onChapter(Number(ch.dataset.u), Number(ch.dataset.t));
    else if (t.closest('[data-ribbon]') && resume) onChapter(resume.unit, resume.topic, resume);
  });
  return p;
}

function coverFace(b: Book): HTMLElement {
  const f = el('div', 'coverface');
  f.style.setProperty('--bookc', b.kapak.renk);
  const leather = b.kapak.stil === 'deri';
  f.style.color = leather ? '#e6c77f' : (isDark(b.kapak.renk) ? '#f6ecd8' : '#2a231d');
  f.innerHTML = `<div class="cs">${esc(b.ders)}</div><div class="rule"></div><div class="ct">${esc(b.baslik)}</div><div class="rule"></div><div class="cs">${esc(b.kod)}</div>`;
  return f;
}

// ---- open / close ----

export function openReader(b: Book, c: ReaderContext): void {
  stopMotion();
  book = b; ctx = c; idx = 0; anchor = null; opening = true; busy = true;
  contents = [[]];
  const reader = $('#reader');
  reader.classList.remove('kabuk');
  $('#rBook').textContent = b.baslik;
  updateChrome(); // the subtitle must have its final height before measuring the page
  reader.hidden = false;
  requestLayout();
}

function animateCover(b: Book): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  busy = true;
  const spread = $('#spread');
  if (single) { coverOpenSingle(b); return; }
  // closed cover on the right half, then it swings open
  const L = spread.querySelector<HTMLElement>('.slot.l')!;
  L.style.opacity = '0';
  spread.classList.add('closed'); spread.style.transition = 'none';
  spread.style.transform = `translateX(${-pw / 2}px)`;
  const leaf = el('div', 'leaf fw slow', spread); leaf.style.left = pw + 'px'; leaf.style.width = pw + 'px';
  el('div', 'lf front', leaf).appendChild(coverFace(b));
  el('div', 'lf back', leaf).appendChild(renderPage(0, 'l'));
  void spread.offsetWidth; spread.style.transition = '';
  later(() => {
    spread.classList.remove('closed');
    spread.style.transform = 'translateX(0)';
    leaf.classList.add('go');
    later(() => { L.style.opacity = '1'; }, 520);
    later(() => { leaf.remove(); busy = false; }, 1120);
  }, 260);
}

function coverOpenSingle(b: Book): void {
  const c = el('div', 'slot single-turn', $('#spread'));
  c.style.width = pw + 'px'; c.style.left = '0'; c.style.zIndex = '6';
  c.appendChild(coverFace(b));
  later(() => { c.classList.add('out-l'); later(() => { c.remove(); busy = false; }, 520); }, 450);
}

// One page on a narrow screen; one spread (two pages) on a wide screen.
function flipTo(target: number): void {
  if (!book || busy || isOkuyucuOpen()) return;
  target = spreadStart(Math.max(0, Math.min(target, pageCount() - 1)));
  if (target === idx) return;
  busy = true;
  const dir = target > idx ? 1 : -1;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    idx = target; drawSlots(); busy = false; return;
  }
  if (!single) {
    const cur = idx;
    const leaf = el('div', `leaf ${dir > 0 ? 'fw' : 'bw'}`, $('#spread'));
    leaf.style.left = (dir > 0 ? pw : 0) + 'px';
    leaf.style.width = pw + 'px';
    el('div', 'lf front', leaf).append(renderPage(dir > 0 ? cur + 1 : cur, dir > 0 ? 'r' : 'l'));
    el('div', 'lf back', leaf).append(renderPage(dir > 0 ? target : target + 1, dir > 0 ? 'l' : 'r'));
    if (dir > 0) fill('r', target + 1);
    else fill('l', target);
    idx = target; updateChrome();
    requestAnimationFrame(() => { if (leaf.isConnected) leaf.classList.add('go'); });
    turnTimer = window.setTimeout(() => { leaf.remove(); drawSlots(); busy = false; }, 840);
    return;
  }
  const old = $('#spread').querySelector<HTMLElement>('.slot.l')!;
  old.classList.add('single-turn'); old.classList.remove('l'); old.style.zIndex = '6';
  fill('l', target); idx = target; updateChrome();
  requestAnimationFrame(() => old.classList.add(dir > 0 ? 'out-l' : 'out-r'));
  turnTimer = window.setTimeout(() => { old.remove(); busy = false; }, 520);
}

// Task 6.3e: the library search opens the full-screen reader with no book on the desk. #reader (where the
// reader lives) is shown only as its frame: the desk's own parts stay invisible under it.
export function readerShell(on: boolean): void {
  if (book) return;   // a book is on the desk: #reader is shown anyway
  const reader = $('#reader');
  if (on) {
    reader.classList.add('kabuk');
    reader.hidden = false;
    requestAnimationFrame(() => reader.classList.add('show'));
    return;
  }
  reader.classList.remove('show');
  setTimeout(() => {
    if (book || reader.classList.contains('show')) return;
    reader.hidden = true;
    reader.classList.remove('kabuk');
  }, 320);
}

export function closeReader(): void {
  if (!book) return;
  ++layoutTicket;
  cancelAnimationFrame(layoutFrame);
  stopMotion();
  opening = false;
  book = null;
  const reader = $('#reader');
  reader.classList.remove('show');
  setTimeout(() => {
    if (book) return;
    reader.hidden = true;
    $('#spread').replaceChildren();
    onClose();
  }, 320);
}
