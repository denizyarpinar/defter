import { describe, expect, it } from 'vitest';
import { closedCurve, curveToPdf, curveToSvg, fillGaps, hasRealPressure, penOutline, smoothCenterline, strokeCurve, type Curve } from './cizgiSekli';

// Task 4.7c: the stroke's shape (pen outline, highlighter centre line) and its SVG / PDF writers

// a zigzag drawn fast: few points, sharp turns
const zigzag = [0, 0, 20, 30, 40, 0, 60, 30, 80, 0, 100, 30];
// a slow line: a point every 0.5
const slow: number[] = [];
for (let i = 0; i <= 200; i++) slow.push(i * 0.5, 10 * Math.sin(i / 20));

// the points of a curve: start, then every control and end
const points = (c: Curve) => {
  const out: [number, number][] = [c.start];
  for (let i = 0; i + 1 < c.segs.length; i += 2) out.push([c.segs[i], c.segs[i + 1]]);
  return out;
};
const spanY = (c: Curve) => {
  const ys = points(c).map(q => q[1]);
  return Math.max(...ys) - Math.min(...ys);
};

describe('penOutline', () => {
  it('a closed shape of quadratic curves, no straight lines', () => {
    const c = penOutline({ noktalar: zigzag, kalinlik: 3 });
    expect(c.closed).toBe(true);
    expect(c.segs.length).toBeGreaterThan(40);
    expect(curveToSvg(c)).toMatch(/^M[\d. -]+Q.*Z$/);
    expect(curveToSvg(c)).not.toContain('L');
  });

  it('pressure: the same line is wider pressed hard than light', () => {
    const n = slow.length / 2;
    // (it must change a little: a pressure that never changes is no pressure, see hasRealPressure)
    const hard = spanY(penOutline({ noktalar: slow, basinc: Array.from({ length: n }, (_, i) => i % 2 ? 1 : 0.95), kalinlik: 4 }));
    const light = spanY(penOutline({ noktalar: slow, basinc: Array.from({ length: n }, (_, i) => i % 2 ? 0.1 : 0.15), kalinlik: 4 }));
    // the sine goes ±10; the outline adds the width: up to 1.5 × 4 hard, about 0.5 × 4 light
    expect(hard).toBeGreaterThan(light + 3);
    expect(hard).toBeLessThanOrEqual(20 + 6 + 0.1);
  });

  it('without pressure (mouse, finger, an older stroke) it is simulated: still drawn, about as wide as kalinlik', () => {
    const c = penOutline({ noktalar: slow, kalinlik: 4 });
    expect(c.closed).toBe(true);
    expect(spanY(c)).toBeGreaterThan(20);
    expect(spanY(c)).toBeLessThanOrEqual(26.1);
  });

  it('pressure with a wrong count is ignored (simulated instead), not an error', () => {
    expect(penOutline({ noktalar: slow, basinc: [1, 1], kalinlik: 4 })).toEqual(penOutline({ noktalar: slow, kalinlik: 4 }));
  });

  it('a single point: a round dot of the medium width (one point has no pressure to tell)', () => {
    const radius = (basinc?: number[]) => {
      const pts = points(penOutline({ noktalar: [50, 50], basinc, kalinlik: 4 }));
      return Math.max(...pts.map(([x, y]) => Math.hypot(x - 50, y - 50)));
    };
    expect(radius()).toBeCloseTo(2, 5);
    expect(radius([1])).toBeCloseTo(2, 5);
  });

  // Task 6.H2b: perfect-freehand left out the last 3 units and the first `size` units of a stroke, in pt
  // that was 2–3.6 pt of straight line at each end of a small letter
  it('a small, slow letter stroke: no straight piece at its ends, the outline goes round both ends', () => {
    // a "u" 6 pt high, a point every 0.2 pt (zoomed in), 2.2 pt wide
    const u: number[] = [];
    for (let a = 0; a <= Math.PI; a += 0.2 / 3) u.push(100 + 3 * Math.cos(Math.PI - a), 200 - 3 * Math.sin(a));
    const c = penOutline({ noktalar: u, kalinlik: 2.2 });
    const pts = points(c);
    const near = (x: number, y: number) => Math.min(...pts.map(([px, py]) => Math.hypot(px - x, py - y)));
    const ends = [[u[0], u[1]], [u[u.length - 2], u[u.length - 1]]];
    // the outline reaches round each end (half the width away), not 3 pt short of it
    for (const [x, y] of ends) expect(near(x, y)).toBeLessThan(1.6);
    // every piece of the outline is short (no long straight edge anywhere)
    let longest = 0;
    for (let i = 1; i < pts.length; i++) longest = Math.max(longest, Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    expect(longest).toBeLessThan(0.9);
  });

  it('drawn the same while the pen is down and after: the shape of the first points stays when more come', () => {
    // the live path is the finished shape of the points so far: only the end grows, nothing earlier jumps
    const a = penOutline({ noktalar: slow.slice(0, 200), kalinlik: 4 });
    const b = penOutline({ noktalar: slow.slice(0, 200), kalinlik: 4 });
    expect(a).toEqual(b);
  });

  it('a flat pressure (a pen without a sensor: 0.12 everywhere) draws at a constant width, the chosen one; not the speed guess', () => {
    // a straight line, a point every 0.3 pt, then every 1.5 pt (slow, then fast): the guess would change the width
    const line: number[] = [];
    for (let x = 0; x <= 30; x += 0.3) line.push(x, 0);
    for (let x = 31.5; x <= 90; x += 1.5) line.push(x, 0);
    const n = line.length / 2;
    const width = (c: Curve) => {
      // the outline's half-width at x: the largest |y| among its points near x
      const at = (x: number) => Math.max(...points(c).filter(([px]) => Math.abs(px - x) < 1).map(([, y]) => Math.abs(y)));
      return [at(15), at(60)];
    };
    const flat = width(penOutline({ noktalar: line, basinc: Array(n).fill(0.12), kalinlik: 4 }));
    for (const w of flat) expect(w).toBeCloseTo(2, 1);                                      // kalinlik / 2 everywhere
    expect(Math.abs(flat[0] - flat[1])).toBeLessThan(0.02);                                 // slow or fast: the same
    const guess = width(penOutline({ noktalar: line, kalinlik: 4 }));                      // a mouse: the speed guess
    expect(Math.abs(guess[0] - guess[1])).toBeGreaterThan(0.1);
    // the same as pressure 0.5 everywhere, whatever the flat value
    expect(penOutline({ noktalar: line, basinc: Array(n).fill(0.12), kalinlik: 4 }))
      .toEqual(penOutline({ noktalar: line, basinc: Array(n).fill(0.9), kalinlik: 4 }));
  });
});

describe('smoothCenterline (highlighter)', () => {
  it('a fast zigzag (few points): from the first point to the last, short pieces, the tips kept', () => {
    const c = smoothCenterline(zigzag);
    expect(c.closed).toBe(false);
    expect(c.start).toEqual([0, 0]);
    expect(c.segs.slice(-2)).toEqual([100, 30]);
    // no long straight piece (6.H2b: the curve is written as pieces of about 0.5 pt)
    let prev = c.start;
    for (let i = 0; i < c.segs.length; i += 2) {
      expect(Math.hypot(c.segs[i] - prev[0], c.segs[i + 1] - prev[1])).toBeLessThanOrEqual(0.6);
      prev = [c.segs[i], c.segs[i + 1]];
    }
    // every tip of the zigzag is reached (within 2 pt), not cut off
    const near = (tx: number, ty: number) => Math.min(...points(c).map(([x, y]) => Math.hypot(x - tx, y - ty)));
    for (let j = 0; j < zigzag.length; j += 2) expect(near(zigzag[j], zigzag[j + 1])).toBeLessThanOrEqual(2);
  });

  it('two points: a straight line; one point: a zero-length path (a dot with the round cap)', () => {
    const line = smoothCenterline([0, 0, 10, 0]);
    expect(points(line).every(([, y]) => Math.abs(y) < 1e-9)).toBe(true);
    expect(line.start).toEqual([0, 0]);
    expect(line.segs.slice(-2)).toEqual([10, 0]);
    expect(curveToSvg(smoothCenterline([7, 8]))).toBe('M7 8L7 8');
  });

  // Task 6.H2b: a thick stroke along a tight quadratic made the browser's outline fold (white arcs)
  it('written as short straight pieces (SVG L, PDF l), each at most about 0.5 pt, on the same curve', () => {
    const curl: number[] = [];
    for (let a = 0; a <= 4 * Math.PI; a += 0.5) curl.push(50 + 4 * Math.cos(a) + a, 50 + 4 * Math.sin(a));
    const c = smoothCenterline(curl);
    expect(c.lines).toBe(true);
    const d = curveToSvg(c);
    expect(d).toMatch(/^M[\d. -]+(L[\d. -]+)+$/);
    expect(d).not.toContain('Q');
    const ops = curveToPdf(c).split('\n');
    expect(ops[0]).toMatch(/ m$/);
    expect(ops.slice(1).every(o => / l$/.test(o))).toBe(true);
    const pts = points(c);
    for (let i = 1; i < pts.length; i++) expect(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])).toBeLessThanOrEqual(0.6);
  });
});

