// Task 6.5-1: after a language change (a reload) the same place again: the book on the desk, the reader on the same
// topic / material / file / page. sessionStorage "defter-dil-donus", read once at start and removed.
// Storage errors are swallowed (private window: the page just opens as usual).

export const DONUS_ANAHTARI = 'defter-dil-donus';

export interface OkuyucuKonumu {
  unit: number;
  topic: number;
  materyal?: string;
  dosya?: string;
  sayfa?: number;
  mod?: 'kitap' | 'pdf';
}

export interface DilDonus {
  kaynak: 'demo' | 'drive';
  kitapId: string;
  okuyucu?: OkuyucuKonumu;
}

interface Depo { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const depo = (): Depo | null => { try { return sessionStorage; } catch { return null; } };

const sayiMi = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

// Pure: a stored value back into a DilDonus (null: missing or broken)
export function donusCoz(ham: string | null): DilDonus | null {
  if (!ham) return null;
  let v: unknown;
  try { v = JSON.parse(ham); } catch { return null; }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if ((o.kaynak !== 'demo' && o.kaynak !== 'drive') || typeof o.kitapId !== 'string' || !o.kitapId) return null;
  const sonuc: DilDonus = { kaynak: o.kaynak, kitapId: o.kitapId };
  const k = o.okuyucu as Record<string, unknown> | undefined;
  if (k && typeof k === 'object' && sayiMi(k.unit) && sayiMi(k.topic)) {
    sonuc.okuyucu = { unit: k.unit, topic: k.topic };
    if (typeof k.materyal === 'string') sonuc.okuyucu.materyal = k.materyal;
    if (typeof k.dosya === 'string') sonuc.okuyucu.dosya = k.dosya;
    if (sayiMi(k.sayfa) && k.sayfa > 0) sonuc.okuyucu.sayfa = k.sayfa;
    if (k.mod === 'kitap' || k.mod === 'pdf') sonuc.okuyucu.mod = k.mod;
  }
  return sonuc;
}

export function donusYaz(d: DilDonus, s: Depo | null = depo()): void {
  try { s?.setItem(DONUS_ANAHTARI, JSON.stringify(d)); } catch { /* nothing to come back to */ }
}

// Once: read and removed
export function donusAl(s: Depo | null = depo()): DilDonus | null {
  try {
    const ham = s?.getItem(DONUS_ANAHTARI) ?? null;
    s?.removeItem(DONUS_ANAHTARI);
    return donusCoz(ham);
  } catch { return null; }
}
