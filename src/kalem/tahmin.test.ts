import { describe, expect, it } from 'vitest';
import { tahminKullan, tahminSadeceKalem } from './tahmin';

describe('çizgi tahmini', () => {
  it.each(['mouse', 'touch', '', 'unknown'])('%s için tahmin kullanmaz', type => {
    expect(tahminKullan(type)).toBe(false);
  });

  it('kalem için tahmini korur', () => {
    expect(tahminKullan('pen')).toBe(true);
  });

  it.each(['mouse', 'touch', 'pen'])('?tahmin=1 ile %s eski tahmini kullanır', type => {
    expect(tahminKullan(type, tahminSadeceKalem('?tahmin=1'))).toBe(true);
  });

  it.each(['', '?tahmin=0', '?tahmin=2', '?olcum=1'])('%s sınırı kaldırmaz', search => {
    expect(tahminSadeceKalem(search)).toBe(true);
    expect(tahminKullan('mouse', tahminSadeceKalem(search))).toBe(false);
  });
});
