import { describe, expect, it } from 'vitest';
import { defterInks, penLayerSvg, type DefterInk, type ViewportLike } from './cizimKatmani';

// Task 4.5: the SVG pen layer in reading mode

// a page 100 × 200 without rotation (screen y goes down)
const flat: ViewportLike = { width: 100, height: 200, convertToViewportPoint: (x, y) => [x, 200 - y] };
const pen = (lines: number[][], extra: Partial<DefterInk> = {}): DefterInk =>
  ({ lines, color: 'rgb(211,47,47)', width: 3, opacity: 1, ...extra });

const svgs = (markup: string) => [...markup.matchAll(/<svg class="o-cizim (\w+)" viewBox="([^"]+)"[^>]*>(.*?)<\/svg>/g)]
  .map(m => ({ cls: m[1], viewBox: m[2], body: m[3] }));
// every point of every path / circle, in order: [[x, y], …] per shape
const shapes = (body: string) => [...body.matchAll(/<path d="M([^"]+)"|<circle cx="([^"]+)" cy="([^"]+)"/g)]
  .map(m => m[1] ? m[1].split('L').map(p => p.split(' ').map(Number)) : [[Number(m[2]), Number(m[3])]]);

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

  it('a stroke is a round path in viewport coordinates; the viewBox is the page at scale 1', () => {
    const [s] = svgs(penLayerSvg([pen([[10, 20, 30, 40.123]])], flat, 'normal'));
    expect(s.cls).toBe('kalem');
    expect(s.viewBox).toBe('0 0 100 200');
    expect(shapes(s.body)).toEqual([[[10, 180], [30, 159.88]]]);
    expect(s.body).toContain('stroke="rgb(211,47,47)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"');
    expect(s.body).toContain('fill="none"');
    expect(s.body).not.toContain('opacity');
  });

  it('a single point is a round dot as wide as the line', () => {
    const [s] = svgs(penLayerSvg([pen([[50, 50]], { width: 6 })], flat, 'normal'));
    expect(s.body).toBe('<circle cx="50" cy="150" r="3" fill="rgb(211,47,47)"/>');
  });

  it('highlighter (opacity < 1) in its own SVG under the pen; every stroke keeps its opacity', () => {
    const hl = pen([[0, 10, 90, 10]], { color: 'rgb(255,235,59)', width: 14, opacity: 0.4 });
    const out = svgs(penLayerSvg([pen([[1, 1, 2, 2]]), hl, pen([[5, 5]])], flat, 'normal'));
    expect(out.map(s => s.cls)).toEqual(['fosforlu', 'kalem']);
    expect(out[0].body).toContain('stroke-width="14"');
    expect(out[0].body).toContain('opacity="0.4"');
    expect(shapes(out[1].body)).toHaveLength(2);
  });

  it('?cizimKontrol=1: one SVG, thin dashed cyan, no fill, no opacity', () => {
    const hl = pen([[0, 10, 90, 10]], { width: 14, opacity: 0.4 });
    const out = svgs(penLayerSvg([pen([[1, 1, 2, 2]]), hl, pen([[5, 5]])], flat, 'kontrol'));
    expect(out.map(s => s.cls)).toEqual(['kontrol']);
    expect(shapes(out[0].body)).toHaveLength(3);
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
      const near = (got: number[][][], exp: number[][][]) => {
        expect(got.length).toBe(exp.length);
        got.forEach((g, i) => {
          expect(g.length).toBe(exp[i].length);
          g.forEach(([x, y], j) => { expect(x).toBeCloseTo(exp[i][j][0], 1); expect(y).toBeCloseTo(exp[i][j][1], 1); });
        });
      };
      near(shapes(out[0].body), [want([ox - 2, oy + 384, ox + 215, oy + 384])]);
      expect(out[0].body).toContain('stroke-width="14"');   // rawWidth (pdf.js says 1 for this flat note)
      near(shapes(out[1].body), [
        want([ox, oy + 300, ox, oy + 120, ox + 200, oy + 120, ox + 260, oy + 200]),
        want([ox + 300, oy + 300])
      ]);
      expect(out[1].body).toContain('<circle');
    } finally {
      await doc.loadingTask.destroy();
    }
  });
});
