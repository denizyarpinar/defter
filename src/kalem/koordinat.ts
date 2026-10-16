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

// Adds x, y to the flat list unless it is closer than min to the last point. true: added.
export function pushPoint(pts: number[], x: number, y: number, min = MIN_STEP): boolean {
  const n = pts.length;
  if (n >= 2 && Math.hypot(x - pts[n - 2], y - pts[n - 1]) < min) return false;
  pts.push(x, y);
  return true;
}
