import { describe, expect, it } from 'vitest';
import { parsePageRange } from './sayfaAraligi';

describe('parsePageRange', () => {
  it('reads the examples from CLAUDE.md', () => {
    expect(parsePageRange('3', 20)).toEqual([3]);
    expect(parsePageRange('3-7', 20)).toEqual([3, 4, 5, 6, 7]);
    expect(parsePageRange('1-2,5,9-11', 20)).toEqual([1, 2, 5, 9, 10, 11]);
  });

  it('empty value → whole PDF', () => {
    expect(parsePageRange(undefined, 4)).toEqual([1, 2, 3, 4]);
    expect(parsePageRange(null, 3)).toEqual([1, 2, 3]);
    expect(parsePageRange('', 3)).toEqual([1, 2, 3]);
    expect(parsePageRange('   ', 2)).toEqual([1, 2]);
  });

  it('accepts a number', () => {
    expect(parsePageRange(3, 10)).toEqual([3]);
  });

  it('allows spaces', () => {
    expect(parsePageRange(' 1 - 3 , 5 ', 10)).toEqual([1, 2, 3, 5]);
  });

  it('skips invalid parts', () => {
    expect(parsePageRange('abc', 10)).toEqual([]);
    expect(parsePageRange('2,x,4', 10)).toEqual([2, 4]);
    expect(parsePageRange('0', 10)).toEqual([]);
    expect(parsePageRange('-3', 10)).toEqual([]);
    expect(parsePageRange('7-3', 10)).toEqual([]);
    expect(parsePageRange('0-2', 10)).toEqual([]);
    expect(parsePageRange('1-2-3', 10)).toEqual([]);
    expect(parsePageRange('1.5', 10)).toEqual([]);
    expect(parsePageRange('1,,2', 10)).toEqual([1, 2]);
  });

  it('cuts parts outside the PDF', () => {
    expect(parsePageRange('9-11', 10)).toEqual([9, 10]);
    expect(parsePageRange('15', 10)).toEqual([]);
    expect(parsePageRange('12-20', 10)).toEqual([]);
    expect(parsePageRange('3', 0)).toEqual([]);
  });

  it('keeps order and drops repeats', () => {
    expect(parsePageRange('5,1-3,2', 10)).toEqual([5, 1, 2, 3]);
  });
});
