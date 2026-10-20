import { afterEach, describe, expect, it, vi } from 'vitest';
import { duzenleKarari, kayitMetni, SiraBirlestirici } from './icindekilerDurumu';

describe('duzenleKarari', () => {
  const g = { drive: true, hasJson: true, surum: 2, kilitAcik: true };
  it('sample library: no button; surum 1 / no kitap.json: grey with a note; locked: opens, writes nothing', () => {
    expect(duzenleKarari({ ...g, drive: false })).toEqual({ goster: false, acik: false, yazar: false, not: null });
    expect(duzenleKarari({ ...g, surum: 1 })).toMatchObject({ goster: true, acik: false, yazar: false, not: expect.stringMatching(/surum 1/) });
    expect(duzenleKarari({ ...g, hasJson: false })).toMatchObject({ goster: true, acik: false, not: expect.stringMatching(/kitap\.json yok/) });
    expect(duzenleKarari({ ...g, kilitAcik: false })).toMatchObject({ goster: true, acik: true, yazar: false, not: expect.stringMatching(/\?kurulum=1/) });
    expect(duzenleKarari(g)).toEqual({ goster: true, acik: true, yazar: true, not: null });
  });
});

describe('kayitMetni', () => {
  it('the status line', () => {
    expect(kayitMetni({ tur: 'bos' })).toBeNull();
    expect(kayitMetni({ tur: 'kaydediliyor', ekleme: true })).toBe('Ekleniyor…');
    expect(kayitMetni({ tur: 'kaydediliyor', ekleme: false })).toBe('Kaydediliyor…');
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
