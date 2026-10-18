import { describe, expect, it } from 'vitest';
import { adAnahtari, adEsle, dosyaAnahtari } from './adEsle';

const oge = (ad: string) => ({ ad, anahtar: dosyaAnahtari(ad) });
const bul = (adlar: string[], q: string) => adEsle(adlar.map(oge), q).map(o => o.ad);

describe('adEsle', () => {
  it('part of a name, no case, umlauts', () => {
    const l = ['Fehleranfällige Systeme.pdf', 'Übung_01.pdf', 'Straße.pdf', 'orijinal.pdf'];
    expect(bul(l, 'fehleranfaellig')).toEqual(['Fehleranfällige Systeme.pdf']);
    expect(bul(l, 'ANFÄLLIG')).toEqual(['Fehleranfällige Systeme.pdf']);
    expect(bul(l, 'uebung')).toEqual(['Übung_01.pdf']);
    expect(bul(l, 'strasse')).toEqual(['Straße.pdf']);
    expect(bul(l, 'straße')).toEqual(['Straße.pdf']);
  });

  it('ı / İ / I are all i', () => {
    expect(bul(['İspat.pdf', 'Kısa.pdf'], 'ispat')).toEqual(['İspat.pdf']);
    expect(bul(['İspat.pdf', 'Kısa.pdf'], 'KISA')).toEqual(['Kısa.pdf']);
  });

  it('".pdf" and "_cozum" are not searched', () => {
    const l = ['Uebung_01.pdf', 'Uebung_01_cozum.pdf', 'cozumler.pdf'];
    expect(bul(l, 'pdf')).toEqual([]);
    expect(bul(l, 'cozum')).toEqual(['cozumler.pdf']);
    expect(bul(l, 'uebung_01')).toEqual(['Uebung_01.pdf', 'Uebung_01_cozum.pdf']);
  });

  it('fewer than 2 letters: nothing', () => {
    expect(bul(['a.pdf', 'ab.pdf'], 'a')).toEqual([]);
    expect(bul(['a.pdf', 'ab.pdf'], ' ')).toEqual([]);
    expect(adAnahtari('x')).toBe('');
  });
});
