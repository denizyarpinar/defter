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

// onDevice (task 4.8a): the unsaved strokes are kept on the device (IndexedDB works)
export interface ToolbarState { preparing: boolean; dirty: boolean; onDevice: boolean; canUndo: boolean; canRedo: boolean }

export interface ToolbarActions {
  close(): void;
  undo(): void;
  redo(): void;
  toolChanged(): void;
}

export class PenToolbar {
  prefs = loadPrefs();
  eraser = false;
  private state: ToolbarState = { preparing: false, dirty: false, onDevice: true, canUndo: false, canRedo: false };

  constructor(private el: HTMLElement, act: ToolbarActions) {
    el.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b || b.disabled) return;
      if (b.dataset.kapat !== undefined) { act.close(); return; }
      if (b.dataset.geri !== undefined) { act.undo(); return; }
      if (b.dataset.ileri !== undefined) { act.redo(); return; }
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
    const status = this.state.preparing ? '<span class="o-tdurum">Kalem hazırlanıyor…</span>'
      : !this.state.dirty ? ''
      // task 4.8a: kept on the device until it goes to Drive (4.8b)
      : this.state.onDevice ? '<span class="o-tdurum kaydedilmedi" title="Çizimler henüz PDF\'e kaydedilmedi; bu cihazda saklanıyor">Kaydedilmedi <small>cihazda</small></span>'
      : '<span class="o-tdurum kaydedilmedi" title="Çizimler henüz PDF\'e kaydedilmedi ve bu cihaza da kaydedilemiyor">Kaydedilmedi</span>';
    const st = this.state;
    const history = `<button type="button" data-geri title="Geri al (Ctrl+Z)"${st.canUndo ? '' : ' disabled'}>↶ Geri al</button>`
      + `<button type="button" data-ileri title="Yinele (Ctrl+Shift+Z)"${st.canRedo ? '' : ' disabled'}>↷ Yinele</button>`;
    // the eraser has no colour or width: the prototype's hint instead
    const options = this.eraser ? '<span class="o-tipucu">Silmek için çizginin üzerinden geç</span>'
      : `<div class="o-tgrp o-renkler">${colors}</div><span class="sep"></span><div class="o-tgrp">${sizes}</div>`;
    this.el.innerHTML = `<div class="o-tgrp">${tool('kalem', 'Kalem')}${tool('fosforlu', 'Fosforlu')}${tool('silgi', 'Silgi')}</div>`
      + `<span class="sep"></span>${options}`
      + `<span class="sep"></span><div class="o-tgrp">${history}</div>`
      + status
      + '<button type="button" class="o-tkapat" data-kapat>Kalemi kapat</button>';
  }
}
