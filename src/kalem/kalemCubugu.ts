import { esc } from '../ui/dom';
import { toast } from '../ui/toast';
import type { UploadStatus } from './pdfKayit';
import type { StrokeTool } from './cizgi';
import type { PenTool } from './kalemModu';

// Pen mode (task 4.6): the tool bar (pen / highlighter, colour, width) and the remembered choice.
// Colours from the prototype (PEN_COLORS / HL_COLORS). Widths in pt (PDF units): they grow with the zoom.
// Task 4.7: eraser, undo, redo. The eraser is not remembered (as in the prototype): prefs.arac
// stays the last drawing tool, the eraser is chosen for this page load only.
// Task 6.H1: one row of fixed height at every width (styles.css); nothing in it changes the bar's height.

// Task 4.7b: a brighter red, orange and purple pens, blue and orange highlighters (Deniz's choice)
export const COLORS: Record<StrokeTool, readonly (readonly [string, string])[]> = {
  kalem: [['#222222', 'Siyah'], ['#1d3a8a', 'Mavi'], ['#e02020', 'Kırmızı'], ['#2f7a46', 'Yeşil'], ['#f07a00', 'Turuncu'], ['#7b2fbf', 'Mor']],
  fosforlu: [['#f5d33a', 'Sarı'], ['#8fd16a', 'Yeşil'], ['#f59ac0', 'Pembe'], ['#7cc4f5', 'Mavi'], ['#ffb347', 'Turuncu']]
};
// colours that were chosen before and changed since → their new value (strokes already drawn keep theirs)
const RENAMED: Partial<Record<StrokeTool, Record<string, string>>> = { kalem: { '#b5523b': '#e02020' } };
export const SIZES: Record<StrokeTool, readonly number[]> = { kalem: [1.2, 2.2, 4], fosforlu: [10, 14, 20] };
const SIZE_NAMES = ['İnce', 'Orta', 'Kalın'];
export const HL_OPACITY = 0.35;   // < 1: the reader knows a highlighter by its opacity

export interface PenPrefs {
  arac: StrokeTool;
  renk: Record<StrokeTool, string>;
  boy: Record<StrokeTool, number>;   // index into SIZES
}

export const DEFAULT_PREFS: PenPrefs = { arac: 'kalem', renk: { kalem: '#222222', fosforlu: '#f5d33a' }, boy: { kalem: 1, fosforlu: 1 } };

const KEY = 'defter.kalem';

// Anything unknown or broken falls back to the default, field by field.
export function parsePrefs(raw: string | null): PenPrefs {
  let v: Partial<PenPrefs> | null = null;
  try { v = raw ? JSON.parse(raw) : null; } catch { v = null; }
  const o = v && typeof v === 'object' ? v : {};
  const tool = (t: StrokeTool) => {
    const saved = o.renk?.[t];
    const renk = (typeof saved === 'string' && RENAMED[t]?.[saved]) || saved;
    return {
      renk: COLORS[t].some(([c]) => c === renk) ? renk! : DEFAULT_PREFS.renk[t],
      boy: Number.isInteger(o.boy?.[t]) && o.boy![t] >= 0 && o.boy![t] < SIZES[t].length ? o.boy![t] : DEFAULT_PREFS.boy[t]
    };
  };
  const k = tool('kalem'), f = tool('fosforlu');
  return {
    arac: o.arac === 'fosforlu' ? 'fosforlu' : 'kalem',
    renk: { kalem: k.renk, fosforlu: f.renk },
    boy: { kalem: k.boy, fosforlu: f.boy }
  };
}

export function loadPrefs(): PenPrefs {
  try { return parsePrefs(localStorage.getItem(KEY)); } catch { return parsePrefs(null); }
}

function savePrefs(p: PenPrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private window: not remembered */ }
}

// What a new stroke looks like
export function strokeStyle(p: PenPrefs): { arac: StrokeTool; renk: string; kalinlik: number; opaklik: number } {
  const t = p.arac;
  return { arac: t, renk: p.renk[t], kalinlik: SIZES[t][p.boy[t]], opaklik: t === 'kalem' ? 1 : HL_OPACITY };
}

// Task 4.8b: saving to Drive. kilit: acik = uploads run; ornek = sample library (never).
// durum: the uploader's last status. (Task 4.9d: the ?kalemYaz=1 test lock is gone.)
export interface SaveView { kilit: 'acik' | 'ornek'; durum: UploadStatus }

// onDevice (task 4.8a): the unsaved strokes are kept on the device (IndexedDB works)
export interface ToolbarState { preparing: boolean; dirty: boolean; onDevice: boolean; canUndo: boolean; canRedo: boolean; kayit: SaveView }

export interface ToolbarActions {
  close(): void;
  undo(): void;
  redo(): void;
  toolChanged(): void;
  save(): void;   // "Kaydet" / "Tekrar dene"
}

