import { describe, expect, it } from 'vitest';
import { aranamayanNotu, okunmamisSayisi, baslangicEslesmesi, bosDurum, listeDegisti, onceki, sayacMetni, sonraki, type AramaDurumu } from './aramaDurumu';

const es = (...sayfalar: number[]) => sayfalar.map(sayfa => ({ sayfa }));
const durum = (o: Partial<AramaDurumu>): AramaDurumu => ({ ...bosDurum(), ...o });

describe('sonraki / önceki', () => {
  it('sona gelince başa, baştan sona sarar', () => {
    const d = durum({ eslesmeler: es(1, 2, 5) });
    expect(sonraki({ ...d, gecerli: 0 })).toBe(1);
    expect(sonraki({ ...d, gecerli: 2 })).toBe(0);
    expect(onceki({ ...d, gecerli: 2 })).toBe(1);
    expect(onceki({ ...d, gecerli: 0 })).toBe(2);
  });
  it('tek eşleşmede yerinde kalır', () => {
    const d = durum({ eslesmeler: es(3), gecerli: 0 });
    expect(sonraki(d)).toBe(0);
    expect(onceki(d)).toBe(0);
  });
  it('eşleşme yoksa -1', () => {
    expect(sonraki(bosDurum())).toBe(-1);
    expect(onceki(bosDurum())).toBe(-1);
  });
  it('geçerli yokken: sonraki ilk, önceki son', () => {
    const d = durum({ eslesmeler: es(1, 4), gecerli: -1 });
    expect(sonraki(d)).toBe(0);
    expect(onceki(d)).toBe(1);
  });
});

describe('baslangicEslesmesi', () => {
  const m = es(2, 2, 5, 9);
  it('bulunulan sayfadaki ilk eşleşme', () => expect(baslangicEslesmesi(m, 5)).toBe(2));
  it('bulunulan sayfada yoksa sonraki', () => expect(baslangicEslesmesi(m, 3)).toBe(2));
  it('öncekiler atlanır', () => expect(baslangicEslesmesi(m, 0)).toBe(0));
  it('sonrasında yoksa ilki', () => expect(baslangicEslesmesi(m, 10)).toBe(0));
  it('boş liste', () => expect(baslangicEslesmesi([], 3)).toBe(-1));
});

describe('listeDegisti', () => {
  it('aynı sayfada eşleşme varsa o sayfanın ilki', () => expect(listeDegisti(4, es(1, 4, 4, 8), 0)).toBe(1));
  it('yoksa en yakın sayfa', () => {
    expect(listeDegisti(5, es(1, 4, 9), 0)).toBe(1);
    expect(listeDegisti(8, es(1, 4, 9), 0)).toBe(2);
  });
  it('eşit uzaklıkta sonraki taraf', () => expect(listeDegisti(5, es(3, 7), 0)).toBe(1));
  it('boş liste', () => expect(listeDegisti(5, [], 0)).toBe(-1));
  it('eski geçerli yoksa yeni sorgu gibi (bulunulan sayfadan)', () => expect(listeDegisti(null, es(1, 4, 9), 5)).toBe(2));
});

describe('sayaç ve not', () => {
  it('sorgu yoksa boş', () => expect(sayacMetni(bosDurum(), false)).toBe(''));
  it('çıkarma sürerken …', () => expect(sayacMetni(durum({ hazirlaniyor: true }), true)).toBe('…'));
  it('sonuç yoksa bulunamadı', () => expect(sayacMetni(bosDurum(), true)).toBe('bulunamadı'));
  it('metin hiç okunamadıysa metin okunamadı', () => expect(sayacMetni(durum({ okunamadi: true }), true)).toBe('metin okunamadı'));
  it('3/12', () => expect(sayacMetni(durum({ eslesmeler: es(...Array(12).fill(1)), gecerli: 2 }), true)).toBe('3/12'));
  it('metinsiz sayfa notu (uzun ve kısa)', () => {
    expect(aranamayanNotu(durum({ aranamayan: 3 }), true)).toEqual({ uzun: '3 sayfa fotoğraf, aranamadı', kisa: '3 foto' });
    expect(aranamayanNotu(durum({ aranamayan: 0 }), true)).toBeNull();
    expect(aranamayanNotu(durum({ aranamayan: 3, hazirlaniyor: true }), true)).toBeNull();
    expect(aranamayanNotu(durum({ aranamayan: 3 }), false)).toBeNull();
  });
});

describe('6.4c-3: the note with the handwriting searched', () => {
  it('only the pages not read yet', () => {
    expect(aranamayanNotu(durum({ aranamayan: 5, okunmamis: 2 }), true)).toEqual({ uzun: '2 sayfa henüz okunmadı', kisa: '2 okunmadı' });
  });
  it('every page read: no note', () => {
    expect(aranamayanNotu(durum({ aranamayan: 5, okunmamis: 0 }), true)).toBeNull();
  });
  it('not searched (okunmamis null): the old note', () => {
    expect(bosDurum().okunmamis).toBeNull();
    expect(aranamayanNotu(durum({ aranamayan: 3 }), true)).toEqual({ uzun: '3 sayfa fotoğraf, aranamadı', kisa: '3 foto' });
  });
  it('while reading / no query: nothing', () => {
    expect(aranamayanNotu(durum({ aranamayan: 3, okunmamis: 3, hazirlaniyor: true }), true)).toBeNull();
    expect(aranamayanNotu(durum({ aranamayan: 3, okunmamis: 3 }), false)).toBeNull();
  });
});

// 6.4c-4: "henüz okunmadı" only for an account that can read
describe('okunmamisSayisi', () => {
  it('okuma izni var: okunmamış sayfa sayısı', () => {
    expect(okunmamisSayisi(5, 2, true)).toBe(3);
    expect(okunmamisSayisi(2, 3, true)).toBe(0);
  });
  it('izin yok ya da el yazısı aranmadı: null (eski not)', () => {
    expect(okunmamisSayisi(5, 0, false)).toBeNull();
    expect(okunmamisSayisi(5, null, true)).toBeNull();
  });
});
