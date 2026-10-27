import { KIRP_MIN_GUVEN, KIRP_VARSAYILAN, MAX_CANVAS_PIKSEL, MAX_KENAR } from '../ayarlar';
import type { Boyut } from '../gorselHesap';
import type { Kose4, KoseSonuc, Nokta } from './kirpHesap';

// Task 5.8c: the pure part of cropping in the photo panel (no DOM, tested): crop or whole
// photo, the toggle, corners from the small copy to the full image, and which part of the
// full image is drawn for the perspective fix. The browser part is hazirlaKirpli in gorsel.ts.

export type KirpKip = 'kirp' | 'tumu';

export interface KirpKarari {
  kip: KirpKip;
  koseler: Kose4 | null;   // full-image pixels (after EXIF orientation); kept even when the confidence is low
  guven: number | null;
  kirpilamadi: boolean;    // no corners or low confidence → whole photo, the thumbnail says so
}

export function ilkKarar(sonuc: KoseSonuc, varsayilan = KIRP_VARSAYILAN, minGuven = KIRP_MIN_GUVEN): KirpKarari {
  if (!sonuc) return { kip: 'tumu', koseler: null, guven: null, kirpilamadi: true };
  if (sonuc.guven < minGuven) return { kip: 'tumu', koseler: sonuc.koseler, guven: sonuc.guven, kirpilamadi: true };
  return { kip: varsayilan ? 'kirp' : 'tumu', koseler: sonuc.koseler, guven: sonuc.guven, kirpilamadi: false };
}

// The thumbnail's toggle. Without corners there is nothing to crop: the same mode.
export function kipDegistir(kip: KirpKip, koseler: Kose4 | null): KirpKip {
  if (!koseler) return kip;
  return kip === 'kirp' ? 'tumu' : 'kirp';
}

// Corners found on the small copy → full-image pixels (x and y separately: rounding the small size).
export function koseleriBuyut(k: Kose4, kucuk: Boyut, buyuk: Boyut): Kose4 {
  const sx = buyuk.width / kucuk.width, sy = buyuk.height / kucuk.height;
  return k.map(p => ({ x: p.x * sx, y: p.y * sy })) as Kose4;
}

export interface KirpPenceresi {
  sx: number; sy: number; sw: number; sh: number;   // part of the full image (drawImage source rectangle)
  width: number; height: number;                    // canvas it is drawn onto
  koseler: Kose4;                                   // corners in that canvas's pixels
}

// Only the page's bounding box is drawn, at a scale where the page's long edge is about maxKenar
// (never enlarged) and the canvas stays under maxPiksel. Less memory than the whole photo, and
// drawImage's smooth downscale keeps thin pen lines clean in the perspective step.
export function kirpPenceresi(k: Kose4, kaynak: Boyut, maxKenar = MAX_KENAR, maxPiksel = MAX_CANVAS_PIKSEL): KirpPenceresi {
  const xs = k.map(p => p.x), ys = k.map(p => p.y);
  const sx = Math.max(0, Math.floor(Math.min(...xs)));
  const sy = Math.max(0, Math.floor(Math.min(...ys)));
  const sw = Math.max(1, Math.min(kaynak.width, Math.ceil(Math.max(...xs))) - sx);
  const sh = Math.max(1, Math.min(kaynak.height, Math.ceil(Math.max(...ys))) - sy);
  // the page's own long edge in full-image pixels (same average of opposite edges as cikisBoyutu)
  const d = (a: Nokta, b: Nokta) => Math.hypot(a.x - b.x, a.y - b.y);
  const uzun = Math.max(1, (d(k[0], k[1]) + d(k[3], k[2])) / 2, (d(k[0], k[3]) + d(k[1], k[2])) / 2);
  let s = Math.min(1, maxKenar / uzun);
  if (sw * s * sh * s > maxPiksel) s *= Math.sqrt(maxPiksel / (sw * s * sh * s));
  let width = Math.max(1, Math.round(sw * s)), height = Math.max(1, Math.round(sh * s));
  if (width * height > maxPiksel) { width = Math.max(1, Math.floor(sw * s)); height = Math.max(1, Math.floor(sh * s)); }
  const fx = width / sw, fy = height / sh;
  const koseler = k.map(p => ({
    x: Math.min(width, Math.max(0, (p.x - sx) * fx)),
    y: Math.min(height, Math.max(0, (p.y - sy) * fy))
  })) as Kose4;
  return { sx, sy, sw, sh, width, height, koseler };
}

// For the "Ekle" log and the trial page. elle: corners set in the corner editor (5.8d).
export function kirpYazi(kip: KirpKip, kirpilamadi: boolean, elle = false): string {
  if (kip === 'kirp') return elle ? 'kırpıldı (elle)' : 'kırpıldı';   // dil-kontrol: yoksay
  return kirpilamadi ? 'tümü (kırpılamadı)' : 'tümü';   // dil-kontrol: yoksay
}
