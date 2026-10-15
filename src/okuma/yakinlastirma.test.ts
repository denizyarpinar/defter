import { describe, expect, it } from 'vitest';
import { layoutPages } from './sanalListe';
import { anchorPoint, clampPan, clampZoom, covers, detailRect, isDoubleTap, pdfLeft, tapZone, zoomAround } from './yakinlastirma';

describe('clampZoom', () => {
  it('stays between 100 % and 400 %', () => {
    expect(clampZoom(0.5)).toBe(1);
    expect(clampZoom(2.5)).toBe(2.5);
    expect(clampZoom(9)).toBe(4);
  });
});

describe('zoomAround', () => {
  it('keeps the point under the finger in place', () => {
    const pan = zoomAround(1, 2, { x: 0, y: 0 }, { x: 100, y: -50 });
    // a point at focus before: focus = pan0 + p·z0 → p = 100; after: pan1 + p·2 must be 100
    expect(pan.x + 100 * 2).toBe(100);
    expect(pan.y + -50 * 2).toBe(-50);
  });
  it('zooming in and out again gives the old pan', () => {
    const a = zoomAround(1, 3, { x: 10, y: 20 }, { x: 40, y: 70 });
    const b = zoomAround(3, 1, a, { x: 40, y: 70 });
    expect(b.x).toBeCloseTo(10);
    expect(b.y).toBeCloseTo(20);
  });
});

describe('clampPan', () => {
  it('does not move content smaller than the view', () => {
    expect(clampPan({ x: 500, y: -500 }, 1, { w: 400, h: 400 }, { w: 800, h: 800 }, 0)).toEqual({ x: 0, y: 0 });
  });
  it('lets a zoomed page move up to its edge + margin', () => {
    const p = clampPan({ x: 9999, y: 0 }, 2, { w: 500, h: 700 }, { w: 800, h: 800 }, 30);
    expect(p.x).toBe((1000 - 800) / 2 + 30);
  });
});

describe('pdfLeft', () => {
  it('centres pages narrower than the screen', () => {
    expect(pdfLeft(1000, 760, 16)).toEqual({ holder: 1000, left: 120 });
  });
  it('wider pages start at the side margin', () => {
    expect(pdfLeft(1000, 1520, 16)).toEqual({ holder: 1552, left: 16 });
  });
});

describe('anchorPoint', () => {
  it('keeps the same spot of the same page', () => {
    const r = [1.4, 1.4, 0.7];
    const from = { layout: layoutPages(r, 500), left: 100, width: 500 };
    const to = { layout: layoutPages(r, 1000), left: 16, width: 1000 };
    const p = { x: 100 + 250, y: from.layout.tops[1] + from.layout.heights[1] * 0.25 };
    const q = anchorPoint(from, to, p);
    expect(q.x).toBe(16 + 500);
    expect(q.y).toBeCloseTo(to.layout.tops[1] + to.layout.heights[1] * 0.25);
  });
});

describe('detailRect', () => {
  it('draws the whole page when it fits in 16 MP', () => {
    const r = detailRect({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 1200, 1700, 2);
    expect(r).toMatchObject({ x: 0, y: 0, w: 1, h: 1, pw: 2400, ph: 3400 });
  });
  it('draws only the visible part (+ margin) of a big page', () => {
    const vis = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
    const r = detailRect(vis, 3000, 4200, 2);
    expect(covers(r, vis)).toBe(true);
    expect(r.w).toBeLessThan(1);
    expect(r.pw * r.ph).toBeLessThanOrEqual(16_000_000);
  });
  it('never goes over 16 MP', () => {
    const r = detailRect({ x: 0, y: 0, w: 1, h: 1 }, 6000, 8000, 2);
    expect(r.pw * r.ph).toBeLessThanOrEqual(16_000_000);
  });
});

describe('tapZone', () => {
  it('only the sides turn the page', () => {
    expect(tapZone(0.1)).toBe('prev');
    expect(tapZone(0.5)).toBe('middle');
    expect(tapZone(0.9)).toBe('next');
  });
});

describe('isDoubleTap', () => {
  it('needs two taps close in time and place', () => {
    const last = { t: 1000, x: 100, y: 100 };
    expect(isDoubleTap(last, 1200, 105, 98)).toBe(true);
    expect(isDoubleTap(last, 1400, 105, 98)).toBe(false);
    expect(isDoubleTap(last, 1200, 200, 100)).toBe(false);
  });
});