describe('hasRealPressure', () => {
  it('real only when it changes: flat 0.12 (ESR stylus) is not, a wrong count is not, a single point is not', () => {
    expect(hasRealPressure([0.12, 0.12, 0.12, 0.12], 4)).toBe(false);
    expect(hasRealPressure([0.12, 0.13, 0.12, 0.12], 4)).toBe(false);   // less than 0.02 apart
    expect(hasRealPressure([0.2, 0.35, 0.5, 0.4], 4)).toBe(true);
    expect(hasRealPressure([0.2, 0.5], 3)).toBe(false);
    expect(hasRealPressure([0.5], 1)).toBe(false);
    expect(hasRealPressure(undefined, 4)).toBe(false);
  });
});

describe('fillGaps', () => {
  it('keeps every point, fills gaps to at most step, pressure linear in between', () => {
    const { xy, extra } = fillGaps([0, 0, 10, 0, 10, 10], 1, [0, 1, 0]);
    expect(xy.length / 2).toBe(extra.length);
    for (let i = 2; i < xy.length; i += 2) expect(Math.hypot(xy[i] - xy[i - 2], xy[i + 1] - xy[i - 1])).toBeLessThanOrEqual(1.2);
    const pts = [];
    for (let i = 0; i < xy.length; i += 2) pts.push([xy[i], xy[i + 1]]);
    for (const p of [[0, 0], [10, 0], [10, 10]]) expect(pts).toContainEqual(p);
    expect(extra[5]).toBeCloseTo(0.5, 5);   // halfway between pressure 0 and 1
  });

  it('close points stay as they are', () => {
    expect(fillGaps([0, 0, 0.5, 0, 1, 0.3], 1).xy).toEqual([0, 0, 0.5, 0, 1, 0.3]);
  });
});

