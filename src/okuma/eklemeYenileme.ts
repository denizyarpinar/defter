// Task 5.8g: photos were added to a topic (konuyaEkle.ts). What the open reader does then, without DOM or Drive:
// - its page list grows (the file on screen got the pages), or
// - its tabs are listed again (a new ozet.pdf), or
// - nothing (another file, another topic, the reader closed).
// "Göster" in the success toast goes to the first new page.

// true: the reader goes to the first new page by itself when the adding is done (Deniz decides after testing)
export const GOSTER_OTOMATIK = false;

export interface EklemeSonucu {
  tur: 'yeni' | 'eklendi';
  fileId: string;
  ad: string;
  eskiSayfa: number;   // pages before the adding
  yeniSayfa: number;   // pages after it
}

export interface OkuyucuDurumu {
  acik: boolean;
  ayniKonu: boolean;                  // the topic the photos went to is the open one
  odakDosyaId: string | null;         // the file of the page on screen
  konuOzetIdleri: readonly string[];  // the summary files the open topic knows
}

export interface GosterHedefi { fileId: string; ad: string; sayfa: number }   // sayfa: 1-based in the PDF

export interface YenilemeKarari {
  yenile: 'yok' | 'liste' | 'konu';
  goster: GosterHedefi | null;        // null: no "Göster" button
}

export function yenilemeKarari(s: EklemeSonucu, o: OkuyucuDurumu): YenilemeKarari {
  if (!o.acik || !o.ayniKonu) return { yenile: 'yok', goster: null };
  const sayfa = s.tur === 'yeni' ? 1 : Math.max(1, Math.min(s.eskiSayfa + 1, s.yeniSayfa));
  const goster = { fileId: s.fileId, ad: s.ad, sayfa };
  // a new summary (or one another device made meanwhile): the tabs don't know it yet
  if (s.tur === 'yeni' || !o.konuOzetIdleri.includes(s.fileId)) return { yenile: 'konu', goster };
  // only the file on screen is refreshed; another file comes new the next time it opens
  return { yenile: o.odakDosyaId === s.fileId ? 'liste' : 'yok', goster };
}

export interface SayfaBilgisi { dosyaId: string | null; pdfSayfa?: number }

export interface Genisleme<T> {
  pages: T[];
  ekYeri: number;     // index of the first new page
  eklenen: number;
  sonaMi: boolean;    // the new pages are at the end of the list (nothing after them moves)
}

// The file's pages in the list get the pages up to `toplam` after its last one (pages are only added at the
// end of a PDF). yap: a new page from its number and the file's last page. null: nothing to add.
export function sayfaListesiniGenislet<T extends SayfaBilgisi>(
  pages: readonly T[], fileId: string, toplam: number, yap: (pdfSayfa: number, ornek: T) => T
): Genisleme<T> | null {
  let son = -1, n = 0;
  pages.forEach((p, i) => {
    if (p.dosyaId === fileId && p.pdfSayfa) { son = i; n = Math.max(n, p.pdfSayfa); }
  });
  if (son < 0 || toplam <= n) return null;
  const yeni: T[] = [];
  for (let k = n + 1; k <= toplam; k++) yeni.push(yap(k, pages[son]));
  const ekYeri = son + 1;
  return { pages: [...pages.slice(0, ekYeri), ...yeni, ...pages.slice(ekYeri)], ekYeri, eklenen: yeni.length, sonaMi: ekYeri === pages.length };
}

// Index i of the old list in the new one (the page stays the same page)
export const yeniIndeks = (i: number, g: Pick<Genisleme<unknown>, 'ekYeri' | 'eklenen'>): number => i >= g.ekYeri ? i + g.eklenen : i;

// "Göster": the target page in the list now (-1: not in it)
export const gosterIndeksi = (pages: readonly SayfaBilgisi[], g: GosterHedefi): number =>
  pages.findIndex(p => p.dosyaId === g.fileId && p.pdfSayfa === g.sayfa);
