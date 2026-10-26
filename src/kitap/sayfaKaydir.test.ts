import { describe, expect, it } from 'vitest';
import type { OcrKayit, OcrSayfa } from '../ocr/kayit/sema';
import { kurdeleKaydir, kurdeleKaydirYerinde, ocrKaydir, sayfaNumarasiKaydir } from './sayfaKaydir';

// Task 6.S-4: page numbers after a blank page went in / out

describe('sayfaNumarasiKaydir', () => {
  it('ekleme: indeksten (0\'dan) itibaren +1; ilk sayfanın önü, son sayfanın arkası', () => {
    expect([1, 2, 3].map(s => sayfaNumarasiKaydir(s, 0, 1))).toEqual([2, 3, 4]);   // before page 1
    expect([1, 2, 3].map(s => sayfaNumarasiKaydir(s, 3, 1))).toEqual([1, 2, 3]);   // after the last
    expect([1, 2, 3].map(s => sayfaNumarasiKaydir(s, 1, 1))).toEqual([1, 3, 4]);
  });
  it('kaldırma: kaldırılan null, sonrakiler −1', () => {
    expect([1, 2, 3, 4].map(s => sayfaNumarasiKaydir(s, 1, -1))).toEqual([1, null, 2, 3]);
    expect([1, 2].map(s => sayfaNumarasiKaydir(s, 0, -1))).toEqual([null, 1]);
    expect([1, 2, 3].map(s => sayfaNumarasiKaydir(s, 2, -1))).toEqual([1, 2, null]);
  });
});

const sayfa = (n: number, iz: string, ek: object = {}): OcrSayfa => ({ sayfa: n, parmakIzi: iz, model: 'm', okunma: '2026-10-25T10:00:00Z', dondurme: 0, satirlar: [], ...ek });
const kayit = (s: OcrSayfa[]): OcrKayit & { bilinmeyen: number } => ({ tur: 'defter-ocr', surum: 1, kaynak: { id: 'p', ad: 'ozet.pdf' }, sayfalar: s, bilinmeyen: 7 });

describe('ocrKaydir', () => {
  it('ekleme: sonraki sayfa anahtarları +1, öncekiler aynı nesne; bilinmeyen alanlar kalır', () => {
    const a = sayfa(1, 'g:a'), b = sayfa(2, 'g:b', { x: 1 }), c = sayfa(3, 'g:c');
    const r = ocrKaydir(kayit([a, b, c]), 1, 1);
    expect(r.degisti).toBe(true);
    expect(r.kayit.sayfalar.map(s => s.sayfa)).toEqual([1, 3, 4]);
    expect(r.kayit.sayfalar[0]).toBe(a);
    expect(r.kayit.sayfalar[1]).toMatchObject({ x: 1, parmakIzi: 'g:b' });
    expect((r.kayit as unknown as { bilinmeyen: number }).bilinmeyen).toBe(7);
  });
  it('son sayfanın arkası: değişiklik yok (aynı kayıt)', () => {
    const k = kayit([sayfa(1, 'g:a'), sayfa(2, 'g:b')]);
    expect(ocrKaydir(k, 2, 1)).toEqual({ kayit: k, degisti: false });
  });
  it('kaldırma: kaldırılan sayfanın kaydı (parmak iziyle) gider, sonrakiler −1', () => {
    const r = ocrKaydir(kayit([sayfa(1, 'g:a'), sayfa(2, 'i:bos'), sayfa(3, 'g:c')]), 1, -1, 'i:bos');
    expect(r.kayit.sayfalar.map(s => [s.sayfa, s.parmakIzi])).toEqual([[1, 'g:a'], [2, 'g:c']]);
  });
  it('kaldırma: aynı numarada başka izli (eski) kayıt silinmez, öncesine geçer; iz yoksa numarayla', () => {
    const r = ocrKaydir(kayit([sayfa(2, 'g:eski'), sayfa(3, 'g:c')]), 1, -1, 'i:bos');
    expect(r.kayit.sayfalar.map(s => [s.sayfa, s.parmakIzi])).toEqual([[1, 'g:eski'], [2, 'g:c']]);
    const n = ocrKaydir(kayit([sayfa(2, 'g:x'), sayfa(3, 'g:c')]), 1, -1);
    expect(n.kayit.sayfalar.map(s => s.parmakIzi)).toEqual(['g:c']);
  });
});

const kitap = () => ({
  surum: 2, bilinmeyen: { a: 1 },
  kurdele: { konu: 'U1/K1', materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 5, ek: true },
  uniteler: [{ baslik: 'U', konular: [
    { baslik: 'K1', klasor: 'U1/K1', kurdeleler: { ozet: { dosya: 'ozet.pdf', sayfa: 3 }, orijinal: { dosya: 'orijinal.pdf', sayfa: 9 }, uebungen: { dosya: 'ozet.pdf', sayfa: 1 } } },
    { baslik: 'K2', klasor: 'U1/K2', kurdeleler: { ozet: { dosya: 'ozet.pdf', sayfa: 8 } } },
  ] }],
});

describe('kurdeleKaydir', () => {
  it('sadece o konunun o dosyaya bakan kurdeleleri + kitabın kurdelesi; girdi değişmez', () => {
    const k = kitap();
    const r = kurdeleKaydir(k, { konu: 'U1/K1', dosya: 'ozet.pdf', indeks: 2, delta: 1 });
    expect(r.degisti).toBe(true);
    const j = r.json as ReturnType<typeof kitap>;
    expect(j.kurdele).toEqual({ konu: 'U1/K1', materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 6, ek: true });
    expect(j.uniteler[0].konular[0].kurdeleler).toEqual({ ozet: { dosya: 'ozet.pdf', sayfa: 4 }, orijinal: { dosya: 'orijinal.pdf', sayfa: 9 }, uebungen: { dosya: 'ozet.pdf', sayfa: 1 } });
    expect(j.uniteler[0].konular[1].kurdeleler.ozet.sayfa).toBe(8);   // another topic
    expect(j.bilinmeyen).toEqual({ a: 1 });
    expect(k.kurdele.sayfa).toBe(5);
  });
  it('kaldırılan sayfadaki kurdele bir önceki sayfaya (ilk sayfa: 1)', () => {
    const j = kurdeleKaydir(kitap(), { konu: 'U1/K1', dosya: 'ozet.pdf', indeks: 2, delta: -1 }).json as ReturnType<typeof kitap>;
    expect(j.uniteler[0].konular[0].kurdeleler.ozet.sayfa).toBe(2);
    expect(j.kurdele.sayfa).toBe(4);
    const i = kurdeleKaydir(kitap(), { konu: 'U1/K1', dosya: 'ozet.pdf', indeks: 0, delta: -1 }).json as ReturnType<typeof kitap>;
    expect(i.uniteler[0].konular[0].kurdeleler.uebungen!.sayfa).toBe(1);
  });
  it('hiçbiri etkilenmiyorsa degisti false; bellekteki kitap yerinde', () => {
    expect(kurdeleKaydir(kitap(), { konu: 'U1/K1', dosya: 'ozet.pdf', indeks: 10, delta: 1 }).degisti).toBe(false);
    const k = kitap();
    expect(kurdeleKaydirYerinde(k, { konu: 'U1/K2', dosya: 'ozet.pdf', indeks: 0, delta: 1 })).toBe(true);
    expect(k.uniteler[0].konular[1].kurdeleler.ozet.sayfa).toBe(9);
    expect(k.kurdele.sayfa).toBe(5);
  });
});
