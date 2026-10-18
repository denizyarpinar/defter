import { describe, expect, it } from 'vitest';
import { metinAra, metinsiz, parcaDikdortgeni, sayfaHazirla, sayfaKutusuna, sorguHazirla, type MetinParcasi, type SayfaMetni } from './metinAra';

// Task 6.3b: normalizing, matching and the rectangles of the search in the open PDF

const A4 = { transform: [1, 0, 0, -1, 0, 842], width: 595, height: 842 };   // pdf.js viewport, rotation 0
// item at (x, y), 10 pt font, every character 5 pt wide
const parca = (str: string, x = 0, y = 700, hasEOL = false): MetinParcasi => ({ str, transform: [10, 0, 0, 10, x, y], width: str.length * 5, height: 10, hasEOL });
const sayfa = (...parcalar: MetinParcasi[]): SayfaMetni => ({ parcalar, gorunum: A4 });
const ara = (q: string, ...parcalar: MetinParcasi[]) => metinAra([{ sayfa: 0, hazir: sayfaHazirla(sayfa(...parcalar)) }], q);
const metin = (...parcalar: MetinParcasi[]) => sayfaHazirla(sayfa(...parcalar)).metin;

describe('normalizing', () => {
  it('small letters, one space, ligatures', () => {
    expect(metin(parca('  Die   Aussage\tist '), parca('ﬁnal'))).toBe('die aussage ist final');
    expect(sorguHazirla('  Aus   Sage ')).toBe('aus sage');
  });

  it('umlauts and ß as ae oe ue ss, also capitals and combining marks', () => {
    expect(metin(parca('Äpfel Öl Übung Straße'))).toBe('aepfel oel uebung strasse');
    expect(metin(parca('Müller'))).toBe('mueller');
    expect(ara('fehleranfällig', parca('Fehleranfaellig'))).toHaveLength(1);
    expect(ara('Strasse', parca('Straße'))).toHaveLength(1);
  });

  it('Turkish ı / İ / i / I match each other', () => {
    expect(metin(parca('IŞIK ışık İzmir izmir'))).toBe('işik işik izmir izmir');
    expect(ara('ışık', parca('IŞIK'))).toHaveLength(1);
    expect(ara('İzmir', parca('izmir'))).toHaveLength(1);
    expect(ara('Bilgi', parca('BİLGİ'))).toHaveLength(1);
  });

  it('a soft hyphen is left out', () => {
    expect(metin(parca('Aus­sage'))).toBe('aussage');
  });
});

describe('matching', () => {
  it('empty and one-letter queries find nothing; two letters do', () => {
    expect(ara('', parca('Aussage'))).toEqual([]);
    expect(ara('   ', parca('Aussage'))).toEqual([]);
    expect(ara('a', parca('Aussage'))).toEqual([]);
    expect(sorguHazirla('a')).toBeNull();
    expect(ara('ss', parca('Aussage'))).toHaveLength(1);
  });

  it('part of a word is found, matches do not overlap, every page', () => {
    const p = sayfaHazirla(sayfa(parca('Aussagenlogik, Aussage')));
    const r = metinAra([{ sayfa: 3, hazir: p }, { sayfa: 7, hazir: p }], 'aussage');
    expect(r.map(m => m.sayfa)).toEqual([3, 3, 7, 7]);
    expect(ara('aa', parca('aaaa'))).toHaveLength(2);
  });

  it('a word split between two items', () => {
    const r = ara('Fehler', parca('Feh', 0), parca('ler', 15), parca(' gefunden', 30));
    expect(r).toHaveLength(1);
    expect(r[0].parcaIndeksleri).toEqual([0, 1]);
    expect(r[0].baslangic).toEqual({ parca: 0, harf: 0 });
    expect(r[0].bitis).toEqual({ parca: 1, harf: 3 });
    expect(r[0].dikdortgenler).toHaveLength(2);
  });

  it('a hyphenated word at the line end: "Fehler-" + "anfällig"', () => {
    const r = ara('fehleranfällig', parca('sehr Fehler-', 0, 700, true), parca('anfällig ist', 0, 688));
    expect(r).toHaveLength(1);
    expect(r[0].parcaIndeksleri).toEqual([0, 1]);
    expect(r[0].baslangic).toEqual({ parca: 0, harf: 5 });
    expect(r[0].bitis).toEqual({ parca: 1, harf: 8 });
    // the line end in its own empty item, as pdf.js often gives it
    expect(ara('fehleranfällig', parca('Fehler-'), { ...parca(''), hasEOL: true }, parca('anfällig'))).toHaveLength(1);
  });

  it('a line end without a hyphen is a space; "Hin-" + "Und" stays two words', () => {
    expect(metin(parca('Aussage', 0, 700, true), parca('Logik'))).toBe('aussage logik');
    expect(metin(parca('Hin-', 0, 700, true), parca('Und'))).toBe('hin- und');
    expect(ara('hinund', parca('Hin-', 0, 700, true), parca('Und'))).toEqual([]);
  });

  it('a page without text (a photo)', () => {
    expect(metinsiz(sayfa())).toBe(true);
    expect(metinsiz(sayfa(parca(' '), parca('')))).toBe(true);
    expect(metinsiz(sayfa(parca('a')))).toBe(false);
  });
});

