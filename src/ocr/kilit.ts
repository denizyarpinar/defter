// Task 6.4c-2: "Temiz yazıya çevir" is a trial behind ?ocrKayit=1. On the live site (production) it stays
// shut even with the parameter: api/oku answers 404 there, the buttons would only show errors.
// Two guards: the Vercel environment at build time and the production address.

export const CANLI_ADRES = 'defter-jade.vercel.app';

export interface KilitOrtami { ortam: string; host: string }

const varsayilan = (): KilitOrtami => ({
  ortam: typeof __VERCEL_ENV__ === 'string' ? __VERCEL_ENV__ : '',
  host: typeof location === 'undefined' ? '' : location.hostname
});

export function ocrKayitAcik(search?: string, o: KilitOrtami = varsayilan()): boolean {
  if (o.ortam === 'production' || o.host.toLowerCase() === CANLI_ADRES) return false;
  const s = search ?? (typeof location === 'undefined' ? '' : location.search);
  return new URLSearchParams(s).get('ocrKayit') === '1';
}
