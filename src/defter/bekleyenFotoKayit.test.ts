import { describe, expect, it } from 'vitest';
import {
  acilistaDuzelt, BekleyenFotoHatasi, depoHatasi, GecisHatasi, IDB_YOK, kayitBoyutu, SON_HATA_UZUNLUK,
  toplamBoyut, yeniKayit, yuklemeBasla, yuklemeHata, type YeniKayitGirdisi,
} from './bekleyenFotoKayit';

// Task 5.8e: the pure part of the pending photo store

const T0 = '2026-10-16T10:00:00.000Z';
const T1 = '2026-10-16T10:01:00.000Z';
const T2 = '2026-10-16T10:02:00.000Z';

const girdi = (over: Partial<YeniKayitGirdisi> = {}): YeniKayitGirdisi => ({
  kitapAdi: 'mathe-1', konuKlasorId: 'K1', konuBaslik: 'Aussagenlogik', hedefAd: 'ozet.pdf',
  jpegler: [{ bytes: new Uint8Array([1, 2, 3]), width: 30, height: 40 }, { bytes: new Uint8Array([4, 5]), width: 40, height: 30 }],
  ...over,
});

describe('yeniKayit', () => {
  it('starts waiting, no tries, given islemId and times', () => {
    const k = yeniKayit(girdi({ hedefFileId: 'F1' }), T0, 'is-1');
    expect(k).toMatchObject({ islemId: 'is-1', olusturma: T0, guncelleme: T0, kitapAdi: 'mathe-1', konuKlasorId: 'K1',
      konuBaslik: 'Aussagenlogik', hedefFileId: 'F1', hedefAd: 'ozet.pdf', durum: 'bekliyor', deneme: 0 });
    expect(k.sonHata).toBeUndefined();
    expect(k.jpegler.map(j => [j.width, j.height])).toEqual([[30, 40], [40, 30]]);
  });

  it('no hedefFileId: the key is not there; an islemId is made when none is given', () => {
    const k = yeniKayit(girdi(), T0);
    expect('hedefFileId' in k).toBe(false);
    expect(k.islemId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('copies the bytes (a view into a larger buffer is not stored whole)', () => {
    const big = new Uint8Array(1000).fill(7);
    const view = big.subarray(10, 14);
    const k = yeniKayit(girdi({ jpegler: [{ bytes: view, width: 1, height: 1 }] }), T0, 'x');
    expect(k.jpegler[0].bytes.buffer.byteLength).toBe(4);
    big[10] = 9;
    expect(k.jpegler[0].bytes[0]).toBe(7);
  });

  it('no photos: refused', () => {
    expect(() => yeniKayit(girdi({ jpegler: [] }), T0, 'x')).toThrow();
  });
});

describe('status', () => {
  it('bekliyor → yukleniyor → hata → yukleniyor: tries counted, error kept short', () => {
    const k0 = yeniKayit(girdi(), T0, 'is-1');
    const k1 = yuklemeBasla(k0, T1);
    expect(k1).toMatchObject({ durum: 'yukleniyor', deneme: 1, guncelleme: T1 });
    expect(k0.durum).toBe('bekliyor');   // the old one is not changed
    const k2 = yuklemeHata(k1, 'x'.repeat(500), T2);
    expect(k2.durum).toBe('hata');
    expect(k2.sonHata!.length).toBe(SON_HATA_UZUNLUK);
    expect(k2.sonHata!.endsWith('…')).toBe(true);
    const k3 = yuklemeBasla(k2, T2);
    expect(k3).toMatchObject({ durum: 'yukleniyor', deneme: 2, islemId: 'is-1' });
    expect(yuklemeHata(k3, 'Çevrimdışı', T2).sonHata).toBe('Çevrimdışı');
  });

  it('wrong steps are refused', () => {
    const k0 = yeniKayit(girdi(), T0, 'is-1');
    expect(() => yuklemeHata(k0, 'e', T1)).toThrow(GecisHatasi);
    expect(() => yuklemeBasla(yuklemeBasla(k0, T1), T1)).toThrow(GecisHatasi);
  });

  it('opened again: yukleniyor counts as bekliyor (tries and error kept); others the same', () => {
    const k0 = yeniKayit(girdi(), T0, 'is-1');
    const h = yuklemeHata(yuklemeBasla(k0, T1), 'Ağ', T1);
    const y = yuklemeBasla(h, T2);
    expect(acilistaDuzelt(y)).toMatchObject({ durum: 'bekliyor', deneme: 2, sonHata: 'Ağ' });
    expect(acilistaDuzelt(k0)).toBe(k0);
    expect(acilistaDuzelt(h)).toBe(h);
  });
});

describe('size', () => {
  it('sums the JPEG bytes', () => {
    const a = yeniKayit(girdi(), T0, 'a');
    const b = yeniKayit(girdi({ jpegler: [{ bytes: new Uint8Array(10), width: 1, height: 1 }] }), T0, 'b');
    expect(kayitBoyutu(a)).toBe(5);
    expect(toplamBoyut([a, b])).toBe(15);
    expect(toplamBoyut([])).toBe(0);
  });
});

describe('depoHatasi', () => {
  it('quota, no IndexedDB, other: Turkish messages', () => {
    const kota = depoHatasi(Object.assign(new Error('full'), { name: 'QuotaExceededError' }));
    expect(kota.tur).toBe('kota');
    expect(kota.message).toContain('yer kalmadı');
    expect(depoHatasi(new Error(IDB_YOK)).tur).toBe('idb-yok');
    const d = depoHatasi('?');
    expect(d.tur).toBe('diger');
    expect(d).toBeInstanceOf(BekleyenFotoHatasi);
    expect(depoHatasi(kota)).toBe(kota);
  });
});
