// A pen stroke (Faz 4, task 4.3). Coordinates are in PDF user space (pt, unrotated page),
// so they don't depend on zoom or page rotation; turning them into screen pixels is the
// drawing layer's job (pdf.js viewport).
// Task 4.7c: a pen stroke may have the Apple Pencil's pressure (basinc, one 0–1 value per point);
// its width then follows it (cizgiSekli.ts). Without it (mouse, finger, older strokes) the
// pressure is simulated from the speed. The highlighter has no pressure: constant width.

import { MAX_WIDTH_FACTOR } from './cizgiSekli';

export type StrokeTool = 'kalem' | 'fosforlu';
export const STROKE_TOOLS: readonly StrokeTool[] = ['kalem', 'fosforlu'];

// Task 6.4e-4: the view a stroke was drawn in. A read photo page shown in clean handwriting has its own
// strokes; the photo (the original) its own. Each view shows only its own; both are in the same PDF.
export type StrokeView = 'orijinal' | 'temiz';

export interface Stroke {
  id: string;           // unique; the caller makes it (crypto.randomUUID)
  arac: StrokeTool;
  renk: string;         // '#rrggbb'
  kalinlik: number;     // line width in pt at medium pressure, > 0
  opaklik: number;      // 0 < x ≤ 1
  noktalar: number[];   // x,y,x,y… in PDF user space (pt)
  basinc?: number[];    // pen only: 0–1 per point, 2 decimals (rounded when drawn, so it stays as saved)
  gorunum?: 'temiz';    // task 6.4e-4: drawn over the clean handwriting; none = the original (all older strokes)
}

export const strokeView = (s: Pick<Stroke, 'gorunum'>): StrokeView => s.gorunum === 'temiz' ? 'temiz' : 'orijinal';

// A new stroke in the view its page shows now (the original: as it is)
export const inView = (s: Stroke, v: StrokeView): Stroke => {
  if (v === 'temiz') return { ...s, gorunum: 'temiz' };
  if (s.gorunum === undefined) return s;
  const { gorunum: _, ...rest } = s;
  return rest;
};

// 2 decimals: what is stored, so the live stroke is the saved one
export const roundPressure = (p: number) => Math.round(Math.min(1, Math.max(0, p)) * 100) / 100;

// Page index (0-based) → the Defter strokes on that page.
export type PageStrokes = Map<number, Stroke[]>;

const HEX = /^#[0-9a-f]{6}$/i;

// Throws for data the writer must not put into a PDF (a bug in the caller, not a user error).
export function validateStroke(s: Stroke): void {
  const bad = (why: string) => { throw new Error(`Geçersiz çizgi ${s.id || '(id yok)'}: ${why}`); };   // dil-kontrol: yoksay
  if (typeof s.id !== 'string' || !s.id) bad('id boş');   // dil-kontrol: yoksay
  if (!STROKE_TOOLS.includes(s.arac)) bad(`araç "${s.arac}"`);   // dil-kontrol: yoksay
  if (!HEX.test(s.renk)) bad(`renk "${s.renk}"`);
  if (!(Number.isFinite(s.kalinlik) && s.kalinlik > 0)) bad(`kalınlık ${s.kalinlik}`);   // dil-kontrol: yoksay
  if (!(Number.isFinite(s.opaklik) && s.opaklik > 0 && s.opaklik <= 1)) bad(`opaklık ${s.opaklik}`);   // dil-kontrol: yoksay
  // the reader tells the tools apart by opacity alone (pdf.js doesn't give /DefterArac): pen 1, highlighter < 1
  if (s.arac === 'kalem' && s.opaklik !== 1) bad(`kalem opaklığı 1 olmalı (${s.opaklik})`);   // dil-kontrol: yoksay
  if (s.arac === 'fosforlu' && s.opaklik === 1) bad(`fosforlu opaklığı 1'den küçük olmalı`);   // dil-kontrol: yoksay
  if (s.noktalar.length < 2 || s.noktalar.length % 2 !== 0) bad('nokta sayısı');   // dil-kontrol: yoksay
  if (!s.noktalar.every(Number.isFinite)) bad('nokta sayı değil');   // dil-kontrol: yoksay
  if (s.gorunum !== undefined && s.gorunum !== 'temiz') bad(`görünüm "${s.gorunum}"`);   // dil-kontrol: yoksay
  if (s.basinc !== undefined) {
    if (s.arac !== 'kalem') bad('fosforluda basınç olmaz');   // dil-kontrol: yoksay
    if (!Array.isArray(s.basinc) || s.basinc.length !== s.noktalar.length / 2) bad('basınç sayısı nokta sayısına eşit değil');   // dil-kontrol: yoksay
    if (!s.basinc.every(p => Number.isFinite(p) && p >= 0 && p <= 1)) bad('basınç 0–1 arasında değil');   // dil-kontrol: yoksay
  }
}

// The stroke's bounds, grown by half the widest the line can get (round caps reach that far) plus 1 pt.
// Pen: up to 1.5 × kalinlik at full pressure (cizgiSekli.ts).
export function strokeBounds(s: Stroke): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < s.noktalar.length; i += 2) {
    const x = s.noktalar[i], y = s.noktalar[i + 1];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const pad = s.kalinlik * (s.arac === 'kalem' ? MAX_WIDTH_FACTOR : 1) / 2 + 1;
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

// '#rrggbb' ↔ [r, g, b] in 0–1 (the PDF /C array)
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(rgb: readonly number[]): string {
  const c = (v: number | undefined) => Math.round(Math.min(1, Math.max(0, v ?? 0)) * 255).toString(16).padStart(2, '0');
  return '#' + c(rgb[0]) + c(rgb[1]) + c(rgb[2]);
}
