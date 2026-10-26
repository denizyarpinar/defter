import { describe, expect, it } from 'vitest';
import { eklemeEngeli, eklemeHedefi, eklemeSonrasiOkunan, isSonrasiSayfa, kaldirmaHedefleri, kaldirmaSonrasiOkunan, kitapCiftiSonrasi, okunanTaraflar, sayfaEkleGorunur, varsayilanTaraf, type GorunenSayfa, type Taraf } from './sayfaEkleDurumu';
import type { Yon } from '../defter/bosSayfa';

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
  it('kitap modu (6.S-4b): okunan taraf, iki yön de o sayfaya; o taraf PDF değil → diğeri', () => {
    expect(eklemeHedefi([p(2, 3), p(3, 4)], 'once')).toMatchObject({ liste: 2, komsu: 2, yon: 'once' });
    expect(eklemeHedefi([p(2, 3), p(3, 4)], 'sonra')).toMatchObject({ liste: 2, komsu: 2, yon: 'sonra' });
    expect(eklemeHedefi([p(2, 3), p(3, 4)], 'once', 'sag')).toMatchObject({ liste: 3, komsu: 3, yon: 'once' });
    expect(eklemeHedefi([p(2, 3), p(3, 4)], 'sonra', 'sag')).toMatchObject({ liste: 3, komsu: 3 });
    expect(eklemeHedefi([p(2, 3), p(3)], 'sonra', 'sag')).toMatchObject({ liste: 2, komsu: 2 });
    expect(eklemeHedefi([p(2), p(3, 4)], 'once')).toMatchObject({ liste: 3, komsu: 3 });
    expect(eklemeHedefi([p(2, 3)], 'sonra', 'sag')).toMatchObject({ liste: 2 });
  });
  it('brifing + sorular: sağdaki başka dosyaysa o dosya', () => {
    expect(eklemeHedefi([p(9, 10, 'brifing'), p(10, 1, 'sorular')], 'sonra', 'sag')).toMatchObject({ dosyaId: 'sorular', komsu: 0 });
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

// Task 6.S-4b: the page read stays on screen. The list's pages are pages 1..n of one PDF (liste = pdfSayfa − 1).
describe('kitap modu: okunan sayfa yerinde', () => {
  const kayit = { islemId: 'b', iz: 'i:b' };
  // the spread after adding, as the page numbers (1-based, 0: empty paper) of the new list
  const sonra = (sol: number, n: number, taraf: Taraf, yon: Yon): [number, number, number] => {
    const g = [p(sol, sol + 1), p(sol + 1, sol + 2)];
    const h = eklemeHedefi(g, yon, taraf)!;
    const o = eklemeSonrasiOkunan(h);
    const c = kitapCiftiSonrasi({ okunanIndeks: o.sayfa - 1, taraf: o.taraf, sayfaSayisi: n + 1 });
    return [c.ciftBaslangic + 1, c.ciftBaslangic + 2, c.ofset];
  };
  // L = 3 (index 2), R = 4; B = the new page: L Arkasına → 4, R Önüne → 4, ...
  it('dört durum (sayfa numaraları yeni listede; B = yeni sayfa)', () => {
    expect(sonra(2, 10, 'sol', 'sonra')).toEqual([3, 4, 0]);   // L | B
    expect(sonra(2, 10, 'sol', 'once')).toEqual([3, 4, 0]);    // B | L (L is now 4)
    expect(sonra(2, 10, 'sag', 'once')).toEqual([4, 5, 1]);    // B | R (B 4, R 5)
    expect(sonra(2, 10, 'sag', 'sonra')).toEqual([4, 5, 1]);   // R | B (R 4, B 5)
  });
  it('ilk sayfanın önü, son sayfanın arkası', () => {
    expect(sonra(0, 10, 'sol', 'once')).toEqual([1, 2, 0]);    // B | 1.
    expect(sonra(8, 10, 'sag', 'sonra')).toEqual([10, 11, 1]); // 10. | B
    expect(sonra(8, 9, 'sol', 'sonra')).toEqual([9, 10, 0]);   // 9 pages, left page is the last: 9. | B
  });
  it('okunan taraflar ve varsayılan', () => {
    const g = [p(2, 3), p(3, 4)];
    expect(okunanTaraflar(g)).toEqual({ sol: 3, sag: 4 });
    expect(okunanTaraflar([p(2, 3)])).toEqual({});
    expect(okunanTaraflar([p(2, 3), p(3)])).toEqual({ sol: 3 });
    expect(varsayilanTaraf(g, null)).toBe('sol');
    expect(varsayilanTaraf(g, 3)).toBe('sag');
    expect(varsayilanTaraf(g, 7)).toBe('sol');   // not on screen any more
    expect(varsayilanTaraf([p(2), p(3, 4)], null)).toBe('sag');
  });
  it('kaldırma: komşu kendi tarafında kalır', () => {
    // B on the right (index 3): the left page (index 2) stays left
    let g = [p(2, 3), p(3, 4)], h = kaldirmaHedefleri(g, (_f, i) => i === 3 ? kayit : null)[0];
    let o = kaldirmaSonrasiOkunan(g, h)!;
    expect(o).toEqual({ dosya: 'ozet.pdf', sayfa: 3, taraf: 'sol' });
    expect(kitapCiftiSonrasi({ okunanIndeks: o.sayfa - 1, taraf: o.taraf, sayfaSayisi: 9 })).toEqual({ ciftBaslangic: 2, ofset: 0 });
    // B on the left (index 2): the right page (old 4, now 3) stays right
    h = kaldirmaHedefleri(g, (_f, i) => i === 2 ? kayit : null)[0];
    o = kaldirmaSonrasiOkunan(g, h)!;
    expect(o).toEqual({ dosya: 'ozet.pdf', sayfa: 3, taraf: 'sag' });
    expect(kitapCiftiSonrasi({ okunanIndeks: o.sayfa - 1, taraf: o.taraf, sayfaSayisi: 9 })).toEqual({ ciftBaslangic: 1, ofset: 1 });
    // B is the first page, on the left: an empty paper on the left, the page on the right
    g = [p(0, 1), p(1, 2)];
    h = kaldirmaHedefleri(g, (_f, i) => i === 0 ? kayit : null)[0];
    o = kaldirmaSonrasiOkunan(g, h)!;
    expect(kitapCiftiSonrasi({ okunanIndeks: o.sayfa - 1, taraf: o.taraf, sayfaSayisi: 9 })).toEqual({ ciftBaslangic: -1, ofset: 1 });
    // one page on screen, or the other one not a PDF page: as in 6.S-4
    expect(kaldirmaSonrasiOkunan([p(2, 3)], { ...h, liste: 2 })).toBeNull();
    expect(kaldirmaSonrasiOkunan([p(2, 3), p(3)], { ...h, liste: 2 })).toBeNull();
  });
  it('kaldırma: komşu başka dosyada → sayfası değişmez', () => {
    const g = [p(9, 10, 'brifing'), p(10, 1, 'sorular')];
    const h = kaldirmaHedefleri(g, (f, i) => f === 'brifing' && i === 9 ? kayit : null)[0];
    expect(kaldirmaSonrasiOkunan(g, h)).toMatchObject({ sayfa: 1, taraf: 'sag' });
  });
});
