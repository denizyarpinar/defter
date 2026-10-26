import { describe, expect, it } from 'vitest';
import {
  ayarlarDilYaz, BEKLEYEN_ANAHTARI, bekleyenCoz, bekleyenOku, bekleyenSil, bekleyenYaz, driveDilOku, tercihKarari,
  yenilendiMi, yenilendiYaz, type TercihGirdisi
} from './driveTercih';

const temel: TercihGirdisi = {
  driveDil: undefined, yerelDil: 'en', yerelAcikSecim: false, yerelBekleyen: null,
  fileId: 'lib', adresteLang: false, buOturumdaYenilendi: false
};
const karar = (g: Partial<TercihGirdisi>) => tercihKarari({ ...temel, ...g });

const bellekDepo = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('tercihKarari', () => {
  it('?lang in the address: nothing (not applied, not written)', () => {
    expect(karar({ adresteLang: true, driveDil: 'tr' })).toEqual({ eylem: 'hicbir', bekleyenSil: false });
    expect(karar({ adresteLang: true, yerelAcikSecim: true })).toEqual({ eylem: 'hicbir', bekleyenSil: false });
  });

  it("Drive's language differs → one reload in it", () => {
    expect(karar({ driveDil: 'tr' })).toEqual({ eylem: 'yenile', dil: 'tr', bekleyenSil: false });
    expect(karar({ driveDil: 'en', yerelDil: 'tr', yerelAcikSecim: true })).toEqual({ eylem: 'yenile', dil: 'en', bekleyenSil: false });
  });

  it('already reloaded in this session → no second reload', () => {
    expect(karar({ driveDil: 'tr', buOturumdaYenilendi: true })).toEqual({ eylem: 'hicbir', bekleyenSil: false });
  });

  it("Drive's language is the page's → nothing", () => {
    expect(karar({ driveDil: 'en', yerelAcikSecim: true })).toEqual({ eylem: 'hicbir', bekleyenSil: false });
  });

  it('Drive has none + a choice of this device → written once', () => {
    expect(karar({ yerelDil: 'tr', yerelAcikSecim: true })).toEqual({ eylem: 'driveYaz', dil: 'tr', bekleyenSil: false });
    expect(karar({ yerelDil: 'tr', yerelAcikSecim: true, driveDil: null })).toEqual({ eylem: 'driveYaz', dil: 'tr', bekleyenSil: false });
  });

  it('Drive has none, no choice ever → nothing', () => {
    expect(karar({})).toEqual({ eylem: 'hicbir', bekleyenSil: false });
  });

  it('no kitaplik.json → never written', () => {
    expect(karar({ fileId: null, yerelDil: 'tr', yerelAcikSecim: true })).toEqual({ eylem: 'hicbir', bekleyenSil: false });
  });

  it('a value we do not know in Drive → left alone', () => {
    expect(karar({ driveDil: 'de', yerelAcikSecim: true })).toEqual({ eylem: 'hicbir', bekleyenSil: false });
    expect(karar({ driveDil: 7 })).toEqual({ eylem: 'hicbir', bekleyenSil: false });
  });

  it("this library's unwritten choice wins over Drive's (no reload back)", () => {
    const g = { yerelDil: 'tr' as const, yerelAcikSecim: true, yerelBekleyen: { dil: 'tr' as const, fileId: 'lib' } };
    expect(karar({ ...g, driveDil: 'en' })).toEqual({ eylem: 'driveYaz', dil: 'tr', bekleyenSil: false });
    expect(karar({ ...g })).toEqual({ eylem: 'driveYaz', dil: 'tr', bekleyenSil: false });
  });

  it('the unwritten choice is in Drive already (its answer was lost) → removed', () => {
    expect(karar({ yerelDil: 'tr', driveDil: 'tr', yerelBekleyen: { dil: 'tr', fileId: 'lib' } })).toEqual({ eylem: 'hicbir', bekleyenSil: true });
  });

  it("another library's (another account) unwritten choice: removed, never written here", () => {
    const b = { dil: 'tr' as const, fileId: 'baska' };
    expect(karar({ yerelDil: 'tr', yerelAcikSecim: true, yerelBekleyen: b, driveDil: 'en' })).toEqual({ eylem: 'yenile', dil: 'en', bekleyenSil: true });
    expect(karar({ yerelDil: 'tr', yerelAcikSecim: true, yerelBekleyen: b, driveDil: 'tr' })).toEqual({ eylem: 'hicbir', bekleyenSil: true });
    expect(karar({ yerelDil: 'tr', yerelAcikSecim: false, yerelBekleyen: b })).toEqual({ eylem: 'hicbir', bekleyenSil: true });
    expect(karar({ yerelDil: 'tr', yerelBekleyen: b, fileId: null })).toEqual({ eylem: 'hicbir', bekleyenSil: true });
  });
});

describe('ayarlarDilYaz', () => {
  it('only ayarlar.dil changes; every other field stays', () => {
    const eski = { surum: 1, raflar: [{ id: 'r', ad: 'Raf 1', kitaplar: ['a'] }], oda: { duvar: '#ffffff' }, baska: { x: 1 }, ayarlar: { tema: 'koyu' } };
    const { json, degisti } = ayarlarDilYaz(eski, 'tr');
    expect(degisti).toBe(true);
    expect(json).toEqual({ ...eski, ayarlar: { tema: 'koyu', dil: 'tr' } });
    expect(eski.ayarlar).toEqual({ tema: 'koyu' });
  });

  it('the same language → nothing written', () => {
    expect(ayarlarDilYaz({ ayarlar: { dil: 'en' } }, 'en').degisti).toBe(false);
  });

  it('not an object → nothing written', () => {
    expect(ayarlarDilYaz([1, 2], 'tr').degisti).toBe(false);
    expect(ayarlarDilYaz(null, 'tr').degisti).toBe(false);
  });

  it('driveDilOku reads ayarlar.dil from the extra fields', () => {
    expect(driveDilOku({ ayarlar: { dil: 'tr' } })).toBe('tr');
    expect(driveDilOku({})).toBeUndefined();
    expect(driveDilOku({ ayarlar: 'x' })).toBeUndefined();
  });
});

describe('flags', () => {
  it('bekleyen: written, read, removed; broken → null', () => {
    const d = bellekDepo();
    bekleyenYaz({ dil: 'tr', fileId: 'lib' }, d);
    expect(bekleyenOku(d)).toEqual({ dil: 'tr', fileId: 'lib' });
    bekleyenSil(d);
    expect(bekleyenOku(d)).toBeNull();
    d.setItem(BEKLEYEN_ANAHTARI, '{"dil":"de","fileId":"x"}');
    expect(bekleyenOku(d)).toBeNull();
    expect(bekleyenCoz('tr')).toBeNull();
    expect(bekleyenCoz('{"dil":"tr"}')).toBeNull();
  });

  it('session flag; a storage that throws → false (no reload)', () => {
    const d = bellekDepo();
    expect(yenilendiMi(d)).toBe(false);
    expect(yenilendiYaz(d)).toBe(true);
    expect(yenilendiMi(d)).toBe(true);
    const bozuk = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => {} };
    expect(yenilendiYaz(bozuk)).toBe(false);
    expect(yenilendiMi(bozuk)).toBe(false);
    expect(yenilendiYaz(null)).toBe(false);
  });
});
