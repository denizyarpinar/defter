import { koseleriSirala, type Kose4, type Nokta } from './kirpHesap';

// Task 6.2d-2: the pure helpers koseB uses after its rough quadrilateral (no DOM, tested):
// binary opening (cut thin bridges to the background), edge refinement (find the real
// paper → background step near each rough edge and fit a line through it) and edge support
// (how much of an edge is a real paper edge; feeds the confidence). Lengths are fractions of
// the working image's long edge, so they mean the same at any B_KENAR.

// ---------- binary opening ----------

// Square-window sum via an integral image. Outside the image counts as "on" so a page that
// runs off the frame is not eaten from that side.
function pencereToplam(m: Uint8Array, w: number, h: number): Int32Array {
  const I = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += m[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  return I;
}

function kutu(I: Int32Array, w: number, x0: number, y0: number, x1: number, y1: number): number {
  const W = w + 1;
  return I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
}

export function erozyon(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const I = pencereToplam(m, w, h), out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      if (kutu(I, w, x0, y0, x1, y1) === (x1 - x0) * (y1 - y0)) out[y * w + x] = 1;
    }
  }
  return out;
}

export function genislet(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const I = pencereToplam(m, w, h), out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      if (kutu(I, w, x0, y0, x1, y1) > 0) out[y * w + x] = 1;
    }
  }
  return out;
}

// Largest 4-connected "on" region: label array (region number per pixel, 0 = off) and its number.
export function enBuyukBolge(m: Uint8Array, w: number, h: number): { label: Int32Array; best: number; size: number } {
  const n = w * h, label = new Int32Array(n), stack = new Int32Array(n);
  let best = 0, bestSize = 0, next = 0;
  for (let s = 0; s < n; s++) {
    if (label[s] !== 0 || !m[s]) continue;
    next++;
    let top = 0, size = 0;
    stack[top++] = s;
    label[s] = next;
    while (top > 0) {
      const p = stack[--top];
      size++;
      const x = p % w;
      if (x > 0 && !label[p - 1] && m[p - 1]) { label[p - 1] = next; stack[top++] = p - 1; }
      if (x < w - 1 && !label[p + 1] && m[p + 1]) { label[p + 1] = next; stack[top++] = p + 1; }
      if (p >= w && !label[p - w] && m[p - w]) { label[p - w] = next; stack[top++] = p - w; }
      if (p + w < n && !label[p + w] && m[p + w]) { label[p + w] = next; stack[top++] = p + w; }
    }
    if (size > bestSize) { bestSize = size; best = next; }
  }
  return { label, best, size: bestSize };
}

// Opening that keeps only the largest part: erode (thin bridges to background clutter break),
// take the largest region, grow it back by the same radius and keep only pixels that were in
// the mask (the edge stays where the threshold put it). null if erosion leaves nothing.
export function acikEnBuyuk(m: Uint8Array, w: number, h: number, r: number): Uint8Array | null {
  const e = erozyon(m, w, h, r);
  const { label, best } = enBuyukBolge(e, w, h);
  if (best === 0) return null;
  const tek = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) if (label[i] === best) tek[i] = 1;
  const g = genislet(tek, w, h, r);
  for (let i = 0; i < m.length; i++) g[i] &= m[i];
  return g;
}

// ---------- lines ----------

// a·x + b·y = c with (a, b) a unit normal.
export interface Dogru { a: number; b: number; c: number }

export const dogruIki = (p: Nokta, q: Nokta): Dogru | null => {
  const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy);
  if (L < 1e-9) return null;
  const a = dy / L, b = -dx / L;
  return { a, b, c: a * p.x + b * p.y };
};

export const uzaklik = (d: Dogru, p: Nokta) => d.a * p.x + d.b * p.y - d.c;

export function kesisim(d1: Dogru, d2: Dogru): Nokta | null {
  const det = d1.a * d2.b - d2.a * d1.b;
  if (Math.abs(det) < 1e-9) return null;
  return { x: (d1.c * d2.b - d2.c * d1.b) / det, y: (d1.a * d2.c - d2.a * d1.c) / det };
}

