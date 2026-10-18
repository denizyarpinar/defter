import { sorguHazirla } from '../okuma/metinAra';

// Task 6.3d: matching names on the device (file names, topic and book titles). Part of a word is found
// too. The same search form as the reader's search (metinAra.ts, 6.3b): no case, ä = ae, ß = ss, ı/İ = i;
// at least 2 letters.

// A file name's search form: ".pdf" and then "_cozum" at the end don't count ('' when nothing is left)
export const dosyaAnahtari = (ad: string) => adAnahtari(ad.trim().replace(/\.pdf$/i, '').replace(/_cozum$/i, ''));

// A title's search form ('' when it is shorter than 2 letters)
export const adAnahtari = (ad: string) => sorguHazirla(ad) ?? '';

// The items whose key contains the query; [] when the query is too short
export function adEsle<T extends { anahtar: string }>(ogeler: readonly T[], q: string): T[] {
  const n = sorguHazirla(q);
  return n ? ogeler.filter(o => o.anahtar.includes(n)) : [];
}