describe('strokeCurve', () => {
  it('pen → outline, highlighter → centre line', () => {
    expect(strokeCurve({ arac: 'kalem', noktalar: zigzag, kalinlik: 3 }).closed).toBe(true);
    expect(strokeCurve({ arac: 'fosforlu', noktalar: zigzag, kalinlik: 12 }).closed).toBe(false);
  });
});

describe('SVG and PDF draw the same curve', () => {
  const quad = (p0: number[], q: number[], p1: number[], t: number) =>
    [0, 1].map(k => (1 - t) ** 2 * p0[k] + 2 * (1 - t) * t * q[k] + t * t * p1[k]);
  const cubic = (p0: number[], c1: number[], c2: number[], p1: number[], t: number) =>
    [0, 1].map(k => (1 - t) ** 3 * p0[k] + 3 * (1 - t) ** 2 * t * c1[k] + 3 * (1 - t) * t * t * c2[k] + t ** 3 * p1[k]);

  it('every quadratic becomes the exact same cubic (checked at 5 places along each)', () => {
    for (const c of [penOutline({ noktalar: zigzag, kalinlik: 3 })]) {
      const ops = curveToPdf(c).split('\n');
      expect(ops[0]).toMatch(/ m$/);
      expect(ops[ops.length - 1] === 'h').toBe(c.closed);
      const cs = ops.filter(o => o.endsWith(' c')).map(o => o.split(' ').slice(0, 6).map(Number));
      expect(cs.length).toBe(c.segs.length / 4);
      let p0: number[] = c.start;
      cs.forEach((n, i) => {
        const q = c.segs.slice(4 * i, 4 * i + 2), p1 = c.segs.slice(4 * i + 2, 4 * i + 4);
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const a = quad(p0, q, p1, t), b = cubic(p0, n.slice(0, 2), n.slice(2, 4), n.slice(4, 6), t);
          expect(b[0]).toBeCloseTo(a[0], 1);
          expect(b[1]).toBeCloseTo(a[1], 1);
        }
        p0 = p1;
      });
    }
  });

  it('the SVG writer maps every point (the pdf.js viewport); closed shapes end with Z', () => {
    const c = closedCurve([[0, 0], [10, 0], [10, 10]]);
    expect(curveToSvg(c, (x, y) => [x * 2, 100 - y])).toBe('M10 100Q20 100 20 95Q20 90 10 95Q0 100 10 100Z');
  });
});
