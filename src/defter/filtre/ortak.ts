// Task 6.2a: shared pieces of the document filters (src/defter/filtre/filtreler.ts). Pure TS on
// RGBA pixels; ImageData fits the Goruntu type, and the Node tests build plain objects.

export interface Goruntu { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number }

export const AYDINLATMA_KENAR = 250;   // long edge of the small lighting grid, blocks
export const AYDINLATMA_MAX_R = 2;     // max filter radius on the grid, blocks (wipes out ink up to ~5 blocks)
export const AYDINLATMA_BLUR_R = 3;    // box blur radius on the grid, blocks, 2 passes

export function bosGoruntu(width: number, height: number): Goruntu {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

// Rec.601 luma, 0–255
export const parlaklik = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

// smallest value v with at least p (0–1) of the counted pixels ≤ v
export function yuzdelik(hist: Uint32Array, p: number): number {
  let toplam = 0;
  for (let i = 0; i < hist.length; i++) toplam += hist[i];
  if (!toplam) return 0;
  const hedef = Math.max(1, Math.ceil(p * toplam));
  let say = 0;
  for (let v = 0; v < hist.length; v++) {
    say += hist[v];
    if (say >= hedef) return v;
  }
  return hist.length - 1;
}

// one histogram per channel (r, g, b)
export function kanalHistogramlari(g: Goruntu): [Uint32Array, Uint32Array, Uint32Array] {
  const h: [Uint32Array, Uint32Array, Uint32Array] = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  const d = g.data;
  for (let i = 0; i < d.length; i += 4) { h[0][d[i]]++; h[1][d[i + 1]]++; h[2][d[i + 2]]++; }
  return h;
}

export function griDizi(g: Goruntu): Float32Array {
  const d = g.data, out = new Float32Array(g.width * g.height);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = parlaklik(d[i], d[i + 1], d[i + 2]);
  return out;
}

export function griGoruntu(v: Float32Array, width: number, height: number): Goruntu {
  const out = bosGoruntu(width, height), d = out.data;
  for (let j = 0, i = 0; j < v.length; j++, i += 4) { d[i] = d[i + 1] = d[i + 2] = v[j]; d[i + 3] = 255; }
  return out;
}

// Box blur, separable sliding sums: O(pixels) whatever r is. At the edges the average is taken
// over the pixels that exist (no dark border).
export function kutuBulanik(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let sum = 0, n = 0;
    for (let x = 0; x < Math.min(r, w); x++) { sum += src[o + x]; n++; }
    for (let x = 0; x < w; x++) {
      if (x + r < w) { sum += src[o + x + r]; n++; }
      if (x - r - 1 >= 0) { sum -= src[o + x - r - 1]; n--; }
      tmp[o + x] = sum / n;
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0, n = 0;
    for (let y = 0; y < Math.min(r, h); y++) { sum += tmp[y * w + x]; n++; }
    for (let y = 0; y < h; y++) {
      if (y + r < h) { sum += tmp[(y + r) * w + x]; n++; }
      if (y - r - 1 >= 0) { sum -= tmp[(y - r - 1) * w + x]; n--; }
      out[y * w + x] = sum / n;
    }
  }
  return out;
}

// Max filter in a (2r+1)² square, separable.
export function maxFiltre(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) if (src[y * w + k] > m) m = src[y * w + k];
      tmp[y * w + x] = m;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) if (tmp[k * w + x] > m) m = tmp[k * w + x];
      out[y * w + x] = m;
    }
  }
  return out;
}

// The paper's brightness and colour at every place, without the ink: a small grid where each block
// keeps its brightest value per channel, then max filter (removes ink) and blur (smooth light).
export interface AydinlatmaHaritasi { w: number; h: number; blok: number; kanal: [Float32Array, Float32Array, Float32Array] }

// mirrored index for -n ≤ i < 2n (… 1 0 | 0 1 … n-1 | n-1 n-2 …); repeats for tiny grids
function yansitIndeks(i: number, n: number): number {
  while (i < 0 || i >= n) i = i < 0 ? -i - 1 : 2 * n - i - 1;
  return i;
}

// Grid grown by p cells on every side with mirrored values (task 6.2b: the filters then see the
// paper continue past the edge instead of a shorter window).
function yansitBuyut(src: Float32Array, w: number, h: number, p: number): Float32Array {
  const W = w + 2 * p, out = new Float32Array(W * (h + 2 * p));
  for (let y = 0; y < h + 2 * p; y++) {
    const sy = yansitIndeks(y - p, h) * w;
    for (let x = 0; x < W; x++) out[y * W + x] = src[sy + yansitIndeks(x - p, w)];
  }
  return out;
}

function kirpGrid(src: Float32Array, w: number, h: number, p: number): Float32Array {
  const W = w + 2 * p, out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) out.set(src.subarray((y + p) * W + p, (y + p) * W + p + w), y * w);
  return out;
}

// yansit = true (filter E): the grid is mirrored at the edges before max filter and blur.
export function aydinlatmaHaritasi(g: Goruntu, yansit = false): AydinlatmaHaritasi {
  const { width: W, height: H, data: d } = g;
  const blok = Math.max(1, Math.round(Math.max(W, H) / AYDINLATMA_KENAR));
  const w = Math.ceil(W / blok), h = Math.ceil(H / blok);
  const kanal = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)] as AydinlatmaHaritasi['kanal'];
  for (let y = 0; y < H; y++) {
    const gy = ((y / blok) | 0) * w;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, j = gy + ((x / blok) | 0);
      for (let c = 0; c < 3; c++) if (d[i + c] > kanal[c][j]) kanal[c][j] = d[i + c];
    }
  }
  const p = yansit ? AYDINLATMA_MAX_R + 2 * AYDINLATMA_BLUR_R : 0;
  const pw = w + 2 * p, ph = h + 2 * p;
  for (let c = 0; c < 3; c++) {
    let k = p ? yansitBuyut(kanal[c], w, h, p) : kanal[c];
    k = maxFiltre(k, pw, ph, AYDINLATMA_MAX_R);
    k = kutuBulanik(k, pw, ph, AYDINLATMA_BLUR_R);
    k = kutuBulanik(k, pw, ph, AYDINLATMA_BLUR_R);
    kanal[c] = p ? kirpGrid(k, w, h, p) : k;
  }
  return { w, h, blok, kanal };
}

// Bilinear read of channel c at full-image pixel (x, y).
export function haritaOku(m: AydinlatmaHaritasi, c: number, x: number, y: number): number {
  let fx = (x + 0.5) / m.blok - 0.5, fy = (y + 0.5) / m.blok - 0.5;
  fx = fx < 0 ? 0 : fx > m.w - 1 ? m.w - 1 : fx;
  fy = fy < 0 ? 0 : fy > m.h - 1 ? m.h - 1 : fy;
  const x0 = fx | 0, y0 = fy | 0;
  const x1 = x0 + 1 < m.w ? x0 + 1 : x0, y1 = y0 + 1 < m.h ? y0 + 1 : y0;
  const ax = fx - x0, ay = fy - y0, k = m.kanal[c];
  const top = k[y0 * m.w + x0] + (k[y0 * m.w + x1] - k[y0 * m.w + x0]) * ax;
  const bot = k[y1 * m.w + x0] + (k[y1 * m.w + x1] - k[y1 * m.w + x0]) * ax;
  return top + (bot - top) * ay;
}