export class PenToolbar {
  prefs = loadPrefs();
  eraser = false;
  private state: ToolbarState = { preparing: false, dirty: false, onDevice: true, canUndo: false, canRedo: false, kayit: { kilit: 'acik', durum: { tur: 'bos' } } };
  // Task 6.H1b: up to 1024 px the colours / widths are one button each; they open in a small popover under the
  // bar. It lives next to the bar (the bar's left part scrolls, it would cut the popover off). Under it a
  // see-through cover over the pages: the first tap outside only closes it, it never starts a stroke.
  private pop = document.createElement('div');
  private cover = document.createElement('div');
  private popKind: 'renk' | 'boy' | null = null;

  constructor(private el: HTMLElement, private act: ToolbarActions) {
    const click = (e: MouseEvent) => this.clicked(e);
    el.addEventListener('click', click);
    this.pop.className = 'o-balon';
    this.pop.setAttribute('role', 'dialog');
    this.pop.hidden = true;
    this.pop.addEventListener('click', click);
    this.cover.className = 'o-perde';
    this.cover.hidden = true;
    this.cover.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.closePopover(); });
    el.after(this.cover, this.pop);
    addEventListener('resize', () => this.closePopover());
    this.render();
  }

  private clicked(e: MouseEvent): void {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b || b.disabled) return;
    const act = this.act;
    if (b.dataset.kapat !== undefined) { this.closePopover(); act.close(); return; }
    if (b.dataset.geri !== undefined) { act.undo(); return; }
    if (b.dataset.ileri !== undefined) { act.redo(); return; }
    if (b.dataset.kaydet !== undefined) { act.save(); return; }
    if (b.dataset.durum !== undefined) { toast(b.getAttribute('aria-label') ?? '', undefined, STATUS_TOAST_MS); return; }
    if (b.dataset.pop) { this.togglePopover(b.dataset.pop as 'renk' | 'boy', b); return; }
    const p = this.prefs;
    if (b.dataset.arac) {
      const was = this.tool;
      this.eraser = b.dataset.arac === 'silgi';
      if (!this.eraser) p.arac = b.dataset.arac as StrokeTool;
      if (this.tool !== was) act.toolChanged();
    }
    if (b.dataset.renk) p.renk[p.arac] = b.dataset.renk;
    if (b.dataset.boy) p.boy[p.arac] = Number(b.dataset.boy);
    savePrefs(p);
    this.closePopover();   // a choice made (or another tool): the popover has done its job
    this.render();
  }

  get tool(): PenTool {
    return this.eraser ? 'silgi' : this.prefs.arac;
  }

  set(state: ToolbarState): void {
    this.state = state;
    this.render();
  }

  // false: it wasn't open (Okuyucu's Esc: the popover first, then the contents, the search, the reader)
  closePopover(): boolean {
    if (!this.popKind) return false;
    this.popKind = null;
    this.pop.hidden = this.cover.hidden = true;
    this.el.querySelectorAll('[data-pop]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    return true;
  }

  private togglePopover(kind: 'renk' | 'boy', btn: HTMLElement): void {
    if (this.popKind === kind) { this.closePopover(); return; }
    this.popKind = kind;
    const t = this.prefs.arac;
    this.pop.setAttribute('aria-label', kind === 'renk' ? 'Renk' : 'Kalınlık');
    this.pop.innerHTML = kind === 'renk' ? this.colorButtons(t) : this.sizeButtons(t);
    this.pop.hidden = this.cover.hidden = false;
    this.el.querySelectorAll('[data-pop]').forEach(b => b.setAttribute('aria-expanded', String(b === btn)));
    // under the bar, centred on the button, kept inside the reader
    const host = this.pop.offsetParent?.getBoundingClientRect() ?? new DOMRect(0, 0, innerWidth, innerHeight);
    const bar = this.el.getBoundingClientRect(), r = btn.getBoundingClientRect(), w = this.pop.offsetWidth;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2 - host.left, host.width - w - 8));
    this.pop.style.left = `${Math.round(left)}px`;
    this.pop.style.top = `${Math.round(bar.bottom - host.top + 6)}px`;
    this.pop.querySelector<HTMLElement>('.on')?.focus({ preventScroll: true });
  }

  private colorButtons(t: StrokeTool): string {
    const p = this.prefs;
    return COLORS[t].map(([c, n]) =>
      `<button type="button" class="dot${c === p.renk[t] ? ' on' : ''}" data-renk="${c}" style="--c:${c}" aria-label="${n}" title="${n}" aria-pressed="${c === p.renk[t]}"></button>`).join('');
  }

  private sizeButtons(t: StrokeTool): string {
    const p = this.prefs;
    return SIZES[t].map((_, i) =>
      `<button type="button" class="sz${i === p.boy[t] ? ' on' : ''}" data-boy="${i}" aria-label="${SIZE_NAMES[i]}" title="${SIZE_NAMES[i]}" aria-pressed="${i === p.boy[t]}">${sizeSample(t, i)}</button>`).join('');
  }

  private render(): void {
    const p = this.prefs, t = p.arac, cur = this.tool;
    const on = (yes: boolean) => yes ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"';
    const tool = (k: PenTool, label: string) => `<button type="button" data-arac="${k}"${on(cur === k)} title="${label}" aria-label="${label}">${ICONS[k]}<span>${label}</span></button>`;
    const st = this.state;
    const history = `<button type="button" data-geri title="Geri al (Ctrl+Z)" aria-label="Geri al"${st.canUndo ? '' : ' disabled'}>${ICONS.geri}<span>Geri al</span></button>`
      + `<button type="button" data-ileri title="Yinele (Ctrl+Shift+Z)" aria-label="Yinele"${st.canRedo ? '' : ' disabled'}>${ICONS.ileri}<span>Yinele</span></button>`;
    // Task 6.H1b: one button for the colour and one for the width (≤ 1024 px, styles.css); they open the popover
    const colorName = COLORS[t].find(([c]) => c === p.renk[t])?.[1] ?? '';
    const expanded = (k: string) => String(this.popKind === k);
    const compact = `<button type="button" class="o-kisasec dot on" data-pop="renk" style="--c:${p.renk[t]}" aria-haspopup="dialog" aria-expanded="${expanded('renk')}" aria-label="Renk: ${colorName}" title="Renk: ${colorName}"></button>`
      + `<button type="button" class="o-kisasec sz" data-pop="boy" aria-haspopup="dialog" aria-expanded="${expanded('boy')}" aria-label="Kalınlık: ${SIZE_NAMES[p.boy[t]]}" title="Kalınlık: ${SIZE_NAMES[p.boy[t]]}">${sizeSample(t, p.boy[t])}</button>`;
    // Task 6.H1: the bar is one row of fixed height whatever the tool or the status. The eraser has no colour
    // or width: they stay in their slot, hidden, with the prototype's hint over them (nothing moves).
    const options = `<div class="o-secenek${this.eraser ? ' silgide' : ''}">`
      + `<div class="o-tgrp o-ayar"${this.eraser ? ' aria-hidden="true"' : ''}><div class="o-tgrp o-renkler">${this.colorButtons(t)}</div><span class="sep o-genis"></span><div class="o-tgrp o-boylar">${this.sizeButtons(t)}</div>${compact}</div>`
      + '<span class="o-tipucu">Silmek için çizginin üzerinden geç</span></div>';
    // Task 6.H1b: two parts. The left one may scroll sideways (phone); the right one [Kaydet][status][Kalemi kapat]
    // never moves and sits on the bar's own background.
    this.el.innerHTML = `<div class="o-kaydir"><div class="o-tgrp">${tool('kalem', 'Kalem')}${tool('fosforlu', 'Fosforlu')}${tool('silgi', 'Silgi')}</div>`
      + `<span class="sep"></span>${options}`
      + `<span class="sep"></span><div class="o-tgrp">${history}</div></div>`
      + `<div class="o-sag">${saveButton(st)}${statusSlot(st)}`
      + `<button type="button" class="o-tkapat" data-kapat title="Kalemi kapat" aria-label="Kalemi kapat">${ICONS.kapat}<span>Kalemi kapat</span></button></div>`;
    if (this.eraser) this.el.querySelectorAll<HTMLButtonElement>('.o-ayar button').forEach(b => { b.tabIndex = -1; });
  }
}