// Weighted total least squares: the line through the weighted centroid along the main axis.
export function agirlikliDogru(p: readonly Nokta[], wt: readonly number[]): Dogru | null {
  let W = 0, mx = 0, my = 0;
  for (let i = 0; i < p.length; i++) { W += wt[i]; mx += wt[i] * p[i].x; my += wt[i] * p[i].y; }
  if (p.length < 2 || W <= 0) return null;
  mx /= W; my /= W;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < p.length; i++) {
    const dx = p[i].x - mx, dy = p[i].y - my;
    sxx += wt[i] * dx * dx; sxy += wt[i] * dx * dy; syy += wt[i] * dy * dy;
  }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);   // direction of the largest spread
  const a = -Math.sin(th), b = Math.cos(th);
  return { a, b, c: a * mx + b * my };
}

// RANSAC over point pairs (fixed-seed generator: the same photo always gives the same corners),
// scored by the summed weight of the inliers, then a weighted refit on those inliers.
export function ransacDogru(p: readonly Nokta[], wt: readonly number[], tol: number, deneme = 150): { dogru: Dogru; ic: boolean[] } | null {
  if (p.length < 2) return null;
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
  let bestScore = -1, bestIc: boolean[] = [];
  for (let k = 0; k < deneme; k++) {
    const i = Math.floor(rnd() * p.length), j = Math.floor(rnd() * p.length);
    if (i === j) continue;
    const d = dogruIki(p[i], p[j]);
    if (!d) continue;
    let s = 0;
    const ic = p.map((q, n) => { const o = Math.abs(uzaklik(d, q)) <= tol; if (o) s += wt[n]; return o; });
    if (s > bestScore) { bestScore = s; bestIc = ic; }
  }
  if (bestScore <= 0) return null;
  const ip = p.filter((_, n) => bestIc[n]), iw = wt.filter((_, n) => bestIc[n]);
  const d = agirlikliDogru(ip, iw);
  if (!d) return null;
  return { dogru: d, ic: p.map(q => Math.abs(uzaklik(d, q)) <= tol) };
}

// ---------- paper edge along a profile ----------

// Paper value at (x, y), bilinear; NaN outside the image.
export function ornek(v: Float32Array, w: number, h: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return NaN;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const a = v[y0 * w + x0] * (1 - fx) + v[y0 * w + x1] * fx;
  const b = v[y1 * w + x0] * (1 - fx) + v[y1 * w + x1] * fx;
  return a * (1 - fy) + b * fy;
}

// A real paper edge is a step: the paper side is bright, the next few pixels outside are
// clearly darker AND stay dark for most of the way further out. A grid line or a written
// stroke is dark only for 2–4 px and then paper again, so it fails the "stays dark" test;
// the spiral's bright wire a dozen px out does not (it is less than half the window).
export const ADIM_YARIM = 3;        // px averaged on each side of the step (≈ blur width, a sharp edge fits in it)
export const DIS_PENCERE = 12;      // px further out that must stay dark: 3× a pen or grid line (≈ 2–4 px here)
export const DIS_TOLERANS = 0.5;    // "back to paper" = more than half way from the dark side to the paper side
export const DIS_PAY = 0.5;         // at most this share of the outer window may be back to paper

// Index of the outermost real paper → background step in prof (index grows outwards), with its
// drop, or null. esik = smallest drop that counts; kagit = paper threshold (Otsu) for the
// "inside is mostly paper" check.
export function profilGecis(prof: readonly number[], esik: number, kagit: number): { i: number; dusus: number } | null {
  const n = prof.length;
  const ort = (a: number, b: number) => {
    let s = 0, c = 0;
    for (let k = Math.max(0, a); k <= Math.min(n - 1, b); k++) if (!Number.isNaN(prof[k])) { s += prof[k]; c++; }
    return c ? s / c : NaN;
  };
  let kagitSay = 0, sayilan = 0;
  let sonuc: { i: number; dusus: number } | null = null;
  for (let i = 0; i < n - 1; i++) {
    if (!Number.isNaN(prof[i])) { sayilan++; if (prof[i] > kagit) kagitSay++; }
    if (i < ADIM_YARIM - 1) continue;
    const ic = ort(i - ADIM_YARIM + 1, i), dis = ort(i + 1, i + ADIM_YARIM);
    if (Number.isNaN(ic) || Number.isNaN(dis)) continue;
    const dusus = ic - dis;
    if (dusus < esik) continue;
    // the paper side must be paper-like for most of the way in (not a bright object in the background)
    if (sayilan === 0 || kagitSay / sayilan < 0.6 || ic <= kagit) continue;
    // outside the image counts as "stays dark" (the page may run off the frame)
    let geri = 0, bak = 0;
    for (let k = i + ADIM_YARIM + 1; k <= Math.min(n - 1, i + ADIM_YARIM + DIS_PENCERE); k++) {
      if (Number.isNaN(prof[k])) continue;
      bak++;
      if (prof[k] > dis + DIS_TOLERANS * dusus) geri++;
    }
    if (bak > 0 && geri > DIS_PAY * bak) continue;
    // a step spreads over a few indices: keep the strongest one of a run
    if (sonuc && i - sonuc.i <= ADIM_YARIM) { if (dusus > sonuc.dusus) sonuc = { i, dusus }; }
    else sonuc = { i, dusus };
  }
  return sonuc;
}

