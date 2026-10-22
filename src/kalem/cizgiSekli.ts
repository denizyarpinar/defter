import { getStrokeOutlinePoints, getStrokePoints, type StrokeOptions } from 'perfect-freehand';

// Task 4.7c: the shape of a stroke, in one place. The live path, the reading layer (SVG) and the
// PDF appearance (/AP) all draw these curves, so the screen and Drive's preview look the same.
// - Pen: the outline of the stroke (perfect-freehand), filled. Its width follows the Apple Pencil's
//   pressure; without pressure (mouse, finger, old strokes) it is simulated from the speed.
// - Highlighter: the centre line, smoothed (quadratic Béziers through the midpoints), stroked
//   with a constant width. Task 6.H2b: written as short straight pieces (see smoothCenterline).
// - Both first fill long gaps between the points with points on a curve that goes through them
//   (centripetal Catmull-Rom). A fast zigzag comes as a few far-apart points; without this the
//   line is either angular (straight pieces) or, smoothed, loses its tips. With it, the smoothing
//   works the same at any speed and the line still goes through every point the pen gave.
// Task 6.H2b: perfect-freehand counts in screen px, we give it pt. Its fixed lengths were then far too long:
// it left out the last 3 units of every stroke and the first `size` units (2–3.6 pt at each end on the
// iPad recording: ~40 % of a small letter's stroke drawn as two straight pieces). So it works in units of
// 1/PF_SCALE pt, and the start is taken from getStrokePoints with a tiny size. The live stroke is drawn
// finished (last = true) as well, so its shape doesn't change when the pen lifts.
// Everything is in PDF user space (pt); the SVG writer maps the points with the pdf.js viewport.
// That map is affine (scale, rotation, shift), so mapping the control points maps the curve exactly.

// Why these values:
// - size = kalinlik: at pressure 0.5 the stroke is exactly kalinlik wide (the meaning it had).
// - thinning 0.5: the width goes from 0.5× (light) to 1.5× (hard); visible, not overdone for handwriting.
// - smoothing 0.25 (6.H2b, was 0.5): outline points at least 0.25 × size apart (0.55 pt at 2.2 pt), fine
//   enough for small zoomed-in writing; the outline is smoothed again by closedCurve.
// - streamline 0.5 (the library's default): it pulls every point towards the one before. On points
//   0.5 pt apart (PEN_STEP) that is a jitter filter that doesn't lag visibly; on raw
//   far-apart points it would cut the tips off a fast zigzag.
// - no taper, round caps: the Pencil's real pressure already thins the ends where it should.
// - a pen without a pressure sensor (flat pressure): constant width, kalinlik (6.H2b, hasRealPressure).
// - no pressure (mouse, finger): simulated from the gaps between the points the
//   pen gave, with perfect-freehand's own rule (fast = thinner), before the gaps are filled (filled gaps
//   all look slow), on the points 0.5 pt apart as they were kept before 6.H2b, so it doesn't depend on the zoom.
const PEN_OPTIONS = {
  thinning: 0.5,
  smoothing: 0.25,
  streamline: 0.5,
  easing: (t: number) => t,
  start: { taper: 0, cap: true },
  end: { taper: 0, cap: true }
} satisfies StrokeOptions;

export const MAX_WIDTH_FACTOR = 1 + PEN_OPTIONS.thinning;   // pressure 1: 1.5 × kalinlik

const PEN_STEP = 0.5;   // pt: the pen's points are at most this far apart after filling
const HL_STEP = 4;      // pt: the highlighter's (its quadratic smoothing needs fewer)
const HL_PIECE = 0.5;   // pt: the highlighter's straight pieces (6.H2b)
const PF_SCALE = 16;    // perfect-freehand works in 1/16 pt (6.H2b)
const SIM_STEP = 0.5;   // pt: the spacing simulated pressure is worked out on (the old MIN_STEP)

// Task 6.H2b: pressure that never changes isn't pressure. A stylus without a pressure sensor (the ESR
// pen on the iPad sends 0.12 for every point) would otherwise draw the whole stroke thin and even.
// Decision (Deniz): such a pen draws at a constant width (the chosen one, pressure 0.5 everywhere), no
// speed guess. The flat pressure is saved as it came (/DefterBasinc): it marks the stroke as a pen without a
// sensor, so it stays constant when read again (the 0.12 strokes saved before 6.H2b too). Mouse and finger
// have no pressure at all: simulated from the speed, as before.
export const MIN_PRESSURE_SPAN = 0.02;

