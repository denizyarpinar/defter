import { describe, expect, it } from 'vitest';
import { paginateContents, type MeasuredUnit } from './icindekilerSayfalama';

const unit = (unit: number, rows: number[], overrides: Partial<MeasuredUnit> = {}): MeasuredUnit => ({
  unit, rows, heading: 15, firstHeading: 10, nextHeading: 10, continuedHeading: 12, gap: 2, ...overrides
});
const part = (unit: number, start: number, end: number, continued = false) => ({ unit, start, end, continued });

describe('desk contents pagination', () => {
  it('keeps one page for an empty list', () => {
    expect(paginateContents([], { first: 0, next: 0 })).toEqual([[]]);
  });
  it('keeps a short list unchanged', () => {
    expect(paginateContents([unit(0, [20, 20]), unit(1, [20])], { first: 100, next: 100 }))
      .toEqual([[part(0, 0, 2), part(1, 0, 1)]]);
  });
  it('accepts an exact fit including the gap', () => {
    expect(paginateContents([unit(0, [20, 20])], { first: 52, next: 52 }))
      .toEqual([[part(0, 0, 2)]]);
  });
  it('moves a heading with its first row, leaving no orphan heading', () => {
    expect(paginateContents([unit(0, [30]), unit(1, [20])], { first: 60, next: 60 }))
      .toEqual([[part(0, 0, 1)], [part(1, 0, 1)]]);
  });
  it('marks only split units as continued and keeps the original topic indices', () => {
    expect(paginateContents([unit(0, [20, 20, 20]), unit(1, [20])], { first: 52, next: 70 }))
      .toEqual([[part(0, 0, 2)], [part(0, 2, 3, true), part(1, 0, 1)]]);
  });
  it('accounts for the taller continuation heading', () => {
    expect(paginateContents([unit(0, [20, 20, 20], { continuedHeading: 35 })], { first: 30, next: 60 }))
      .toEqual([[part(0, 0, 1)], [part(0, 1, 2, true)], [part(0, 2, 3, true)]]);
  });
  it('uses the different first-page and continuation capacities', () => {
    expect(paginateContents([unit(0, [20, 20, 20, 20])], { first: 30, next: 80 }))
      .toEqual([[part(0, 0, 1)], [part(0, 1, 4, true)]]);
  });
  it.each([0, -50, 5])('consumes at least one row with page capacity %s', capacity => {
    expect(paginateContents([unit(0, [500, 20, 30])], { first: capacity, next: capacity }))
      .toEqual([[part(0, 0, 1)], [part(0, 1, 2, true)], [part(0, 2, 3, true)]]);
  });
  it('does not loop on an empty unit', () => {
    expect(paginateContents([unit(0, []), unit(1, [20])], { first: 60, next: 60 }))
      .toEqual([[part(0, 0, 0), part(1, 0, 1)]]);
  });
  it('never drops, duplicates or reorders topics across many page sizes', () => {
    const units = [unit(0, [13, 22, 50, 7]), unit(1, [80, 1, 33]), unit(2, [12, 34])];
    const expected = units.flatMap(u => u.rows.map((_, t) => `${u.unit}:${t}`));
    for (let size = 1; size < 300; size++) {
      const pages = paginateContents(units, { first: size, next: size + 20 });
      expect(pages.flatMap(p => p.flatMap(f =>
        Array.from({ length: f.end - f.start }, (_, i) => `${f.unit}:${f.start + i}`)))).toEqual(expected);
      expect(pages.every(p => p.length > 0 && p.every(f => f.end > f.start))).toBe(true);
    }
  });
});
