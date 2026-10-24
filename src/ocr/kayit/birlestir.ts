import type { OcrKayit, OcrSayfa } from './sema';

// Task 6.4c-1: merging page entries. The key is only parmakIzi (Deniz's decision): an older entry with
// the same page number but another fingerprint stays (eslestir calls it "eski"; nothing is lost).
// The rest of the record (unknown fields included) is the first one's.

const zaman = (s: OcrSayfa) => { const t = Date.parse(s.okunma); return Number.isNaN(t) ? 0 : t; };
const sirala = (a: OcrSayfa[]) => [...a].sort((x, y) => x.sayfa - y.sayfa || zaman(x) - zaman(y));

// A new reading of a page: it wins over every entry with the same fingerprint
export function sayfaBirlestir(kayit: OcrKayit, yeni: OcrSayfa): OcrKayit {
  return { ...kayit, sayfalar: sirala([...kayit.sayfalar.filter(s => s.parmakIzi !== yeni.parmakIzi), yeni]) };
}

// Two copies of one record (two files for the same PDF): per fingerprint the later reading wins
export function kayitBirlestir(asil: OcrKayit, diger: OcrKayit): OcrKayit {
  const sayfalar = [...asil.sayfalar];
  for (const s of diger.sayfalar) {
    const i = sayfalar.findIndex(x => x.parmakIzi === s.parmakIzi);
    if (i < 0) sayfalar.push(s);
    else if (zaman(s) > zaman(sayfalar[i])) sayfalar[i] = s;
  }
  return { ...asil, sayfalar: sirala(sayfalar) };
}
