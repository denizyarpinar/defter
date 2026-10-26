import { describe, expect, it } from 'vitest';
import { eklemeEngeli, eklemeHedefi, isSonrasiSayfa, kaldirmaHedefleri, sayfaEkleGorunur, type GorunenSayfa } from './sayfaEkleDurumu';

// Task 6.S-4

const p = (liste: number, pdfSayfa?: number, dosyaId: string | null = 'f'): GorunenSayfa => ({ liste, dosyaId, ...(pdfSayfa ? { pdfSayfa } : {}), ad: 'ozet.pdf' });

describe('sayfaEkleGorunur', () => {
  it('Drive + surum 2 + materyal', () => {
    expect(sayfaEkleGorunur({ drive: true, surum2: true, materyal: true })).toBe(true);
    expect(sayfaEkleGorunur({ drive: false, surum2: true, materyal: true })).toBe(false);
    expect(sayfaEkleGorunur({ drive: true, surum2: false, materyal: true })).toBe(false);
    expect(sayfaEkleGorunur({ drive: true, surum2: true, materyal: false })).toBe(false);
  });
});

describe('eklemeHedefi', () => {
  it('PDF modu / tek sayfa: o sayfa, iki yön', () => {
    expect(eklemeHedefi([p(4, 5)], 'once')).toEqual({ liste: 4, dosyaId: 'f', ad: 'ozet.pdf', komsu: 4, yon: 'once' });
    expect(eklemeHedefi([p(4, 5)], 'sonra')).toMatchObject({ komsu: 4, yon: 'sonra' });
  });
  it('kitap modu: Önüne = sol, Arkasına = sağ; sağ boş / PDF değil → sol', () => {
    expect(eklemeHedefi([p(2, 3), p(3, 4)], 'once')).toMatchObject({ liste: 2, komsu: 2 });
    expect(eklemeHedefi([p(2, 3), p(3, 4)], 'sonra')).toMatchObject({ liste: 3, komsu: 3 });
    expect(eklemeHedefi([p(2, 3), p(3)], 'sonra')).toMatchObject({ liste: 2, komsu: 2 });
    expect(eklemeHedefi([p(2, 3)], 'sonra')).toMatchObject({ liste: 2 });
  });
  it('brifing + sorular: sağdaki başka dosyaysa o dosya', () => {
    expect(eklemeHedefi([p(9, 10, 'brifing'), p(10, 1, 'sorular')], 'sonra')).toMatchObject({ dosyaId: 'sorular', komsu: 0 });
  });
  it('PDF sayfası değil: null', () => {
    expect(eklemeHedefi([p(0)], 'once')).toBeNull();
    expect(eklemeHedefi([p(0, 1, null)], 'sonra')).toBeNull();
  });
});

describe('kaldirmaHedefleri', () => {
  const kayit = { islemId: 'b', iz: 'i:b' };
  it('sadece işaretli sayfalar; iki tane → sol / sağ, bir tane → tek', () => {
    expect(kaldirmaHedefleri([p(0, 1), p(1, 2)], () => null)).toEqual([]);
    expect(kaldirmaHedefleri([p(0, 1), p(1, 2)], (_f, i) => i === 1 ? kayit : null).map(h => [h.taraf, h.indeks])).toEqual([['tek', 1]]);
    expect(kaldirmaHedefleri([p(0, 1), p(1, 2)], () => kayit).map(h => h.taraf)).toEqual(['sol', 'sag']);
  });
});

describe('eklemeEngeli / isSonrasiSayfa', () => {
  it('sırayla nedenler', () => {
    const yok = { isSuruyor: false, kalemYazamaz: null, okumaSuruyor: false, hedefYok: false };
    expect(eklemeEngeli(yok)).toBeNull();
    expect(eklemeEngeli({ ...yok, kalemYazamaz: 'imzalı' })).toBe('imzalı');
    expect(eklemeEngeli({ ...yok, isSuruyor: true, kalemYazamaz: 'imzalı' })).toMatch(/sürüyor/);
    expect(eklemeEngeli({ ...yok, hedefYok: true })).toMatch(/PDF sayfası değil/);
  });
  it('ekleme: yeni sayfa; kaldırma: öncesi (ilk sayfa: 1)', () => {
    expect(isSonrasiSayfa('ekle', 0)).toBe(1);
    expect(isSonrasiSayfa('ekle', 3)).toBe(4);
    expect(isSonrasiSayfa('kaldir', 3)).toBe(3);
    expect(isSonrasiSayfa('kaldir', 0)).toBe(1);
  });
});
