import { describe, expect, it } from 'vitest';
import { eslestir } from './eslestir';
import { bosKayit, type OcrKayit, type OcrSayfa } from './sema';

const s = (sayfa: number, parmakIzi: string, okunma = '2026-10-24T10:00:00.000Z'): OcrSayfa =>
  ({ sayfa, parmakIzi, model: 'm', okunma, dondurme: 0, satirlar: [] });
const k = (...sayfalar: OcrSayfa[]): OcrKayit => ({ ...bosKayit({ id: 'p', ad: 'ozet.pdf' }), sayfalar });

describe('eslestir', () => {
  it('sayfa sırası aynı: her kayıt kendi sayfasında', () => {
    const r = eslestir(k(s(1, 'a'), s(2, 'b')), ['a', 'b', 'c']);
    expect(r.sayfalar.map(x => x?.parmakIzi ?? null)).toEqual(['a', 'b', null]);
    expect(r.eski).toEqual([]);
  });

  it('2. sayfa silinip sayfalar kayınca kayıt doğru sayfaya bağlanır, silinenin kaydı eski', () => {
    const r = eslestir(k(s(1, 'a'), s(2, 'b'), s(3, 'c')), ['a', 'c']);
    expect(r.sayfalar.map(x => x?.sayfa)).toEqual([1, 3]);
    expect(r.eski.map(x => x.parmakIzi)).toEqual(['b']);
  });

  it('sayfa yer değiştirdi: parmak izi kazanır', () => {
    const r = eslestir(k(s(1, 'a'), s(2, 'b')), ['b', 'a']);
    expect(r.sayfalar.map(x => x?.parmakIzi)).toEqual(['b', 'a']);
  });

  it('parmak izi tutmayan kayıt (aynı sayfa numarası) eski sayılır', () => {
    const r = eslestir(k(s(1, 'eski-foto')), ['yeni-foto']);
    expect(r.sayfalar).toEqual([null]);
    expect(r.eski.map(x => x.parmakIzi)).toEqual(['eski-foto']);
  });

  it('aynı fotoğraf iki sayfada: önce sayfa numarası tutan, sonra en yenisi', () => {
    const r = eslestir(k(s(3, 'a', '2026-10-24T09:00:00.000Z'), s(1, 'a', '2026-10-24T08:00:00.000Z')), ['a', 'x', 'a']);
    expect(r.sayfalar.map(x => x?.sayfa ?? null)).toEqual([1, null, 3]);
    const tek = eslestir(k(s(5, 'a', '2026-10-24T08:00:00.000Z'), s(6, 'a', '2026-10-24T09:00:00.000Z')), ['a']);
    expect(tek.sayfalar[0]?.sayfa).toBe(6);
    expect(tek.eski.map(x => x.sayfa)).toEqual([5]);
  });
});
