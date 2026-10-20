import { describe, expect, it } from 'vitest';
import { bosAd, sonrakiNumara } from './klasorNumarasi';

describe('sonrakiNumara', () => {
  it('the largest + 1, numbers with gaps (01, 03, 07 → 08)', () => {
    expect(sonrakiNumara('konu', ['Unite-01-A/Konu-01-X', 'Unite-01-A/Konu-03-Y', 'Unite-02-B/Konu-07-Z'])).toBe(8);
    expect(sonrakiNumara('unite', ['Unite-01-A/Konu-01-X', 'Unite-02-B/Konu-07-Z', 'Unite-05-C'])).toBe(6);
  });

  it('a Drive folder kitap.json doesn\'t know counts too; case-insensitive; nothing → 1', () => {
    expect(sonrakiNumara('konu', ['Unite-01-A/Konu-02-X', 'konu-11-yarim'])).toBe(12);
    expect(sonrakiNumara('unite', ['UNITE-04-Alt', 'Uebungen', 'kitap.json'])).toBe(5);
    expect(sonrakiNumara('konu', [])).toBe(1);
    expect(sonrakiNumara('unite', ['Konu-09-X'])).toBe(1);
  });
});

describe('bosAd', () => {
  it('klasorAdi with the number; a name there already (any case) → the next number', () => {
    expect(bosAd('konu', 4, 'Graphen & Bäume', [])).toBe('Konu-04-Graphen-Baeume');
    expect(bosAd('unite', 3, 'Neu', ['unite-03-neu', 'Unite-04-Neu'])).toBe('Unite-05-Neu');
  });
});
