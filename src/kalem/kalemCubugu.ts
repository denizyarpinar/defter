import type { StrokeTool } from './cizgi';

// Pen mode (task 4.6): the tool bar (pen / highlighter, colour, width) and the remembered choice.
// Colours from the prototype (PEN_COLORS / HL_COLORS). Widths in pt (PDF units): they grow with the zoom.

export const COLORS: Record<StrokeTool, readonly (readonly [string, string])[]> = {
  kalem: [['#222222', 'Siyah'], ['#1d3a8a', 'Mavi'], ['#b5523b', 'Kırmızı'], ['#2f7a46', 'Yeşil']],
  fosforlu: [['#f5d33a', 'Sarı'], ['#8fd16a', 'Yeşil'], ['#f59ac0', 'Pembe']]
};
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
  const tool = (t: StrokeTool) => ({
    renk: COLORS[t].some(([c]) => c === o.renk?.[t]) ? o.renk![t] : DEFAULT_PREFS.renk[t],
    boy: Number.isInteger(o.boy?.[t]) && o.boy![t] >= 0 && o.boy![t] < SIZES[t].length ? o.boy![t] : DEFAULT_PREFS.boy[t]
  });
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

export interface ToolbarState { preparing: boolean; dirty: boolean }

export class PenToolbar {
  prefs = loadPrefs();
  private state: ToolbarState = { preparing: false, dirty: false };

  constructor(private el: HTMLElement, onClose: () => void) {
    el.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      if (b.dataset.kapat !== undefined) { onClose(); return; }
      const p = this.prefs;
      if (b.dataset.arac) p.arac = b.dataset.arac as StrokeTool;
      if (b.dataset.renk) p.renk[p.arac] = b.dataset.renk;
      if (b.dataset.boy) p.boy[p.arac] = Number(b.dataset.boy);
      savePrefs(p);
      this.render();
    });
    this.render();
  }

  set(state: ToolbarState): void {
    this.state = state;
    this.render();
  }

  private render(): void {
    const p = this.prefs, t = p.arac;
    const on = (yes: boolean) => yes ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"';
    const tool = (k: StrokeTool, label: string) => `<button type="button" data-arac="${k}"${on(t === k)}>${label}</button>`;
    const colors = COLORS[t].map(([c, n]) =>
      `<button type="button" class="dot${c === p.renk[t] ? ' on' : ''}" data-renk="${c}" style="--c:${c}" aria-label="${n}" title="${n}" aria-pressed="${c === p.renk[t]}"></button>`).join('');
    const sizes = SIZES[t].map((d, i) => {
      // the sample line: pen widths shown a bit bigger, highlighter flatter
      const h = t === 'kalem' ? Math.round(2 + d * 1.6) : Math.round(d * 0.7);
      const w = t === 'kalem' ? h : Math.round(h * 1.8);
      return `<button type="button" class="sz${i === p.boy[t] ? ' on' : ''}" data-boy="${i}" aria-label="${SIZE_NAMES[i]}" title="${SIZE_NAMES[i]}" aria-pressed="${i === p.boy[t]}"><i style="width:${w}px;height:${h}px"></i></button>`;
    }).join('');
    const status = this.state.preparing ? '<span class="o-tdurum">Kalem hazırlanıyor…</span>'
      : this.state.dirty ? '<span class="o-tdurum kaydedilmedi" title="Çizimler henüz PDF\'e kaydedilmiyor">Kaydedilmedi</span>' : '';
    this.el.innerHTML = `<div class="o-tgrp">${tool('kalem', 'Kalem')}${tool('fosforlu', 'Fosforlu')}</div>`
      + `<span class="sep"></span><div class="o-tgrp">${colors}</div>`
      + `<span class="sep"></span><div class="o-tgrp">${sizes}</div>`
      + status
      + '<button type="button" class="o-tkapat" data-kapat>Kalemi kapat</button>';
  }
}
