import type { Book, ChapterStatus, SourceType } from '../model/types';
import { bookUnits, topicCount, usesUnits } from '../model/units';
import { cycleStatus, resumeOf, type Resume } from '../okuma/okumaDurumu';
import { isOkuyucuOpen } from '../okuma/Okuyucu';
import { isDark } from '../scene/units';
import { esc } from './dom';
import { viewSize } from './ekran';

// Open book on the desk (2D overlay). Phase 1: title page + table of contents only.

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
const PAGES = ['title', 'toc'] as const;

function el(tag: string, cls: string, parent?: HTMLElement, html?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

// chapter(unit, topic): indices as in bookUnits (surum 1: unit 0 "Genel", topic = chapter)
// resume: "Kaldığın yerden devam" (task 3.5)
export function initReader(close: () => void, chapter: (unit: number, topic: number, resume?: Resume) => void): void {
  onClose = close;
  onChapter = chapter;
  $('#rClose').addEventListener('click', closeReader);
  $('#prev').addEventListener('click', () => flipTo(idx - 1));
  $('#next').addEventListener('click', () => flipTo(idx + 1));
  addEventListener('keydown', e => {
    if (!book || isOkuyucuOpen()) return;   // the full-screen reader is on top
    if (e.key === 'Escape') closeReader();
    if (e.key === 'ArrowRight') flipTo(idx + 1);
    if (e.key === 'ArrowLeft') flipTo(idx - 1);
  });
  addEventListener('resize', () => { if (book) renderAll(); });
  // swipe left/right to turn the page (as in the prototype)
  let swipe: { x: number; y: number } | null = null;
  $('#spreadWrap').addEventListener('pointerdown', e => { swipe = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointerup', e => {
    if (!swipe || !book) { swipe = null; return; }
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) flipTo(idx + (dx < 0 ? 1 : -1));
  });
}

export const isReaderOpen = () => book !== null;

// The reading state changed (the full-screen reader closed): draw the pages again.
export function refreshReader(): void {
  if (book) renderAll();
}

// ---- layout ----

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
  measure();
  $('#spread').querySelectorAll('.slot').forEach(s => s.remove());
  if (single) fill('l', idx);
  else { idx = 0; fill('l', 0); fill('r', 1); }
  updateChrome();
}

function updateChrome(): void {
  const n = PAGES.length, b = book!;
  const a = idx + 1, z = Math.min(n, idx + (single ? 1 : 2));
  $('#pno').textContent = single || a === z ? `s. ${a} / ${n}` : `s. ${a}–${z} / ${n}`;
  const size = usesUnits(b) ? `${b.uniteler.length} ünite · ${topicCount(b)} konu` : `${b.bolumler.length} bölüm`;
  $('#rChap').textContent = [b.ders, size].filter(Boolean).join(' · ');
  ($('#prev') as HTMLButtonElement).disabled = idx === 0;
  ($('#next') as HTMLButtonElement).disabled = idx + (single ? 1 : 2) >= n;
}

// ---- pages ----

function lastOpenedText(d: number | null): string {
  if (d === null) return 'ilk kez';
  return d === 0 ? 'bugün' : `${d} gün önce`;
}

