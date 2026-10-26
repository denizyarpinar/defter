import { describe, expect, it } from 'vitest';
import type { OcrKayit, OcrSayfa } from '../ocr/kayit/sema';
import { kurdeleGeriKoy, kurdeleGeriKoyYerinde, kurdeleKaydir, kurdeleKaydirYerinde, ocrGeriKoy, ocrKaydir, ocrSil, sayfaNumarasiKaydir, silinenKurdeleler } from './sayfaKaydir';

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

// Task 6.S-4d: any page deleted, then back with "Geri al"

describe('ocrSil / ocrGeriKoy', () => {
  it('silinen sayfanın kaydı silinenler alanına, sonrakiler −1; geri al → JSON aynı (bayt düzeyinde)', () => {
    const k = kayit([sayfa(1, 'g:a'), sayfa(3, 'g:c', { x: 1 }), sayfa(4, 'g:d'), sayfa(2, 'g:b')]);
    const once = JSON.stringify(k);
    const s = ocrSil(k, { islemId: 's1', indeks: 2, iz: 'g:c' });
    expect(s.degisti).toBe(true);
    expect(s.kayit.sayfalar.map(x => [x.sayfa, x.parmakIzi])).toEqual([[1, 'g:a'], [3, 'g:d'], [2, 'g:b']]);
    expect(s.kayit.silinenler).toEqual([{ islemId: 's1', sira: 1, sayfa: k.sayfalar[1] }]);
    expect((s.kayit as unknown as { bilinmeyen: number }).bilinmeyen).toBe(7);
    expect(JSON.stringify(k)).toBe(once);   // the input is not changed
    const g = ocrGeriKoy(s.kayit, { islemId: 's1', indeks: 2 });
    expect(JSON.stringify(g.kayit)).toBe(once);
  });
  it('başka silinenler kalır; geri gelen kayıt yeni yerinin numarasını alır', () => {
    const k = { ...kayit([sayfa(1, 'g:a'), sayfa(2, 'g:b')]), silinenler: [{ islemId: 'eski', sira: 0, sayfa: sayfa(9, 'g:z') }] };
    const s = ocrSil(k, { islemId: 'y', indeks: 0, iz: 'g:a' });
    expect(s.kayit.silinenler!.map(x => x.islemId)).toEqual(['eski', 'y']);
    const g = ocrGeriKoy(s.kayit, { islemId: 'y', indeks: 2 });   // went back at the end
    expect(g.kayit.sayfalar.map(x => [x.sayfa, x.parmakIzi])).toEqual([[3, 'g:a'], [1, 'g:b']]);
    expect(g.kayit.silinenler!.map(x => x.islemId)).toEqual(['eski']);
  });
  it('aynı iz başka sayfada da varsa sadece o numaradaki gider; okunmamış sayfa: sadece kayma', () => {
    const k = kayit([sayfa(1, 'g:a'), sayfa(3, 'g:a')]);
    const s = ocrSil(k, { islemId: 'q', indeks: 2, iz: 'g:a', ayniIzVar: true });
    expect(s.kayit.sayfalar.map(x => x.sayfa)).toEqual([1]);
    expect(s.kayit.silinenler!.map(x => x.sayfa.sayfa)).toEqual([3]);
    const o = ocrSil(kayit([sayfa(1, 'g:a'), sayfa(3, 'g:c')]), { islemId: 'q', indeks: 1, iz: 'g:x' });
    expect(o.kayit.sayfalar.map(x => x.sayfa)).toEqual([1, 2]);
    expect(o.kayit.silinenler).toBeUndefined();
    expect(ocrSil(kayit([sayfa(1, 'g:a')]), { islemId: 'q', indeks: 3, iz: 'g:x' }).degisti).toBe(false);
  });
});

describe('silinenKurdeleler / kurdeleGeriKoy', () => {
  it('silinen sayfadaki kurdeleler kaydedilir; sil → geri al → kitap.json aynı', () => {
    const k = kitap();   // ozet: 3, kitap kurdelesi: 5, uebungen: 1 (ozet.pdf)
    const once = JSON.stringify(k);
    for (const indeks of [2, 4, 0]) {
      const h = { konu: 'U1/K1', dosya: 'ozet.pdf', indeks };
      const t = silinenKurdeleler(k, h);
      const s = kurdeleKaydir(k, { ...h, delta: -1 }).json;
      const g = kurdeleGeriKoy(s, h, t, true);
      expect(JSON.stringify(g.json)).toBe(once);
    }
    expect(silinenKurdeleler(k, { konu: 'U1/K1', dosya: 'ozet.pdf', indeks: 2 })).toEqual({ materyaller: ['ozet'], kitap: false });
    expect(silinenKurdeleler(k, { konu: 'U1/K1', dosya: 'ozet.pdf', indeks: 4 })).toEqual({ materyaller: [], kitap: true });
  });
  it('yerinde değilse (sona eklendi) sadece +1; kurdele bu arada başka yere gittiyse geri gelmez', () => {
    const h = { konu: 'U1/K1', dosya: 'ozet.pdf', indeks: 2 };
    const k = kitap();
    const t = silinenKurdeleler(k, h);
    kurdeleKaydirYerinde(k, { ...h, delta: -1 });
    const a = structuredClone(k);
    kurdeleGeriKoyYerinde(a, h, t, false);
    expect(a.uniteler[0].konular[0].kurdeleler.ozet.sayfa).toBe(2);
    k.uniteler[0].konular[0].kurdeleler.ozet.sayfa = 1;   // the user moved it
    kurdeleGeriKoyYerinde(k, h, t, true);
    expect(k.uniteler[0].konular[0].kurdeleler.ozet.sayfa).toBe(1);
  });
});
