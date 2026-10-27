import { MAX_CANVAS_PIKSEL, MAX_KENAR } from './ayarlar';
import { t } from '../dil';

// Task 5.3: the pure part of preparing a photo (no DOM, so it can be tested): target size and
// which error to show. The browser part is gorsel.ts.

export interface Boyut { width: number; height: number }

// Longest edge at most maxKenar, never enlarged, aspect kept, and never over maxPiksel.
export function hedefBoyut(w: number, h: number, maxKenar = MAX_KENAR, maxPiksel = MAX_CANVAS_PIKSEL): Boyut {
  if (!(w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h))) throw new RangeError(`Geçersiz görsel boyutu: ${w}×${h}`);   // dil-kontrol: yoksay
  let k = Math.min(1, maxKenar / Math.max(w, h));
  if (w * k * h * k > maxPiksel) k *= Math.sqrt(maxPiksel / (w * k * h * k));
  const out = { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
  // rounding up must not push it over the pixel limit
  if (out.width * out.height > maxPiksel) { out.width = Math.max(1, Math.floor(w * k)); out.height = Math.max(1, Math.floor(h * k)); }
  return out;
}

export type GorselHataTuru = 'heic' | 'resimDegil' | 'bos' | 'acilamadi';

export interface DosyaBilgisi { name: string; type: string; size: number }

// Why a file could not be opened, from what is known about it (the decoder's own error says little).
export function hataTuru(f: DosyaBilgisi): GorselHataTuru {
  const type = f.type.toLowerCase();
  if (/^image\/hei[cf]/.test(type) || /\.hei[cf]$/i.test(f.name)) return 'heic';
  if (f.size === 0) return 'bos';
  if (type && !type.startsWith('image/')) return 'resimDegil';
  return 'acilamadi';
}


export function hataMesaji(tur: GorselHataTuru): string {
  switch (tur) {
    case 'heic':
    case 'acilamadi': return t('gorsel.acilamadi');
    case 'resimDegil': return t('gorsel.resimDegil');
    case 'bos': return t('gorsel.bos');
  }
}

export class GorselHatasi extends Error {
  constructor(public tur: GorselHataTuru, options?: { cause?: unknown }) {
    super(hataMesaji(tur), options);
    this.name = 'GorselHatasi';
  }
}
