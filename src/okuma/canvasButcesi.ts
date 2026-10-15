import { MAX_PIXELS } from './sanalListe';

// Canvas memory of the reader (task 3.7, no DOM, so it can be tested).
// iPad Safari limits one canvas (16 MP) and also all canvases together; over the limit pages
// stay blank or the tab reloads. On touch devices both limits are lower and the total is kept:
// off-screen pages are freed first, then the resolution of new canvases goes down (a bit blurry).
// On a desktop only the 16 MP per canvas of before applies.

export interface Limits { perCanvas: number; total: number }

export const DESKTOP_LIMITS: Limits = { perCanvas: MAX_PIXELS, total: Infinity };
export const TOUCH_LIMITS: Limits = { perCanvas: 8_000_000, total: 24_000_000 };

// iPadOS Safari calls itself a Mac, so ask for touch points instead of the name.
export const deviceLimits = (maxTouchPoints: number): Limits => maxTouchPoints > 1 ? TOUCH_LIMITS : DESKTOP_LIMITS;

// An off-screen page (one of the ±2 drawn ahead) gets a canvas only if this share of its size fits.
export const MIN_SHARE = 0.25;

export type CanvasKind = 'ana' | 'detay';   // the page itself / the sharp zoomed part over it

export interface CanvasEntry { page: number; kind: CanvasKind; px: number; visible: boolean }

// Which canvases to free so that `need` more pixels fit: only off-screen ones, zoom details before
// pages, and the farthest from the page the reader is on first. May free less than needed.
export function toFree(entries: [string, CanvasEntry][], need: number, focus: number): string[] {
  if (need <= 0) return [];
  const off = entries.filter(([, e]) => !e.visible)
    .sort(([, a], [, b]) => (a.kind === b.kind ? 0 : a.kind === 'detay' ? -1 : 1) || Math.abs(b.page - focus) - Math.abs(a.page - focus));
  const out: string[] = [];
  for (const [key, e] of off) {
    if (need <= 0) break;
    out.push(key);
    need -= e.px;
  }
  return out;
}

// What a new canvas may have, with `used` pixels already taken.
export function allowance(used: number, limits: Limits): number {
  return Math.max(0, Math.min(limits.perCanvas, limits.total - used));
}

// The visible zoomed pages share what is left, in proportion to what each would like.
export function shareBudget(available: number, wants: number[]): number[] {
  const sum = wants.reduce((a, b) => a + b, 0);
  if (sum <= available) return wants.slice();
  const k = Math.max(0, available) / sum;
  return wants.map(w => Math.floor(w * k));
}

export class CanvasBudget {
  private items = new Map<string, CanvasEntry & { free: () => void }>();

  constructor(public limits: Limits, private onChange: (count: number, px: number) => void = () => {}) {}

  get used(): number {
    let s = 0;
    for (const e of this.items.values()) s += e.px;
    return s;
  }

  usedBy(kind: CanvasKind): number {
    let s = 0;
    for (const e of this.items.values()) if (e.kind === kind) s += e.px;
    return s;
  }

  get count(): number { return this.items.size; }

  // free(): called when the budget needs the room; it must release the canvas and call delete(key).
  set(key: string, e: CanvasEntry, free: () => void): void {
    this.items.set(key, { ...e, free });
    this.changed();
  }

  delete(key: string): void {
    if (this.items.delete(key)) this.changed();
  }

  clear(): void {
    this.items.clear();
    this.changed();
  }

  markVisible(isVisible: (page: number) => boolean): void {
    for (const e of this.items.values()) e.visible = isVisible(e.page);
  }

  // Free off-screen canvases until `need` more pixels fit under the total.
  makeRoom(need: number, focus: number): void {
    const over = this.used + need - this.limits.total;
    if (!(over > 0)) return;   // also NaN / -Infinity (no total on a desktop): nothing to free
    for (const key of toFree([...this.items].map(([k, e]) => [k, e]), over, focus)) this.items.get(key)?.free();
  }

  // Pixels a new canvas for `page` may have (≤ want). Visible pages make room first; an off-screen
  // page gets nothing (0) when less than MIN_SHARE of what it wants is left.
  reserve(want: number, visible: boolean, focus: number): number {
    const w = Math.min(want, this.limits.perCanvas);
    if (visible) this.makeRoom(w, focus);
    const cap = Math.min(w, allowance(this.used, this.limits));
    if (!visible && cap < w * MIN_SHARE) return 0;
    return cap;
  }

  private changed(): void {
    this.onChange(this.items.size, this.used);
  }
}
