import { aydinlatmaHaritasi, bosGoruntu, griDizi, griGoruntu, haritaOku, kanalHistogramlari, kutuBulanik, parlaklik, yuzdelik, type AydinlatmaHaritasi, type Goruntu } from './ortak';

// Task 6.2a: four "scanned page" filters to compare on real notebook photos (?filtreTest=1).
// Not used by the photo flow yet. 6.2b adds E (A + soft shadow fix), Deniz's pick. All take the
// cropped, straightened page before the JPEG step and return a new image (the input is not changed).

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
// E: soft shadow fix on brightness only (B's map), then A, then light contrast (task 6.2b)
export const E_GOLGE_GUC = 0.7;         // 0 = no shadow fix, 1 = full (gain = 1 + this·(paper / map − 1))
export const E_KAZANC_MAX = 1.8;        // shadow gain never above this
export const E_KONTRAST = 0.15;         // ink darkening per channel: 255 − (255 − v)·(1 + this)
export const E_MUREKKEP_PAY = 0.5;      // dark ink gets this part of the gain (paper and coloured ink all of it)
export const E_KAGIT_YUZDELIK = 0.95;   // target paper brightness = this percentile of the map
export const E_SIYAH_MAX = 50;          // A's black point, at most this

const sinirla = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

// siyahMax (E): black point never above this; on a page with little ink the 1 % point is shaded
// paper, and a high black point there would wipe out that channel.
export function beyazDengesi(g: Goruntu, siyahMax = 255): Goruntu {
  const out = bosGoruntu(g.width, g.height), s = g.data, d = out.data;
  const hist = kanalHistogramlari(g);
  const lut = hist.map(h => {
    const beyaz = Math.max(1, yuzdelik(h, A_KAGIT_YUZDELIK));
    let siyah = Math.min(siyahMax, yuzdelik(h, A_SIYAH_YUZDELIK));
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

export interface EAyar { golgeGuc: number; kazancMax: number; kontrast: number }
export const E_VARSAYILAN: EAyar = { golgeGuc: E_GOLGE_GUC, kazancMax: E_KAZANC_MAX, kontrast: E_KONTRAST };

const yumusakEsik = (a: number, b: number, v: number) => {
  const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a);
  return t * t * (3 - 2 * t);
};

export const renkDuzeltHaritasi = (g: Goruntu) => aydinlatmaHaritasi(g, true);

// The map is optional so the test page can move the sliders without building it again.
export function renkDuzelt(g: Goruntu, ayar: EAyar = E_VARSAYILAN, harita?: AydinlatmaHaritasi): Goruntu {
  const { width: W, height: H } = g;
  const m = harita ?? renkDuzeltHaritasi(g);
  const n = m.w * m.h, isik = new Float32Array(n), kazanc = new Float32Array(n);
  for (let j = 0; j < n; j++) isik[j] = Math.max(B_MIN_ARKA, parlaklik(m.kanal[0][j], m.kanal[1][j], m.kanal[2][j]));
  const sirali = isik.slice().sort();
  const hedef = sirali[Math.min(n - 1, Math.floor(E_KAGIT_YUZDELIK * n))];
  // strength = part of the shadow taken away: 0.7 → a paper at 55 % light ends at 87 %
  for (let j = 0; j < n; j++) kazanc[j] = Math.min(ayar.kazancMax, Math.max(1, 1 + ayar.golgeGuc * (hedef / isik[j] - 1)));
  // the gain is read through the map's bilinear reader
  const km: AydinlatmaHaritasi = { ...m, kanal: [kazanc, kazanc, kazanc] };
  const ara = bosGoruntu(W, H), s = g.data, d = ara.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = s[i], gr = s[i + 1], b = s[i + 2];
      const k = haritaOku(km, 0, x, y);
      let carpan = 1;
      if (k > 1) {
        // Dark ink (every channel well below the paper here) gets only part of the gain, so it
        // stays dark. Coloured ink has one channel near the paper's and gets the full gain like the
        // paper around it: its weak channels stay weak, so it stays saturated and is not whitened.
        const nr = r / Math.max(1, haritaOku(m, 0, x, y)), ng = gr / Math.max(1, haritaOku(m, 1, x, y)), nb = b / Math.max(1, haritaOku(m, 2, x, y));
        const kagit = yumusakEsik(0.45, 0.8, Math.max(nr, ng, nb));
        carpan = 1 + (k - 1) * (E_MUREKKEP_PAY + (1 - E_MUREKKEP_PAY) * kagit);
      }
      // same factor on every channel: the hue stays, no colour fringe
      d[i] = r * carpan; d[i + 1] = gr * carpan; d[i + 2] = b * carpan; d[i + 3] = 255;
    }
  }
  const out = beyazDengesi(ara, E_SIYAH_MAX);
  if (ayar.kontrast > 0) {
    // per channel: white stays white, ink gets darker, a red line stays bright red (scaling all
    // channels by the luma change would turn it dark red: its luma is low)
    const t = new Uint8ClampedArray(256), o = out.data;
    for (let v = 0; v < 256; v++) t[v] = 255 - (255 - v) * (1 + ayar.kontrast);
    for (let i = 0; i < o.length; i += 4) { o[i] = t[o[i]]; o[i + 1] = t[o[i + 1]]; o[i + 2] = t[o[i + 2]]; }
  }
  return out;
}

export interface Filtre { id: 'A' | 'B' | 'C' | 'D' | 'E'; ad: string; uygula: (g: Goruntu) => Goruntu }

export const FILTRELER: readonly Filtre[] = [
  { id: 'A', ad: 'Beyaz dengesi', uygula: beyazDengesi },
  { id: 'B', ad: 'Arka plan (renkli)', uygula: arkaPlanDuzelt },
  { id: 'C', ad: 'Gri belge', uygula: griBelge },
  { id: 'D', ad: 'Siyah-beyaz', uygula: siyahBeyaz },
  { id: 'E', ad: 'Renk düzelt', uygula: g => renkDuzelt(g) }   // dil-kontrol: yoksay
];
