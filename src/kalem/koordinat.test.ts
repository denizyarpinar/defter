import { describe, expect, it } from 'vitest';
import { EventOrder, minStep, pushLastPoint, pushPoint, roundPt, screenToViewport, toPdf, type BoxRect } from './koordinat';

// Task 4.6: screen → PDF user space, with the real viewports of kalem-testi.pdf
// (page 1 upright, pages 3–5 rotated 90 / 180 / 270, page 6 with a CropBox from 120 160).

const penTestUrl = Object.values(import.meta.glob<string>('/public/demo/kalem-testi.pdf', { eager: true, query: '?inline', import: 'default' }))[0];
const penTestBytes = () => Uint8Array.from(atob(penTestUrl.split(',')[1]), c => c.charCodeAt(0));

describe('screen ↔ PDF round trip', () => {
  // points on the page (user space); page 6's CropBox is x 120–520, y 160–720
  const pts: Record<number, [number, number][]> = {
    1: [[72, 120], [300.5, 700.25], [500, 400]],
    3: [[72, 120], [300.5, 700.25], [500, 400]],
    4: [[72, 120], [300.5, 700.25], [500, 400]],
    5: [[72, 120], [300.5, 700.25], [500, 400]],
    6: [[140, 180], [300.5, 700.25], [500, 400]]
  };
  // the page box on screen: 100 %, zoomed 2.5× and scrolled (left / top outside the screen), a small phone box
  const boxes = (w: number, h: number): BoxRect[] => [
    { left: 16, top: 80, width: 760, height: 760 * h / w },
    { left: -900, top: -1400, width: 1900, height: 1900 * h / w },
    { left: 3, top: 50, width: 300, height: 300 * h / w }
  ];

  it.each([1, 3, 4, 5, 6])('page %i', async n => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: penTestBytes() }).promise;
    try {
      const vp = (await doc.getPage(n)).getViewport({ scale: 1 });
      if (n === 3 || n === 5) expect(vp.width).toBeGreaterThan(vp.height);   // turned: landscape on screen
      for (const r of boxes(vp.width, vp.height)) {
        for (const [x, y] of pts[n]) {
          const [vx, vy] = vp.convertToViewportPoint(x, y);
          const sx = r.left + vx / vp.width * r.width, sy = r.top + vy / vp.height * r.height;
          const [bx, by] = toPdf(vp, ...screenToViewport(sx, sy, r, vp));
          expect(Math.abs(bx - x)).toBeLessThan(0.01);
          expect(Math.abs(by - y)).toBeLessThan(0.01);
        }
      }
    } finally {
      await doc.loadingTask.destroy();
    }
  });

  it('rotated 90: moving right on screen moves up the page (y grows)', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: penTestBytes() }).promise;
    try {
      const vp = (await doc.getPage(3)).getViewport({ scale: 1 });
      const r = { left: 0, top: 0, width: vp.width, height: vp.height };
      const a = toPdf(vp, ...screenToViewport(100, 100, r, vp)), b = toPdf(vp, ...screenToViewport(200, 100, r, vp));
      expect(b[1] - a[1]).toBeCloseTo(100, 3);
      expect(b[0]).toBeCloseTo(a[0], 3);
    } finally {
      await doc.loadingTask.destroy();
    }
  });
});

describe('screenToViewport', () => {
  const vp = { width: 200, height: 400 };
  const r = { left: 10, top: 20, width: 100, height: 200 };

  it('scales the box to the viewBox', () => {
    expect(screenToViewport(60, 120, r, vp)).toEqual([100, 200]);
    expect(screenToViewport(10, 20, r, vp)).toEqual([0, 0]);
  });

  it('a point outside the page goes to its edge', () => {
    expect(screenToViewport(-50, 500, r, vp)).toEqual([0, 400]);
    expect(screenToViewport(500, -5, r, vp)).toEqual([200, 0]);
  });

  it('an empty box does not divide by zero', () => {
    expect(screenToViewport(5, 5, { left: 0, top: 0, width: 0, height: 0 }, vp)).toEqual([0, 0]);
  });
});

