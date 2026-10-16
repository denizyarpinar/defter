import { getStroke, type StrokeOptions } from 'perfect-freehand';

// Task 4.7c: the shape of a stroke, in one place. The live path, the reading layer (SVG) and the
// PDF appearance (/AP) all draw these curves, so the screen and Drive's preview look the same.
// - Pen: the outline of the stroke (perfect-freehand), filled. Its width follows the Apple Pencil's
//   pressure; without pressure (mouse, finger, old strokes) it is simulated from the speed.
// - Highlighter: the centre line, smoothed (quadratic Béziers through the midpoints), stroked
//   with a constant width.
// - Both first fill long gaps between the points with points on a curve that goes through them
//   (centripetal Catmull-Rom). A fast zigzag comes as a few far-apart points; without this the
//   line is either angular (straight pieces) or, smoothed, loses its tips. With it, the smoothing
//   works the same at any speed and the line still goes through every point the pen gave.
// Everything is in PDF user space (pt); the SVG writer maps the points with the pdf.js viewport.
// That map is affine (scale, rotation, shift), so mapping the control points maps the curve exactly.

// Why these values:
// - size = kalinlik: at pressure 0.5 the stroke is exactly kalinlik wide (the meaning it had).
// - thinning 0.5: the width goes from 0.5× (light) to 1.5× (hard); visible, not overdone for handwriting.
// - smoothing 0.5: softens the outline's edge; more rounds off the corners of letters.
// - streamline 0.5 (the library's default): it pulls every point towards the one before. On points
//   1 pt apart (PEN_STEP) that is a jitter filter of about 1 pt that doesn't lag visibly; on raw
//   far-apart points it would cut the tips off a fast zigzag.
// - no taper, round caps: the Pencil's real pressure already thins the ends where it should.
// - no pressure (mouse, finger): simulated from the gaps between the points the pen gave, with
//   perfect-freehand's own rule (fast = thinner), before the gaps are filled (filled gaps all look slow).
const PEN_OPTIONS = {
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  easing: (t: number) => t,
  start: { taper: 0, cap: true },
  end: { taper: 0, cap: true }
} satisfies StrokeOptions;

export const MAX_WIDTH_FACTOR = 1 + PEN_OPTIONS.thinning;   // pressure 1: 1.5 × kalinlik

const PEN_STEP = 1;   // pt: the pen's points are at most this far apart after filling
const HL_STEP = 4;    // pt: the highlighter's (its quadratic smoothing needs fewer)

export type Pt = [number, number];

// A path: a start point and quadratic Bézier segments (cx, cy, x, y, …). closed: filled shape.
export interface Curve {
  start: Pt;
  segs: number[];
  closed: boolean;
}

export interface StrokeShape {
  noktalar: ArrayLike<number>;
  basinc?: ArrayLike<number>;
  kalinlik: number;
}

const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

// The pen stroke's outline. last: the stroke is finished (false while it is being drawn).
export function penOutline(s: StrokeShape, last: boolean): Curve {
  const n = s.noktalar.length >> 1;
  const real = !!s.basinc && s.basinc.length === n;
  if (n === 1) {
    // a tap: a round dot (perfect-freehand would make a short line of it, 1 unit to the side)
    const p = real ? s.basinc![0] : 0.5;
    const r = s.kalinlik * (0.5 - PEN_OPTIONS.thinning * (0.5 - p));
    return circle([s.noktalar[0], s.noktalar[1]], Math.max(r, 0.05));
  }
  const xy = Array.from({ length: 2 * n }, (_, i) => s.noktalar[i]);
  const pressure = real ? Array.from(s.basinc!) : simulatedPressure(xy, s.kalinlik);
  const filled = fillGaps(xy, PEN_STEP, pressure);
  const pts: number[][] = [];
  for (let i = 0; i < filled.extra.length; i++) pts.push([filled.xy[2 * i], filled.xy[2 * i + 1], filled.extra[i]]);
  const outline = getStroke(pts, { ...PEN_OPTIONS, size: s.kalinlik, simulatePressure: false, last }) as Pt[];
  return closedCurve(outline);
}

// perfect-freehand's simulated pressure, on the points as the pen gave them: a long gap (fast)
// pulls it down, a short one (slow) up. The same for the live stroke and the saved one.
function simulatedPressure(xy: readonly number[], size: number): number[] {
  const out = [0.5];
  let p = 0.5;
  for (let i = 2; i + 1 < xy.length; i += 2) {
    const r = Math.min(1, Math.hypot(xy[i] - xy[i - 2], xy[i + 1] - xy[i - 1]) / size);
    p = Math.min(1, p + (Math.min(1, 1 - r) - p) * (r * 0.275));
    out.push(p);
  }
  return out;
}

// Points every `step` pt or closer, on a centripetal Catmull-Rom curve through the given ones (it
// keeps every point and makes no loops or cusps at sharp turns). extra (pressure): linear in between.
export function fillGaps(xy: readonly number[], step: number, extra: readonly number[] = []): { xy: number[]; extra: number[] } {
  const n = xy.length >> 1;
  const P = (i: number): Pt => [xy[2 * i], xy[2 * i + 1]];
  const outXy: number[] = [], outEx: number[] = [];
  const hasExtra = extra.length === n;
  for (let i = 0; i < n; i++) {
    const p1 = P(i);
    outXy.push(p1[0], p1[1]);
    if (hasExtra) outEx.push(extra[i]);
    if (i === n - 1) break;
    const p2 = P(i + 1);
    const k = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step);
    if (k < 2) continue;
    // at the ends, the missing neighbour is mirrored
    const p0: Pt = i > 0 ? P(i - 1) : [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]];
    const p3: Pt = i + 2 < n ? P(i + 2) : [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];
    for (let j = 1; j < k; j++) {
      const q = catmullRom(p0, p1, p2, p3, j / k);
      outXy.push(q[0], q[1]);
      if (hasExtra) outEx.push(extra[i] + (extra[i + 1] - extra[i]) * (j / k));
    }
  }
  return { xy: outXy, extra: outEx };
}

