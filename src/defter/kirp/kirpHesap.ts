import { MAX_KENAR } from '../ayarlar';
import { hedefBoyut, type Boyut } from '../gorselHesap';

// Task 5.8b: the pure part of cropping a notebook page out of a photo (no DOM, tested):
// corner order, convex hull → 4 corners, how page-like a quadrilateral is, output size and
// the homography for the perspective fix. The browser parts are perspektif.ts and koseB.ts.

export interface Nokta { x: number; y: number }
// top-left, top-right, bottom-right, bottom-left (image pixels, y down)
export type Kose4 = [Nokta, Nokta, Nokta, Nokta];
export type KoseSonuc = { koseler: Kose4; guven: number } | null;

const cross = (o: Nokta, a: Nokta, b: Nokta) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const dist = (a: Nokta, b: Nokta) => Math.hypot(a.x - b.x, a.y - b.y);

// Signed area (shoelace); positive = clockwise on screen (y down).
export function alan(p: readonly Nokta[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

// Any 4 points → top-left, top-right, bottom-right, bottom-left. Sorted by angle around the
// centre (clockwise on screen), then rotated so the point with the smallest x + y comes first.
export function koseleriSirala(p: readonly Nokta[]): Kose4 {
  if (p.length !== 4) throw new RangeError(`4 köşe gerekli, ${p.length} geldi`);
  const cx = (p[0].x + p[1].x + p[2].x + p[3].x) / 4;
  const cy = (p[0].y + p[1].y + p[2].y + p[3].y) / 4;
  const s = [...p].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let first = 0;
  for (let i = 1; i < 4; i++) if (s[i].x + s[i].y < s[first].x + s[first].y) first = i;
  return [0, 1, 2, 3].map(i => ({ ...s[(first + i) % 4] })) as Kose4;
}

// Convex hull (monotone chain), clockwise on screen, no collinear points.
export function disbukeyZarf(points: readonly Nokta[]): Nokta[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const lower: Nokta[] = [], upper: Nokta[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);   // counter-clockwise in y-up terms = clockwise on screen
}

// Hull → the 4 hull points with the largest area. A finger or spiral holes on the page edge
// only make dents, and the hull steps over dents, so the corners survive.
// O(n³) over the hull; hulls with more than ZARF_SINIR points are thinned evenly first.
export const ZARF_SINIR = 120;
export function dortKoseyeIndir(zarf: readonly Nokta[]): Kose4 | null {
  let h = zarf;
  if (h.length > ZARF_SINIR) {
    const step = h.length / ZARF_SINIR;
    h = Array.from({ length: ZARF_SINIR }, (_, i) => zarf[Math.floor(i * step)]);
  }
  const n = h.length;
  if (n < 4) return null;
  const tri = (a: number, b: number, c: number) => Math.abs(cross(h[a], h[b], h[c])) / 2;
  let best = 0, bi = -1, bj = -1, bk = -1, bl = -1;
  // diagonal i–k; best j on one side and best l on the other are independent
  for (let i = 0; i < n; i++) {
    for (let k = i + 2; k < n; k++) {
      let ja = 0, jb = -1;
      for (let j = i + 1; j < k; j++) { const a = tri(i, j, k); if (a > ja) { ja = a; jb = j; } }
      let la = 0, lb = -1;
      for (let l = k + 1; l < n + i; l++) { const a = tri(i, k, l % n); if (a > la) { la = a; lb = l % n; } }
      if (jb >= 0 && lb >= 0 && ja + la > best) { best = ja + la; bi = i; bj = jb; bk = k; bl = lb; }
    }
  }
  if (bi < 0 || best <= 0) return null;
  return koseleriSirala([h[bi], h[bj], h[bk], h[bl]]);
}

// How page-like a quadrilateral is, 0–1. 0 = rejected: not convex, the whole image frame
// (area > ALAN_UST of the image), or too small (< ALAN_ALT).
export const ALAN_ALT = 0.15;
export const ALAN_UST = 0.98;
export function dortgenPuani(k: Kose4, w: number, h: number): number {
  const r = Math.abs(alan(k)) / (w * h);
  if (!(r >= ALAN_ALT && r <= ALAN_UST)) return 0;
  let sign = 0;
  let maxDev = 0;
  for (let i = 0; i < 4; i++) {
    const prev = k[(i + 3) % 4], cur = k[i], next = k[(i + 1) % 4];
    const c = cross(prev, cur, next);
    if (c === 0 || (sign !== 0 && Math.sign(c) !== sign)) return 0;
    sign = Math.sign(c);
    const ax = prev.x - cur.x, ay = prev.y - cur.y, bx = next.x - cur.x, by = next.y - cur.y;
    const ang = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by)))));
    maxDev = Math.max(maxDev, Math.abs(ang - Math.PI / 2));
  }
  const aci = Math.max(0, 1 - maxDev / (Math.PI / 4));   // 45° off → 0
  const s = [dist(k[0], k[1]), dist(k[1], k[2]), dist(k[2], k[3]), dist(k[3], k[0])];
  const kenar = (Math.min(s[0], s[2]) / Math.max(s[0], s[2])) * (Math.min(s[1], s[3]) / Math.max(s[1], s[3]));
  const buyukluk = Math.min(1, r / 0.4);
  return Math.round((0.5 * aci + 0.3 * kenar + 0.2 * buyukluk) * 100) / 100;
}

// Output size of the straightened page: average of opposite edges, long edge ≤ maxKenar, never enlarged.
export function cikisBoyutu(k: Kose4, maxKenar = MAX_KENAR): Boyut {
  const w = (dist(k[0], k[1]) + dist(k[3], k[2])) / 2;
  const h = (dist(k[0], k[3]) + dist(k[1], k[2])) / 2;
  return hedefBoyut(Math.max(1, w), Math.max(1, h), maxKenar);
}

export const olcekle = (k: Kose4, s: number): Kose4 => k.map(p => ({ x: p.x * s, y: p.y * s })) as Kose4;

// 3×3 homography (row-major, h[8] = 1) that maps each kaynak[i] to hedef[i]. null if degenerate.
export type Homografi = number[];
export function homografi(kaynak: readonly Nokta[], hedef: readonly Nokta[]): Homografi | null {
  // three corners on one line: the system may still solve, but the map squashes the page flat
  for (const p of [kaynak, hedef]) {
    for (let i = 0; i < 4; i++) if (Math.abs(cross(p[i], p[(i + 1) % 4], p[(i + 2) % 4])) < 1e-9) return null;
  }
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = kaynak[i], { x: u, y: v } = hedef[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting on the 8×9 augmented matrix
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      if (f !== 0) for (let j = c; j < 9; j++) A[r][j] -= f * A[c][j];
    }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  h.push(1);
  return h.every(Number.isFinite) ? h : null;
}

export function uygula(H: Homografi, p: Nokta): Nokta {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}
