import { describe, expect, it } from 'vitest';
import { harfKatla, katla, katlaUzunlukKoru } from './katla';

describe('katla', () => {
  it('INFO → info, İ/I/ı/i one letter', () => {
    expect(katlaUzunlukKoru('INFO')).toBe('info');
    expect(katla('İstanbul')).toBe(katla('istanbul'));
    expect(katla('ISTANBUL')).toBe(katla('istanbul'));
    expect(katla('ıstanbul')).toBe('istanbul');
    expect(['I', 'İ', 'ı', 'i'].map(harfKatla)).toEqual(['i', 'i', 'i', 'i']);
  });
  it('keeps the length', () => {
    for (const s of ['İstanbul INFO', 'ÄÖÜß ẞ', 'Ǆ ﬁ İİ', 'i̇ x']) expect(katlaUzunlukKoru(s).length).toBe(s.length);
  });
  it('drops the combining dot only in katla', () => {
    expect(katla('i̇stanbul')).toBe('istanbul');
  });
});