// the sample line of a width: pen widths shown a bit bigger, highlighter flatter
function sizeSample(t: StrokeTool, i: number): string {
  const d = SIZES[t][i];
  const h = t === 'kalem' ? Math.round(2 + d * 1.6) : Math.round(d * 0.7);
  const w = t === 'kalem' ? h : Math.round(h * 1.8);
  return `<i style="width:${w}px;height:${h}px"></i>`;
}

// Task 6.H1: icons; on narrow screens the buttons show only these (the name stays in title / aria-label).
// Pen and highlighter: the shapes of the pen-mode cursors (styles.css). Kalemi kapat: the pen, struck through.
const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  kalem: svg('<path d="M3 21l1.5-5L16 4.5 19.5 8 8 19.5z"/><path d="M14 6.5l3.5 3.5"/>'),
  fosforlu: svg('<path d="M2.5 21.5l1.5-6.5L15 4l5 5-11 11z"/><path d="M4 15l5 5"/>'),
  silgi: svg('<path d="M4.6 14.6l9-9a1.8 1.8 0 0 1 2.6 0l3.2 3.2a1.8 1.8 0 0 1 0 2.6L12 19H9z"/><path d="M8.5 10.7l5.8 5.8M9 19h11"/>'),
  geri: svg('<path d="M9 5L4 10l5 5"/><path d="M4 10h10a5 5 0 0 1 0 10h-3"/>'),
  ileri: svg('<path d="M15 5l5 5-5 5"/><path d="M20 10H10a5 5 0 0 0 0 10h3"/>'),
  kaydet: svg('<path d="M7 18.5H6a4 4 0 0 1-.6-8A6 6 0 0 1 17 8.6a4.5 4.5 0 0 1 1 8.9h-1"/><path d="M12 20v-8M9 14.5l3-3 3 3"/>'),
  kapat: svg('<path d="M5 20l1.2-4L15.5 6.7l2.8 2.8L9 18.8z"/><path d="M3.5 3.5l17 17"/>')
};