// The point at u (0–1) between p1 and p2 (Barry–Goldman, alpha 0.5)
function catmullRom(p0: Pt, p1: Pt, p2: Pt, p3: Pt, u: number): Pt {
  const knot = (a: Pt, b: Pt) => Math.max(Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])), 1e-6);
  const t0 = 0, t1 = t0 + knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
  const t = t1 + u * (t2 - t1);
  const lerp = (a: Pt, b: Pt, ta: number, tb: number): Pt =>
    [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
  const a1 = lerp(p0, p1, t0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2), b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

// A polygon → a smooth closed curve: from the middle of each edge to the next, the corner is the
// control point (what perfect-freehand's own SVG example does).
export function closedCurve(poly: readonly Pt[]): Curve {
  const k = poly.length;
  if (k === 0) return { start: [0, 0], segs: [], closed: true };
  if (k < 3) return { start: poly[0], segs: [], closed: true };
  const segs: number[] = [];
  for (let i = 1; i <= k; i++) {
    const c = poly[i % k], e = mid(c, poly[(i + 1) % k]);
    segs.push(c[0], c[1], e[0], e[1]);
  }
  return { start: mid(poly[0], poly[1]), segs, closed: true };
}

function circle(c: Pt, r: number): Curve {
  const poly: Pt[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * 2 * Math.PI;
    poly.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return closedCurve(poly);
}

// The highlighter's centre line: the gaps filled (HL_STEP), then straight to the first midpoint,
// a quadratic through every midpoint (the points are the controls), straight to the last point.
// A single point stays a zero-length path, which the round cap draws as a dot.
export function smoothCenterline(noktalar: ArrayLike<number>): Curve {
  const { xy } = fillGaps(Array.from({ length: noktalar.length & ~1 }, (_, i) => noktalar[i]), HL_STEP);
  const p: Pt[] = [];
  for (let i = 0; i + 1 < xy.length; i += 2) p.push([xy[i], xy[i + 1]]);
  if (!p.length) return { start: [0, 0], segs: [], closed: false };
  const segs: number[] = [];
  const line = (a: Pt, b: Pt) => { const m = mid(a, b); segs.push(m[0], m[1], b[0], b[1]); };
  if (p.length === 1) segs.push(p[0][0], p[0][1], p[0][0], p[0][1]);
  else if (p.length === 2) line(p[0], p[1]);
  else {
    line(p[0], mid(p[0], p[1]));
    for (let i = 1; i < p.length - 1; i++) {
      const e = mid(p[i], p[i + 1]);
      segs.push(p[i][0], p[i][1], e[0], e[1]);
    }
    line(mid(p[p.length - 2], p[p.length - 1]), p[p.length - 1]);
  }
  return { start: p[0], segs, closed: false };
}

const num = (v: number) => String(Math.round(v * 100) / 100);

// SVG path data. map: PDF pt → viewBox units (the pdf.js viewport); identity if left out.
export function curveToSvg(c: Curve, map: (x: number, y: number) => number[] = (x, y) => [x, y]): string {
  const pt = (x: number, y: number) => { const [a, b] = map(x, y); return `${num(a)} ${num(b)}`; };
  let d = `M${pt(c.start[0], c.start[1])}`;
  for (let i = 0; i + 3 < c.segs.length; i += 4) d += `Q${pt(c.segs[i], c.segs[i + 1])} ${pt(c.segs[i + 2], c.segs[i + 3])}`;
  return c.closed ? d + 'Z' : d;
}

// PDF path operators. PDF has only cubic curves: a quadratic (p0, q, p1) is exactly the cubic
// with controls p0 + ⅔(q − p0) and p1 + ⅔(q − p1), so the shape is the same as on screen.
export function curveToPdf(c: Curve): string {
  const out = [`${num(c.start[0])} ${num(c.start[1])} m`];
  let x0 = c.start[0], y0 = c.start[1];
  for (let i = 0; i + 3 < c.segs.length; i += 4) {
    const [qx, qy, x, y] = [c.segs[i], c.segs[i + 1], c.segs[i + 2], c.segs[i + 3]];
    const c1x = x0 + (2 / 3) * (qx - x0), c1y = y0 + (2 / 3) * (qy - y0);
    const c2x = x + (2 / 3) * (qx - x), c2y = y + (2 / 3) * (qy - y);
    out.push(`${num(c1x)} ${num(c1y)} ${num(c2x)} ${num(c2y)} ${num(x)} ${num(y)} c`);
    x0 = x; y0 = y;
  }
  if (c.closed) out.push('h');
  return out.join('\n');
}

// The furthest any part of the curve gets (a Bézier stays inside its controls)
export function curveBounds(c: Curve): [number, number, number, number] {
  let x0 = c.start[0], y0 = c.start[1], x1 = x0, y1 = y0;
  for (let i = 0; i + 1 < c.segs.length; i += 2) {
    const x = c.segs[i], y = c.segs[i + 1];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

// The shape a stroke is drawn with: pen → outline (fill), highlighter → centre line (stroke)
export function strokeCurve(s: StrokeShape & { arac: 'kalem' | 'fosforlu' }, last = true): Curve {
  return s.arac === 'kalem' ? penOutline(s, last) : smoothCenterline(s.noktalar);
}
