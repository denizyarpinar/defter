import { describe, expect, it } from 'vitest';
import { duzeltmeUygula, elleSayisi, kelimeDegistir, kelimeGeriAl, kelimeler, tekrarOkuUyarisi, yazildigiGibi, KelimeBos, OcrSayfaDegisti, type DuzeltmeHedefi } from './elleDuzelt';
import { bosKayit, duzeltilmisMetin, hamMetin, kayitOku, type OcrKayit, type OcrParca, type OcrSayfa } from './sema';

const parca = (metin: string, o: Partial<OcrParca> = {}): OcrParca => ({ metin, renk: 'mavi', ...o });
const sayfa = (...parcalar: OcrParca[]): OcrSayfa => ({
  sayfa: 1, parmakIzi: 'g:aa', model: 'm', okunma: '2026-10-25T10:00:00.000Z', dondurme: 0,
  satirlar: [{ girinti: 0, parcalar }, { girinti: 1, cizim: 'graf' }],
});
const kayit = (...sayfalar: OcrSayfa[]): OcrKayit => ({ ...bosKayit({ id: 'pdf1', ad: 'ozet.pdf' }), sayfalar });

describe('kelimeDegistir', () => {
  it('parça içinde bir kelime: metin değişmez, duzeltme + elle', () => {
    const p = kelimeDegistir(parca('das anzi Problem'), 1, 'anki');
    expect(p).toEqual({ metin: 'das anzi Problem', renk: 'mavi', duzeltme: 'das anki Problem', elle: true });
  });

  it('birden çok kelime üst üste: önceki düzeltme taban olur', () => {
    let p = kelimeDegistir(parca('das anzi Problen'), 1, 'anki');
    p = kelimeDegistir(p, 2, 'Problem');
    expect(p.metin).toBe('das anzi Problen');
    expect(p.duzeltme).toBe('das anki Problem');
    expect(p.elle).toBe(true);
  });

  it('noktalama korunur, sadece öz düzenlenir', () => {
    expect(kelimeler(parca('(anzi), z.B.'))).toEqual([{ bas: '(', oz: 'anzi', son: '),' }, { bas: '', oz: 'z.B', son: '.' }]);
    expect(kelimeDegistir(parca('(anzi), z.B.'), 0, 'anki').duzeltme).toBe('(anki), z.B.');
    expect(kelimeler(parca('a → b'))[1]).toEqual({ bas: '', oz: '', son: '→' });   // punctuation only: no core
    expect(() => kelimeDegistir(parca('a → b'), 1, 'x')).toThrow(RangeError);
  });

  it('modelin düzeltmesi varsa taban o; boşluklar korunur', () => {
    const p = kelimeDegistir(parca('Kantn  sind', { duzeltme: 'Kante  sind' }), 1, 'ist');
    expect(p).toMatchObject({ metin: 'Kantn  sind', duzeltme: 'Kante  ist', elle: true });
  });

  it('metne eşit olunca duzeltme ve elle silinir; aynı kelime → aynı nesne', () => {
    const p = kelimeDegistir(parca('das anzi'), 1, 'anki');
    expect(kelimeDegistir(p, 1, 'anzi')).toEqual(parca('das anzi'));
    expect(kelimeDegistir(p, 1, 'anki')).toBe(p);
  });

  it('boş kelime: KelimeBos', () => {
    expect(() => kelimeDegistir(parca('das anzi'), 1, '   ')).toThrow(KelimeBos);
  });

  it('boşluklu iki kelime ("an ki") kabul edilir; sonra Geri al bütün elle düzeltmeyi kaldırır', () => {
    const p = kelimeDegistir(parca('das anki Problem'), 1, ' an   ki ');
    expect(p).toMatchObject({ metin: 'das anki Problem', duzeltme: 'das an ki Problem', elle: true });
    expect(yazildigiGibi(p, 1)).toBe('das anki Problem');   // the word count changed: the whole part
    expect(kelimeGeriAl(p, 2)).toEqual(parca('das anki Problem'));
  });
});

