import { DILLER, type Dil } from './sozluk';

// Task 6.5-2b: the language choice in the user's Drive, so that another device opens in it too.
// Where: kitaplik.json → "ayarlar": { "dil": "en" | "tr" } (optional; the other writers keep it: they write over the
// latest file). What happens after the library is loaded is decided here (pure); main.ts does it.
// - ?lang in the address (a shared link): nothing — not applied, not written.
// - A choice this device could not write yet ("bekleyen", tied to its kitaplik.json): written first; it wins.
//   Another library's (another account) is removed, never written there.
// - Drive's language differs from the page's → one reload in it (once per session).
// - Drive has none and this device has a choice of its own → it is written once. No choice ever → nothing.

export interface Bekleyen { dil: Dil; fileId: string }

export interface TercihGirdisi {
  driveDil: unknown;                 // ayarlar.dil as read (undefined: none)
  yerelDil: Dil;                     // the page's language
  yerelAcikSecim: boolean;           // localStorage has a choice (not only the default)
  yerelBekleyen: Bekleyen | null;
  fileId: string | null;             // this library's kitaplik.json (null: none, nothing is written)
  adresteLang: boolean;
  buOturumdaYenilendi: boolean;
}

export type TercihEylemi = 'hicbir' | 'yenile' | 'driveYaz';

export interface TercihKarari {
  eylem: TercihEylemi;
  dil?: Dil;               // yenile: the language to open in; driveYaz: the one to write
  bekleyenSil: boolean;
}

const gecerli = (d: unknown): d is Dil => typeof d === 'string' && (DILLER as readonly string[]).includes(d);

export function tercihKarari(g: TercihGirdisi): TercihKarari {
  const b = g.yerelBekleyen;
  const baskaKitaplik = !!b && b.fileId !== g.fileId;
  const sonuc = (eylem: TercihEylemi, dil?: Dil, bekleyenSil = baskaKitaplik): TercihKarari =>
    dil ? { eylem, dil, bekleyenSil } : { eylem, bekleyenSil };
  if (g.adresteLang) return sonuc('hicbir');
  if (b && !baskaKitaplik && g.fileId) {
    return g.driveDil === g.yerelDil ? sonuc('hicbir', undefined, true) : sonuc('driveYaz', g.yerelDil);
  }
  if (g.driveDil === undefined || g.driveDil === null) {
    return g.yerelAcikSecim && g.fileId ? sonuc('driveYaz', g.yerelDil) : sonuc('hicbir');
  }
  if (!gecerli(g.driveDil)) return sonuc('hicbir');   // a value we don't know: left alone
  if (g.driveDil === g.yerelDil || g.buOturumdaYenilendi) return sonuc('hicbir');
  return sonuc('yenile', g.driveDil);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

// ayarlar.dil of a library's extra fields (parseLibrary keeps "ayarlar" there)
export const driveDilOku = (extra: Obj): unknown => isObj(extra.ayarlar) ? extra.ayarlar.dil : undefined;

// The latest kitaplik.json with our language; every other field (and ayarlar's other fields) stays.
// Not an object → nothing written.
export function ayarlarDilYaz(latest: unknown, dil: Dil): { json: unknown; degisti: boolean } {
  if (!isObj(latest)) return { json: latest, degisti: false };
  const ayarlar = isObj(latest.ayarlar) ? latest.ayarlar : {};
  if (ayarlar.dil === dil) return { json: latest, degisti: false };
  return { json: { ...latest, ayarlar: { ...ayarlar, dil } }, degisti: true };
}

// ---- the device's flags (storage errors swallowed: the page then just doesn't remember) ----

export const BEKLEYEN_ANAHTARI = 'defter-dil-bekleyen';     // localStorage: { dil, fileId }
export const YENILENDI_ANAHTARI = 'defter-dil-drive-yenilendi';   // sessionStorage: reloaded for Drive's language

interface Depo { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const yerel = (): Depo | null => { try { return localStorage; } catch { return null; } };
const oturum = (): Depo | null => { try { return sessionStorage; } catch { return null; } };

export function bekleyenCoz(ham: string | null): Bekleyen | null {
  if (!ham) return null;
  try {
    const v: unknown = JSON.parse(ham);
    return isObj(v) && gecerli(v.dil) && typeof v.fileId === 'string' && v.fileId ? { dil: v.dil, fileId: v.fileId } : null;
  } catch { return null; }
}

export function bekleyenOku(s: Depo | null = yerel()): Bekleyen | null {
  try { return bekleyenCoz(s?.getItem(BEKLEYEN_ANAHTARI) ?? null); } catch { return null; }
}

export function bekleyenYaz(b: Bekleyen, s: Depo | null = yerel()): void {
  try { s?.setItem(BEKLEYEN_ANAHTARI, JSON.stringify(b)); } catch { /* not remembered */ }
}

export function bekleyenSil(s: Depo | null = yerel()): void {
  try { s?.removeItem(BEKLEYEN_ANAHTARI); } catch { /* nothing to do */ }
}

export function yenilendiMi(s: Depo | null = oturum()): boolean {
  try { return s?.getItem(YENILENDI_ANAHTARI) === '1'; } catch { return false; }
}

// false: the flag could not be kept (private window) — then no reload at all, it could repeat
export function yenilendiYaz(s: Depo | null = oturum()): boolean {
  try { s?.setItem(YENILENDI_ANAHTARI, '1'); return s?.getItem(YENILENDI_ANAHTARI) === '1'; } catch { return false; }
}
