import { describe, expect, it } from 'vitest';
import { JPEG_KALITE, MAX_CANVAS_PIKSEL, MAX_KENAR } from './ayarlar';
import { GorselHatasi, hataMesaji, hataTuru, hedefBoyut } from './gorselHesap';

describe('hedefBoyut', () => {
  it('uses the temporary defaults', () => {
    expect(MAX_KENAR).toBe(2000);
    expect(JPEG_KALITE).toBe(0.85);
    expect(MAX_CANVAS_PIKSEL).toBe(16_000_000);
  });

  it('landscape, portrait and square photos get a 2000 px long edge', () => {
    expect(hedefBoyut(4032, 3024)).toEqual({ width: 2000, height: 1500 });
    expect(hedefBoyut(3024, 4032)).toEqual({ width: 1500, height: 2000 });
    expect(hedefBoyut(4000, 4000)).toEqual({ width: 2000, height: 2000 });
    expect(hedefBoyut(8064, 6048)).toEqual({ width: 2000, height: 1500 });   // 48 MP
  });

  it('never enlarges', () => {
    expect(hedefBoyut(800, 600)).toEqual({ width: 800, height: 600 });
    expect(hedefBoyut(2000, 1000)).toEqual({ width: 2000, height: 1000 });
    expect(hedefBoyut(1, 1)).toEqual({ width: 1, height: 1 });
  });

  it('very long images keep at least 1 px', () => {
    expect(hedefBoyut(12000, 500)).toEqual({ width: 2000, height: 83 });
    expect(hedefBoyut(1, 5000)).toEqual({ width: 1, height: 2000 });
  });

  it('stays under the pixel limit', () => {
    const r = hedefBoyut(3000, 3000, 2000, 1_000_000);
    expect(r.width * r.height).toBeLessThanOrEqual(1_000_000);
    expect(r.width).toBe(r.height);
    const s = hedefBoyut(999, 333, 5000, 100_000);
    expect(s.width * s.height).toBeLessThanOrEqual(100_000);
  });

  it('rejects broken sizes', () => {
    expect(() => hedefBoyut(0, 100)).toThrow();
    expect(() => hedefBoyut(100, -1)).toThrow();
    expect(() => hedefBoyut(NaN, 100)).toThrow();
    expect(() => hedefBoyut(Infinity, 100)).toThrow();
  });
});

describe('hataTuru', () => {
  const f = (name: string, type: string, size = 1000) => ({ name, type, size });

  it('recognises HEIC by type or only by extension', () => {
    expect(hataTuru(f('IMG_1.HEIC', 'image/heic'))).toBe('heic');
    expect(hataTuru(f('a.heif', 'image/heif'))).toBe('heic');
    expect(hataTuru(f('IMG_2.heic', ''))).toBe('heic');
  });

  it('other cases', () => {
    expect(hataTuru(f('ders.pdf', 'application/pdf'))).toBe('resimDegil');
    expect(hataTuru(f('bos.jpg', 'image/jpeg', 0))).toBe('bos');
    expect(hataTuru(f('bozuk.jpg', 'image/jpeg'))).toBe('acilamadi');
    expect(hataTuru(f('dosya', ''))).toBe('acilamadi');
  });

  it('messages are Turkish and say what to do', () => {
    expect(hataMesaji('heic')).toBe('Bu fotoğraf açılamadı. Fotoğraflar uygulamasından paylaşmayı ya da JPEG seçmeyi dene.');
    expect(hataMesaji('acilamadi')).toBe(hataMesaji('heic'));
    expect(hataMesaji('resimDegil')).toMatch(/fotoğraf değil/);
    expect(hataMesaji('bos')).toMatch(/boş/);
    const e = new GorselHatasi('bos');
    expect(e).toBeInstanceOf(Error);
    expect(e.tur).toBe('bos');
    expect(e.message).toBe(hataMesaji('bos'));
  });
});
