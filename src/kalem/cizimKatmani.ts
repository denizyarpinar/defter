import { isDefterAnnotation, type PenLayerMode } from './defterNotu';

// Task 4.5: Defter's strokes in reading mode, as an SVG layer over the page (no canvas: no pixel
// memory, sharp at any zoom, moves with the page when a sheet turns). Built from pdf.js
// getAnnotations() data; pdf-lib is not loaded. Only markup here (no DOM), so it can be tested.

export interface DefterInk {
  lines: ArrayLike<number>[];   // PDF user space, x0 y0 x1 y1 …
  color: string;                // rgb(…)
  width: number;                // PDF units
  opacity: number;              // < 1: highlighter
}

// the part of a pdf.js annotation used here (InkAnnotation data)
interface InkData {
  annotationType?: number;
  titleObj?: { str?: string };
  inkLists?: ArrayLike<number>[];
  color?: ArrayLike<number> | null;
  opacity?: number;
  borderStyle?: { width?: number; rawWidth?: number };
}

export function defterInks(annots: readonly InkData[]): DefterInk[] {
  return annots.filter(isDefterAnnotation).map(a => {
    const c = a.color && a.color.length >= 3 ? a.color : [0, 0, 0];
    return {
      lines: a.inkLists ?? [],
      color: `rgb(${c[0]},${c[1]},${c[2]})`,
      // pdf.js sets width to 1 when it is over half the Rect height (a flat highlighter); rawWidth is the real one
      width: a.borderStyle?.rawWidth ?? a.borderStyle?.width ?? 1,
      opacity: a.opacity ?? 1
    };
  });
}

// pdf.js PageViewport at scale 1 with the page's own rotation (CropBox offset included)
export interface ViewportLike {
  width: number;
  height: number;
  convertToViewportPoint(x: number, y: number): number[];
}

const CHECK_COLOR = '#00bcd4';   // ?cizimKontrol=1: cyan, thin, dashed
const num = (v: number) => String(Math.round(v * 100) / 100);

// One stroke: a path; a single point: a round dot.
function shape(line: ArrayLike<number>, vp: ViewportLike, ink: DefterInk, check: boolean): string {
  const pts: string[] = [];
  for (let j = 0; j + 1 < line.length; j += 2) {
    const [x, y] = vp.convertToViewportPoint(line[j], line[j + 1]);
    pts.push(`${num(x)} ${num(y)}`);
  }
  if (!pts.length) return '';
  if (check) {
    if (pts.length === 1) {
      const [x, y] = pts[0].split(' ');
      return `<circle cx="${x}" cy="${y}" r="${num(ink.width / 2)}" fill="none" stroke="${CHECK_COLOR}" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="4 3"/>`;
    }
    return `<path d="M${pts.join('L')}" fill="none" stroke="${CHECK_COLOR}" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="4 3" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const op = ink.opacity < 1 ? ` opacity="${num(ink.opacity)}"` : '';
  if (pts.length === 1) {
    const [x, y] = pts[0].split(' ');
    return `<circle cx="${x}" cy="${y}" r="${num(ink.width / 2)}" fill="${ink.color}"${op}/>`;
  }
  return `<path d="M${pts.join('L')}" fill="none" stroke="${ink.color}" stroke-width="${num(ink.width)}" stroke-linecap="round" stroke-linejoin="round"${op}/>`;
}

// The layer's markup ('' when the page has no Defter strokes). Highlighter and pen are two SVGs:
// mix-blend-mode only mixes with what is behind the element that has it, and inside an SVG that
// would be the SVG itself, not the page canvas. So the highlighter SVG as a whole is multiplied
// (styles.css), under the pen SVG. Opacity is per stroke, so strokes on top of each other don't add up.
// width/height 100 %: the page box gives the size, zoom and book/PDF mode need no new markup.
export function penLayerSvg(inks: readonly DefterInk[], vp: ViewportLike, mode: PenLayerMode): string {
  if (mode === 'kapali' || !inks.length) return '';
  const open = (cls: string) =>
    `<svg class="o-cizim ${cls}" viewBox="0 0 ${num(vp.width)} ${num(vp.height)}" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">`;
  const draw = (list: readonly DefterInk[], check: boolean) =>
    list.flatMap(ink => [...ink.lines].map(l => shape(l, vp, ink, check))).join('');
  if (mode === 'kontrol') return `${open('kontrol')}${draw(inks, true)}</svg>`;
  const hl = inks.filter(i => i.opacity < 1), pen = inks.filter(i => i.opacity >= 1);
  return (hl.length ? `${open('fosforlu')}${draw(hl, false)}</svg>` : '')
    + (pen.length ? `${open('kalem')}${draw(pen, false)}</svg>` : '');
}
