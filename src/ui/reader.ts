import type { Book, ChapterStatus, SourceType } from '../model/types';
import { isDark } from '../scene/units';
import { esc } from './dom';
import { toast } from './toast';

// Open book on the desk (2D overlay). Phase 1: title page + table of contents only.

const PAGE_AR = 1.4142;   // A4, same as a PDF page

const ICON: Record<SourceType, string> = {
  pdf: '<svg viewBox="0 0 16 16"><path d="M4 1h6l3 3v11H4z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 1v3h3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  defter: '<svg viewBox="0 0 16 16"><rect x="3" y="1.5" width="10" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 5h5M5.5 8h5M5.5 11h3" stroke="currentColor" stroke-width="1.2"/></svg>',
  claude: '<svg viewBox="0 0 16 16"><path d="M8 1.5v13M1.5 8h13M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  link: '<svg viewBox="0 0 16 16"><path d="M6.5 9.5l3-3M7 4.5l1.5-1.5a2.8 2.8 0 0 1 4 4L11 8.5M9 11.5L7.5 13a2.8 2.8 0 0 1-4-4L5 7.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
};
const SRC_LABEL: Record<SourceType, string> = { pdf: 'PDF', defter: 'Defter', claude: 'Claude', link: 'Link' };
const ST: Record<ChapterStatus, [cls: string, label: string]> = {
  okunmadi: ['todo', 'Okunmadı'], calisildi: ['done', 'Çalışıldı'], tekrar: ['review', 'Tekrar']
};

export interface ReaderContext {
  shelfName: string | null;     // null = "Yeni gelenler"
  daysSinceOpened: number | null;
}

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;

let book: Book | null = null;
let ctx: ReaderContext = { shelfName: null, daysSinceOpened: null };
let idx = 0, pw = 0, single = false, busy = false;
let onClose: () => void = () => {};
const PAGES = ['title', 'toc'] as const;

function el(tag: string, cls: string, parent?: HTMLElement, html?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

export function initReader(close: () => void): void {
  onClose = close;
  $('#rClose').addEventListener('click', closeReader);
  $('#prev').addEventListener('click', () => flipTo(idx - 1));
  $('#next').addEventListener('click', () => flipTo(idx + 1));
  addEventListener('keydown', e => {
    if (!book) return;
    if (e.key === 'Escape') closeReader();
    if (e.key === 'ArrowRight') flipTo(idx + 1);
    if (e.key === 'ArrowLeft') flipTo(idx - 1);
  });
  addEventListener('resize', () => { if (book) renderAll(); });
}

export const isReaderOpen = () => book !== null;

// ---- layout ----

function measure(): void {
  const r = $('#reader');
  const topH = r.querySelector<HTMLElement>('.r-top')!.offsetHeight;
  const botH = r.querySelector<HTMLElement>('.r-bottom')!.offsetHeight;
  const avH = innerHeight - topH - botH - 34;
  single = innerWidth < 760;
  const w = single ? Math.min(innerWidth - 40, avH / PAGE_AR) : Math.min((innerWidth - 60) / 2, avH / PAGE_AR);
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
  $('#rChap').textContent = [b.ders, `${b.bolumler.length} bölüm`].filter(Boolean).join(' · ');
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
  const p = el('div', `page ${kind === 'title' ? 'tp' : 'toc'} ${side === 'r' ? 'rightp' : 'leftp'}`);
  const inn = el('div', 'in', p);
  el('div', 'folio', p, String(i + 1));
  if (kind === 'title') {
    const total = b.bolumler.reduce((a, c) => a + c.kaynaklar.length, 0);
    inn.innerHTML = `<div class="shelf">${ctx.shelfName ? esc(ctx.shelfName) + ' rafı' : 'Yeni gelenler'}</div>
      <h1>${esc(b.baslik)}</h1>
      <dl class="meta"><dt>Ders / alan</dt><dd>${esc(b.ders || '—')}</dd><dt>Bölüm</dt><dd>${b.bolumler.length}</dd>
      <dt>Kaynak</dt><dd>${total} dosya</dd><dt>Son açılış</dt><dd>${lastOpenedText(ctx.daysSinceOpened)}</dd></dl>
      ${b.kurdele !== null ? `<button class="go" data-ribbon>Kaldığın yer: s. ${esc(String(b.kurdele))} →</button>` : ''}
      <div class="exl">Deniz'in kitaplığından</div>`;
  } else {
    let html = '<div class="src">Kitap · içindekiler</div><h2>İçindekiler</h2>';
    if (!b.bolumler.length) {
      html += `<p class="empty">${b.hasJson ? 'Bu kitapta henüz bölüm yok.' : 'Bu klasörde kitap.json yok. Drive\'da klasöre bir kitap.json ekleyince bölümler burada görünür.'}</p>`;
    } else {
      html += '<ol>';
      b.bolumler.forEach((c, ci) => {
        const kinds = [...new Set(c.kaynaklar.map(s => s.tur))];
        const [cls, label] = ST[c.durum];
        html += `<li><button data-ch="${ci}"><span class="num">${ci + 1}</span><span><span class="tt">${esc(c.baslik)}</span>
          <span class="icons">${kinds.map(k => `<span class="ic">${ICON[k]}${SRC_LABEL[k]}</span>`).join('')}<span class="st ${cls}">${label}</span></span></span></button></li>`;
      });
      html += '</ol><div class="legend">Bölüme dokun: oraya git</div>';
    }
    inn.innerHTML = html;
  }
  p.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-ch]') || t.closest('[data-ribbon]')) toast('Sayfalar Faz 3\'te geliyor.');
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