// ---------- edge refinement ----------

export const ORNEK_SAYI = 60;        // samples per edge: dense enough for RANSAC, cheap at 800 px
export const UC_PAY = 0.08;          // skip this much of each edge end: corners are where shadows, fingers and the spiral sit
export const SERIT_GENIS = 0.12;     // pass 1 band (± long edge): the rough hull was off by up to ~10 % on the spiral side
export const SERIT_DAR = 0.02;       // pass 2 band around the pass-1 line: a few px either side of a straight paper edge
export const TOL_GENIS = 0.01;       // RANSAC inlier distance, pass 1 (pages bend a little; 1 % ≈ 8 px)
export const TOL_DAR = 0.004;        // pass 2 (≈ 3 px at 800 px: the blur width)
export const IC_MIN = 0.4;           // a line needs this share of the samples behind it, or the edge stays rough
export const UZAK_TASIMA = 0.04;     // moving an edge further than this (long edge) needs strong support …
export const UZAK_DESTEK = 0.6;      // … at least this share of samples on the new line
export const ALAN_DEGISIM = 0.3;     // whole result rejected if the area changes more than ±30 % …
export const KOSE_KAYMA = 0.15;      // … or a corner moves more than 15 % of the long edge

export interface Kenar { dogru: Dogru; destek: number; incelendi: boolean }

// Candidate edge points across a band around line d (outward normal n = (a, b) of d).
// cerceveHaric: skip samples where the image frame is closer outside the line than the "stays dark"
// check reaches; there the photo cannot tell whether the line is a paper edge.
function adaylar(v: Float32Array, w: number, h: number, p0: Nokta, p1: Nokta, d: Dogru, bant: number, esik: number, kagit: number, cerceveHaric = false) {
  const pts: Nokta[] = [], wt: number[] = [];
  let gecerli = 0;
  const S = Math.max(2, Math.round(bant));
  for (let k = 0; k < ORNEK_SAYI; k++) {
    const t = UC_PAY + (1 - 2 * UC_PAY) * (k + 0.5) / ORNEK_SAYI;
    // a point on d near the sample position of the rough edge
    const bx = p0.x + (p1.x - p0.x) * t, by = p0.y + (p1.y - p0.y) * t;
    const o = uzaklik(d, { x: bx, y: by });
    const cx = bx - o * d.a, cy = by - o * d.b;
    const dx = ADIM_YARIM + DIS_PENCERE;
    if (cerceveHaric && Number.isNaN(ornek(v, w, h, cx + dx * d.a, cy + dx * d.b))) continue;
    const prof: number[] = [];
    for (let s = -S; s <= S; s++) prof.push(ornek(v, w, h, cx + s * d.a, cy + s * d.b));
    // samples whose band is mostly outside the image say nothing about the edge
    if (prof.filter(Number.isNaN).length > S) continue;
    gecerli++;
    const g = profilGecis(prof, esik, kagit);
    if (!g) continue;
    const s = g.i - S + 0.5;   // the step sits between index i and i + 1
    pts.push({ x: cx + s * d.a, y: cy + s * d.b });
    wt.push(g.dusus);
  }
  return { pts, wt, gecerli };
}

// Line for the edge p0 → p1 of a clockwise quadrilateral (outward normal = left of the direction on screen).
const disDogru = (p0: Nokta, p1: Nokta) => dogruIki(p0, p1);

