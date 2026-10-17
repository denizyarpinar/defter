import { describe, expect, it } from 'vitest';
import { MAX_DOSYA_MB } from './ayarlar';
import { BOZUK_PDF_METIN, DESTEKLENMEYEN_METIN, boyutMetni, heicAcilamadiMetni, ofisMetni, turMetni } from './dosyaEklemeMetin';
import { dosyaTuru } from './dosyaTuru';
import { hataMesaji } from './gorselHesap';

describe('ofisMetni', () => {
  it('names the program', () => {
    expect(ofisMetni('word')).toBe('Word dosyaları eklenemiyor. Dosyayı PDF olarak kaydedip ekle.');
    expect(ofisMetni('powerpoint')).toBe('PowerPoint dosyaları eklenemiyor. Dosyayı PDF olarak kaydedip ekle.');
    expect(ofisMetni('keynote')).toBe('Keynote dosyaları eklenemiyor. Dosyayı PDF olarak kaydedip ekle.');
    expect(ofisMetni('pages')).toBe('Pages dosyaları eklenemiyor. Dosyayı PDF olarak kaydedip ekle.');
  });

  it('unknown or missing alt → Word/PowerPoint', () => {
    expect(ofisMetni()).toBe('Word/PowerPoint dosyaları eklenemiyor. Dosyayı PDF olarak kaydedip ekle.');
    expect(ofisMetni('excel')).toBe(ofisMetni());
  });
});

describe('turMetni', () => {
  it('pdf and images can be added: no text', () => {
    expect(turMetni({ tur: 'pdf' })).toBeNull();
    expect(turMetni({ tur: 'pdf', alt: 'onEkli' })).toBeNull();
    expect(turMetni({ tur: 'gorsel', alt: 'heic' })).toBeNull();
  });

  it('office, unsupported, broken PDF', () => {
    expect(turMetni({ tur: 'ofis', alt: 'powerpoint' })).toBe(ofisMetni('powerpoint'));
    expect(turMetni({ tur: 'desteklenmeyen' })).toBe('Bu dosya türü desteklenmiyor. PDF ya da görsel (JPEG, PNG) seç.');
    expect(turMetni({ tur: 'desteklenmeyen' })).toBe(DESTEKLENMEYEN_METIN);
    expect(turMetni({ tur: 'desteklenmeyen', alt: 'bozukPdf' })).toBe('Bu PDF açılamıyor, dosya bozuk olabilir.');
  });

  it('a .pdf with random bytes → bozukPdf and its text', () => {
    const s = dosyaTuru('ders.pdf', 'application/pdf', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]));
    expect(s).toEqual({ tur: 'desteklenmeyen', alt: 'bozukPdf' });
    expect(turMetni(s)).toBe(BOZUK_PDF_METIN);
  });

  it('HEIC the browser can\'t open: the photo flow\'s text', () => {
    expect(heicAcilamadiMetni()).toBe(hataMesaji('heic'));
  });
});

describe('boyutMetni', () => {
  it('uses the temporary default', () => {
    expect(MAX_DOSYA_MB).toBe(50);
  });

  it('up to the limit: null', () => {
    expect(boyutMetni(0)).toBeNull();
    expect(boyutMetni(12_345_678)).toBeNull();
    expect(boyutMetni(50_000_000)).toBeNull();
  });

  it('over the limit: the size, rounded up, never equal to the limit', () => {
    expect(boyutMetni(50_000_001)).toBe('Dosya çok büyük: 50,1 MB, sınır 50 MB');
    expect(boyutMetni(62_400_000)).toBe('Dosya çok büyük: 62,4 MB, sınır 50 MB');
    expect(boyutMetni(120_000_000)).toBe('Dosya çok büyük: 120 MB, sınır 50 MB');
  });

  it('another limit', () => {
    expect(boyutMetni(3_000_000, 2.5)).toBe('Dosya çok büyük: 3 MB, sınır 2,5 MB');
    expect(boyutMetni(2_000_000, 2.5)).toBeNull();
  });
});
