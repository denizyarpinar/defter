import type { Stil } from './basici';

const STILLER: readonly Stil[] = ['tukenmez', 'yumusak'];   // basici.ts STILLER (not imported: this module is in the reader's first bundle)

// Task 6.4e-2: the reader's "Temiz yazı ↔ Orijinal" button, the decisions only (no DOM, no Drive).
// - The button: a Drive library (never the sample one) + at least one page of the open list whose record
//   matched by fingerprint (eslestir) + the atlas found. Otherwise hidden.
// - A read page is drawn in clean handwriting while the choice is on. Task 6.4e-4: the pen too (it draws there;
//   those strokes are the clean view's own, cizgi.ts StrokeView); the button works with the pen on.
// - The counter: read pages / photo pages of the list. A photo page = exactly one image on it (fingerprint "g:").
// - The choice (on/off, style) per device in localStorage; reading or writing it may fail (private window):
//   the default then, the page works the same.

export interface TemizTercih { acik: boolean; stil: Stil }
export const VARSAYILAN_TERCIH: TemizTercih = { acik: true, stil: 'tukenmez' };
export const TERCIH_ANAHTARI = 'defter-temiz-yazi';

export interface DugmeGirdisi {
  drive: boolean;          // a Drive library (not the sample one)
  eslesen: number;         // pages of the open list with a matched record
  atlasVar: boolean;       // the atlas was found (atlasOkuDrive not null)
}

export const dugmeGorunur = (g: DugmeGirdisi): boolean => g.drive && g.eslesen > 0 && g.atlasVar;

// Clean handwriting is drawn now (button pressed)
export const etkin = (t: Pick<TemizTercih, 'acik'>): boolean => t.acik;

export const fotografSayfasiMi = (parmakIzi: string | undefined): boolean => !!parmakIzi?.startsWith('g:');

export interface Sayac { okunmus: number; fotograf: number }

// izler: the fingerprint of each page of the list (undefined: not a PDF page / not known); okunmus: indexes
// of the pages with a matched record. A read page is always counted as a photo page (8 photos, 3 read: 3/8).
export function sayac(izler: ReadonlyMap<number, string>, okunmus: ReadonlySet<number>): Sayac {
  const foto = new Set<number>(okunmus);
  for (const [i, iz] of izler) if (fotografSayfasiMi(iz)) foto.add(i);
  return { okunmus: okunmus.size, fotograf: foto.size };
}

export const kisaMetin = (s: Sayac): string => `${s.okunmus}/${s.fotograf}`;
export const dugmeMetni = (s: Sayac): string => `Temiz yazı (${kisaMetin(s)})`;

export interface Depo { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function tercihOku(depo: () => Depo | null | undefined): TemizTercih {
  try {
    const ham = depo()?.getItem(TERCIH_ANAHTARI);
    if (!ham) return { ...VARSAYILAN_TERCIH };
    const j = JSON.parse(ham) as Partial<TemizTercih> | null;
    return {
      acik: typeof j?.acik === 'boolean' ? j.acik : VARSAYILAN_TERCIH.acik,
      stil: STILLER.includes(j?.stil as Stil) ? j!.stil as Stil : VARSAYILAN_TERCIH.stil,
    };
  } catch {
    return { ...VARSAYILAN_TERCIH };
  }
}

// false: not saved (the choice still holds for this page)
export function tercihYaz(depo: () => Depo | null | undefined, t: TemizTercih): boolean {
  try {
    const d = depo();
    if (!d) return false;
    d.setItem(TERCIH_ANAHTARI, JSON.stringify({ acik: t.acik, stil: t.stil }));
    return true;
  } catch {
    return false;
  }
}
