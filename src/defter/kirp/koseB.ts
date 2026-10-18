import { disbukeyZarf, dortgenPuani, dortKoseyeIndir, type Kose4, type KoseSonuc, type Nokta } from './kirpHesap';
import { koseleriBuyut } from './kirpKarar';
import { acikEnBuyuk, dortgenIncelt, enBuyukBolge, kenarDestekleri } from './kenarIncelt';

// Task 5.8b, method B (chosen in 5.8c): page corners without a library. The paper is the largest bright area:
// shrink → "paper value" (brightness minus part of the saturation, so warm light on white paper
// still beats a brown desk) → box blur → Otsu threshold → largest connected bright region →
// convex hull of its row ends → 4 corners. koseBRgba is pure (tested); koseB is the canvas wrapper.
// Task 6.2d-2 (measured on real photos): the largest region is taken after an opening (thin
// bridges to background clutter break), the hull's quadrilateral is refined to the real paper
// edges (kenarIncelt.ts), and the confidence counts how much of each edge is a real paper edge.

export const B_KENAR = 800;               // long edge of the working image, px
export const DOYGUNLUK_AGIRLIGI = 0.5;    // paper value = brightness − this × (max − min of r, g, b)
export const BLUR_YARICAP = 2;            // box blur radius, 2 passes
export const ACMA_ORAN = 0.006;           // opening radius (× long edge, ≈ 5 px at 800): breaks bridges up to ≈ 1 % wide, far thinner than a page
export const ADIM_ORAN = 0.3;             // a paper edge drops at least this share of (paper − background) within a few px; soft shadow edges do not
export const DESTEK_TAM = 0.6;            // the second weakest edge needs this support for full confidence (same bar as UZAK_DESTEK: most of the edge is a real step)

export interface KoseBAyar { acma: boolean; incelt: boolean; destek: boolean }
export const KOSE_B_AYAR: KoseBAyar = { acma: true, incelt: true, destek: true };

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

// Every stage of koseBRgba (the measurement script draws them). bolge = the region the hull is
// taken from; kaba = the hull's quadrilateral; kose = after refinement; destek = per edge.
export function koseBAsamalar(rgba: ArrayLike<number>, w: number, h: number, ayar: KoseBAyar = KOSE_B_AYAR) {
  const n = w * h;
  const v0 = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    v0[i] = lum - DOYGUNLUK_AGIRLIGI * (Math.max(r, g, b) - Math.min(r, g, b));
  }
  const v = boxBlur(boxBlur(v0, w, h, BLUR_YARICAP), w, h, BLUR_YARICAP);
  const t = otsu(v);
  const maske = new Uint8Array(n);
  let ustSay = 0, ustTop = 0, altTop = 0;
  for (let i = 0; i < n; i++) {
    if (v[i] > t) { maske[i] = 1; ustSay++; ustTop += v[i]; } else altTop += v[i];
  }

  // largest region, after the opening when it leaves something
  let bolge: Uint8Array | null = ayar.acma ? acikEnBuyuk(maske, w, h, Math.max(1, Math.round(ACMA_ORAN * Math.max(w, h)))) : null;
  if (bolge && !bolge.some(Boolean)) bolge = null;
  if (!bolge) {
    const { label, best } = enBuyukBolge(maske, w, h);
    if (best !== 0) { bolge = new Uint8Array(n); for (let i = 0; i < n; i++) if (label[i] === best) bolge[i] = 1; }
  }
  let bolgeBoyut = 0;
  if (bolge) for (let i = 0; i < n; i++) bolgeBoyut += bolge[i];
  const temel = { v, t, maske, bolge, bolgeBoyut, ustEsikOran: ustSay / n, zarf: [] as Nokta[], kaba: null as Kose4 | null, kose: null as Kose4 | null, destek: null as number[] | null, guven: 0 };
  if (!bolge || bolgeBoyut === 0) return temel;

  // the hull only needs each row's leftmost and rightmost pixel
  const ends: Nokta[] = [];
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) if (bolge[y * w + x]) { if (l < 0) l = x; r = x; }
    if (l >= 0) ends.push({ x: l, y }, { x: r + 1, y }, { x: l, y: y + 1 }, { x: r + 1, y: y + 1 });
  }
  temel.zarf = disbukeyZarf(ends);
  temel.kaba = dortKoseyeIndir(temel.zarf);
  if (!temel.kaba) return temel;

  // edge steps are looked for in the lightly blurred value (the heavy blur would smear them)
  const ince = (ayar.incelt || ayar.destek) ? boxBlur(v0, w, h, 1) : v0;
  const m1 = ustSay ? ustTop / ustSay : 255, m0 = n - ustSay ? altTop / (n - ustSay) : 0;
  const esik = Math.max(8, ADIM_ORAN * (m1 - m0));
  // paper next to the spiral and the page edge lies in the curl's shadow: below the Otsu
  // threshold but still far above the background, so the "inside is paper" test uses the middle
  const kagit = (t + m0) / 2;
  temel.kose = ayar.incelt ? dortgenIncelt(ince, w, h, temel.kaba, esik, kagit) : temel.kaba;
  let guven = dortgenPuani(temel.kose, w, h);
  if (ayar.destek && guven > 0) {
    temel.destek = kenarDestekleri(ince, w, h, temel.kose, esik, kagit);
    // A notebook page has one side without a clean edge (the spiral or the binding, or a string or
    // finger over it), so the second weakest edge counts. Two weak edges = not the whole page
    // (half of it in a hand's shadow, a corner cut off). Never 0: the corners are kept for the
    // thumbnail's toggle even when the crop is not trusted.
    const ikinci = [...temel.destek].sort((x, y) => x - y)[1];
    guven = Math.max(0.01, Math.round(guven * Math.min(1, ikinci / DESTEK_TAM) * 100) / 100);
  }
  temel.guven = guven;
  return temel;
}

// Corners in this image's pixels, or null.
export function koseBRgba(rgba: ArrayLike<number>, w: number, h: number, ayar: KoseBAyar = KOSE_B_AYAR): KoseSonuc {
  const a = koseBAsamalar(rgba, w, h, ayar);
  return a.kose && a.guven > 0 ? { koseler: a.kose, guven: a.guven } : null;
}

// Browser wrapper: draws a B_KENAR copy of the decoded photo (w × h) and returns corners in
// the photo's own pixels (koseleriBuyut, x and y separately).
export function koseB(src: CanvasImageSource, srcW: number, srcH: number): KoseSonuc {
  const s = Math.min(1, B_KENAR / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * s)), h = Math.max(1, Math.round(srcH * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  try {
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    const r = koseBRgba(ctx.getImageData(0, 0, w, h).data, w, h);
    return r && { koseler: koseleriBuyut(r.koseler, { width: w, height: h }, { width: srcW, height: srcH }), guven: r.guven };
  } finally {
    c.width = c.height = 0;
  }
}
