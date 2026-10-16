import { describe, expect, it } from 'vitest';
import type { Stroke } from './cizgi';
import { eraserRadius, segmentDistance, strokeHit } from './silgi';

// Task 4.7: which strokes the eraser touches

const stroke = (noktalar: number[], over: Partial<Stroke> = {}): Stroke =>
  ({ id: 's', arac: 'kalem', renk: '#222222', kalinlik: 2, opaklik: 1, noktalar, ...over });

describe('segmentDistance', () => {
  it('crossing segments: 0; parallel: the gap; points: their distance', () => {
    expect(segmentDistance([0, 0], [10, 10], [0, 10], [10, 0])).toBe(0);
    expect(segmentDistance([0, 0], [10, 0], [0, 5], [10, 5])).toBe(5);
    expect(segmentDistance([0, 0], [0, 0], [3, 4], [3, 4])).toBe(5);
    expect(segmentDistance([0, 0], [10, 0], [15, 0], [20, 0])).toBe(5);   // on one line, apart
    expect(segmentDistance([5, 3], [5, 3], [0, 0], [10, 0])).toBe(3);     // point over a segment
  });
});

describe('strokeHit', () => {
  const flat = stroke([0, 0, 100, 0]);                     // straight line
  const diag = stroke([0, 0, 50, 50, 100, 0]);             // a bent line

  it('a straight line: hit within radius + half the width, missed beyond', () => {
    expect(strokeHit(flat, [50, 5], [50, 5], 4)).toBe(true);        // 5 ≤ 4 + 1
    expect(strokeHit(flat, [50, 5.5], [50, 5.5], 4)).toBe(false);   // 5.5 > 5
    expect(strokeHit(flat, [-4.5, 0], [-4.5, 0], 4)).toBe(true);    // past the end (round cap)
  });

  it('a diagonal line: hit on a slanted segment, not inside the bend', () => {
    expect(strokeHit(diag, [25, 25], [25, 25], 1)).toBe(true);
    expect(strokeHit(diag, [75, 25], [75, 25], 1)).toBe(true);
    expect(strokeHit(diag, [50, 10], [50, 10], 3)).toBe(false);     // under the tip, far from both segments
  });

  it('a thick highlighter is hit by its edge', () => {
    const hl = stroke([0, 0, 100, 0], { arac: 'fosforlu', kalinlik: 20, opaklik: 0.35 });
    expect(strokeHit(hl, [50, 13], [50, 13], 4)).toBe(true);        // 13 ≤ 4 + 10
    expect(strokeHit(hl, [50, 15], [50, 15], 4)).toBe(false);
    expect(strokeHit(flat, [50, 13], [50, 13], 4)).toBe(false);     // the same spot misses a thin pen
  });

  it('outside the bounds: no hit', () => {
    expect(strokeHit(flat, [200, 200], [300, 300], 10)).toBe(false);
    expect(strokeHit(flat, [-50, -50], [-20, -20], 10)).toBe(false);
  });

  it('a fast move: the segment between two events crosses the stroke', () => {
    const v = stroke([50, -20, 50, 20]);
    // events at x = 0 and x = 100 only: neither point is near, the move between them is
    expect(strokeHit(v, [0, 0], [0, 0], 4)).toBe(false);
    expect(strokeHit(v, [100, 0], [100, 0], 4)).toBe(false);
    expect(strokeHit(v, [0, 0], [100, 0], 4)).toBe(true);
  });

  it('a single dot', () => {
    const dot = stroke([10, 10]);
    expect(strokeHit(dot, [14, 10], [14, 10], 3)).toBe(true);
    expect(strokeHit(dot, [15, 10], [15, 10], 3)).toBe(false);
  });
});

describe('eraserRadius', () => {
  it('10 px on the screen in pt: smaller when zoomed in', () => {
    expect(eraserRadius(595, 595)).toBe(10);       // 1 px = 1 pt
    expect(eraserRadius(1190, 595)).toBe(5);       // 200 %
    expect(eraserRadius(297.5, 595)).toBe(20);     // 50 %
  });
});
