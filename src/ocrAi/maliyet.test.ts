import { describe, expect, it } from 'vitest';
import { FIYATLAR, MODELLER, dolarYaz, maliyet } from './maliyet';
import { OKU_MODELLER } from '../../api/oku';

describe('maliyet', () => {
  it('fiyat tablosundan hesaplar', () => {
    expect(maliyet('claude-haiku-5-5', { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(FIYATLAR['claude-haiku-5-5'].giris);
    expect(maliyet('claude-sonnet-5-5', { input_tokens: 2000, output_tokens: 1000 }))
      .toBeCloseTo((2000 * FIYATLAR['claude-sonnet-5-5'].giris + 1000 * FIYATLAR['claude-sonnet-5-5'].cikis) / 1e6);
  });
  it('sunucunun izin verdiği modellerle aynı liste', () => {
    expect([...MODELLER].sort()).toEqual([...OKU_MODELLER].sort());
  });
  it('küçük tutarları okunur yazar', () => {
    expect(dolarYaz(0.00042)).toBe('$0.00042');
    expect(dolarYaz(0.0213)).toBe('$0.0213');
  });
});
