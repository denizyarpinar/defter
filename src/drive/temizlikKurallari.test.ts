import { describe, expect, it } from 'vitest';
import { temizlikSec, testMi, type Aday } from './temizlikKurallari';

const K1 = 'Kitaplık/kitaplar/programmiergrundlagen/Unite-01-Logik/Konu-01-Aussagenlogik';
const dosya = (yol: string, appProperties?: Record<string, string>): Aday => ({ yol, klasor: false, appProperties });

describe('testMi', () => {
  it.each([
    'Robotics-test-3.pdf', 'tahta.pdf', 'tahta (1).pdf', 'defter.pdf', 'kucuk-foto.pdf', 'A-test2.pdf', 'B-test.pdf',
    'klavye-test.pdf', 'ipad-foto.pdf', 'coklu-test.pdf', 'coklu–pdf.pdf', 'IMG_1234.pdf', 'DFKI_Access_2025_Rules.pdf',
    'tutorial01 (1).pdf', 'Kopie von tutorial01.pdf', 'ders-notu.pdf', 'ders-sunumu.pdf', 'derso-sunumu.pdf',
    'ipad-not.pdf', 'kilitsiz.pdf', 'Lecture 01 Introduction to Robotics.pdf',
  ])('Konu-01 test name %s → kesin', name => {
    expect(testMi(dosya(`${K1}/${name}`))?.guven).toBe('kesin');
    expect(testMi(dosya(`${K1}/Uebungen/${name}`))?.guven).toBe('kesin');
  });

  it('Konu-01: other names only with defterIslem', () => {
    expect(testMi(dosya(`${K1}/Oedevler/blatt1.pdf`))).toBeNull();
    expect(testMi(dosya(`${K1}/Oedevler/blatt1.pdf`, { defter: '1', defterIslem: 'x' }))?.guven).toBe('kesin');
    expect(testMi(dosya(`${K1}/Uebungen/tutorial01.pdf`))).toBeNull();
    expect(testMi(dosya(`${K1}/defterli-not.pdf`))).toBeNull();
  });

  it('never: orijinal, ozet, brifing, sorular, kitap.json, kitaplik.json, backups (even with defterIslem)', () => {
    for (const n of ['orijinal.pdf', 'ozet.pdf', 'OZET.pdf', 'brifing.pdf', 'sorular.pdf'])
      expect(testMi(dosya(`${K1}/${n}`, { defterIslem: 'x' }))).toBeNull();
    for (const y of ['Kitaplık/kitaplik.json', 'Kitaplık/kitaplar/programmiergrundlagen/kitap.json', 'Kitaplık/kitaplar/programmiergrundlagen/kitap_v1_yedek.json', 'Kitaplık/kitaplar/programmiergrundlagen/kitap_v2_yedek.json'])
      expect(testMi(dosya(y))).toBeNull();
    expect(testMi(dosya('Kitaplık/kitaplar/x/Unite-01/Konu-98/ozet.pdf', { defterIslem: 'x' }))).toBeNull();
  });

  it('inside the two test folders the protected names are listed (kesin, test klasörünün içi)', () => {
    for (const y of [
      'Kitaplık/kitaplar/x/Unite-01/Konu-99-Test-5.7/ozet.pdf',
      'Kitaplık/kitaplar/x/Unite-01/Konu-99-Test-5.7/Uebungen/orijinal.pdf',
      'Kitaplık/kitaplar/x/Unite-01/Konu-99-Test-5.7/kitap.json',
      '(Drive kökü)/Defter-ceviri-deneme/ozet.pdf',
      '(Drive kökü)/Defter-ceviri-deneme/sorular.pdf',
    ]) expect(testMi(dosya(y))).toEqual({ neden: 'test klasörünün içi', guven: 'kesin' });
    expect(testMi(dosya('Kitaplık/kitaplar/x/Unite-01/Konu-99-Test-5.7b/ozet.pdf'))).toBeNull();
    expect(testMi(dosya('(Drive kökü)/ozet.pdf'))).toBeNull();
  });

  it('Konu-99-Test-5.7: the folder and everything in it', () => {
    const k = 'Kitaplık/kitaplar/programmiergrundlagen/Unite-01-Logik/Konu-99-Test-5.7';
    expect(testMi({ yol: k, klasor: true })?.guven).toBe('kesin');
    expect(testMi(dosya(`${k}/Uebungen/a.pdf`))?.guven).toBe('kesin');
    expect(testMi(dosya(`${k}9/a.pdf`))).toBeNull();
  });

  it('book root: deneme-5.5 kesin, 01_Programmiergrundlagen emin değilim, others nothing', () => {
    const b = 'Kitaplık/kitaplar/programmiergrundlagen';
    expect(testMi(dosya(`${b}/deneme-5.5.pdf`))?.guven).toBe('kesin');
    expect(testMi(dosya(`${b}/01_Programmiergrundlagen.pdf`))?.guven).toBe('emin değilim');
    expect(testMi(dosya(`${b}/notlar.pdf`))).toBeNull();
  });

  it('Defter-ceviri-deneme in the Drive root: the folder and its files', () => {
    expect(testMi({ yol: '(Drive kökü)/Defter-ceviri-deneme', klasor: true })?.guven).toBe('kesin');
    expect(testMi(dosya('(Drive kökü)/Defter-ceviri-deneme/a.pdf'))?.guven).toBe('kesin');
    expect(testMi(dosya('(Drive kökü)/Defter-ceviri-deneme2/a.pdf'))).toBeNull();
  });

  it('defterIslem outside Konu-01 → emin değilim; other folders are not listed', () => {
    expect(testMi(dosya('Kitaplık/kitaplar/mat-1/Unite-01/Konu-01/Uebungen/b.pdf', { defter: '1', defterIslem: 'y' }))?.guven).toBe('emin değilim');
    expect(testMi(dosya('Kitaplık/kitaplar/mat-1/Unite-01/Konu-01/Uebungen/b.pdf', { defter: '1' }))).toBeNull();
    expect(testMi({ yol: `${K1}/Uebungen`, klasor: true })).toBeNull();
  });
});

describe('temizlikSec', () => {
  it('adds X_cozum.pdf of a listed X.pdf, in the same folder only', () => {
    const r = temizlikSec([
      dosya(`${K1}/Uebungen/blatt.pdf`, { defterIslem: 'a' }),
      dosya(`${K1}/Uebungen/blatt_cozum.pdf`),
      dosya(`${K1}/Oedevler/blatt_cozum.pdf`),
      dosya(`${K1}/Uebungen/echt.pdf`),
      dosya(`${K1}/Uebungen/echt_cozum.pdf`),
      dosya(`${K1}/Uebungen/tahta_cozum.pdf`),
    ]);
    expect(r.map(s => [s.aday.yol.slice(K1.length + 1), s.guven])).toEqual([
      ['Uebungen/blatt_cozum.pdf', 'kesin'],
      ['Uebungen/blatt.pdf', 'kesin'],
      ['Uebungen/tahta_cozum.pdf', 'kesin'],
    ]);
    expect(r[0].neden).toBe('blatt.pdf dosyasının çözümü');
  });
});