describe('kelimeGeriAl / yazildigiGibi', () => {
  it('kelime sayısı aynı: sadece o kelime metindeki haline döner', () => {
    let p = kelimeDegistir(parca('das anzi Problen'), 1, 'anki');
    p = kelimeDegistir(p, 2, 'Problem');
    expect(yazildigiGibi(p, 0)).toBeNull();
    expect(yazildigiGibi(p, 1)).toBe('anzi');
    const g = kelimeGeriAl(p, 1);
    expect(g).toMatchObject({ duzeltme: 'das anzi Problem', elle: true });
    expect(kelimeGeriAl(g, 2)).toEqual(parca('das anzi Problen'));
  });

  it('elle olmayan parçada (modelin düzeltmesi) değişiklik yok', () => {
    const p = parca('Kantn', { duzeltme: 'Kante' });
    expect(yazildigiGibi(p, 0)).toBeNull();
    expect(kelimeGeriAl(p, 0)).toBe(p);
  });
});

describe('elleSayisi / tekrarOkuUyarisi', () => {
  it('elle düzeltilmiş parçalar sayılır', () => {
    const s = sayfa(kelimeDegistir(parca('anzi'), 0, 'anki'), parca('b', { duzeltme: 'c' }), kelimeDegistir(parca('x y'), 1, 'z'));
    expect(elleSayisi(s)).toBe(2);
    expect(tekrarOkuUyarisi(s)).toBe('Bu sayfada 2 elle düzeltme var, tekrar okursan silinir.');
    expect(tekrarOkuUyarisi(sayfa(parca('a')))).toBeNull();
  });
});

describe('duzeltmeUygula', () => {
  const s = sayfa(parca('der'), parca('das anzi Problem'));
  const hedef: DuzeltmeHedefi = { parmakIzi: 'g:aa', okunma: s.okunma, satir: 0, parca: 1, metin: 'das anzi Problem', gosterilen: 'das anzi Problem' };
  const degistir = (x: OcrParca) => kelimeDegistir(x, 1, 'anki');

  it('son kayıtta o parça değişir; metin korunur; diğerleri ve bilinmeyen alanlar aynen; okunur', () => {
    const k = { ...kayit(s, { ...s, sayfa: 2, parmakIzi: 'g:bb' }), gelecek: 1 } as OcrKayit;
    const y = duzeltmeUygula(k, hedef, degistir);
    expect(duzeltilmisMetin(y.sayfalar[0])).toBe('der das anki Problem\n  [çizim: graf]');
    expect(hamMetin(y.sayfalar[0])).toBe(hamMetin(s));
    expect(y.sayfalar[1]).toBe(k.sayfalar[1]);
    expect((y as unknown as { gelecek: number }).gelecek).toBe(1);
    expect(k.sayfalar[0]).toEqual(s);   // the input is not changed
    expect(kayitOku(JSON.parse(JSON.stringify(y)))).toBeTruthy();
  });

  it('sayfa yeniden okunmuş (okunma farklı), parça metni ya da gösterilen farklı → OcrSayfaDegisti', () => {
    expect(() => duzeltmeUygula(kayit({ ...s, okunma: '2026-10-25T11:00:00.000Z' }), hedef, degistir)).toThrow(OcrSayfaDegisti);
    expect(() => duzeltmeUygula(kayit(s), { ...hedef, metin: 'das anzi Problen' }, degistir)).toThrow(OcrSayfaDegisti);
    expect(() => duzeltmeUygula(kayit(s), { ...hedef, gosterilen: 'das an ki Problem' }, degistir)).toThrow(OcrSayfaDegisti);
    expect(() => duzeltmeUygula(kayit(s), { ...hedef, satir: 1 }, degistir)).toThrow(OcrSayfaDegisti);   // a drawing line
    expect(() => duzeltmeUygula(kayit(), hedef, degistir)).toThrow(OcrSayfaDegisti);
  });
});
