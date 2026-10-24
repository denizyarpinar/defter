import { describe, expect, it } from 'vitest';
import { elYazisiAra, elYazisiHazirla } from './elYazisiAra';

const sayfa = (n: number, ...metinler: string[]) => ({ sayfa: n, metinler: metinler.map(elYazisiHazirla) });

describe('elYazisiHazirla', () => {
  it('the same search form as a PDF page: lower case, ä = ae, ß = ss, ı/İ = i', () => {
    expect(elYazisiHazirla('Größe der Fläche')).toBe('groesse der flaeche');
    expect(elYazisiHazirla('İSTANBUL ılık')).toBe('istanbul ilik');
  });
  it('lines: a hyphen at the line end before a small letter joins the word', () => {
    expect(elYazisiHazirla('Fehler-\nanfällig')).toBe('fehleranfaellig');
    expect(elYazisiHazirla('Hin-\nUnd')).toBe('hin- und');
  });
});

describe('elYazisiAra', () => {
  const sayfalar = [sayfa(4, 'Die Einrückung ist wichtig'), sayfa(1, 'Beweis durch Induktion'), sayfa(2, 'nichts')];

  it('ä and ae find the same; no case', () => {
    expect(elYazisiAra(sayfalar, 'einrueckung')).toEqual([{ sayfa: 4 }]);
    expect(elYazisiAra(sayfalar, 'EINRÜCKUNG')).toEqual([{ sayfa: 4 }]);
    expect(elYazisiAra(sayfalar, 'induktion')).toEqual([{ sayfa: 1 }]);
  });

  it('a word only in the corrected text is found', () => {
    const s = [sayfa(3, 'Bewies durch Indukton', 'Beweis durch Induktion')];
    expect(elYazisiAra(s, 'Induktion')).toEqual([{ sayfa: 3 }]);
    expect(elYazisiAra(s, 'Indukton')).toEqual([{ sayfa: 3 }]);   // as written too
  });

  it('page order, one match per page; too short or not there: none', () => {
    expect(elYazisiAra(sayfalar, 'i')).toEqual([]);
    expect(elYazisiAra(sayfalar, 'ist')).toEqual([{ sayfa: 4 }]);
    expect(elYazisiAra([sayfa(5, 'abc abc'), sayfa(2, 'abc')], 'abc')).toEqual([{ sayfa: 2 }, { sayfa: 5 }]);
    expect(elYazisiAra(sayfalar, 'zebra')).toEqual([]);
  });
});