describe('rectangles', () => {
  it('characters of an item in PDF user space (rotation 0)', () => {
    const r = parcaDikdortgeni(parca('Aussage', 100, 700), 2, 5);
    expect(r.x).toBeCloseTo(110); expect(r.w).toBeCloseTo(15);
    expect(r.y).toBeCloseTo(698); expect(r.h).toBeCloseTo(10);
  });

  it('a match → its rectangle → fractions of the page box (rotation 0, CropBox at 0 0)', () => {
    const [m] = ara('sag', parca('Aussage', 100, 700));
    const k = sayfaKutusuna(m.dikdortgenler[0], A4);
    expect(k.x).toBeCloseTo(115 / 595); expect(k.w).toBeCloseTo(15 / 595);
    expect(k.y).toBeCloseTo((842 - 708) / 842); expect(k.h).toBeCloseTo(10 / 842);
  });

  it('rotation 0 with a CropBox offset', () => {
    // viewBox [50 100 545 742]: pdf.js transform [1, 0, 0, -1, -x0, y1]
    const g = { transform: [1, 0, 0, -1, -50, 742], width: 495, height: 642 };
    const k = sayfaKutusuna({ x: 60, y: 690, w: 20, h: 10 }, g);
    expect(k.x).toBeCloseTo(10 / 495); expect(k.y).toBeCloseTo(42 / 642);
    expect(k.w).toBeCloseTo(20 / 495); expect(k.h).toBeCloseTo(10 / 642);
  });

  it('rotation 90 (with a CropBox offset)', () => {
    // viewBox [50 100 545 742], /Rotate 90: pdf.js transform [0, 1, 1, 0, -y0, -x0], width = y1 - y0, height = x1 - x0
    const g = { transform: [0, 1, 1, 0, -100, -50], width: 642, height: 495 };
    const k = sayfaKutusuna({ x: 60, y: 690, w: 20, h: 10 }, g);
    expect(k.x).toBeCloseTo(590 / 642); expect(k.w).toBeCloseTo(10 / 642);
    expect(k.y).toBeCloseTo(10 / 495); expect(k.h).toBeCloseTo(20 / 495);
  });

  it('turned text (an item at 90° in user space)', () => {
    const it: MetinParcasi = { str: 'abcd', transform: [0, 10, -10, 0, 100, 200], width: 20, height: 10, hasEOL: false };
    const r = parcaDikdortgeni(it, 0, 2);
    expect(r.x).toBeCloseTo(92); expect(r.w).toBeCloseTo(10);
    expect(r.y).toBeCloseTo(200); expect(r.h).toBeCloseTo(10);
  });
});
