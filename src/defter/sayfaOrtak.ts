import type { PDFDocument } from 'pdf-lib';
import { sayfaIzi } from '../ocr/kayit/parmakIzi';

// Task 6.S-4 / 6.S-4c: what the blank page (bosSayfa.ts) and "Deftere yapıştır" (yapistir.ts) share: the paper
// pattern, its numbers in a content stream, and finding a page again in a newer version by its fingerprint.
// Pure: no Drive, no DOM.

export const DESENLER = ['duz', 'kareli', 'cizgili'] as const;
export type Desen = typeof DESENLER[number];

const MM = 72 / 25.4;
export const KARE_MM = 5;
export const CIZGI_MM = 8;
const KENAR_TOLERANS = 0.5;   // pt: no line right on the page edge

type Lib = typeof import('pdf-lib');

export class SayfaYeriDegisti extends Error {
  constructor() { super('PDF bu arada başka bir yerde değişti; sayfanın yeri bulunamadı, hiçbir şey yazılmadı. Konuyu kapatıp yeniden aç, sonra tekrar dene.'); }
}

export interface Cizgi { x1: number; y1: number; x2: number; y2: number }

// The pattern's lines on a w × h page (PDF coordinates, origin bottom left), measured from the top left corner
export function desenCizgileri(w: number, h: number, desen: Desen): Cizgi[] {
  if (desen === 'duz') return [];
  const adim = (desen === 'kareli' ? KARE_MM : CIZGI_MM) * MM;
  const out: Cizgi[] = [];
  for (let k = 1; k * adim < h - KENAR_TOLERANS; k++) { const y = h - k * adim; out.push({ x1: 0, y1: y, x2: w, y2: y }); }
  if (desen === 'kareli') for (let k = 1; k * adim < w - KENAR_TOLERANS; k++) { const x = k * adim; out.push({ x1: x, y1: 0, x2: x, y2: h }); }
  return out;
}

// Numbers and ids in a content stream
export const n3 = (x: number) => String(Math.round(x * 1000) / 1000);
export const temizId = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '');

// Page `i` of the reader's version in this version. Without its fingerprint: i itself (out of range →
// SayfaYeriDegisti); with it: the page with that fingerprint nearest to i, none → SayfaYeriDegisti.
export async function izleBul(L: Lib, doc: PDFDocument, i: number, iz: string | undefined): Promise<number> {
  const n = doc.getPageCount(), sayfalar = doc.getPages();
  if (!iz) {
    if (!Number.isInteger(i) || i < 0 || i >= n) throw new SayfaYeriDegisti();
    return i;
  }
  if (i >= 0 && i < n && await sayfaIzi(L, doc, sayfalar[i]) === iz) return i;
  let en = -1;
  for (let k = 0; k < n; k++) {
    if (await sayfaIzi(L, doc, sayfalar[k]) !== iz) continue;
    if (en < 0 || Math.abs(k - i) < Math.abs(en - i)) en = k;
  }
  if (en < 0) throw new SayfaYeriDegisti();
  return en;
}
