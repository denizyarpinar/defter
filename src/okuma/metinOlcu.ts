// Task 6.3c-2: measuring text with canvas measureText, for the widths of the search highlights.
// One hidden canvas, a fixed size (only the ratios count); results kept by font + text.
import type { Olcucu } from './metinAra';

const BOYUT = 100;      // px
const EN_COK = 5000;    // kept results; then the store starts again

let ctx: CanvasRenderingContext2D | null | undefined;
const bellek = new Map<string, number>();

export const canvasOlcucu: Olcucu = (metin, font) => {
  if (!metin) return 0;
  const anahtar = font + '\u0000' + metin;
  const v = bellek.get(anahtar);
  if (v !== undefined) return v;
  if (ctx === undefined) ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!ctx) return 0;   // no canvas: the caller counts every character as the same width
  ctx.font = `${BOYUT}px ${font}`;
  const w = ctx.measureText(metin).width;
  if (bellek.size >= EN_COK) bellek.clear();
  bellek.set(anahtar, w);
  return w;
};
