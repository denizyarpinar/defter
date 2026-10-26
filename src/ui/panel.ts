import { addShelf, deleteShelf, newArrivals } from '../model/library';
import { MAX_SHELVES, MIN_SHELVES, type Book, type CoverStyle, type FloorKey, type Library } from '../model/types';
import { t, type Anahtar } from '../dil';
import { yasalHref } from '../dil/html';
import { esc } from './dom';
import { toast } from './toast';

// "Özelleştir" side panel (as in the prototype). Changes stay in memory for now (Drive: task 1.5).

export const COVER_SWATCHES = ['#24476b', '#2f5d50', '#7cc47f', '#6cc5c9', '#7a8fa6', '#b0306d', '#e0453a', '#f08a3c', '#f0dc5a', '#6b3a2a', '#8a4b33', '#b89a7a'];
const WALL_SWATCHES: [Anahtar, string][] = [['panel.duvar.kum', '#efe6d8'], ['panel.duvar.kirikBeyaz', '#f6f3ee'], ['panel.duvar.adacayi', '#dfe5d6'], ['panel.duvar.pudra', '#f0dfd8'], ['panel.duvar.geceMavisi', '#c9d3e3']];
const FLOOR_SWATCHES: [Anahtar, FloorKey, string, string][] = [['panel.zemin.mese', 'mese', '#d9a46a', '#c48d55'], ['panel.zemin.ceviz', 'ceviz', '#9a6a45', '#7f5536'], ['panel.zemin.acik', 'acik', '#e6cfae', '#d6b98f']];

export interface PanelHooks {
  shelvesChanged(): void;
  bookChanged(id: string): void;
  roomChanged(): void;
  yeniKitap?: { acik(): boolean; ac(): void };   // task 6.K4a: "＋ Yeni kitap" (only in a Drive library)
}

