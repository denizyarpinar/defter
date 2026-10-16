import type { Boyut } from '../gorselHesap';
import { alan, koseleriSirala, type Kose4, type Nokta } from './kirpHesap';

// Task 5.8d: the pure part of the corner editor (no DOM, tested): fitting the photo on the
// screen, screen ↔ image coordinates, keeping handles inside the image, finding the handle
// under a finger, whether a quadrilateral can be cropped, the start quadrilateral and the
// magnifier's source square. Corners are always full-image pixels (as in KirpKarari.koseler);
// the ~1600 px preview is only for drawing. The browser part is src/ui/koseDuzenleyici.ts.

export const ELLE_MIN_ALAN = 0.02;   // smallest quadrilateral, share of the image area
export const BASLANGIC_PAY = 0.08;   // no corners found: a rectangle this far inside
export const TUTAMAC_YARICAP = 28;   // px around a handle that grabs it (≥ 22: a 44 px touch area)

export interface Sigdirma { olcek: number; ofsetX: number; ofsetY: number }

// The image fitted inside the area (aspect kept, centred), bosluk px free on every side.
export function sigdir(gorsel: Boyut, alanBoyut: Boyut, bosluk = 0): Sigdirma {
  const w = Math.max(1, alanBoyut.width - 2 * bosluk), h = Math.max(1, alanBoyut.height - 2 * bosluk);
  const olcek = Math.min(w / gorsel.width, h / gorsel.height);
  return {
    olcek,
    ofsetX: (alanBoyut.width - gorsel.width * olcek) / 2,
    ofsetY: (alanBoyut.height - gorsel.height * olcek) / 2
  };
}

export const gorseldenEkrana = (p: Nokta, s: Sigdirma): Nokta => ({ x: s.ofsetX + p.x * s.olcek, y: s.ofsetY + p.y * s.olcek });
export const ekrandanGorsele = (p: Nokta, s: Sigdirma): Nokta => ({ x: (p.x - s.ofsetX) / s.olcek, y: (p.y - s.ofsetY) / s.olcek });

// A handle never leaves the image.
export function sinirla(p: Nokta, b: Boyut): Nokta {
  return { x: Math.min(b.width, Math.max(0, p.x)), y: Math.min(b.height, Math.max(0, p.y)) };
}

// The handle under the pointer (screen px): the nearest one within the radius, else -1.
export function enYakinKose(p: Nokta, koseler: readonly Nokta[], yaricap = TUTAMAC_YARICAP): number {
  let en = -1, enD = yaricap;
  koseler.forEach((k, i) => {
    const d = Math.hypot(k.x - p.x, k.y - p.y);
    if (d <= enD) { en = i; enD = d; }
  });
  return en;
}

export type Gecerlilik = { gecerli: true; koseler: Kose4 } | { gecerli: false; neden: 'disbukeyDegil' | 'kucuk'; koseler: Kose4 };

// The handles in any order → sorted (top-left, top-right, bottom-right, bottom-left), then checked.
// Sorting first means swapped handles never give a turned or mirrored page; after the sort the
// edges never cross, so what is left to reject is a dent (not convex), three corners on a line
// or a quadrilateral that is too small. The editor draws and crops this sorted quadrilateral.
export function gecerliMi(k: readonly Nokta[], b: Boyut, minAlan = ELLE_MIN_ALAN): Gecerlilik {
  const s = koseleriSirala(k);
  let isaret = 0;
  for (let i = 0; i < 4; i++) {
    const o = s[(i + 3) % 4], a = s[i], c = s[(i + 1) % 4];
    const cr = Math.sign((a.x - o.x) * (c.y - o.y) - (a.y - o.y) * (c.x - o.x));
    if (cr === 0 || (isaret !== 0 && cr !== isaret)) return { gecerli: false, neden: 'disbukeyDegil', koseler: s };
    isaret = cr;
  }
  if (Math.abs(alan(s)) < minAlan * b.width * b.height) return { gecerli: false, neden: 'kucuk', koseler: s };
  return { gecerli: true, koseler: s };
}

// Where the editor starts: the corners found (kept inside the image), else a rectangle pay inside.
export function baslangicDortgeni(k: Kose4 | null, b: Boyut, pay = BASLANGIC_PAY): Kose4 {
  if (k) return k.map(p => sinirla(p, b)) as Kose4;
  const x0 = b.width * pay, y0 = b.height * pay, x1 = b.width - x0, y1 = b.height - y0;
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}

export function koselerEsit(a: Kose4 | null, b: Kose4 | null): boolean {
  if (!a || !b) return a === b;
  return a.every((p, i) => p.x === b[i].x && p.y === b[i].y);
}

export interface BuyutecKaynagi {
  sx: number; sy: number; sw: number; sh: number;   // preview pixels (inside the preview)
  dx: number; dy: number; dw: number; dh: number;   // magnifier pixels
}

// The magnifier (cap × cap px) shows the screen around p (full-image px) carpan times bigger.
// The source square is cut to the preview (Safari draws nothing for a source outside the image);
// the part outside stays the magnifier's background. null: nothing of the image is in the square.
export function buyutecKaynagi(p: Nokta, tam: Boyut, onizleme: Boyut, ekranOlcek: number, cap: number, carpan = 2.5): BuyutecKaynagi | null {
  const kx = onizleme.width / tam.width, ky = onizleme.height / tam.height;
  const yarim = cap / carpan / ekranOlcek / 2;   // full-image px
  const x0 = (p.x - yarim) * kx, x1 = (p.x + yarim) * kx;
  const y0 = (p.y - yarim) * ky, y1 = (p.y + yarim) * ky;
  const sx = Math.max(0, x0), sy = Math.max(0, y0);
  const ex = Math.min(onizleme.width, x1), ey = Math.min(onizleme.height, y1);
  if (ex <= sx || ey <= sy) return null;
  const fx = cap / (x1 - x0), fy = cap / (y1 - y0);
  return { sx, sy, sw: ex - sx, sh: ey - sy, dx: (sx - x0) * fx, dy: (sy - y0) * fy, dw: (ex - sx) * fx, dh: (ey - sy) * fy };
}
