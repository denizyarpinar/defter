import { describe, expect, it } from 'vitest';
import { GAP, MAX_PIXELS, PAD_BOTTOM, PAD_TOP, canvasSize, currentPage, layoutPages, visibleRange } from './sanalListe';

const A4 = 1.4142;

describe('layoutPages', () => {
  it('stacks pages with their own ratio', () => {
    const l = layoutPages([A4, 0.75, A4], 100);
    expect(l.heights).toEqual([141, 75, 141]);
    expect(l.tops).toEqual([PAD_TOP, PAD_TOP + 141 + GAP, PAD_TOP + 141 + GAP + 75 + GAP]);
    expect(l.total).toBe(PAD_TOP + 141 + 75 + 141 + 2 * GAP + PAD_BOTTOM);
  });
});

describe('visibleRange', () => {
  const l = layoutPages(Array(20).fill(1), 100);   // each page 100 px, every 118 px

  it('adds two pages on each side', () => {
    // pages 5 and 6 are on screen
    expect(visibleRange(l, l.tops[5], 150)).toEqual([3, 8]);
  });
  it('stays inside the book', () => {
    expect(visibleRange(l, 0, 150)).toEqual([0, 3]);
    expect(visibleRange(l, l.total - 150, 150)).toEqual([17, 19]);
  });
  it('skips the page above when only the gap is visible', () => {
    expect(visibleRange(l, l.tops[5] - 5, 50, 0)).toEqual([5, 5]);
  });
  it('handles an empty book', () => {
    expect(visibleRange(layoutPages([], 100), 0, 500)).toEqual([0, -1]);
  });
});

describe('currentPage', () => {
  it('is the page at the top third of the screen', () => {
    const l = layoutPages(Array(10).fill(1), 100);
    expect(currentPage(l, 0, 300)).toBe(0);
    expect(currentPage(l, l.tops[4], 300)).toBe(4);
  });
});

describe('canvasSize', () => {
  it('uses devicePixelRatio up to 2', () => {
    expect(canvasSize(500, 700, 1)).toEqual({ w: 500, h: 700, scale: 1 });
    expect(canvasSize(500, 700, 3).scale).toBe(2);
  });
  it('never goes over 16 MP', () => {
    const c = canvasSize(3000, 4000, 2);
    expect(c.w * c.h).toBeLessThanOrEqual(MAX_PIXELS);
    expect(c.w / c.h).toBeCloseTo(0.75, 2);
  });
});