describe('pushPoint', () => {
  it('drops points closer than 0.5 pt to the last one', () => {
    const p: number[] = [];
    expect(pushPoint(p, 10, 10)).toBe(true);
    expect(pushPoint(p, 10.3, 10.3)).toBe(false);   // 0.42 pt
    expect(pushPoint(p, 10.4, 10.4)).toBe(true);    // 0.57 pt
    expect(pushPoint(p, 10.4, 10.4)).toBe(false);
    expect(p).toEqual([10, 10, 10.4, 10.4]);
  });

  it('the distance counts from the last kept point, not the dropped ones', () => {
    const p = [0, 0];
    for (let i = 1; i <= 10; i++) pushPoint(p, i * 0.1, 0);   // creeping 0.1 pt at a time
    expect(p).toEqual([0, 0, 0.5, 0, 1, 0]);
  });
});

// Task 6.H2b
describe('minStep: 1 screen px, at most 0.5 pt', () => {
  it('at 100 % (a 595 pt page 820 px wide: 1.38 px/pt) it stays 0.5 pt; zoomed in it gets finer', () => {
    expect(minStep(820, 595.28)).toBe(0.5);
    expect(minStep(595.28 * 3, 595.28)).toBeCloseTo(1 / 3, 6);   // the iPad recording: 3 px/pt
    expect(minStep(595.28 * 4, 595.28)).toBeCloseTo(0.25, 6);
    expect(minStep(0, 595.28)).toBe(0.5);                          // no box: the old step
  });

  it('roundPt keeps 0.01 pt, what /InkList keeps', () => {
    expect(roundPt(150.123)).toBe(150.12);
    expect(roundPt(180.456)).toBe(180.46);
  });
});

describe('pushLastPoint (pointerup)', () => {
  it('far enough: added, with the last pressure (the own pressure of the up is 0)', () => {
    const p = [0, 0, 1, 0], b = [0.3, 0.6];
    expect(pushLastPoint(p, b, 2, 0)).toBe('eklendi');
    expect(p).toEqual([0, 0, 1, 0, 2, 0]);
    expect(b).toEqual([0.3, 0.6, 0.6]);
  });

  it('too close: it takes the place of the last point (pressure count unchanged); a tap stays one point', () => {
    const p = [0, 0, 1, 0], b = [0.3, 0.6];
    expect(pushLastPoint(p, b, 1.2, 0)).toBe('yerine');
    expect(p).toEqual([0, 0, 1.2, 0]);
    expect(b).toEqual([0.3, 0.6]);
    const tap = [5, 5];
    expect(pushLastPoint(tap, null, 5.2, 5)).toBe('yok');
    expect(tap).toEqual([5, 5]);
  });
});

describe('EventOrder (the same move twice)', () => {
  // kalem-zoom.txt, stroke 1: a move and its 4 coalesced events came twice, the same times and places
  const move = [[471.5, 383.5, 17], [471.5, 383, 23], [471.5, 382.5, 25], [471.5, 382, 31]];
  const take = (o: EventOrder, pts: number[], evs: number[][]) => {
    for (const [x, y, t] of evs) if (o.accept(t, x, y)) pushPoint(pts, x, y, 0.1);
  };

  it('the same move with the same coalesced list again: the points stay the same (no going back)', () => {
    const o = new EventOrder(), pts: number[] = [];
    o.accept(0, 472.5, 383.5); pts.push(472.5, 383.5);   // the down
    take(o, pts, move);
    const once = pts.slice();
    take(o, pts, move);
    expect(pts).toEqual(once);
  });

  it('an event older than the last one taken is dropped; a later one is taken', () => {
    const o = new EventOrder();
    expect(o.accept(10, 0, 0)).toBe(true);
    expect(o.accept(8, 5, 5)).toBe(false);
    expect(o.accept(10, 0, 0)).toBe(false);   // same time, same place: the same event again
    expect(o.accept(10, 1, 0)).toBe(true);    // same time, another place: a coarse clock, a real point
    expect(o.accept(12, 2, 0)).toBe(true);
  });
});
