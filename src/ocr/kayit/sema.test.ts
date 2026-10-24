import { describe, expect, it } from 'vitest';
import { bosKayit, duzeltilmisMetin, hamMetin, kayitOku, ocrDosyaAdi, sayfaKontrol, OcrKayitBozuk, OcrKayitYeniSurum, type OcrSayfa } from './sema';

const sayfa = (o: Partial<OcrSayfa> = {}): OcrSayfa => ({
  sayfa: 1, parmakIzi: 'g:aa', model: 'claude-haiku-5-5', okunma: '2026-10-24T10:00:00.000Z', dondurme: 0,
  satirlar: [
    { girinti: 0, parcalar: [{ metin: 'der Knoten', renk: 'kirmizi' }, { metin: 'düğüm', renk: 'mavi' }] },
    { girinti: 1, parcalar: [{ metin: 'Kantn', renk: 'siyah', duzeltme: 'Kante' }, { metin: '\\deg(v)', renk: 'siyah', tur: 'formul' }] },
    { girinti: 1, cizim: 'graf' }
  ],
  ...o
});
const kayit = (o: Record<string, unknown> = {}) => ({ tur: 'defter-ocr', surum: 1, kaynak: { id: 'pdf1', ad: 'ozet.pdf' }, sayfalar: [sayfa()], ...o });

describe('kayitOku', () => {
  it('geçerli kayıt aynı nesne olarak döner', () => {
    const x = kayit();
    expect(kayitOku(x)).toBe(x);
  });

  it('bilinmeyen alanlar her seviyede korunur', () => {
    const x = JSON.parse(JSON.stringify(kayit({ ekKok: 1 })));
    x.sayfalar[0].ekSayfa = 'a';
    x.sayfalar[0].satirlar[0].ekSatir = true;
    x.sayfalar[0].satirlar[0].parcalar[1].ekParca = { z: 1 };
    const k = kayitOku(x) as unknown as typeof x;
    expect(JSON.parse(JSON.stringify(k))).toEqual(x);
  });

  it('bozuk: tur, surum, kaynak, sayfa alanları, renk, satır → OcrKayitBozuk', () => {
    const bozuklar: unknown[] = [
      null, [], 'x', kayit({ tur: 'baska' }), kayit({ surum: 0 }), kayit({ surum: '1' }), kayit({ kaynak: { ad: 'x' } }),
      kayit({ sayfalar: {} }), kayit({ sayfalar: [sayfa({ sayfa: 0 })] }), kayit({ sayfalar: [sayfa({ parmakIzi: '' })] }),
      kayit({ sayfalar: [sayfa({ dondurme: 45 as never })] }),
      kayit({ sayfalar: [sayfa({ satirlar: [{ girinti: 0, parcalar: [{ metin: 'x', renk: 'mor' as never }] }] })] }),
      kayit({ sayfalar: [sayfa({ satirlar: [{ girinti: -1, cizim: 'x' }] })] }),
      kayit({ sayfalar: [sayfa({ satirlar: [{ girinti: 0 } as never] })] }),
      kayit({ sayfalar: [sayfa({ satirlar: [{ girinti: 0, parcalar: [{ metin: 'x', renk: 'mavi', tur: 'cizim' as never }] }] })] })
    ];
    for (const b of bozuklar) expect(() => kayitOku(b), JSON.stringify(b)).toThrow(OcrKayitBozuk);
  });

  it('yeni sürüm → OcrKayitYeniSurum (bozuk sayılmaz)', () => {
    expect(() => kayitOku(kayit({ surum: 2, sayfalar: 'yeni biçim' }))).toThrow(OcrKayitYeniSurum);
  });

  it('mesajlar Türkçe ve yazılmadığını söyler', () => {
    expect(() => kayitOku({})).toThrow(/yazılmadı/);
    expect(() => kayitOku(kayit({ surum: 3 }))).toThrow(/surum 3/);
  });

  it('sayfaKontrol tek sayfayı da denetler', () => {
    expect(() => sayfaKontrol(sayfa())).not.toThrow();
    expect(() => sayfaKontrol({ ...sayfa(), model: '' })).toThrow(OcrKayitBozuk);
  });
});

describe('metin yardımcıları', () => {
  it('hamMetin: yazıldığı gibi, parçalar boşlukla, girinti iki boşluk, çizim [çizim: …]', () => {
    expect(hamMetin(sayfa())).toBe('der Knoten düğüm\n  Kantn \\deg(v)\n  [çizim: graf]');
  });
  it('duzeltilmisMetin: duzeltme varsa o', () => {
    expect(duzeltilmisMetin(sayfa())).toBe('der Knoten düğüm\n  Kante \\deg(v)\n  [çizim: graf]');
  });
  it('kenarında boşluk olan parçaya ikinci boşluk eklenmez', () => {
    expect(hamMetin({ satirlar: [{ girinti: 0, parcalar: [{ metin: 'a ', renk: 'mavi' }, { metin: 'b', renk: 'siyah' }, { metin: '', renk: 'siyah' }] }] })).toBe('a b');
  });
  it('ocrDosyaAdi ve bosKayit', () => {
    expect(ocrDosyaAdi('ozet.pdf')).toBe('ozet.ocr.json');
    expect(ocrDosyaAdi('Blatt-01.PDF')).toBe('Blatt-01.ocr.json');
    expect(bosKayit({ id: 'p', ad: 'ozet.pdf' })).toEqual({ tur: 'defter-ocr', surum: 1, kaynak: { id: 'p', ad: 'ozet.pdf' }, sayfalar: [] });
  });
});
