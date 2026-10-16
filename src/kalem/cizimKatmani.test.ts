import { describe, expect, it } from 'vitest';
import { defterInks, penLayerSvg, type DefterInk, type ViewportLike } from './cizimKatmani';

// Task 4.5: the SVG pen layer in reading mode

// a page 100 × 200 without rotation (screen y goes down)
const flat: ViewportLike = { width: 100, height: 200, convertToViewportPoint: (x, y) => [x, 200 - y] };
const pen = (lines: number[][], extra: Partial<DefterInk> = {}): DefterInk =>
  ({ lines, color: 'rgb(211,47,47)', width: 3, opacity: 1, ...extra });

const svgs = (markup: string) => [...markup.matchAll(/<svg class="o-cizim (\w+)" viewBox="([^"]+)"[^>]*>(.*?)<\/svg>/g)]
  .map(m => ({ cls: m[1], viewBox: m[2], body: m[3] }));
// every path: its points (start, Q controls and ends) in order, closed or not
const paths = (body: string) => [...body.matchAll(/<path d="([^"]+)"/g)].map(m => {
  const n = m[1].replace(/[MQZ]/g, ' ').trim().split(/\s+/).map(Number);
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
  return { d: m[1], pts, closed: m[1].endsWith('Z') };
});
// distance from p to the polyline
function distTo(p: [number, number], line: number[][]): number {
  let best = Infinity;
  for (let i = 0; i < line.length; i++) {
    const a = line[i], b = line[Math.min(i + 1, line.length - 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return best;
}
// A filled outline around the line: it reaches both ends, and stays inside the line's box grown by
// the widest half-width (1.5 × width / 2), plus a little: the curve through the points rounds a sharp
// corner and goes a hair past it (more when the points are far apart: the test PDF's L is drawn
// with a point every 2 pt, like a pen).
function expectOutline(o: { pts: [number, number][]; closed: boolean }, line: number[][], width: number) {
  expect(o.closed).toBe(true);
  const r = width * 0.75 + 0.2;
  const xs = line.map(p => p[0]), ys = line.map(p => p[1]);
  for (const [x, y] of o.pts) {
    expect(x).toBeGreaterThanOrEqual(Math.min(...xs) - r);
    expect(x).toBeLessThanOrEqual(Math.max(...xs) + r);
    expect(y).toBeGreaterThanOrEqual(Math.min(...ys) - r);
    expect(y).toBeLessThanOrEqual(Math.max(...ys) + r);
  }
  for (const end of [line[0], line[line.length - 1]]) {
    expect(Math.min(...o.pts.map(p => Math.hypot(p[0] - end[0], p[1] - end[1])))).toBeLessThanOrEqual(r);
  }
}
// a polyline with a point every 0.5 (like the pen gives them)
function dense(line: number[][]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const [a, b] = [line[i], line[i + 1]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5);
    for (let k = 0; k < n; k++) out.push(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n);
  }
  const last = line[line.length - 1];
  return [...out, last[0], last[1]];
}

describe('defterInks', () => {
  it('only Defter Ink notes; rawWidth before width; color and opacity', () => {
    const inks = defterInks([
      { annotationType: 15, titleObj: { str: 'Defter' }, inkLists: [new Float32Array([1, 2, 3, 4])], color: new Uint8ClampedArray([255, 235, 59]), opacity: 0.4, borderStyle: { width: 1, rawWidth: 14 } },
      { annotationType: 15, titleObj: { str: 'GoodNotes' }, inkLists: [[5, 6]], color: [0, 0, 0] },
      { annotationType: 5, titleObj: { str: 'Defter' } },
      { annotationType: 15, titleObj: { str: 'Defter' }, inkLists: [[7, 8]], color: null, borderStyle: { width: 2 } }
    ]);
    expect(inks).toHaveLength(2);
    expect(inks[0]).toMatchObject({ color: 'rgb(255,235,59)', width: 14, opacity: 0.4 });
    expect(Array.from(inks[0].lines[0])).toEqual([1, 2, 3, 4]);
    expect(inks[1]).toMatchObject({ color: 'rgb(0,0,0)', width: 2, opacity: 1 });
  });
});

describe('penLayerSvg', () => {
  it('no strokes, or ?defterNot=goster: no layer', () => {
    expect(penLayerSvg([], flat, 'normal')).toBe('');
    expect(penLayerSvg([pen([[1, 2, 3, 4]])], flat, 'kapali')).toBe('');
  });

  it('task 4.7c: a pen stroke is its outline, filled, in viewport coordinates; the viewBox is the page at scale 1', () => {
    const [s] = svgs(penLayerSvg([pen([[10, 20, 30, 40.123]])], flat, 'normal'));
    expect(s.cls).toBe('kalem');
    expect(s.viewBox).toBe('0 0 100 200');
    const [o] = paths(s.body);
    expectOutline(o, [[10, 180], [30, 159.877]], 3);
    expect(o.d).toContain('Q');
    expect(o.d).not.toContain('L');
    expect(s.body).toContain('fill="rgb(211,47,47)"/>');
    expect(s.body).not.toMatch(/stroke|opacity/);
  });

  it('task 4.7c: a dense stroke stays within its half-width; with pressure, hard is wider than light', () => {
    const line = dense([[10, 100], [40, 110], [70, 100], [90, 120]]);
    const onScreen = [[10, 100], [40, 90], [70, 100], [90, 80]];
    const reach = (pressure?: number[]) => {
      const [o] = paths(svgs(penLayerSvg([pen([line], { width: 4, pressure })], flat, 'normal'))[0].body);
      return Math.max(...o.pts.map(q => distTo(q, onScreen)));
    };
    const all = (p: number) => Array(line.length / 2).fill(p);
    expect(reach(all(1))).toBeGreaterThan(2.5);          // 1.5 × 4 / 2 = 3
    expect(reach(all(1))).toBeLessThanOrEqual(3.15);
    expect(reach(all(0.1))).toBeLessThan(1.8);           // 0.5 × 4 / 2 = 1, more at the sharp corners (smoothing)
    expect(reach(all(1))).toBeGreaterThan(reach(all(0.1)) + 1);
    expect(reach()).toBeLessThanOrEqual(3.15);           // simulated pressure (mouse, finger, old strokes)
  });

  it('a single point is a round dot as wide as the line', () => {
    const [s] = svgs(penLayerSvg([pen([[50, 50]], { width: 6 })], flat, 'normal'));
    const [o] = paths(s.body);
    expect(o.closed).toBe(true);
    for (const [x, y] of o.pts) {
      const r = Math.hypot(x - 50, y - 150);
      expect(r).toBeGreaterThan(2.9);
      expect(r).toBeLessThanOrEqual(3.01);
    }
  });

  it('highlighter (opacity < 1) in its own SVG under the pen: a smooth line from the first to the last point', () => {
    const hl = pen([[0, 10, 30, 30, 60, 10, 90, 30]], { color: 'rgb(255,235,59)', width: 14, opacity: 0.4 });
    const out = svgs(penLayerSvg([pen([[1, 1, 2, 2]]), hl, pen([[5, 5]])], flat, 'normal'));
    expect(out.map(s => s.cls)).toEqual(['fosforlu', 'kalem']);
    expect(out[0].body).toContain('fill="none" stroke="rgb(255,235,59)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"');
    const [line] = paths(out[0].body);
    expect(line.closed).toBe(false);
    expect(line.pts[0]).toEqual([0, 190]);
    expect(line.pts[line.pts.length - 1]).toEqual([90, 170]);
    expect(line.d).not.toContain('L');
    // the corners are controls: the line goes round them, through the midpoints
    expect(line.pts).toContainEqual([45, 180]);
    expect(paths(out[1].body)).toHaveLength(2);
  });

  it('?cizimKontrol=1: one SVG, thin dashed cyan, no fill, no opacity', () => {
    const hl = pen([[0, 10, 90, 10]], { width: 14, opacity: 0.4 });
    const out = svgs(penLayerSvg([pen([[1, 1, 2, 2]]), hl, pen([[5, 5]])], flat, 'kontrol'));
    expect(out.map(s => s.cls)).toEqual(['kontrol']);
    expect(paths(out[0].body)).toHaveLength(3);
    for (const el of out[0].body.split('/>').filter(Boolean)) {
      expect(el).toContain('stroke="#00bcd4" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray');
      expect(el).toContain('fill="none"');
      expect(el).not.toContain('opacity');
    }
  });
});

// The real thing: kalem-testi.pdf pages 3–6 (rotated 90 / 180 / 270, CropBox from 120 160), read
// with pdf.js like the reader does. The expected screen points are worked out here by hand, not
// with pdf.js, so a wrong turn, mirror or offset would show.
const penTestUrl = Object.values(import.meta.glob<string>('/public/demo/kalem-testi.pdf', { eager: true, query: '?inline', import: 'default' }))[0];
const penTestBytes = () => Uint8Array.from(atob(penTestUrl.split(',')[1]), c => c.charCodeAt(0));

describe('kalem-testi.pdf: the layer lands on the notes', () => {
  const W = 595.28, H = 841.89;
  // user space (x, y) → screen (left, top) at scale 1
  const cases: { page: number; size: [number, number]; at: (x: number, y: number) => [number, number]; o: [number, number] }[] = [
    { page: 3, size: [H, W], at: (x, y) => [y, x], o: [72, 120] },
    { page: 4, size: [W, H], at: (x, y) => [W - x, y], o: [72, 120] },
    { page: 5, size: [H, W], at: (x, y) => [H - y, W - x], o: [72, 120] },
    { page: 6, size: [400, 560], at: (x, y) => [x - 120, 720 - y], o: [140, 180] }
  ];

  it.each(cases)('page $page', async ({ page: n, size, at, o: [ox, oy] }) => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: penTestBytes() }).promise;
    try {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const out = svgs(penLayerSvg(defterInks(await page.getAnnotations()), vp, 'normal'));
      expect(out.map(s => s.cls)).toEqual(['fosforlu', 'kalem']);
      for (const s of out) {
        const [, , w, h] = s.viewBox.split(' ').map(Number);
        expect(w).toBeCloseTo(size[0], 1);
        expect(h).toBeCloseTo(size[1], 1);
      }
      const want = (pts: number[]) => pts.reduce<number[][]>((a, v, i) => (i % 2 ? a[a.length - 1].push(v) : a.push([v]), a), []).map(([x, y]) => at(x, y));
      const near = (got: [number, number], exp: number[]) => { expect(got[0]).toBeCloseTo(exp[0], 1); expect(got[1]).toBeCloseTo(exp[1], 1); };
      // highlighter: from its first point to its last
      const [hl] = paths(out[0].body);
      const hlWant = want([ox - 2, oy + 384, ox + 215, oy + 384]);
      near(hl.pts[0], hlWant[0]);
      near(hl.pts[hl.pts.length - 1], hlWant[1]);
      expect(out[0].body).toContain('stroke-width="14"');   // rawWidth (pdf.js says 1 for this flat note)
      // pen (task 4.7c): outlines around the line and the dot
      const pens = paths(out[1].body);
      expect(pens).toHaveLength(2);
      expectOutline(pens[0], want([ox, oy + 300, ox, oy + 120, ox + 200, oy + 120, ox + 260, oy + 200]), 3);
      expectOutline(pens[1], want([ox + 300, oy + 300]), 6);
    } finally {
      await doc.loadingTask.destroy();
    }
  });
});
