import { aydinlatmaHaritasi, bosGoruntu, griDizi, griGoruntu, haritaOku, kanalHistogramlari, kutuBulanik, yuzdelik, type Goruntu } from './ortak';

// Task 6.2a: four "scanned page" filters to compare on real notebook photos (?filtreTest=1).
// Not used by the photo flow yet; Deniz picks one in 6.2b. All take the cropped, straightened
// page before the JPEG step and return a new image (the input is not changed).

// A: white balance + contrast
export const A_KAGIT_YUZDELIK = 0.9;    // paper colour = this percentile per channel
export const A_SIYAH_YUZDELIK = 0.01;   // black point per channel
export const A_MIN_ARALIK = 40;         // narrower range than this → black point 0 (nearly empty page)
// B: background division
export const B_MIN_ARKA = 8;            // lighting map floor (no division by ~0)
export const B_SIYAH = 25;              // after division: ≤ this → 0
export const B_BEYAZ = 235;             // after division: ≥ this → 255 (paper noise and texture go)
// C: grey + sharpening
export const C_KESKIN = 0.6;            // unsharp mask amount (radius 1)
// D: Sauvola threshold on B's grey
export const D_PENCERE = 0.0075;        // window radius as part of the long edge (window ≈ 1.5 %)
export const D_MIN_R = 7;
export const D_K = 0.25;
export const D_R = 128;

const sinirla = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

export function beyazDengesi(g: Goruntu): Goruntu {
  const out = bosGoruntu(g.width, g.height), s = g.data, d = out.data;
  const hist = kanalHistogramlari(g);
  const lut = hist.map(h => {
    const beyaz = Math.max(1, yuzdelik(h, A_KAGIT_YUZDELIK));
    let siyah = yuzdelik(h, A_SIYAH_YUZDELIK);
    if (beyaz - siyah < A_MIN_ARALIK) siyah = 0;
    const t = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) t[v] = ((v - siyah) / Math.max(1, beyaz - siyah)) * 255;
    return t;
  });
  for (let i = 0; i < s.length; i += 4) {
    d[i] = lut[0][s[i]]; d[i + 1] = lut[1][s[i + 1]]; d[i + 2] = lut[2][s[i + 2]]; d[i + 3] = 255;
  }
  return out;
}

export function arkaPlanDuzelt(g: Goruntu): Goruntu {
  const { width: W, height: H } = g;
  const m = aydinlatmaHaritasi(g);
  const out = bosGoruntu(W, H), s = g.data, d = out.data;
  const olcek = 255 / (B_BEYAZ - B_SIYAH);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = (s[i + c] / Math.max(B_MIN_ARKA, haritaOku(m, c, x, y))) * 255;
        d[i + c] = (v - B_SIYAH) * olcek;
      }
      d[i + 3] = 255;
    }
  }
  return out;
}

export function griBelge(g: Goruntu): Goruntu {
  const { width: W, height: H } = g;
  const gri = griDizi(arkaPlanDuzelt(g));
  const bulanik = kutuBulanik(gri, W, H, 1);
  for (let j = 0; j < gri.length; j++) gri[j] = sinirla(gri[j] + C_KESKIN * (gri[j] - bulanik[j]));
  return griGoruntu(gri, W, H);
}

export function siyahBeyaz(g: Goruntu): Goruntu {
  const { width: W, height: H } = g;
  const gri = griDizi(arkaPlanDuzelt(g));
  const r = Math.max(D_MIN_R, Math.round(Math.max(W, H) * D_PENCERE));
  const ort = kutuBulanik(gri, W, H, r);
  const kare = new Float32Array(gri.length);
  for (let j = 0; j < gri.length; j++) kare[j] = gri[j] * gri[j];
  const kareOrt = kutuBulanik(kare, W, H, r);
  for (let j = 0; j < gri.length; j++) {
    const sapma = Math.sqrt(Math.max(0, kareOrt[j] - ort[j] * ort[j]));
    gri[j] = gri[j] > ort[j] * (1 + D_K * (sapma / D_R - 1)) ? 255 : 0;
  }
  return griGoruntu(gri, W, H);
}

export interface Filtre { id: 'A' | 'B' | 'C' | 'D'; ad: string; uygula: (g: Goruntu) => Goruntu }

export const FILTRELER: readonly Filtre[] = [
  { id: 'A', ad: 'Beyaz dengesi', uygula: beyazDengesi },
  { id: 'B', ad: 'Arka plan (renkli)', uygula: arkaPlanDuzelt },
  { id: 'C', ad: 'Gri belge', uygula: griBelge },
  { id: 'D', ad: 'Siyah-beyaz', uygula: siyahBeyaz }
];
