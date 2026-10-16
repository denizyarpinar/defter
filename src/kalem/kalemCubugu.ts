import { esc } from '../ui/dom';
import type { UploadStatus } from './pdfKayit';
import type { StrokeTool } from './cizgi';
import type { PenTool } from './kalemModu';

// Pen mode (task 4.6): the tool bar (pen / highlighter, colour, width) and the remembered choice.
// Colours from the prototype (PEN_COLORS / HL_COLORS). Widths in pt (PDF units): they grow with the zoom.
// Task 4.7: eraser, undo, redo. The eraser is not remembered (as in the prototype): prefs.arac
// stays the last drawing tool, the eraser is chosen for this page load only.

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

  constructor(private el: HTMLElement, act: ToolbarActions) {
    el.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b || b.disabled) return;
      if (b.dataset.kapat !== undefined) { act.close(); return; }
      if (b.dataset.geri !== undefined) { act.undo(); return; }
      if (b.dataset.ileri !== undefined) { act.redo(); return; }
      if (b.dataset.kaydet !== undefined) { act.save(); return; }
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
      this.render();
    });
    this.render();
  }

  get tool(): PenTool {
    return this.eraser ? 'silgi' : this.prefs.arac;
  }

  set(state: ToolbarState): void {
    this.state = state;
    this.render();
  }

  private render(): void {
    const p = this.prefs, t = p.arac, cur = this.tool;
    const on = (yes: boolean) => yes ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"';
    const tool = (k: PenTool, label: string) => `<button type="button" data-arac="${k}"${on(cur === k)}>${label}</button>`;
    const colors = COLORS[t].map(([c, n]) =>
      `<button type="button" class="dot${c === p.renk[t] ? ' on' : ''}" data-renk="${c}" style="--c:${c}" aria-label="${n}" title="${n}" aria-pressed="${c === p.renk[t]}"></button>`).join('');
    const sizes = SIZES[t].map((d, i) => {
      // the sample line: pen widths shown a bit bigger, highlighter flatter
      const h = t === 'kalem' ? Math.round(2 + d * 1.6) : Math.round(d * 0.7);
      const w = t === 'kalem' ? h : Math.round(h * 1.8);
      return `<button type="button" class="sz${i === p.boy[t] ? ' on' : ''}" data-boy="${i}" aria-label="${SIZE_NAMES[i]}" title="${SIZE_NAMES[i]}" aria-pressed="${i === p.boy[t]}"><i style="width:${w}px;height:${h}px"></i></button>`;
    }).join('');
    const status = saveStatus(this.state);
    const st = this.state;
    const history = `<button type="button" data-geri title="Geri al (Ctrl+Z)"${st.canUndo ? '' : ' disabled'}>↶ Geri al</button>`
      + `<button type="button" data-ileri title="Yinele (Ctrl+Shift+Z)"${st.canRedo ? '' : ' disabled'}>↷ Yinele</button>`;
    // the eraser has no colour or width: the prototype's hint instead
    const options = this.eraser ? '<span class="o-tipucu">Silmek için çizginin üzerinden geç</span>'
      : `<div class="o-tgrp o-renkler">${colors}</div><span class="sep"></span><div class="o-tgrp">${sizes}</div>`;
    this.el.innerHTML = `<div class="o-tgrp">${tool('kalem', 'Kalem')}${tool('fosforlu', 'Fosforlu')}${tool('silgi', 'Silgi')}</div>`
      + `<span class="sep"></span>${options}`
      + `<span class="sep"></span><div class="o-tgrp">${history}</div>`
      + `<span class="sep"></span><div class="o-tgrp o-kayit">${saveButton(this.state)}${status}</div>`
      + '<button type="button" class="o-tkapat" data-kapat>Kalemi kapat</button>';
  }
}

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
  if (d.tur === 'kaydediliyor') return pill('o-tdurum', 'Kaydediliyor…', 'Kaydediliyor…', 'Kaydediliyor…');
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
  return `<button type="button" class="o-kaydet" data-kaydet title="${title}"${off ? ' disabled' : ''}>${retry ? 'Tekrar dene' : 'Kaydet'}</button>`;
}
