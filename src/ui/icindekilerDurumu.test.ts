import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseBook } from '../model/parse';
import { bosDurumMetni, duzenleKarari, kayitMetni, SiraBirlestirici } from './icindekilerDurumu';

describe('duzenleKarari', () => {
  const g = { drive: true, hasJson: true, surum: 2, kilitAcik: true };
  it('sample library: no button; surum 1 / no kitap.json: opens, only the book to the trash; locked: opens, writes nothing', () => {
    expect(duzenleKarari({ ...g, drive: false })).toEqual({ goster: false, acik: false, yazar: false, kitapCop: false, not: null });
    expect(duzenleKarari({ ...g, surum: 1 })).toMatchObject({ goster: true, acik: true, yazar: false, kitapCop: true, not: expect.stringMatching(/surum 1/) });
    expect(duzenleKarari({ ...g, hasJson: false })).toMatchObject({ goster: true, acik: true, yazar: false, kitapCop: true, not: expect.stringMatching(/kitap\.json yok/) });
    // 6.K5b: locked → the book's trash button is grey too
    expect(duzenleKarari({ ...g, surum: 1, kilitAcik: false })).toMatchObject({ kitapCop: false, not: expect.stringMatching(/\?kurulum=1/) });
    expect(duzenleKarari({ ...g, kilitAcik: false })).toMatchObject({ goster: true, acik: true, yazar: false, kitapCop: false, not: expect.stringMatching(/\?kurulum=1/) });
    expect(duzenleKarari(g)).toEqual({ goster: true, acik: true, yazar: true, kitapCop: true, not: null });
  });
});

describe('6.K5b-3: a book without topics', () => {
  const bos = parseBook('deneme-9', { surum: 2, baslik: 'deneme-9', uniteler: [] });
  const uniteli = parseBook('d', { surum: 2, baslik: 'd', uniteler: [{ baslik: 'Graphen', klasor: 'Unite-01-Graphen', konular: [] }] });
  const konulu = parseBook('d', { surum: 2, baslik: 'd', uniteler: [{ baslik: 'Graphen', konular: [{ baslik: 'Bäume', klasor: 'Unite-01-Graphen/Konu-01-Baeume', durum: 'okunmadi' }] }] });
  it('the edit mode: the same rules as a book with topics (+ Ünite writes with ?kurulum=1)', () => {
    const g = { drive: true, hasJson: true, surum: bos.surum, kilitAcik: true };
    expect(duzenleKarari(g)).toEqual({ goster: true, acik: true, yazar: true, kitapCop: true, not: null });
    expect(duzenleKarari({ ...g, kilitAcik: false })).toMatchObject({ goster: true, yazar: false, kitapCop: false, not: expect.stringMatching(/\?kurulum=1/) });
    expect(duzenleKarari({ ...g, hasJson: false })).toMatchObject({ goster: true, yazar: false, kitapCop: true });
    expect(duzenleKarari({ ...g, drive: false }).goster).toBe(false);
  });
  it('bosDurumMetni: what the empty reader says', () => {
    expect(bosDurumMetni(bos, true)).toBe('Bu kitapta henüz konu yok. ＋ Ünite ile başla.');
    expect(bosDurumMetni(uniteli, true)).toBe('Bu kitapta henüz konu yok. ＋ Konu ile başla.');
    expect(bosDurumMetni(konulu, true)).toBe('Açmak için İçindekiler\'den bir konu seç.');
    expect(bosDurumMetni(parseBook('eski', { surum: 1, baslik: 'eski', bolumler: [] }), true)).toBe('Bu kitapta henüz konu yok.');
    expect(bosDurumMetni(parseBook('json-yok', null), false)).toMatch(/kitap\.json yok/);
  });
});

describe('kayitMetni', () => {
  it('the status line', () => {
    expect(kayitMetni({ tur: 'bos' })).toBeNull();
    expect(kayitMetni({ tur: 'kaydediliyor', ekleme: true })).toBe('Ekleniyor…');
    expect(kayitMetni({ tur: 'kaydediliyor', ekleme: false })).toBe('Kaydediliyor…');
    expect(kayitMetni({ tur: 'kaydediliyor', ekleme: false, cop: 'at' })).toBe('Çöpe atılıyor…');
    expect(kayitMetni({ tur: 'kaydediliyor', ekleme: false, cop: 'geri' })).toBe('Geri alınıyor…');
    expect(kayitMetni({ tur: 'kaydedildi' })).toBe('Kaydedildi');
    expect(kayitMetni({ tur: 'hata', mesaj: 'Olmadı.', izin: false })).toBe('Olmadı.');
  });
});

describe('SiraBirlestirici', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('taps within 800 ms → one send (per scope); hemen sends what waits', () => {
    vi.useFakeTimers();
    const gonderilen: string[] = [];
    const s = new SiraBirlestirici(800);
    s.bekle('u', () => gonderilen.push('u1'));
    vi.advanceTimersByTime(500);
    s.bekle('u', () => gonderilen.push('u2'));
    s.bekle('k', () => gonderilen.push('k1'));
    vi.advanceTimersByTime(799);
    expect(gonderilen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(gonderilen).toEqual(['u2', 'k1']);
    expect(s.bosMu).toBe(true);
    s.bekle('u', () => gonderilen.push('u3'));
    s.hemen();
    expect(gonderilen).toEqual(['u2', 'k1', 'u3']);
    vi.advanceTimersByTime(2000);
    expect(gonderilen).toHaveLength(3);
  });
});
