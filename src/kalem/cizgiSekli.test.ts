import { describe, expect, it } from 'vitest';
import { closedCurve, curveToPdf, curveToSvg, fillGaps, penOutline, smoothCenterline, strokeCurve, type Curve } from './cizgiSekli';

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
    const c = penOutline({ noktalar: zigzag, kalinlik: 3 }, true);
    expect(c.closed).toBe(true);
    expect(c.segs.length).toBeGreaterThan(40);
    expect(curveToSvg(c)).toMatch(/^M[\d. -]+Q.*Z$/);
    expect(curveToSvg(c)).not.toContain('L');
  });

  it('pressure: the same line is wider pressed hard than light', () => {
    const n = slow.length / 2;
    const hard = spanY(penOutline({ noktalar: slow, basinc: Array(n).fill(1), kalinlik: 4 }, true));
    const light = spanY(penOutline({ noktalar: slow, basinc: Array(n).fill(0.1), kalinlik: 4 }, true));
    // the sine goes ±10; the outline adds the width: up to 1.5 × 4 hard, about 0.5 × 4 light
    expect(hard).toBeGreaterThan(light + 3);
    expect(hard).toBeLessThanOrEqual(20 + 6 + 0.1);
  });

  it('without pressure (mouse, finger, an older stroke) it is simulated: still drawn, about as wide as kalinlik', () => {
    const c = penOutline({ noktalar: slow, kalinlik: 4 }, true);
    expect(c.closed).toBe(true);
    expect(spanY(c)).toBeGreaterThan(20);
    expect(spanY(c)).toBeLessThanOrEqual(26.1);
  });

  it('pressure with a wrong count is ignored (simulated instead), not an error', () => {
    expect(penOutline({ noktalar: slow, basinc: [1, 1], kalinlik: 4 }, true)).toEqual(penOutline({ noktalar: slow, kalinlik: 4 }, true));
  });

  it('a single point: a round dot, its size from the pressure', () => {
    const radius = (basinc?: number[]) => {
      const pts = points(penOutline({ noktalar: [50, 50], basinc, kalinlik: 4 }, true));
      return Math.max(...pts.map(([x, y]) => Math.hypot(x - 50, y - 50)));
    };
    expect(radius()).toBeCloseTo(2, 5);
    expect(radius([1])).toBeCloseTo(3, 5);
    expect(radius([0])).toBeCloseTo(1, 5);
  });

  it('the live stroke (last = false) and the finished one reach the pen', () => {
    const end = [slow[slow.length - 2], slow[slow.length - 1]];
    for (const last of [false, true]) {
      const pts = points(penOutline({ noktalar: slow, kalinlik: 4 }, last));
      expect(Math.min(...pts.map(([x, y]) => Math.hypot(x - end[0], y - end[1])))).toBeLessThan(4);
    }
  });
});

describe('smoothCenterline (highlighter)', () => {
  it('a fast zigzag (few points): from the first point to the last, short pieces, the tips kept', () => {
    const c = smoothCenterline(zigzag);
    expect(c.closed).toBe(false);
    expect(c.start).toEqual([0, 0]);
    expect(c.segs.slice(-2)).toEqual([100, 30]);
    // no long straight piece: every quadratic is short (the gaps were filled)
    let prev = c.start;
    for (let i = 0; i < c.segs.length; i += 4) {
      expect(Math.hypot(c.segs[i + 2] - prev[0], c.segs[i + 3] - prev[1])).toBeLessThanOrEqual(6);   // step 4 (split by the chord; on a bend a piece gets a bit longer)
      prev = [c.segs[i + 2], c.segs[i + 3]];
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
    expect(curveToSvg(smoothCenterline([7, 8]))).toBe('M7 8Q7 8 7 8');
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
    for (const c of [penOutline({ noktalar: zigzag, kalinlik: 3 }, true), smoothCenterline(zigzag)]) {
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
