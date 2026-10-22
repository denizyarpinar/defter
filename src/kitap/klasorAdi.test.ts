import { describe, expect, it } from 'vitest';
import { asciiAd, kitapKlasorAdi, klasorAdi } from './klasorAdi';

describe('asciiAd', () => {
  it('German and Turkish letters, case kept', () => {
    expect(asciiAd('Äpfel Öl Übung Straße')).toBe('Aepfel-Oel-Uebung-Strasse');
    expect(asciiAd('Ağaç Işık Şeker İnce çiçek ğüşıöç')).toBe('Agac-Isik-Seker-Ince-cicek-guesioec');
    expect(asciiAd('Değişkenler ve veri tipleri')).toBe('Degiskenler-ve-veri-tipleri');
  });
  it('other accents lose their marks', () => {
    expect(asciiAd('Café Élève naïve')).toBe('Cafe-Eleve-naive');
  });
  it('signs → one dash, none at the ends', () => {
    expect(asciiAd('Werte, Typen & Ausdrücke')).toBe('Werte-Typen-Ausdruecke');
    expect(asciiAd('  --(Logik)--  ')).toBe('Logik');
    expect(asciiAd('1.5 Grenzwerte / Folgen')).toBe('1-5-Grenzwerte-Folgen');
  });
  it('at most 40 characters, no dash at the end', () => {
    const a = asciiAd('Sehr lange Überschrift für eine Vorlesung über Analysis');
    expect(a.length).toBeLessThanOrEqual(40);
    expect(a.endsWith('-')).toBe(false);
    expect(a.startsWith('Sehr-lange-Ueberschrift')).toBe(true);
  });
  it('nothing ASCII left → empty', () => {
    expect(asciiAd('∑ ∫ ★')).toBe('');
  });
});

describe('klasorAdi', () => {
  it('as the existing books (two digits)', () => {
    expect(klasorAdi('unite', 1, 'Temeller')).toBe('Unite-01-Temeller');
    expect(klasorAdi('konu', 3, 'Metotlar')).toBe('Konu-03-Metotlar');
    expect(klasorAdi('konu', 2, 'Werte, Typen, Ausdrücke')).toBe('Konu-02-Werte-Typen-Ausdruecke');
    expect(klasorAdi('konu', 123, 'X')).toBe('Konu-123-X');
  });
  it('no ASCII name → only the number', () => {
    expect(klasorAdi('unite', 4, '∑')).toBe('Unite-04');
  });
});

describe('kitapKlasorAdi', () => {
  it('lower case with dashes', () => {
    expect(kitapKlasorAdi('Mathe 1')).toBe('mathe-1');
    expect(kitapKlasorAdi('Lineer Cebir')).toBe('lineer-cebir');
    expect(kitapKlasorAdi('Programlamaya Giriş')).toBe('programlamaya-giris');
    expect(kitapKlasorAdi('İşletim Sistemleri')).toBe('isletim-sistemleri');
    expect(kitapKlasorAdi('Grundlagen der Größen')).toBe('grundlagen-der-groessen');
  });
  it('empty → "kitap"', () => {
    expect(kitapKlasorAdi('  ')).toBe('kitap');
  });
});