export function hasRealPressure(basinc: ArrayLike<number> | undefined | null, points: number): boolean {
  if (!basinc || basinc.length !== points || points < 2) return false;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < basinc.length; i++) {
    if (basinc[i] < lo) lo = basinc[i];
    if (basinc[i] > hi) hi = basinc[i];
  }
  return hi - lo >= MIN_PRESSURE_SPAN;
}

export type Pt = [number, number];

// A path: a start point and quadratic Bézier segments (cx, cy, x, y, …). closed: filled shape.
// lines (6.H2b): straight pieces instead, segs = x, y, x, y, …
export interface Curve {
  start: Pt;
  segs: number[];
  closed: boolean;
  lines?: boolean;
}

export interface StrokeShape {
  noktalar: ArrayLike<number>;
  basinc?: ArrayLike<number>;
  kalinlik: number;
}

const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

// The pen stroke's outline, as it is finished: the live stroke is drawn the same way (6.H2b).
export function penOutline(s: StrokeShape): Curve {
  const n = s.noktalar.length >> 1;
  if (n === 1) {
    // a tap: a round dot of the medium width (one point has no pressure to tell)
    return circle([s.noktalar[0], s.noktalar[1]], Math.max(s.kalinlik * 0.5, 0.05));
  }
  const all = Array.from({ length: 2 * n }, (_, i) => s.noktalar[i]);
  const flat = !!s.basinc && s.basinc.length === n && !hasRealPressure(s.basinc, n);
  const allPressure = hasRealPressure(s.basinc, n) ? Array.from(s.basinc!)
    : flat ? Array<number>(n).fill(0.5) : simulatedPressure(all, s.kalinlik);
  const [a, b] = capCovered(all, s.kalinlik * CAP_SHARE);
  const xy = all.slice(2 * a, 2 * b + 2), pressure = allPressure.slice(a, b + 1);
  const filled = fillGaps(xy, PEN_STEP, pressure);
  const pts: number[][] = [];
  for (let i = 0; i < filled.extra.length; i++) pts.push([filled.xy[2 * i] * PF_SCALE, filled.xy[2 * i + 1] * PF_SCALE, filled.extra[i]]);
  // size 1 here: getStrokePoints skips the first `size` units of a stroke; the real width is for the outline
  const line = getStrokePoints(pts, { streamline: PEN_OPTIONS.streamline, size: 1, last: true });
  const outline = getStrokeOutlinePoints(line, { ...PEN_OPTIONS, size: s.kalinlik * PF_SCALE, simulatePressure: false, last: true });
  return closedCurve(outline.map(p => [p[0] / PF_SCALE, p[1] / PF_SCALE] as Pt));
}

// Task 6.H2b: a pen often hooks back by about a point when it lands and when it lifts (the iPad recording:
// 0.9 pt back, then on). perfect-freehand puts a round cap on every turn back, so the hook drew a blob
// wider than the line. The points at each end that the end's round cap covers anyway (within r of the first
// point kept) are left out: the ink is the same, the blob goes. [first, last] index kept.
const CAP_SHARE = 0.4;   // r = 0.4 × kalinlik: inside the cap (half the width is 0.5 × kalinlik at medium pressure)

export function capCovered(xy: readonly number[], r: number): [number, number] {
  const n = xy.length >> 1;
  const within = (i: number, j: number) => Math.hypot(xy[2 * i] - xy[2 * j], xy[2 * i + 1] - xy[2 * j + 1]) <= r;
  // the furthest j whose circle holds every point before it
  const from = (step: 1 | -1, start: number) => {
    let best = start;
    for (let j = start + step; j >= 0 && j < n; j += step) {
      let ok = true;
      for (let i = start; i !== j; i += step) if (!within(i, j)) { ok = false; break; }
      if (!ok) break;
      best = j;
    }
    return best;
  };
  const a = from(1, 0), b = from(-1, n - 1);
  return a < b ? [a, b] : [0, n - 1];   // a stroke that is all inside one cap stays as it is
}

