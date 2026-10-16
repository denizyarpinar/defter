import { strokeBounds, type Stroke } from './cizgi';

// Eraser (task 4.7): a stroke eraser. A stroke the eraser touches goes as a whole (no partial erase).
// All in PDF user space (pt). The eraser moves from one pointer event to the next: that segment is
// tested, so a fast move still catches the strokes it crossed between two events.

export const ERASER_PX = 10;   // radius on the screen; in pt it depends on the zoom (eraserRadius)

export type Pt = readonly [number, number];

// px on the screen → pt: the page box is boxWidth CSS px wide, the viewport (scale 1) vpWidth pt
export function eraserRadius(boxWidth: number, vpWidth: number, px = ERASER_PX): number {
  return boxWidth > 0 ? px * vpWidth / boxWidth : px;
}

function pointSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

// Shortest distance between segments ab and cd (0 when they cross). A point is a zero-length segment.
export function segmentDistance(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b));
}

// Does the eraser, moving from → to with radius r (pt), touch the stroke (its line width included)?
export function strokeHit(s: Stroke, from: Pt, to: Pt, r: number): boolean {
  const [x0, y0, x1, y1] = strokeBounds(s);
  if (Math.max(from[0], to[0]) < x0 - r || Math.min(from[0], to[0]) > x1 + r
    || Math.max(from[1], to[1]) < y0 - r || Math.min(from[1], to[1]) > y1 + r) return false;
  const reach = r + s.kalinlik / 2, p = s.noktalar;
  if (p.length === 2) return segmentDistance(from, to, [p[0], p[1]], [p[0], p[1]]) <= reach;
  for (let i = 2; i < p.length; i += 2) {
    if (segmentDistance(from, to, [p[i - 2], p[i - 1]], [p[i], p[i + 1]]) <= reach) return true;
  }
  return false;
}
