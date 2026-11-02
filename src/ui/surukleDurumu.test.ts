import { describe, expect, it } from 'vitest';
import { hedefSira, siraTasi, surukleHedefi } from './surukleDurumu';

describe('drag order', () => {
  it.each([
    [0, 151, 2], [2, 49, 0], [1, 100, 1], [0, -100, 0], [2, 1000, 2],
    [0, 1000, 2], [2, -100, 0], [1, 50, 1], [1, 150, 1],
  ])('source %i at %i → %i', (source, y, target) => {
    expect(hedefSira([50, 100, 150], source, y)).toBe(target);
  });
  it('one row and explicit unit scope', () => {
    expect(hedefSira([50], 0, -100)).toBe(0);
    expect(hedefSira([50], 0, 1000)).toBe(0);
    expect(surukleHedefi([50, 100, 150], 0, 200, 4)).toEqual({ unite: 4, sira: 2 });
  });
  it('inserts instead of swapping, leaves input unchanged', () => {
    const rows = ['a', 'b', 'c', 'd'];
    expect(siraTasi(rows, 0, 3)).toEqual(['b', 'c', 'd', 'a']);
    expect(siraTasi(rows, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(siraTasi(rows, 2, 2)).toEqual(rows);
    expect(rows).toEqual(['a', 'b', 'c', 'd']);
  });
  it('invalid and empty ranges are harmless', () => {
    expect(siraTasi([], 0, 0)).toEqual([]);
    for (const [source, target] of [[-1, 1], [0, 3], [1.5, 0]]) {
      expect(siraTasi([1, 2], source, target)).toEqual([1, 2]);
    }
  });
});
