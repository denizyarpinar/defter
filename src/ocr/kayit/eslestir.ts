import type { OcrKayit, OcrSayfa } from './sema';

// Task 6.4c-1: the record's entries → the PDF's pages as they are now. The fingerprint decides, so an entry
// follows its page when pages before it are removed or moved. The same photo on two pages: first the entry
// whose page number also fits, then the newest. An entry with no page is "eski" (its page changed or left).

export interface Eslesme {
  sayfalar: (OcrSayfa | null)[];   // index = page - 1
  eski: OcrSayfa[];
}

export function eslestir(kayit: OcrKayit, parmakIzleri: readonly string[]): Eslesme {
  const sayfalar: (OcrSayfa | null)[] = parmakIzleri.map(() => null);
  const kullanildi = new Set<OcrSayfa>();
  const yeniOnce = [...kayit.sayfalar].sort((a, b) => Date.parse(b.okunma) - Date.parse(a.okunma));
  const bagla = (uyar: (s: OcrSayfa, i: number) => boolean) => parmakIzleri.forEach((iz, i) => {
    if (sayfalar[i]) return;
    const s = yeniOnce.find(x => !kullanildi.has(x) && x.parmakIzi === iz && uyar(x, i));
    if (s) { sayfalar[i] = s; kullanildi.add(s); }
  });
  bagla((s, i) => s.sayfa === i + 1);
  bagla(() => true);
  return { sayfalar, eski: kayit.sayfalar.filter(s => !kullanildi.has(s)) };
}