// perfect-freehand's simulated pressure: a long gap (fast) pulls it down, a short one (slow) up. Worked
// out on the points thinned to SIM_STEP (as they were kept until 6.H2b; the finer zoomed-in points would
// all look slow), then spread over all of them, linear in between.
function simulatedPressure(xy: readonly number[], size: number): number[] {
  const n = xy.length >> 1;
  const kept = [0];
  for (let i = 1; i < n; i++) {
    const k = kept[kept.length - 1];
    if (Math.hypot(xy[2 * i] - xy[2 * k], xy[2 * i + 1] - xy[2 * k + 1]) >= SIM_STEP) kept.push(i);
  }
  const at: number[] = [0.5];
  let p = 0.5;
  for (let j = 1; j < kept.length; j++) {
    const a = kept[j - 1], b = kept[j];
    const r = Math.min(1, Math.hypot(xy[2 * b] - xy[2 * a], xy[2 * b + 1] - xy[2 * a + 1]) / size);
    p = Math.min(1, p + (Math.min(1, 1 - r) - p) * (r * 0.275));
    at.push(p);
  }
  const out = new Array<number>(n);
  for (let j = 0; j < kept.length; j++) {
    const a = kept[j], last = j + 1 === kept.length, b = last ? n : kept[j + 1];
    for (let i = a; i < b; i++) out[i] = last ? at[j] : at[j] + (at[j + 1] - at[j]) * (i - a) / (b - a);
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
// Task 6.H2b: the quadratics are written as short straight pieces (HL_PIECE). A thick stroke along a
// tight curve made the browser's outline fold over itself (thin white arcs inside the yellow); along
// short straight pieces with round joins it doesn't. Same curve, same width.
// A single point stays a zero-length path, which the round cap draws as a dot.
export function smoothCenterline(noktalar: ArrayLike<number>): Curve {
  const { xy } = fillGaps(Array.from({ length: noktalar.length & ~1 }, (_, i) => noktalar[i]), HL_STEP);
  const p: Pt[] = [];
  for (let i = 0; i + 1 < xy.length; i += 2) p.push([xy[i], xy[i + 1]]);
  if (!p.length) return { start: [0, 0], segs: [], closed: false, lines: true };
  const segs: number[] = [];
  let at = p[0];
  const lineTo = (b: Pt) => { segs.push(b[0], b[1]); at = b; };
  // a straight piece, cut to HL_PIECE as well (every piece the same size: nothing for the browser to fold)
  const straight = (b: Pt) => {
    const a = at, k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / HL_PIECE));
    for (let j = 1; j < k; j++) lineTo([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
    lineTo(b);
  };
  // the quadratic from where the line is, over the control q, to e: pieces of about HL_PIECE
  const quad = (q: Pt, e: Pt) => {
    const a = at;
    const k = Math.max(1, Math.ceil((Math.hypot(q[0] - a[0], q[1] - a[1]) + Math.hypot(e[0] - q[0], e[1] - q[1])) / HL_PIECE));
    for (let j = 1; j <= k; j++) {
      const t = j / k, u = 1 - t;
      lineTo([u * u * a[0] + 2 * u * t * q[0] + t * t * e[0], u * u * a[1] + 2 * u * t * q[1] + t * t * e[1]]);
    }
  };
  if (p.length === 1) lineTo(p[0]);
  else if (p.length === 2) straight(p[1]);
  else {
    straight(mid(p[0], p[1]));
    for (let i = 1; i < p.length - 1; i++) quad(p[i], mid(p[i], p[i + 1]));
    straight(p[p.length - 1]);
  }
  return { start: p[0], segs, closed: false, lines: true };
}

const num = (v: number) => String(Math.round(v * 100) / 100);

// SVG path data. map: PDF pt → viewBox units (the pdf.js viewport); identity if left out.
export function curveToSvg(c: Curve, map: (x: number, y: number) => number[] = (x, y) => [x, y]): string {
  const pt = (x: number, y: number) => { const [a, b] = map(x, y); return `${num(a)} ${num(b)}`; };
  let d = `M${pt(c.start[0], c.start[1])}`;
  if (c.lines) for (let i = 0; i + 1 < c.segs.length; i += 2) d += `L${pt(c.segs[i], c.segs[i + 1])}`;
  else for (let i = 0; i + 3 < c.segs.length; i += 4) d += `Q${pt(c.segs[i], c.segs[i + 1])} ${pt(c.segs[i + 2], c.segs[i + 3])}`;
  return c.closed ? d + 'Z' : d;
}

// PDF path operators. PDF has only cubic curves: a quadratic (p0, q, p1) is exactly the cubic
// with controls p0 + ⅔(q − p0) and p1 + ⅔(q − p1), so the shape is the same as on screen.
export function curveToPdf(c: Curve): string {
  const out = [`${num(c.start[0])} ${num(c.start[1])} m`];
  if (c.lines) {
    for (let i = 0; i + 1 < c.segs.length; i += 2) out.push(`${num(c.segs[i])} ${num(c.segs[i + 1])} l`);
    if (c.closed) out.push('h');
    return out.join('\n');
  }
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

// The furthest any part of the curve gets (a Bézier stays inside its controls; lines: their ends)
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
export function strokeCurve(s: StrokeShape & { arac: 'kalem' | 'fosforlu' }): Curve {
  return s.arac === 'kalem' ? penOutline(s) : smoothCenterline(s.noktalar);
}
