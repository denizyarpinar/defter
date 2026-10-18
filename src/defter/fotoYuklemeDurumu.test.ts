import { describe, expect, it } from 'vitest';
import { yuklemeDurumMetni, yuzdeHesapla, type SiradakiEkleme } from './fotoYuklemeDurumu';

// Task 6.2e-2: the status strip while photos go to Drive.

const sirada = (foto: number): SiradakiEkleme => ({ foto, asama: { tur: 'sirada' } });
const hazir = (foto: number): SiradakiEkleme => ({ foto, asama: { tur: 'hazirlaniyor' } });
const yukle = (foto: number, yuzde: number | null): SiradakiEkleme => ({ foto, asama: { tur: 'yukleniyor', yuzde } });

describe('yuzdeHesapla', () => {
  it('whole percent between 0 and 100', () => {
    expect(yuzdeHesapla(0, 1000)).toBe(0);
    expect(yuzdeHesapla(425, 1000)).toBe(42);
    expect(yuzdeHesapla(999, 1000)).toBe(99);
    expect(yuzdeHesapla(1000, 1000)).toBe(100);
    expect(yuzdeHesapla(1200, 1000)).toBe(100);
  });
  it('nothing to send / odd numbers: 0', () => {
    expect(yuzdeHesapla(0, 0)).toBe(0);
    expect(yuzdeHesapla(5, 0)).toBe(0);
    expect(yuzdeHesapla(-1, 10)).toBe(0);
    expect(yuzdeHesapla(Number.NaN, 10)).toBe(0);
  });
});

describe('yuklemeDurumMetni', () => {
  it('nothing going on: null', () => {
    expect(yuklemeDurumMetni([])).toBeNull();
  });
  it('being prepared (checks, pdf-lib)', () => {
    expect(yuklemeDurumMetni([hazir(2)])).toBe('2 fotoğraf ekleniyor…');
  });
  it('uploading: with the percent, or without it (no ?yeniYukleme=1)', () => {
    expect(yuklemeDurumMetni([yukle(2, 42)])).toBe('Fotoğraflar yükleniyor… %42');
    expect(yuklemeDurumMetni([yukle(2, 0)])).toBe('Fotoğraflar yükleniyor… %0');
    expect(yuklemeDurumMetni([yukle(2, null)])).toBe('Fotoğraflar yükleniyor…');
  });
  it('the waiting ones: "sırada", added up', () => {
    expect(yuklemeDurumMetni([yukle(2, 42), sirada(3)])).toBe('Fotoğraflar yükleniyor… %42 · 3 fotoğraf sırada');
    expect(yuklemeDurumMetni([hazir(1), sirada(3), sirada(2)])).toBe('1 fotoğraf ekleniyor… · 5 fotoğraf sırada');
  });
  it('nothing running yet: the first waiting one is about to start (not "sırada")', () => {
    expect(yuklemeDurumMetni([sirada(2)])).toBe('2 fotoğraf ekleniyor…');
    expect(yuklemeDurumMetni([sirada(2), sirada(4)])).toBe('2 fotoğraf ekleniyor… · 4 fotoğraf sırada');
  });
});
