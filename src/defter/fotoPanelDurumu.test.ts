import { describe, expect, it } from 'vitest';
import { FOLDER_MIME, type DriveFile } from '../drive/drive';
import { boyutYazi, cikar, ekleDurumu, hedefHesapla, renkEtiketi, tasi, TEMIZ_YAZI_VARSAYILAN, temizEtiketi, temizYaziIsareti, type HedefGirdi } from './fotoPanelDurumu';

// Task 5.8a: the "Fotoğraf ekle" panel's pure part.

const f = (name: string, extra: Partial<DriveFile & { trashed: boolean }> = {}) =>
  ({ id: name, name, mimeType: 'application/pdf', modifiedTime: 't', ...extra });

describe('tasi / cikar', () => {
  it('moves one place, the edges stay', () => {
    expect(tasi(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(tasi(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(tasi(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(tasi(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
    expect(tasi(['a'], 5, 1)).toEqual(['a']);
  });
  it('returns a new array, the old one is unchanged', () => {
    const l = ['a', 'b'];
    expect(tasi(l, 0, 1)).not.toBe(l);
    expect(l).toEqual(['a', 'b']);
  });
  it('removes one item', () => {
    expect(cikar(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
    expect(cikar(['a'], 3)).toEqual(['a']);
  });
});

describe('hedefHesapla', () => {
  const girdi = (o: Partial<HedefGirdi>): HedefGirdi => ({ ozetDosyalari: [], sayfaSayisi: () => undefined, yeniSayfa: 3, ...o });

  it('no summary → new ozet.pdf', () => {
    const h = hedefHesapla(girdi({}));
    expect(h).toMatchObject({ tur: 'yok', hedef: null, eskiSayfa: 0 });
    expect(h.metin).toBe('Bu konuda özet yok: yeni ozet.pdf oluşturulacak (3 sayfa)');
    expect(hedefHesapla(girdi({ yeniSayfa: 0 })).metin).toBe('Bu konuda özet yok: fotoğraflardan yeni ozet.pdf oluşturulacak');
  });

  it('files in the trash and folders don\'t count', () => {
    const h = hedefHesapla(girdi({ ozetDosyalari: [f('ozet.pdf', { trashed: true }), f('brifing.pdf', { mimeType: FOLDER_MIME })] }));
    expect(h.tur).toBe('yok');
  });

  it('one summary: page count known → "12 → 15"', () => {
    const h = hedefHesapla(girdi({ ozetDosyalari: [f('ozet.pdf')], sayfaSayisi: id => id === 'ozet.pdf' ? 12 : undefined }));
    expect(h).toMatchObject({ tur: 'tek', eskiSayfa: 12 });
    expect(h.hedef?.name).toBe('ozet.pdf');
    expect(h.metin).toBe('ozet.pdf dosyasının sonuna eklenecek: 12 → 15 sayfa');
  });

  it('one summary: page count not known → "(3 sayfa)"; 0 photos → no count', () => {
    expect(hedefHesapla(girdi({ ozetDosyalari: [f('Ozet.PDF')] })).metin).toBe('Ozet.PDF dosyasının sonuna eklenecek (3 sayfa)');
    expect(hedefHesapla(girdi({ ozetDosyalari: [f('ozet.pdf')], yeniSayfa: 0 })).metin).toBe('ozet.pdf dosyasının sonuna eklenecek');
  });

  it('brifing.pdf alone is the one summary', () => {
    expect(hedefHesapla(girdi({ ozetDosyalari: [f('brifing.pdf')] }))).toMatchObject({ tur: 'tek', hedef: { name: 'brifing.pdf' } });
  });

  it('ozet.pdf wins over brifing / sorular (same rule as the reader)', () => {
    const h = hedefHesapla(girdi({ ozetDosyalari: [f('brifing.pdf'), f('ozet.pdf'), f('sorular.pdf')] }));
    expect(h).toMatchObject({ tur: 'tek', hedef: { name: 'ozet.pdf' } });
  });

  describe('several summaries (brifing + sorular)', () => {
    const iki = [f('brifing.pdf'), f('sorular.pdf')];
    const hedef = (o: Partial<HedefGirdi>) => hedefHesapla(girdi({ ozetDosyalari: iki, ...o })).hedef?.name;

    it('lists both, the first by default', () => {
      const h = hedefHesapla(girdi({ ozetDosyalari: iki }));
      expect(h.tur).toBe('secim');
      expect(h.dosyalar.map(x => x.name)).toEqual(['brifing.pdf', 'sorular.pdf']);
      expect(h.hedef?.name).toBe('brifing.pdf');
    });
    it('the file on screen is the default', () => {
      expect(hedef({ acikDosyaId: 'sorular.pdf' })).toBe('sorular.pdf');
      expect(hedef({ acikDosyaId: 'brifing.pdf' })).toBe('brifing.pdf');
    });
    it('another tab open (a file that is no summary) → the first', () => {
      expect(hedef({ acikDosyaId: 'orijinal.pdf' })).toBe('brifing.pdf');
    });
    it('the panel\'s choice wins; an unknown choice is ignored', () => {
      expect(hedef({ acikDosyaId: 'brifing.pdf', seciliId: 'sorular.pdf' })).toBe('sorular.pdf');
      expect(hedef({ acikDosyaId: 'sorular.pdf', seciliId: 'yok.pdf' })).toBe('sorular.pdf');
    });
    it('the text follows the chosen file', () => {
      const h = hedefHesapla(girdi({ ozetDosyalari: iki, seciliId: 'sorular.pdf', sayfaSayisi: id => id === 'sorular.pdf' ? 4 : 9 }));
      expect(h.metin).toBe('sorular.pdf dosyasının sonuna eklenecek: 4 → 7 sayfa');
    });
  });
});

describe('ekleDurumu', () => {
  const d = { ornek: false, hazirSayisi: 2, hazirlaniyor: false };
  it('sample library: off, with a note', () => {
    const e = ekleDurumu({ ...d, ornek: true });
    expect(e.aktif).toBe(false);
    expect(e.aciklama).toMatch(/Örnek kitaplıkta/);
  });
  it('no photos or still preparing: off, no note', () => {
    expect(ekleDurumu({ ...d, hazirSayisi: 0 })).toEqual({ aktif: false, aciklama: null });
    expect(ekleDurumu({ ...d, hazirlaniyor: true })).toEqual({ aktif: false, aciklama: null });
  });
  it('photos ready: on', () => {
    expect(ekleDurumu(d)).toEqual({ aktif: true, aciklama: null });
  });
});

describe('boyutYazi', () => {
  it('KB below 1 MB, MB with a comma above', () => {
    expect(boyutYazi(412 * 1024)).toBe('412 KB');
    expect(boyutYazi(10)).toBe('1 KB');
    expect(boyutYazi(1.25 * 1024 * 1024)).toBe('1,3 MB');
  });
});

describe('renkEtiketi (6.2c)', () => {
  it('says the state and what a tap does', () => {
    expect(renkEtiketi(true, 3)).toBe('3. fotoğraf: renk düzeltiliyor – kapat');
    expect(renkEtiketi(false, 1)).toBe('1. fotoğraf: renk düzeltme kapalı – aç');
  });
});

describe('Temiz yazıya çevir (6.4c-2)', () => {
  const j = { bytes: new Uint8Array([1]), width: 1, height: 1, renkDuzelt: true };
  it('off by default; the record gets the flag only when on', () => {
    expect(TEMIZ_YAZI_VARSAYILAN).toBe(false);
    expect(temizYaziIsareti(j, false)).toBe(j);
    expect('temizYazi' in temizYaziIsareti(j, false)).toBe(false);
    expect(temizYaziIsareti(j, true)).toEqual({ ...j, temizYazi: true });
  });
  it('labels', () => {
    expect(temizEtiketi(true, 2)).toBe('2. fotoğraf: temiz yazıya çevrilecek – kapat');
    expect(temizEtiketi(false, 1)).toBe('1. fotoğraf: temiz yazıya çevrilmeyecek – aç');
  });
});