// Task 6.H1: the status always sits in a slot of fixed width (empty or not), so it never moves the bar.
// On narrow screens only a coloured dot shows (an error: "Hata"); the iPad has no hover, so a tap on the
// slot shows the full text in a toast for 2 s.
export function statusSlot(st: ToolbarState): string {
  const html = saveStatus(st);
  const full = [...html.matchAll(/ title="([^"]*)"/g)].map(m => m[1]).join(' · ');
  return `<button type="button" class="o-durum-yuva" data-durum${full ? ` aria-label="${full}"` : ' disabled aria-hidden="true"'}>${html}</button>`;
}

const STATUS_TOAST_MS = 2000;
const DEVICE_TITLE = "Çizimler henüz PDF'e kaydedilmedi; bu cihazda saklanıyor";

// Task 4.9b: every status has a long text and a short one; on a phone (styles.css, < 600 px) only
// the short one shows (with a coloured dot), the full text stays in the title.
const pill = (cls: string, long: string, short: string, title: string) =>
  `<span class="${cls}" title="${title}"><span class="o-uzun">${long}</span><span class="o-kisa">${short}</span></span>`;

// Task 4.8b: what the tool bar says about saving (first what is going on, then what is waiting)
export function saveStatus(st: ToolbarState): string {
  if (st.preparing) return pill('o-tdurum', 'Kalem hazırlanıyor…', 'Hazırlanıyor…', 'Kalem hazırlanıyor…');
  const k = st.kayit, d = k.durum;
  const unsaved = !st.dirty ? ''
    : st.onDevice ? pill('o-tdurum kaydedilmedi', 'Kaydedilmedi <small>cihazda</small>', 'Cihazda', DEVICE_TITLE)
    : pill('o-tdurum kaydedilmedi', 'Kaydedilmedi', 'Kaydedilmedi', "Çizimler henüz PDF'e kaydedilmedi ve bu cihaza da kaydedilemiyor");
  if (k.kilit === 'ornek') return unsaved + pill('o-tipucu', "Örnek kitaplık: Drive'a kaydedilmez", 'Örnek', "Örnek kitaplık: Drive'a kaydedilmez");
  if (d.tur === 'kaydediliyor') return pill('o-tdurum kaydediliyor', 'Kaydediliyor…', 'Kaydediliyor…', 'Kaydediliyor…');
  if (d.tur === 'hata' && st.dirty) return pill('o-tdurum hata', 'Kaydedilemedi', 'Hata', `Kaydedilemedi: ${esc(d.mesaj)}`);
  if (d.tur === 'cevrimdisi' && st.dirty) return pill('o-tdurum kaydedilmedi', 'Çevrimdışı <small>cihazda</small>', 'Çevrimdışı', 'İnternet yok. Çizimler bu cihazda; bağlanınca kaydedilecek.');
  if (st.dirty) return unsaved;
  if (d.tur === 'kaydedildi') return pill('o-tdurum kaydedildi', 'Kaydedildi', 'Kaydedildi', 'Kaydedildi');
  return '';
}

// "Kaydet" (44 px); after an error "Tekrar dene". Disabled in the sample library, while saving, or with nothing to save.
export function saveButton(st: ToolbarState): string {
  const k = st.kayit;
  const retry = k.kilit === 'acik' && k.durum.tur === 'hata' && st.dirty;
  const off = k.kilit !== 'acik' || k.durum.tur === 'kaydediliyor' || !st.dirty;
  const title = k.kilit === 'ornek' ? "Örnek kitaplıkta çizimler Drive'a kaydedilmez" : "Çizimleri Drive'daki PDF'e kaydet";
  const label = retry ? 'Tekrar dene' : 'Kaydet';   // ≤ 1024 px only the icon (task 6.H1)
  return `<button type="button" class="o-kaydet" data-kaydet title="${title}" aria-label="${label}"${off ? ' disabled' : ''}>${ICONS.kaydet}<span>${label}</span></button>`;
}