// Two passes: wide band around the rough edge, then a narrow band around the pass-1 line.
export function kenarIncelt(v: Float32Array, w: number, h: number, p0: Nokta, p1: Nokta, esik: number, kagit: number): Kenar | null {
  const L = Math.max(w, h);
  const kaba = disDogru(p0, p1);
  if (!kaba) return null;
  const a1 = adaylar(v, w, h, p0, p1, kaba, SERIT_GENIS * L, esik, kagit);
  if (a1.gecerli === 0) return { dogru: kaba, destek: 1, incelendi: false };   // edge runs along the frame: nothing to refine
  const r1 = ransacDogru(a1.pts, a1.wt, TOL_GENIS * L);
  if (!r1 || r1.ic.filter(Boolean).length < IC_MIN * a1.gecerli) return { dogru: kaba, destek: 0, incelendi: false };
  // keep the normal pointing outwards like the rough line's
  let d1 = r1.dogru;
  if (d1.a * kaba.a + d1.b * kaba.b < 0) d1 = { a: -d1.a, b: -d1.b, c: -d1.c };
  const a2 = adaylar(v, w, h, p0, p1, d1, SERIT_DAR * L, esik, kagit, true);
  const r2 = ransacDogru(a2.pts, a2.wt, TOL_DAR * L);
  const ic2 = r2 ? r2.ic.filter(Boolean).length : 0;
  if (!r2 || a2.gecerli === 0 || ic2 < IC_MIN * a2.gecerli) return { dogru: kaba, destek: 0, incelendi: false };
  let d2 = r2.dogru;
  if (d2.a * kaba.a + d2.b * kaba.b < 0) d2 = { a: -d2.a, b: -d2.b, c: -d2.c };
  const destek = ic2 / a2.gecerli;
  const tasima = Math.max(Math.abs(uzaklik(d2, p0)), Math.abs(uzaklik(d2, p1)));
  if (tasima > UZAK_TASIMA * L && destek < UZAK_DESTEK) return { dogru: kaba, destek: 0, incelendi: false };
  return { dogru: d2, destek, incelendi: true };
}

const alanAbs = (k: readonly Nokta[]) => Math.abs(k.reduce((s, a, i) => { const b = k[(i + 1) % k.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2);

// Rough quadrilateral (clockwise on screen) → refined one, or the rough one when the result
// looks wrong (crossing lines, big area change, a corner moved too far). Corners are clamped
// to the image like the hull's are.
export function dortgenIncelt(v: Float32Array, w: number, h: number, kaba: Kose4, esik: number, kagit: number): Kose4 {
  const L = Math.max(w, h);
  const kenarlar = [0, 1, 2, 3].map(i => kenarIncelt(v, w, h, kaba[i], kaba[(i + 1) % 4], esik, kagit));
  if (kenarlar.some(k => !k) || !kenarlar.some(k => k!.incelendi)) return kaba;
  const yeni: Nokta[] = [];
  for (let i = 0; i < 4; i++) {
    const p = kesisim(kenarlar[(i + 3) % 4]!.dogru, kenarlar[i]!.dogru);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return kaba;
    yeni.push({ x: Math.min(w, Math.max(0, p.x)), y: Math.min(h, Math.max(0, p.y)) });
  }
  // convex, same turning direction as the rough one
  for (let i = 0; i < 4; i++) {
    const a = yeni[(i + 3) % 4], b = yeni[i], c = yeni[(i + 1) % 4];
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0) return kaba;
  }
  const A0 = alanAbs(kaba), A1 = alanAbs(yeni);
  if (Math.abs(A1 - A0) > ALAN_DEGISIM * A0) return kaba;
  if (yeni.some((p, i) => Math.hypot(p.x - kaba[i].x, p.y - kaba[i].y) > KOSE_KAYMA * L)) return kaba;
  return koseleriSirala(yeni);
}

// ---------- edge support ----------

// Per edge: share of the samples where a real paper → background step lies on the edge, measured
// like pass 2 of the refinement (band SERIT_DAR, distance TOL_DAR), so a refined edge's support is
// the share of samples behind its line. Samples next to the image frame are not counted; an
// edge with no counted samples (it runs along the frame) gets 1: nothing says it is wrong.
export function kenarDestekleri(v: Float32Array, w: number, h: number, k: Kose4, esik: number, kagit: number): number[] {
  const L = Math.max(w, h);
  return [0, 1, 2, 3].map(i => {
    const p0 = k[i], p1 = k[(i + 1) % 4], d = disDogru(p0, p1);
    if (!d) return 0;
    const a = adaylar(v, w, h, p0, p1, d, SERIT_DAR * L, esik, kagit, true);
    if (a.gecerli === 0) return 1;
    let say = 0;
    for (const p of a.pts) if (Math.abs(uzaklik(d, p)) <= TOL_DAR * L) say++;
    return say / a.gecerli;
  });
}
