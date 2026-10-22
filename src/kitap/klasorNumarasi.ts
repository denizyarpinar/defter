import { klasorAdi } from './klasorAdi';

// Task 6.K5a: the folder name for a new unit / topic of an existing book. Pure, tested.
// - Number = the largest one in kitap.json's paths AND in Drive's folders + 1 (a half-made folder that never got
//   into kitap.json counts too). Units: Unite-NN; topics: Konu-NN, counting on through the whole book.
// - A name that is there already (case-insensitive) → the next number. An existing folder is never written into.

const DESEN = { unite: /^Unite-(\d+)/i, konu: /^Konu-(\d+)/i } as const;

// adlar: folder names or paths ("Unite-01-A/Konu-03-B"); every part counts
export function sonrakiNumara(tur: 'unite' | 'konu', adlar: Iterable<string>): number {
  let enBuyuk = 0;
  for (const ad of adlar) {
    for (const parca of ad.split('/')) {
      const m = DESEN[tur].exec(parca.trim());
      if (m) enBuyuk = Math.max(enBuyuk, Number(m[1]));
    }
  }
  return enBuyuk + 1;
}

// klasorAdi(tur, n, ad) from n on, the first one not in `mevcut` (names in the same parent folder)
export function bosAd(tur: 'unite' | 'konu', n: number, ad: string, mevcut: Iterable<string>): string {
  const dolu = new Set([...mevcut].map(m => m.toLowerCase()));
  for (let k = n; ; k++) {
    const aday = klasorAdi(tur, k, ad);
    if (!dolu.has(aday.toLowerCase())) return aday;
  }
}
