import type { ViewportLike } from './cizimKatmani';

// Pen mode (task 4.6): a point on the screen → PDF user space (pt).
// screen → the page's box (getBoundingClientRect: zoom and book/PDF mode are in it)
//        → viewBox units (pdf.js viewport at scale 1, the page's rotation and CropBox included)
//        → convertToPdfPoint. So a stroke lands on the same spot of the page at any zoom.

export interface PenViewport extends ViewportLike {
  convertToPdfPoint(x: number, y: number): number[];
}

export interface BoxRect { left: number; top: number; width: number; height: number }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// A point outside the page is pulled to its edge (the stroke stays on the page).
export function screenToViewport(cx: number, cy: number, r: BoxRect, vp: { width: number; height: number }): [number, number] {
  const fx = r.width > 0 ? clamp01((cx - r.left) / r.width) : 0;
  const fy = r.height > 0 ? clamp01((cy - r.top) / r.height) : 0;
  return [fx * vp.width, fy * vp.height];
}

export function toPdf(vp: PenViewport, vx: number, vy: number): [number, number] {
  const [x, y] = vp.convertToPdfPoint(vx, vy);
  return [x, y];
}

export const MIN_STEP = 0.5;   // pt: closer points add nothing a pen can show
// Task 6.H2b: zoomed in, 0.5 pt is several screen px (3 px/pt on the iPad: half the points were dropped and
// small letters came out angular). So the step is at most 1 screen px: the same as before at 100 %, finer zoomed in.
export const MIN_STEP_PX = 1;

// The step for a page box this wide on screen (px) whose viewport is vpWidth wide (pt)
export function minStep(boxWidthPx: number, vpWidthPt: number): number {
  return boxWidthPx > 0 ? Math.min(MIN_STEP, MIN_STEP_PX * vpWidthPt / boxWidthPx) : MIN_STEP;
}

// 0.01 pt, what the PDF's /InkList keeps: the live stroke is the saved one
export const roundPt = (v: number) => Math.round(v * 100) / 100;

// Adds x, y to the flat list unless it is closer than min to the last point. true: added.
export function pushPoint(pts: number[], x: number, y: number, min = MIN_STEP): boolean {
  const n = pts.length;
  if (n >= 2 && Math.hypot(x - pts[n - 2], y - pts[n - 1]) < min) return false;
  pts.push(x, y);
  return true;
}

// The pen's last point (pointerup): it ends the stroke where the pen lifted. Far enough: added, its pressure
// the last one (the up's own is 0). Too close: it takes the last point's place (a tap stays one point).
// 'eklendi' | 'yerine' | 'yok'
export function pushLastPoint(pts: number[], basinc: number[] | null, x: number, y: number, min = MIN_STEP): 'eklendi' | 'yerine' | 'yok' {
  const n = pts.length;
  if (pushPoint(pts, x, y, min)) {
    if (basinc && basinc.length) basinc.push(basinc[basinc.length - 1]);
    return 'eklendi';
  }
  if (n < 4) return 'yok';
  pts[n - 2] = x; pts[n - 1] = y;
  return 'yerine';
}

// Task 6.H2b: on the iPad the same pointermove came twice (same time, same coalesced list), so the
// stroke went back and drew the same piece again. A point older than the last one taken is dropped;
// one at the same time only when it is also at the same place (with a coarse clock, as in Firefox,
// two real points can share a time). Positions are client px, as the events give them.
export class EventOrder {
  private t = -Infinity;
  private x = NaN;
  private y = NaN;

  accept(t: number, x: number, y: number): boolean {
    if (t < this.t || (t === this.t && x === this.x && y === this.y)) return false;
    this.t = t; this.x = x; this.y = y;
    return true;
  }
}
