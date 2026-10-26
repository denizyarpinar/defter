import { describe, expect, it } from 'vitest';
import { kayitBirlestir, sayfaBirlestir } from './birlestir';
import { bosKayit, type OcrKayit, type OcrSayfa } from './sema';

const s = (sayfa: number, parmakIzi: string, okunma: string, metin = 'x'): OcrSayfa => ({
  sayfa, parmakIzi, model: 'm', okunma, dondurme: 0, satirlar: [{ girinti: 0, parcalar: [{ metin, renk: 'mavi' }] }]
});
const k = (...sayfalar: OcrSayfa[]): OcrKayit => ({ ...bosKayit({ id: 'p', ad: 'ozet.pdf' }), sayfalar });
const T1 = '2026-10-24T10:00:00.000Z', T2 = '2026-10-24T11:00:00.000Z';

describe('sayfaBirlestir', () => {
  it('aynı parmak izi: yeni okuma kazanır (saati eski olsa bile)', () => {
    const r = sayfaBirlestir(k(s(1, 'a', T2, 'eski')), s(1, 'a', T1, 'yeni'));
    expect(r.sayfalar).toHaveLength(1);
    expect(r.sayfalar[0].satirlar).toEqual([{ girinti: 0, parcalar: [{ metin: 'yeni', renk: 'mavi' }] }]);
  });
  it('farklı parmak izi eklenir, sayfa sırasına dizilir', () => {
    const r = sayfaBirlestir(k(s(3, 'c', T1)), s(1, 'a', T1));
    expect(r.sayfalar.map(x => x.parmakIzi)).toEqual(['a', 'c']);
  });
  it('aynı sayfa numarası, farklı parmak izi: eski kayıt kalır', () => {
    const r = sayfaBirlestir(k(s(2, 'eski', T1)), s(2, 'yeni', T2));
    expect(r.sayfalar.map(x => x.parmakIzi)).toEqual(['eski', 'yeni']);
  });
  it('bilinmeyen alanlar korunur, girdi değişmez', () => {
    const once = { ...k(s(1, 'a', T1)), ek: 5 } as OcrKayit;
    const r = sayfaBirlestir(once, s(2, 'b', T1));
    expect((r as unknown as { ek: number }).ek).toBe(5);
    expect(once.sayfalar).toHaveLength(1);
  });
});

describe('kayitBirlestir (iki dosya)', () => {
  it('aynı parmak izinde okunma saati yeni olan kazanır; ötekiler eklenir', () => {
    const asil = { ...k(s(1, 'a', T1, 'asil'), s(2, 'b', T2, 'asil-b')), ek: 'asil' } as OcrKayit;
    const diger = { ...k(s(1, 'a', T2, 'diger'), s(2, 'b', T1, 'diger-b'), s(3, 'c', T1)), ek: 'diger' } as OcrKayit;
    const r = kayitBirlestir(asil, diger);
    expect(r.sayfalar.map(x => [x.parmakIzi, (x.satirlar[0] as { parcalar: { metin: string }[] }).parcalar[0].metin])).toEqual([['a', 'diger'], ['b', 'asil-b'], ['c', 'x']]);
    expect((r as unknown as { ek: string }).ek).toBe('asil');
  });

  it('6.S-4d: silinenler alanları islemId ile birleşir; aynı islemId + sayfada okunması yeni olan kalır', () => {
    const asil = { ...k(s(1, 'a', T1)), silinenler: [{ islemId: 'x', sira: 1, sayfa: s(2, 'b', T1, 'eski') }, { islemId: 'y', sira: 0, sayfa: s(4, 'd', T1) }] };
    const diger = { ...k(s(1, 'a', T1)), silinenler: [{ islemId: 'x', sira: 1, sayfa: s(2, 'b', T2, 'yeni') }, { islemId: 'z', sira: 2, sayfa: s(5, 'e', T1) }] };
    const r = kayitBirlestir(asil, diger);
    expect(r.silinenler!.map(x => [x.islemId, (x.sayfa.satirlar[0] as { parcalar: { metin: string }[] }).parcalar[0].metin])).toEqual([['x', 'yeni'], ['y', 'x'], ['z', 'x']]);
    expect(kayitBirlestir(k(s(1, 'a', T1)), k(s(2, 'b', T1))).silinenler).toBeUndefined();
    expect(kayitBirlestir(k(), diger).silinenler!.map(x => x.islemId)).toEqual(['x', 'z']);
  });
});
