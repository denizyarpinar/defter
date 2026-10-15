import { MAX_DPR, MAX_PIXELS, pageAt, type Layout } from './sanalListe';

// Zoom maths for the reader (task 3.4, no DOM, so it can be tested).
// Book mode: the spread is scaled with CSS around its centre and moved (pan), as in the prototype.
// PDF mode: the pages get wider (width × zoom) and the browser's own scroll pans.

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const TAP_ZOOM = 2;        // double tap: 100 % ↔ 200 %
export const EDGE = 0.22;         // book mode: a tap this close to the side turns the page
export const DOUBLE_TAP_MS = 300;

export interface Pt { x: number; y: number }
export interface Size { w: number; h: number }

export const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
export const isZoomed = (z: number) => z > 1.01;

// New pan so that `focus` (relative to the view centre) stays on the same spot of the page.
export function zoomAround(z0: number, z1: number, pan: Pt, focus: Pt): Pt {
  const k = z1 / z0;
  return { x: focus.x - (focus.x - pan.x) * k, y: focus.y - (focus.y - pan.y) * k };
}

// The scaled content may move only as far as its edge (+ a small margin) (prototype clampPan).
export function clampPan(pan: Pt, z: number, content: Size, view: Size, margin = 30): Pt {
  const mx = Math.max(0, (content.w * z - view.w) / 2 + margin);
  const my = Math.max(0, (content.h * z - view.h) / 2 + margin);
  return { x: Math.max(-mx, Math.min(mx, pan.x)) || 0, y: Math.max(-my, Math.min(my, pan.y)) || 0 };   // || 0: no −0
}

// PDF mode: where the pages stand in the scroll content.
export interface PdfGeometry { layout: Layout; left: number; width: number }

// PDF mode after a zoom: the content point under the finger (old geometry) in the new geometry.
// Gaps between pages don't grow, so it is found through the page and the spot inside it.
export function anchorPoint(from: PdfGeometry, to: PdfGeometry, p: Pt): Pt {
  const n = from.layout.tops.length;
  const u = (p.x - from.left) / Math.max(1, from.width);
  if (!n) return { x: to.left + u * to.width, y: p.y };
  const i = pageAt(from.layout, p.y);
  const v = (p.y - from.layout.tops[i]) / Math.max(1, from.layout.heights[i]);
  return { x: to.left + u * to.width, y: to.layout.tops[i] + v * to.layout.heights[i] };
}

// PDF mode: the pages are centred; wider than the screen → they start at `side`.
export function pdfLeft(viewW: number, width: number, side: number): { holder: number; left: number } {
  const holder = Math.max(viewW, width + 2 * side);
  return { holder, left: (holder - width) / 2 };
}

// A part of a page in 0–1 fractions of its width / height.
export interface Rect { x: number; y: number; w: number; h: number }

// Sharp drawing of a zoomed page shown at pageW × pageH screen px, `vis` of it on screen.
// The whole page if it fits in maxPx (16 MP, or the share of the canvas budget), else the visible
// part with some margin (pan stays sharp a bit), at a lower resolution if even that doesn't fit.
export function detailRect(vis: Rect, pageW: number, pageH: number, dpr: number, maxPx = MAX_PIXELS): Rect & { pw: number; ph: number } {
  let scale = Math.min(Math.max(dpr || 1, 1), MAX_DPR);
  const px = (r: Rect, s: number) => r.w * pageW * s * r.h * pageH * s;
  const full = { x: 0, y: 0, w: 1, h: 1 };
  let r: Rect = full;
  if (px(full, scale) > maxPx) {
    r = grow(vis, 0.25);
    if (px(r, scale) > maxPx) r = vis;
    if (px(r, scale) > maxPx) scale *= Math.sqrt(maxPx / px(r, scale));
  }
  return { ...r, pw: Math.max(1, Math.floor(r.w * pageW * scale)), ph: Math.max(1, Math.floor(r.h * pageH * scale)) };
}

function grow(r: Rect, k: number): Rect {
  const x0 = Math.max(0, r.x - r.w * k), y0 = Math.max(0, r.y - r.h * k);
  const x1 = Math.min(1, r.x + r.w * (1 + k)), y1 = Math.min(1, r.y + r.h * (1 + k));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

interface Box { left: number; top: number; right: number; bottom: number; width: number; height: number }

// The part of a page (screen box `page`) inside the view, in fractions of the page; null = not on screen.
export function visiblePart(page: Box, view: Box): Rect | null {
  const x0 = Math.max(page.left, view.left), x1 = Math.min(page.right, view.right);
  const y0 = Math.max(page.top, view.top), y1 = Math.min(page.bottom, view.bottom);
  if (x1 - x0 < 1 || y1 - y0 < 1 || !page.width || !page.height) return null;
  return { x: (x0 - page.left) / page.width, y: (y0 - page.top) / page.height, w: (x1 - x0) / page.width, h: (y1 - y0) / page.height };
}

// a contains b (with a little tolerance for rounding)
export function covers(a: Rect, b: Rect, eps = 0.002): boolean {
  return a.x <= b.x + eps && a.y <= b.y + eps && a.x + a.w >= b.x + b.w - eps && a.y + a.h >= b.y + b.h - eps;
}

// Book mode, tap at x (px). book: the open book on screen and its page count (1 or 2).
// The outer EDGE of each page turns it, and so does the desk beside the book; the middle
// (around the spine) doesn't, it is for double tap zoom. Measured on the book, not on the whole
// area: on a wide, low window the book is narrow and an area-based edge lay on the desk only.
export function tapZone(x: number, book: { left: number; width: number; pages: 1 | 2 }): 'prev' | 'next' | 'middle' {
  const edge = EDGE * book.width / book.pages;
  return x < book.left + edge ? 'prev' : x > book.left + book.width - edge ? 'next' : 'middle';
}

export function isDoubleTap(last: { t: number; x: number; y: number }, t: number, x: number, y: number): boolean {
  return t - last.t < DOUBLE_TAP_MS && Math.hypot(x - last.x, y - last.y) < 30;
}
