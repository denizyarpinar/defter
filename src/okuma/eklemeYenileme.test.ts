import { describe, expect, it } from 'vitest';
import { GOSTER_OTOMATIK, gosterIndeksi, sayfaListesiniGenislet, yeniIndeks, yenilemeKarari, type EklemeSonucu, type OkuyucuDurumu } from './eklemeYenileme';

// Task 5.8g: what the open reader refreshes after photos were added, and where "Göster" goes.

const sonuc = (x: Partial<EklemeSonucu> = {}): EklemeSonucu => ({ tur: 'eklendi', fileId: 'OZ', ad: 'ozet.pdf', eskiSayfa: 27, yeniSayfa: 29, ...x });
const durum = (x: Partial<OkuyucuDurumu> = {}): OkuyucuDurumu => ({ acik: true, ayniKonu: true, odakDosyaId: 'OZ', konuOzetIdleri: ['OZ'], ...x });

describe('yenilemeKarari', () => {
  it('no automatic jump by default', () => {
    expect(GOSTER_OTOMATIK).toBe(false);
  });
  it('reader closed or another topic: nothing, no Göster', () => {
    expect(yenilemeKarari(sonuc(), durum({ acik: false }))).toEqual({ yenile: 'yok', goster: null });
    expect(yenilemeKarari(sonuc(), durum({ ayniKonu: false }))).toEqual({ yenile: 'yok', goster: null });
    expect(yenilemeKarari(sonuc({ tur: 'yeni' }), durum({ ayniKonu: false })).goster).toBeNull();
  });
  it('summary on screen: its list grows, Göster → first new page', () => {
    expect(yenilemeKarari(sonuc(), durum())).toEqual({ yenile: 'liste', goster: { fileId: 'OZ', ad: 'ozet.pdf', sayfa: 28 } });
  });
  it('another material on screen (Orijinal): the list stays, Göster still there', () => {
    expect(yenilemeKarari(sonuc(), durum({ odakDosyaId: 'OR' }))).toEqual({ yenile: 'yok', goster: { fileId: 'OZ', ad: 'ozet.pdf', sayfa: 28 } });
    expect(yenilemeKarari(sonuc(), durum({ odakDosyaId: null })).yenile).toBe('yok');
  });
  it('brifing on screen, pages went to sorular.pdf: brifing is not touched', () => {
    const r = yenilemeKarari(sonuc({ fileId: 'SO', ad: 'sorular.pdf', eskiSayfa: 4, yeniSayfa: 5 }), durum({ odakDosyaId: 'BR', konuOzetIdleri: ['BR', 'SO'] }));
    expect(r).toEqual({ yenile: 'yok', goster: { fileId: 'SO', ad: 'sorular.pdf', sayfa: 5 } });
  });
  it('brifing on screen, pages went to brifing: its list grows', () => {
    expect(yenilemeKarari(sonuc({ fileId: 'BR', ad: 'brifing.pdf' }), durum({ odakDosyaId: 'BR', konuOzetIdleri: ['BR', 'SO'] })).yenile).toBe('liste');
  });
  it('new ozet.pdf: the tabs are listed again, Göster → its first page', () => {
    const r = yenilemeKarari(sonuc({ tur: 'yeni', fileId: 'N', eskiSayfa: 0, yeniSayfa: 2 }), durum({ odakDosyaId: 'OR', konuOzetIdleri: [] }));
    expect(r).toEqual({ yenile: 'konu', goster: { fileId: 'N', ad: 'ozet.pdf', sayfa: 1 } });
  });
  it('a summary the topic does not know (made on another device meanwhile): tabs again', () => {
    expect(yenilemeKarari(sonuc({ fileId: 'X' }), durum({ odakDosyaId: 'OR', konuOzetIdleri: [] })).yenile).toBe('konu');
  });
  it('already added before: same rules, Göster stays inside the file', () => {
    expect(yenilemeKarari(sonuc({ eskiSayfa: 27, yeniSayfa: 27 }), durum()).goster?.sayfa).toBe(27);
  });
});

interface P { dosyaId: string | null; pdfSayfa?: number; v?: string }
const pdf = (id: string, n: number, v = 'a'): P[] => Array.from({ length: n }, (_, i) => ({ dosyaId: id, pdfSayfa: i + 1, v }));
const yap = (pdfSayfa: number, o: P): P => ({ ...o, pdfSayfa });

describe('sayfaListesiniGenislet', () => {
  it('one file: the new pages at the end, the old ones the same objects', () => {
    const list = pdf('OZ', 27);
    const g = sayfaListesiniGenislet(list, 'OZ', 29, yap)!;
    expect(g).toMatchObject({ ekYeri: 27, eklenen: 2, sonaMi: true });
    expect(g.pages.length).toBe(29);
    expect(g.pages[0]).toBe(list[0]);
    expect(g.pages.slice(27).map(p => p.pdfSayfa)).toEqual([28, 29]);
    expect(yeniIndeks(22, g)).toBe(22);
  });
  it('brifing + sorular: pages go after brifing, sorular moves down', () => {
    const list = [...pdf('BR', 3), ...pdf('SO', 2)];
    const g = sayfaListesiniGenislet(list, 'BR', 5, yap)!;
    expect(g).toMatchObject({ ekYeri: 3, eklenen: 2, sonaMi: false });
    expect(g.pages.map(p => `${p.dosyaId}${p.pdfSayfa}`)).toEqual(['BR1', 'BR2', 'BR3', 'BR4', 'BR5', 'SO1', 'SO2']);
    expect(yeniIndeks(1, g)).toBe(1);   // brifing page: same place
    expect(yeniIndeks(3, g)).toBe(5);   // sorular page 1 moved
  });
  it('nothing to add (already as many pages, file not in the list)', () => {
    expect(sayfaListesiniGenislet(pdf('OZ', 5), 'OZ', 5, yap)).toBeNull();
    expect(sayfaListesiniGenislet(pdf('OZ', 5), 'OZ', 3, yap)).toBeNull();
    expect(sayfaListesiniGenislet(pdf('OZ', 5), 'X', 9, yap)).toBeNull();
  });
});

describe('gosterIndeksi', () => {
  it('finds the page by file and page number', () => {
    const list = [...pdf('BR', 3), ...pdf('SO', 2)];
    expect(gosterIndeksi(list, { fileId: 'SO', ad: 'sorular.pdf', sayfa: 2 })).toBe(4);
    expect(gosterIndeksi(list, { fileId: 'SO', ad: 'sorular.pdf', sayfa: 3 })).toBe(-1);
  });
});
