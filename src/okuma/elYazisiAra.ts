import { sayfaHazirla, sorguHazirla, type MetinParcasi } from './metinAra';

// Task 6.4c-3: searching the handwriting read into <pdf>.ocr.json Pure.
// A read photo page's text goes through the same search form as a PDF page's (ä = ae, ß = ss, ı/İ = i,
// no case, "Fehler-" + "anfällig" at a line end = one word). There are no positions: a match is a page.

const BIRIM = [1, 0, 0, 1, 0, 0];

// A page's text (lines with \n) → its search form; each line is an item that ends a line
export function elYazisiHazirla(metin: string): string {
  const parcalar: MetinParcasi[] = metin.split('\n').map(str => ({ str, transform: BIRIM, width: 0, height: 0, hasEOL: true }));
  return sayfaHazirla({ parcalar, gorunum: { transform: BIRIM, width: 0, height: 0 } }).metin.trim();
}

// A read page of the list: its index and its texts in search form (as written, with the corrections)
export interface ElYazisiSayfasi { sayfa: number; metinler: string[] }

// What the reader's record gave for the photo pages of the list
export interface ElYazisiSonucu { sayfalar: ElYazisiSayfasi[] }

// The pages where q is in one of the texts, in page order (one match per page)
export function elYazisiAra(sayfalar: readonly ElYazisiSayfasi[], q: string): { sayfa: number }[] {
  const n = sorguHazirla(q);
  if (!n) return [];
  return sayfalar.filter(s => s.metinler.some(m => m.includes(n))).map(s => ({ sayfa: s.sayfa })).sort((a, b) => a.sayfa - b.sayfa);
}
