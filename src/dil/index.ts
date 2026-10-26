import { en } from './en';
import { tr } from './tr';
import { DILLER, type Anahtar, type Cogul, type Dil, type Sozluk } from './sozluk';

// Task 6.5-1: two languages without a library. The choice: ?lang=en|tr (also saved) > localStorage "defter-dil" > English.
// navigator.language is not used (Deniz's decision). A change reloads the page (dilSec); nothing re-renders live.

export type { Anahtar, Dil } from './sozluk';

export const DIL_ANAHTARI = 'defter-dil';
const SOZLUKLER: Record<Dil, Sozluk> = { en, tr };

const gecerli = (d: unknown): d is Dil => typeof d === 'string' && (DILLER as readonly string[]).includes(d);

// Pure: the language from the address's query string and the saved value
export function dilBelirle(search: string, kayitli: string | null): Dil {
  const p = new URLSearchParams(search).get('lang');
  if (gecerli(p)) return p;
  return gecerli(kayitli) ? kayitli : 'en';
}

function kayitliOku(): string | null {
  try { return localStorage.getItem(DIL_ANAHTARI); } catch { return null; }
}

function kaydet(d: Dil): void {
  try { localStorage.setItem(DIL_ANAHTARI, d); } catch { /* private window: this page only */ }
}

function ilkDil(): Dil {
  if (typeof location === 'undefined') return 'en';
  const d = dilBelirle(location.search, kayitliOku());
  if (gecerli(new URLSearchParams(location.search).get('lang'))) kaydet(d);
  return d;
}

let secili: Dil = ilkDil();

export const dil = (): Dil => secili;

// Only in memory, no reload (the tests: src/dil/testKurulum.ts)
export function dilAyarla(d: Dil): void { secili = d; }

type Degerler = Record<string, string | number>;

const yerlestir = (s: string, d?: Degerler) =>
  d ? s.replace(/\{(\w+)\}/g, (m, k: string) => k in d ? String(d[k]) : m) : s;

// A dictionary key? ([data-t] also carries topic numbers in the contents pages: reader.ts, Okuyucu.ts)
export const anahtarMi = (s: string | undefined): s is Anahtar => !!s && Object.hasOwn(tr, s);

// The text of a key in the chosen language; {name} → d.name. A plural picks by d.n.
export function t(anahtar: Anahtar, d?: Degerler): string {
  const v: string | Cogul = SOZLUKLER[secili][anahtar];
  if (typeof v === 'string') return yerlestir(v, d);
  const n = Number(d?.n ?? 0);
  return yerlestir(new Intl.PluralRules(secili).select(n) === 'one' ? v.bir : v.cok, d);
}

// The user chose a language: saved, then the page again (without ?lang, which would override the choice).
// Saving the open work first is the caller's job (main.ts dilDegistir).
export function dilSec(d: Dil): void {
  kaydet(d);
  const parcalar = location.search.slice(1).split('&').filter(p => p !== '');
  const kalan = parcalar.filter(p => !/^lang(=|$)/.test(p));
  if (kalan.length === parcalar.length) { location.reload(); return; }
  location.replace(location.pathname + (kalan.length ? '?' + kalan.join('&') : '') + location.hash);   // ?demo stays ?demo
}
