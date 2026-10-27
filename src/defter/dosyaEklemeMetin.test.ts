import { describe, expect, it } from 'vitest';
import { SessionExpired } from '../drive/drive';
import { OfisCevrilemedi, OfisCokBuyuk, OfisDesteklenmiyor, OfisIptal, OfisYuklenemedi } from '../drive/ofisCevir';
import { DosyaYazmaYok, YerDisi, YetkiYok } from '../drive/pdfOlustur';
import { MAX_DOSYA_MB } from './ayarlar';
import {
  BOZUK_PDF_METIN, CEVIRI_BEKLENMEYEN_METIN, DESTEKLENMEYEN_METIN, boyutMetni, heicAcilamadiMetni, ofisHataMetni, ofisMetni, turMetni
} from './dosyaEklemeMetin';
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
    expect(turMetni({ tur: 'desteklenmeyen' })).toBe(DESTEKLENMEYEN_METIN());
    expect(turMetni({ tur: 'desteklenmeyen', alt: 'bozukPdf' })).toBe('Bu PDF açılamıyor, dosya bozuk olabilir.');
  });

  it('a .pdf with random bytes → bozukPdf and its text', () => {
    const s = dosyaTuru('ders.pdf', 'application/pdf', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]));
    expect(s).toEqual({ tur: 'desteklenmeyen', alt: 'bozukPdf' });
    expect(turMetni(s)).toBe(BOZUK_PDF_METIN());
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

describe('ofisHataMetni (6.1c)', () => {
  it('cancelled: silent', () => {
    expect(ofisHataMetni(new OfisIptal())).toBeNull();
  });
  it('Drive could not convert / upload failed: its own text + "Tekrar çevir"', () => {
    const c = new OfisCevrilemedi(400);
    expect(ofisHataMetni(c)).toEqual({ metin: c.message, tekrarCevir: true });
    expect(c.message).toMatch(/PDF olarak kaydet/);
    const y = new OfisYuklenemedi(503);
    expect(ofisHataMetni(y)).toEqual({ metin: y.message, tekrarCevir: true });
    expect(y.message).toMatch(/tekrar dene/);
    expect(ofisHataMetni(new SessionExpired())?.tekrarCevir).toBe(true);
  });
  it('Google permission (scope) not enough: no "Tekrar çevir" (6.1e); no connection / Drive error: "Tekrar çevir"', () => {
    const izin = new OfisYuklenemedi(403, 'izin');
    expect(izin.message).toMatch(/izni/);
    expect(ofisHataMetni(izin)).toEqual({ metin: izin.message, tekrarCevir: false });
    expect(new OfisYuklenemedi().neden).toBe('ag');
    expect(new OfisYuklenemedi(503).neden).toBe('sunucu');
    expect(ofisHataMetni(new OfisYuklenemedi())?.tekrarCevir).toBe(true);
    expect(ofisHataMetni(new OfisYuklenemedi(undefined, 'sunucu'))?.tekrarCevir).toBe(true);
  });
  it('too big: no "Tekrar çevir", says save as PDF', () => {
    const r = ofisHataMetni(new OfisCokBuyuk());
    expect(r).toEqual({ metin: new OfisCokBuyuk().message, tekrarCevir: false });
    expect(r!.metin).toMatch(/PDF olarak kaydedip ekle/);
  });
  it('things a new try cannot fix: their text, no "Tekrar çevir"', () => {
    for (const e of [new OfisDesteklenmiyor('a.key'), new DosyaYazmaYok(), new YerDisi(), new YetkiYok()]) {
      expect(ofisHataMetni(e)).toEqual({ metin: e.message, tekrarCevir: false });
    }
  });
  it('no connection (fetch TypeError): the upload text; anything else: a Turkish fallback', () => {
    expect(ofisHataMetni(new TypeError('Failed to fetch'))).toEqual({ metin: new OfisYuklenemedi().message, tekrarCevir: true });
    expect(ofisHataMetni(new Error('boom'))).toEqual({ metin: CEVIRI_BEKLENMEYEN_METIN(), tekrarCevir: true });
    expect(ofisHataMetni('x')).toEqual({ metin: CEVIRI_BEKLENMEYEN_METIN(), tekrarCevir: true });
  });
});