export function initPanel(data: { library: Library; books: Map<string, Book> }, hooks: PanelHooks): void {
  const panel = document.querySelector<HTMLElement>('#panel')!;
  const btn = document.querySelector<HTMLElement>('#custBtn')!;
  let pendingDelete: number | null = null;
  let selBook: string | null = null;

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) render();
  };
  btn.addEventListener('click', () => setOpen(panel.hidden !== false));

  function render(): void {
    const { library: lib, books } = data;
    const all = [...lib.raflar.flatMap(s => s.kitaplar.filter(id => books.has(id))), ...newArrivals(lib, books)];
    if (!selBook || !all.includes(selBook)) selBook = all[0] ?? null;
    const cb = selBook ? books.get(selBook)! : null;
    const opt = (id: string) => `<option value="${esc(id)}" ${id === selBook ? 'selected' : ''}>${esc(books.get(id)!.baslik)}</option>`;
    const pile = newArrivals(lib, books);
    panel.innerHTML = `<div class="phead"><b>${t('ustCubuk.ozellestir')}</b><button class="ibtn" id="pClose">${t('genel.kapat')}</button></div>
    ${hooks.yeniKitap?.acik() ? `<div class="prow" style="margin-top:12px"><button class="ibtn solid" id="pNewBook">${t('panel.yeniKitap')}</button></div>` : ''}
    <h3>${t('panel.raflar')}</h3>
    ${lib.raflar.map((s, i) => `<div class="prow"><span class="n">${i + 1}</span><input type="text" data-i="${i}" value="${esc(s.ad)}" maxlength="22" aria-label="${esc(t('panel.rafAdi', { n: i + 1 }))}">
       <button class="ibtn danger" data-del="${i}" ${lib.raflar.length <= MIN_SHELVES ? 'disabled' : ''}>${t(pendingDelete === i ? 'panel.eminMisin' : 'panel.sil')}</button></div>`).join('')}
    <div class="prow"><button class="ibtn solid" id="addShelf" ${lib.raflar.length >= MAX_SHELVES ? 'disabled' : ''}>${t('panel.rafEkle')}</button><span class="note" style="margin:0">${t('panel.rafSayisi', { n: lib.raflar.length, en: MAX_SHELVES })}</span></div>
    <p class="note">${t('panel.silNot')}</p>
    <h3>${t('panel.kapak')}</h3>
    ${cb ? `<select id="pBook" aria-label="${esc(t('panel.kitapSec'))}">${lib.raflar.map(s => `<optgroup label="${esc(s.ad)}">${s.kitaplar.filter(id => books.has(id)).map(opt).join('')}</optgroup>`).join('')}
      ${pile.length ? `<optgroup label="${esc(t('panel.yeniGelenler'))}">${pile.map(opt).join('')}</optgroup>` : ''}</select>
    <div class="sw" id="pCover">${COVER_SWATCHES.map(c => `<button style="background:${c}" data-c="${c}" class="${c === cb.kapak.renk ? 'on' : ''}" aria-label="${esc(t('panel.renk', { renk: c }))}"></button>`).join('')}</div>
    <div class="prow" style="margin-top:10px"><div class="seg" id="pStyle" style="backdrop-filter:none"><button data-s="kumas" class="${cb.kapak.stil === 'kumas' ? 'on' : ''}">${t('panel.kumas')}</button><button data-s="deri" class="${cb.kapak.stil === 'deri' ? 'on' : ''}">${t('panel.deri')}</button></div></div>` : `<p class="note">${t('panel.kitapYok')}</p>`}
    <h3>${t('panel.oda')}</h3>
    <div class="note" style="margin:0 0 6px">${t('panel.duvar')}</div>
    <div class="sw" id="pWall">${WALL_SWATCHES.map(([n, c]) => `<button style="background:${c}" data-c="${c}" title="${esc(t(n))}" aria-label="${esc(t(n))}" class="${c === lib.oda.duvar ? 'on' : ''}"></button>`).join('')}</div>
    <div class="note" style="margin:10px 0 6px">${t('panel.zemin')}</div>
    <div class="sw" id="pFloor">${FLOOR_SWATCHES.map(([n, k, a, b]) => `<button style="background:linear-gradient(135deg,${a},${b})" data-f="${k}" title="${esc(t(n))}" aria-label="${esc(t(n))}" class="${k === lib.oda.zemin ? 'on' : ''}"></button>`).join('')}</div>
    <p class="note">${t('panel.oturumNot')}</p>
    <nav class="legal-links panel-legal" aria-label="${esc(t('yasal.etiket'))}">
      <a href="${yasalHref('privacy')}" target="_blank" rel="noopener noreferrer" aria-label="${esc(t('yasal.gizlilikEtiket'))}">${t('yasal.gizlilik')}</a>
      <a href="${yasalHref('terms')}" target="_blank" rel="noopener noreferrer" aria-label="${esc(t('yasal.sartlarEtiket'))}">${t('yasal.sartlar')}</a>
    </nav>`;

    const q = <T extends HTMLElement>(s: string) => panel.querySelector<T>(s);
    q('#pClose')!.onclick = () => setOpen(false);
    const nb = q<HTMLButtonElement>('#pNewBook');
    if (nb) nb.onclick = () => { setOpen(false); hooks.yeniKitap?.ac(); };
    panel.querySelectorAll<HTMLInputElement>('input[data-i]').forEach(inp => inp.addEventListener('input', () => {
      const i = +inp.dataset.i!;
      lib.raflar[i].ad = inp.value.trim() || `Raf ${i + 1}`;
      hooks.shelvesChanged();
    }));
    panel.querySelectorAll<HTMLButtonElement>('[data-del]').forEach(b => b.onclick = () => {
      const i = +b.dataset.del!;
      if (pendingDelete !== i) { pendingDelete = i; render(); return; }
      pendingDelete = null;
      const res = deleteShelf(lib, i);
      if (!res) return;
      hooks.shelvesChanged(); render();
      toast(res.movedTo ? t('panel.rafSilindiTasindi', { ad: res.name, hedef: res.movedTo }) : t('panel.rafSilindi', { ad: res.name }));
    });
    const add = q<HTMLButtonElement>('#addShelf');
    if (add) add.onclick = () => { if (addShelf(lib)) { hooks.shelvesChanged(); render(); } };
    const sel = q<HTMLSelectElement>('#pBook');
    if (sel) sel.onchange = () => { selBook = sel.value; render(); };
    const cover = (fn: (b: Book) => void) => {
      if (!selBook) return;
      fn(books.get(selBook)!);
      hooks.bookChanged(selBook); render();
    };
    const pc = q('#pCover');
    if (pc) pc.onclick = e => {
      const c = (e.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c;
      if (c) cover(b => { b.kapak.renk = c; });
    };
    const ps = q('#pStyle');
    if (ps) ps.onclick = e => {
      const st = (e.target as HTMLElement).closest<HTMLElement>('[data-s]')?.dataset.s as CoverStyle | undefined;
      if (st) cover(b => { b.kapak.stil = st; });
    };
    q('#pWall')!.onclick = e => {
      const c = (e.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c;
      if (!c) return;
      lib.oda.duvar = c; hooks.roomChanged(); render();
    };
    q('#pFloor')!.onclick = e => {
      const f = (e.target as HTMLElement).closest<HTMLElement>('[data-f]')?.dataset.f as FloorKey | undefined;
      if (!f) return;
      lib.oda.zemin = f; hooks.roomChanged(); render();
    };
  }
}
