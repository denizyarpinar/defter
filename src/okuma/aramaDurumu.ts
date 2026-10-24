// Task 6.3c: the search bar's state, pure (no DOM, no pdf.js). Which match is the current one, moving
// between matches, keeping the current one when the list changes, the counter text.

export interface AramaDurumu {
  eslesmeler: { sayfa: number; elYazisi?: boolean }[];   // in page order; elYazisi: in the page's read handwriting (6.4c-3)
  gecerli: number;                   // index in eslesmeler; -1: none
  hazirlaniyor: boolean;             // the pages' text is still being read (the first search)
  aranamayan: number;                // pages without text (notebook photos, images)
  okunamadi: boolean;                // the PDF pages' text couldn't be read at all (not "not found")
  okunmamis: number | null;          // 6.4c-3: pages without text whose handwriting isn't read yet; null: not searched / this account cannot read (6.4c-4)
}

export const bosDurum = (): AramaDurumu => ({ eslesmeler: [], gecerli: -1, hazirlaniyor: false, aranamayan: 0, okunamadi: false, okunmamis: null });

// The next match; after the last one the first again
export function sonraki(d: AramaDurumu): number {
  const n = d.eslesmeler.length;
  return n ? (d.gecerli + 1 + n) % n : -1;
}

// The match before; before the first one the last
export function onceki(d: AramaDurumu): number {
  const n = d.eslesmeler.length;
  if (!n) return -1;
  return d.gecerli < 0 ? n - 1 : (d.gecerli - 1 + n) % n;
}

// A new query: the first match on the page the reader is on or after it (as a browser's search); none after → the first
export function baslangicEslesmesi(eslesmeler: { sayfa: number }[], odakSayfa: number): number {
  if (!eslesmeler.length) return -1;
  const i = eslesmeler.findIndex(m => m.sayfa >= odakSayfa);
  return i >= 0 ? i : 0;
}

// The list changed (another material, pages added): the first match on the old current one's page;
// none there → the nearest page (equally near: the later one). eskiSayfa null: as a new query from odakSayfa.
export function listeDegisti(eskiSayfa: number | null, eslesmeler: { sayfa: number }[], odakSayfa: number): number {
  if (!eslesmeler.length) return -1;
  if (eskiSayfa === null) return baslangicEslesmesi(eslesmeler, odakSayfa);
  let best = 0;
  for (let i = 1; i < eslesmeler.length; i++) {
    const a = Math.abs(eslesmeler[i].sayfa - eskiSayfa), b = Math.abs(eslesmeler[best].sayfa - eskiSayfa);
    if (a < b || (a === b && eslesmeler[i].sayfa > eslesmeler[best].sayfa)) best = i;
  }
  return best;
}

// The counter next to the box: "…" while reading, "bulunamadı" ("metin okunamadı": no text could be read), "3/12"; "" before a search
export function sayacMetni(d: AramaDurumu, sorguVar: boolean): string {
  if (!sorguVar) return '';
  if (d.hazirlaniyor) return '…';
  if (!d.eslesmeler.length) return d.okunamadi ? 'metin okunamadı' : 'bulunamadı';
  return `${Math.max(0, d.gecerli) + 1}/${d.eslesmeler.length}`;
}

// 6.4c-4: the pages without text still to read (okunan: pages with a read record, null: handwriting not searched).
// Only for an account that can read (okumaVar): for the others "henüz okunmadı" would promise a button they lack.
export function okunmamisSayisi(aranamayan: number, okunan: number | null, okumaVar: boolean): number | null {
  return okunan === null || !okumaVar ? null : Math.max(0, aranamayan - okunan);
}

// The small note about pages without text: the full text and the short one (phone); null: nothing to say.
// 6.4c-3: the handwriting searched too → only the pages not read yet (all read: no note).
export function aranamayanNotu(d: AramaDurumu, sorguVar: boolean): { uzun: string; kisa: string } | null {
  if (!sorguVar || d.hazirlaniyor) return null;
  if (d.okunmamis !== null) return d.okunmamis > 0 ? { uzun: `${d.okunmamis} sayfa henüz okunmadı`, kisa: `${d.okunmamis} okunmadı` } : null;
  if (!d.aranamayan) return null;
  return { uzun: `${d.aranamayan} sayfa fotoğraf, aranamadı`, kisa: `${d.aranamayan} foto` };
}