function renderPage(i: number, side: 'l' | 'r'): HTMLElement {
  const b = book!;
  const kind = PAGES[i];
  const resume = resumeOf(b);
  const p = el('div', `page ${kind === 'title' ? 'tp' : 'toc'} ${side === 'r' ? 'rightp' : 'leftp'}`);
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
    let html = '<div class="src">Kitap · içindekiler</div><h2>İçindekiler</h2>';
    if (resume) html += `<button class="resume" data-ribbon><span class="rib" aria-hidden="true"></span><span>Kaldığın yerden devam: <b>${esc(resume.label)}</b></span></button>`;
    const units = bookUnits(b);
    if (!units.some(u => u.konular.length)) {
      html += `<p class="empty">${b.hasJson ? 'Bu kitapta henüz konu yok.' : 'Bu klasörde kitap.json yok. Drive\'da klasöre bir kitap.json ekleyince bölümler burada görünür.'}</p>`;
    } else {
      units.forEach((u, ui) => {
        html += `<h3 class="unit">${esc(u.baslik)}</h3><ol>`;
        u.konular.forEach((t, ti) => {
          // surum 1: the chapter's source types; surum 2: materials are known only when the topic opens
          const kinds = [...new Set((t.kaynaklar ?? []).map(s => s.tur))];
          const [cls, label] = ST[t.durum];
          html += `<li><button data-u="${ui}" data-t="${ti}"><span class="num">${ti + 1}</span><span><span class="tt">${esc(t.baslik)}</span>
            <span class="icons">${kinds.map(k => `<span class="ic">${ICON[k]}${SRC_LABEL[k]}</span>`).join('')}<span class="st ${cls}" data-st title="Durumu değiştirmek için dokun">${label}</span></span></span></button></li>`;
        });
        html += '</ol>';
      });
      html += '<div class="legend">Konuya dokun: oraya git · Duruma dokun: değiştir</div>';
    }
    inn.innerHTML = html;
  }
  p.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const ch = t.closest<HTMLElement>('[data-t]');
    if (ch && t.closest('[data-st]')) {
      // the status label: next status (only this page is drawn again)
      cycleStatus(b, Number(ch.dataset.u), Number(ch.dataset.t));
      p.replaceWith(renderPage(i, side));
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
  book = b; ctx = c; idx = 0; busy = false;
  const reader = $('#reader');
  $('#rBook').textContent = b.baslik;
  reader.hidden = false;
  requestAnimationFrame(() => {
    reader.classList.add('show');
    measure();
    const spread = $('#spread');
    spread.replaceChildren();
    updateChrome();
    if (single) { fill('l', 0); coverOpenSingle(b); return; }
    // closed cover on the right half, then it swings open
    fill('l', 0); fill('r', 1);
    const L = spread.querySelector<HTMLElement>('.slot.l')!;
    L.style.opacity = '0';
    spread.classList.add('closed'); spread.style.transition = 'none';
    spread.style.transform = `translateX(${-pw / 2}px)`;
    const leaf = el('div', 'leaf fw slow', spread); leaf.style.left = pw + 'px'; leaf.style.width = pw + 'px';
    el('div', 'lf front', leaf).appendChild(coverFace(b));
    el('div', 'lf back', leaf).appendChild(renderPage(0, 'l'));
    void spread.offsetWidth; spread.style.transition = '';
    setTimeout(() => {
      spread.classList.remove('closed');
      spread.style.transform = 'translateX(0)';
      leaf.classList.add('go');
      setTimeout(() => { L.style.opacity = '1'; }, 520);
      setTimeout(() => leaf.remove(), 1120);
    }, 260);
  });
}

function coverOpenSingle(b: Book): void {
  const c = el('div', 'slot single-turn', $('#spread'));
  c.style.width = pw + 'px'; c.style.left = '0'; c.style.zIndex = '6';
  c.appendChild(coverFace(b));
  setTimeout(() => { c.classList.add('out-l'); setTimeout(() => c.remove(), 520); }, 450);
}

// Single-page mode (narrow screens): turn between title page and contents.
function flipTo(target: number): void {
  if (!book || !single || busy) return;
  target = Math.max(0, Math.min(target, PAGES.length - 1));
  if (target === idx) return;
  busy = true;
  const dir = target > idx ? 1 : -1;
  const old = $('#spread').querySelector<HTMLElement>('.slot.l')!;
  old.classList.add('single-turn'); old.classList.remove('l'); old.style.zIndex = '6';
  fill('l', target); idx = target; updateChrome();
  requestAnimationFrame(() => old.classList.add(dir > 0 ? 'out-l' : 'out-r'));
  setTimeout(() => { old.remove(); busy = false; }, 520);
}

export function closeReader(): void {
  if (!book) return;
  book = null;
  const reader = $('#reader');
  reader.classList.remove('show');
  setTimeout(() => {
    reader.hidden = true;
    $('#spread').replaceChildren();
    onClose();
  }, 320);
}
