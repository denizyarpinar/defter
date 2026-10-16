import { disbukeyZarf, dortgenPuani, dortKoseyeIndir, olcekle, type KoseSonuc, type Nokta } from './kirpHesap';

// Task 5.8b, method B: page corners without a library. The paper is the largest bright area:
// shrink → "paper value" (brightness minus part of the saturation, so warm light on white paper
// still beats a brown desk) → box blur → Otsu threshold → largest connected bright region →
// convex hull of its row ends → 4 corners. koseBRgba is pure (tested); koseB is the canvas wrapper.

export const B_KENAR = 800;               // long edge of the working image, px
export const DOYGUNLUK_AGIRLIGI = 0.5;    // paper value = brightness − this × (max − min of r, g, b)
export const BLUR_YARICAP = 2;            // box blur radius, 2 passes

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let d = -r; d <= r; d++) { const xx = x + d; if (xx >= 0 && xx < w) { s += src[y * w + xx]; n++; } }
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let d = -r; d <= r; d++) { const yy = y + d; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; n++; } }
      out[y * w + x] = s / n;
    }
  }
  return out;
}

export function otsu(v: Float32Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < v.length; i++) hist[Math.max(0, Math.min(255, Math.round(v[i])))]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0, sumB = 0, best = -1, t = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = v.length - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  return t;
}

// Corners in this image's pixels, or null.
export function koseBRgba(rgba: ArrayLike<number>, w: number, h: number): KoseSonuc {
  const n = w * h;
  let v: Float32Array = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    v[i] = lum - DOYGUNLUK_AGIRLIGI * (Math.max(r, g, b) - Math.min(r, g, b));
  }
  v = boxBlur(boxBlur(v, w, h, BLUR_YARICAP), w, h, BLUR_YARICAP);
  const t = otsu(v);

  // largest 4-connected region above the threshold
  const label = new Int32Array(n);   // 0 = not visited
  const stack = new Int32Array(n);
  let bestLabel = 0, bestSize = 0, next = 0;
  for (let s = 0; s < n; s++) {
    if (label[s] !== 0 || v[s] <= t) continue;
    next++;
    let top = 0, size = 0;
    stack[top++] = s;
    label[s] = next;
    while (top > 0) {
      const p = stack[--top];
      size++;
      const x = p % w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of nb) {
        if (q < 0 || q >= n || label[q] !== 0 || v[q] <= t) continue;
        label[q] = next;
        stack[top++] = q;
      }
    }
    if (size > bestSize) { bestSize = size; bestLabel = next; }
  }
  if (bestLabel === 0) return null;

  // the hull only needs each row's leftmost and rightmost pixel
  const ends: Nokta[] = [];
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) if (label[y * w + x] === bestLabel) { if (l < 0) l = x; r = x; }
    if (l >= 0) ends.push({ x: l, y }, { x: r + 1, y }, { x: l, y: y + 1 }, { x: r + 1, y: y + 1 });
  }
  const k = dortKoseyeIndir(disbukeyZarf(ends));
  if (!k) return null;
  const guven = dortgenPuani(k, w, h);
  return guven > 0 ? { koseler: k, guven } : null;
}

// Canvas wrapper: works on a B_KENAR copy, returns corners in the canvas's own pixels.
export function koseB(src: HTMLCanvasElement): KoseSonuc {
  const s = Math.min(1, B_KENAR / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * s)), h = Math.max(1, Math.round(src.height * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  try {
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0, w, h);
    const r = koseBRgba(ctx.getImageData(0, 0, w, h).data, w, h);
    return r && { koseler: olcekle(r.koseler, src.width / w), guven: r.guven };
  } finally {
    c.width = c.height = 0;
  }
}
