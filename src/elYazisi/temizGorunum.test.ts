import { describe, expect, it } from 'vitest';
import {
  TERCIH_ANAHTARI, VARSAYILAN_TERCIH, dugmeGorunur, dugmeMetni, etkin, kisaMetin, sayac, tercihOku, tercihYaz, type Depo
} from './temizGorunum';

const bellekDepo = (ilk: Record<string, string> = {}): Depo & { veri: Record<string, string> } => {
  const veri = { ...ilk };
  return { veri, getItem: k => veri[k] ?? null, setItem: (k, v) => { veri[k] = v; } };
};

describe('dugmeGorunur', () => {
  it('sadece Drive kitaplığı + eşleşen sayfa + atlas', () => {
    expect(dugmeGorunur({ drive: true, eslesen: 1, atlasVar: true })).toBe(true);
    expect(dugmeGorunur({ drive: false, eslesen: 3, atlasVar: true })).toBe(false);   // sample library
    expect(dugmeGorunur({ drive: true, eslesen: 0, atlasVar: true })).toBe(false);    // nothing read
    expect(dugmeGorunur({ drive: true, eslesen: 2, atlasVar: false })).toBe(false);   // no atlas (another user)
  });
});

describe('etkin', () => {
  it('tercih açıkken temiz; 6.4e-4: kalem bunu değiştirmez (parametre yok)', () => {
    expect(etkin({ acik: true })).toBe(true);
    expect(etkin({ acik: false })).toBe(false);
  });
});

describe('sayac', () => {
  it('okunmuş / fotoğraf sayfası (g: parmak izi); basılı sayfa sayılmaz', () => {
    const izler = new Map([[0, 'i:basili'], [1, 'g:a'], [2, 'g:b'], [3, 'g:c'], [5, 'g:d']]);
    const s = sayac(izler, new Set([1, 3]));
    expect(s).toEqual({ okunmus: 2, fotograf: 4 });
    expect(dugmeMetni(s)).toBe('Temiz yazı (2/4)');
    expect(kisaMetin(s)).toBe('2/4');
  });
  it('okunmuş sayfa izi bilinmese de fotoğraf sayılır', () => {
    expect(sayac(new Map(), new Set([4]))).toEqual({ okunmus: 1, fotograf: 1 });
  });
});

describe('tercih', () => {
  it('yoksa varsayılan: açık + tükenmez', () => {
    expect(tercihOku(() => bellekDepo())).toEqual({ acik: true, stil: 'tukenmez' });
    expect(VARSAYILAN_TERCIH).toEqual({ acik: true, stil: 'tukenmez' });
  });
  it('yazılan geri okunur', () => {
    const d = bellekDepo();
    expect(tercihYaz(() => d, { acik: false, stil: 'yumusak' })).toBe(true);
    expect(JSON.parse(d.veri[TERCIH_ANAHTARI])).toEqual({ acik: false, stil: 'yumusak' });
    expect(tercihOku(() => d)).toEqual({ acik: false, stil: 'yumusak' });
  });
  it('okuma hatası (gizli pencere) → varsayılan, hata dışarı çıkmaz', () => {
    const atan: Depo = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } };
    expect(tercihOku(() => atan)).toEqual(VARSAYILAN_TERCIH);
    expect(tercihOku(() => { throw new Error('localStorage yok'); })).toEqual(VARSAYILAN_TERCIH);
    expect(tercihYaz(() => atan, { acik: false, stil: 'tukenmez' })).toBe(false);
    expect(tercihYaz(() => null, { acik: false, stil: 'tukenmez' })).toBe(false);
  });
  it('bozuk ya da bilinmeyen değer → o alan varsayılan', () => {
    expect(tercihOku(() => bellekDepo({ [TERCIH_ANAHTARI]: '{bozuk' }))).toEqual(VARSAYILAN_TERCIH);
    expect(tercihOku(() => bellekDepo({ [TERCIH_ANAHTARI]: 'null' }))).toEqual(VARSAYILAN_TERCIH);
    expect(tercihOku(() => bellekDepo({ [TERCIH_ANAHTARI]: '{"acik":false,"stil":"kursun"}' }))).toEqual({ acik: false, stil: 'tukenmez' });
    expect(tercihOku(() => bellekDepo({ [TERCIH_ANAHTARI]: '{"acik":"evet","stil":"yumusak"}' }))).toEqual({ acik: true, stil: 'yumusak' });
  });
});
