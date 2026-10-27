import type { AtlasD } from './atlasCoz';
import type { ElYazisiAtlas } from './atlasSema';

// Task 6.4e-1: the printer, the twin of tools/atlas/basici.py (no DOM). A glyph is prepared once per
// (sample, colour, style), at the atlas xh, as RGBA; the page draws it scaled.
// - tukenmez: U = D enlarged 3× with PIL's Lanczos (ported below, the same coefficients), α = smoothstep(U; esik[renk])
//   · clip(d0 + d1·U/D90, 0, 1), 3×3 box mean → alpha; colour = the colour's tone. Drawn source-over, which
//   gives Python's kâğıt + kaplama·(ton − kâğıt) (glyph boxes never overlap: the gap between them is > 0).
// - yumusak: transmittance T_c = exp(−D·yogunluk·p_c) as RGB, drawn with multiply. No paper noise.
// Every parameter comes from the atlas JSON (stiller, renkler); nothing is hard-coded here.
// Arithmetic follows numpy's float32 steps (Math.fround) so the result matches the Python reference
// (scripts/temiz-yazi-esdeger.test.ts).

export const STILLER = ['tukenmez', 'yumusak'] as const;
export type Stil = typeof STILLER[number];

export interface TukenmezAyar { buyut: number; doku: [number, number, number]; esik: Record<string, [number, number]>; tonlar: Record<string, [number, number, number]> }

export class AtlasStilYok extends Error {
  constructor(ne: string) { super(`El yazısı atlasında ${ne} yok. Paketi yeniden üret (uret.py paket) ve yükle.`); }   // dil-kontrol: yoksay
}

export function kagitRengi(atlas: Pick<ElYazisiAtlas, 'stiller'>): [number, number, number] {
  const k = atlas.stiller.kagit;
  if (!Array.isArray(k) || k.length !== 3) throw new AtlasStilYok('kâğıt rengi (stiller.kagit)');   // dil-kontrol: yoksay
  return k as [number, number, number];
}

export function tukenmezAyar(atlas: Pick<ElYazisiAtlas, 'stiller'>): TukenmezAyar {
  const t = atlas.stiller.tukenmez as Partial<TukenmezAyar> | undefined;
  if (!t || !t.buyut || !t.doku || !t.esik || !t.tonlar) throw new AtlasStilYok('tükenmez stili (stiller.tukenmez)');   // dil-kontrol: yoksay
  return t as TukenmezAyar;
}

// Python's round(): half to even
export function pyRound(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

// ---- PIL resize (Resample.c) for one float channel ----

const sinc = (x: number) => { if (x === 0) return 1; x *= Math.PI; return Math.sin(x) / x; };
export const lanczos = (x: number) => (-3 <= x && x < 3 ? sinc(x) * sinc(x / 3) : 0);
const LANCZOS_DESTEK = 3;

interface Katsayi { min: number; k: Float64Array }

// precompute_coeffs: box (0, inSize), double precision
export function pilKatsayilar(inSize: number, outSize: number): Katsayi[] {
  const scale = inSize / outSize;
  const filterscale = Math.max(scale, 1);
  const support = LANCZOS_DESTEK * filterscale;
  const ss = 1 / filterscale;
  const out: Katsayi[] = [];
  for (let xx = 0; xx < outSize; xx++) {
    const center = (xx + 0.5) * scale;
    const xmin = Math.max(Math.trunc(center - support + 0.5), 0);
    const xmax = Math.min(Math.trunc(center + support + 0.5), inSize) - xmin;
    const k = new Float64Array(Math.max(xmax, 0));
    let ww = 0;
    for (let x = 0; x < xmax; x++) { const w = lanczos((x + xmin - center + 0.5) * ss); k[x] = w; ww += w; }
    if (ww !== 0) for (let x = 0; x < xmax; x++) k[x] /= ww;
    out.push({ min: xmin, k });
  }
  return out;
}

// Image.resize((w2, h2), LANCZOS) on mode "F": horizontal pass, then vertical; float32 in between. Negatives → 0 (np.maximum).
export function lanczosBuyut(g: AtlasD, w2: number, h2: number): AtlasD {
  const { w, h, D } = g;
  let ara: Float32Array = D, aw = w;
  if (w2 !== w) {
    const kx = pilKatsayilar(w, w2);
    ara = new Float32Array(w2 * h);
    for (let y = 0; y < h; y++) {
      for (let xx = 0; xx < w2; xx++) {
        const { min, k } = kx[xx];
        let s = 0;
        for (let x = 0; x < k.length; x++) s += D[y * w + x + min] * k[x];
        ara[y * w2 + xx] = s;
      }
    }
    aw = w2;
  }
  let son = ara;
  if (h2 !== h) {
    const ky = pilKatsayilar(h, h2);
    son = new Float32Array(aw * h2);
    for (let yy = 0; yy < h2; yy++) {
      const { min, k } = ky[yy];
      for (let x = 0; x < aw; x++) {
        let s = 0;
        for (let y = 0; y < k.length; y++) s += ara[(y + min) * aw + x] * k[y];
        son[yy * aw + x] = s;
      }
    }
  } else if (son === D) son = D.slice();
  for (let i = 0; i < son.length; i++) if (son[i] < 0) son[i] = 0;
  return { w: aw, h: h2, D: son };
}

// np.percentile(D[D > 0], q) (method "linear"); no ink → 1
export function yuzdelik(D: Float32Array, q: number): number {
  const v = D.filter(x => x > 0).sort();
  if (!v.length) return 1;
  const i = (v.length - 1) * q / 100;
  const lo = Math.floor(i), hi = Math.min(lo + 1, v.length - 1);
  return v[lo] + (v[hi] - v[lo]) * (i - lo);
}

const f = Math.fround;
const kirp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ---- glyphs ----

export interface Glif {
  w: number; h: number;
  rgba: Uint8ClampedArray;   // tukenmez: tone + alpha (source-over) · yumusak: transmittance, alpha 255 (multiply)
  taban: number;             // box top → baseline (px, at atlas xh)
}

// tukenmez: coverage at 1× (0–1), before 8-bit
export function tukenmezKaplama(g: AtlasD, renk: string, t: TukenmezAyar): Float32Array {
  const k = Math.round(t.buyut);
  const esik = t.esik[renk];
  if (!esik) throw new AtlasStilYok(`"${renk}" rengi için tükenmez eşiği`);   // dil-kontrol: yoksay
  const [e0, e1] = esik;
  const [d0, d1, q] = t.doku;
  const U = lanczosBuyut(g, g.w * k, g.h * k);
  const d90 = Math.max(yuzdelik(g.D, q), 1e-6);
  const fe0 = f(e0), fark = f(e1 - e0), fd0 = f(d0), fd1 = f(d1), fd90 = f(d90);
  const c = new Float32Array(U.D.length);
  for (let i = 0; i < c.length; i++) {
    const u = U.D[i];
    const tt = kirp01(f(f(u - fe0) / fark));
    const ss = f(f(tt * tt) * f(3 - f(2 * tt)));
    const doku = kirp01(f(fd0 + f(f(fd1 * u) / fd90)));
    c[i] = f(ss * doku);
  }
  const out = new Float32Array(g.w * g.h);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      let s = 0;
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) s += c[(y * k + dy) * U.w + x * k + dx];
      out[y * g.w + x] = s / (k * k);
    }
  }
  return out;
}

export function tukenmezGlif(g: AtlasD, taban: number, renk: string, atlas: Pick<ElYazisiAtlas, 'stiller'>): Glif {
  const t = tukenmezAyar(atlas);
  const ton = t.tonlar[renk];
  if (!ton) throw new AtlasStilYok(`"${renk}" rengi için tükenmez tonu`);   // dil-kontrol: yoksay
  const kap = tukenmezKaplama(g, renk, t);
  const rgba = new Uint8ClampedArray(g.w * g.h * 4);
  for (let i = 0; i < kap.length; i++) {
    rgba[i * 4] = ton[0]; rgba[i * 4 + 1] = ton[1]; rgba[i * 4 + 2] = ton[2];
    rgba[i * 4 + 3] = Math.round(kap[i] * 255);
  }
  return { w: g.w, h: g.h, rgba, taban };
}

export function yumusakGlif(g: AtlasD, taban: number, renk: string, atlas: Pick<ElYazisiAtlas, 'renkler'>): Glif {
  const r = atlas.renkler[renk];
  if (!r) throw new AtlasStilYok(`"${renk}" rengi`);
  const yog = f(r.yogunluk), p = r.p.map(f);
  const rgba = new Uint8ClampedArray(g.w * g.h * 4);
  for (let i = 0; i < g.D.length; i++) {
    const a = f(g.D[i] * yog);
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(Math.exp(-f(a * p[c])) * 255);
    rgba[i * 4 + 3] = 255;
  }
  return { w: g.w, h: g.h, rgba, taban };
}

// Prepared glyphs: (style, colour, character, sample no) → RGBA. One preparation per key.
export class GlifBellegi {
  private readonly m = new Map<string, Glif>();
  constructor(private readonly atlas: ElYazisiAtlas, private readonly ornek: (karakter: string, i: number) => AtlasD) {}
  get boyut(): number { return this.m.size; }
  glif(stil: Stil, renk: string, karakter: string, i: number): Glif {
    const anahtar = `${stil}\u0000${renk}\u0000${karakter}\u0000${i}`;
    let g = this.m.get(anahtar);
    if (!g) {
      const o = this.atlas.karakterler[karakter][i];
      const D = this.ornek(karakter, i);
      g = stil === 'tukenmez' ? tukenmezGlif(D, o.taban, renk, this.atlas) : yumusakGlif(D, o.taban, renk, this.atlas);
      this.m.set(anahtar, g);
    }
    return g;
  }
}

// ---- one line, exactly like basici.py bas() (equivalence test and the dev page) ----

const KENAR = 0.5, YUKSEKLIK = 3.0, TABAN_Y = 2.1, EKSIK_GENISLIK = 0.5;

export interface SatirSonucu { w: number; h: number; rgb: Uint8ClampedArray; eksik: string[] }

// At the atlas xh only (glyphs are not rescaled); oynama is always 0 here (the reference turns it off)
export function satirBas(metin: string, renk: string, stil: Stil, atlas: ElYazisiAtlas, bellek: GlifBellegi): SatirSonucu {
  const xh = atlas.xh;
  const kenar = pyRound(KENAR * xh), harfArasi = pyRound(atlas.aralik.harf * xh), kelimeArasi = pyRound(atlas.aralik.kelime * xh);
  const parcalar: { x: number; g: Glif }[] = [];
  const eksik: string[] = [];
  const sayac = new Map<string, number>();
  let x = kenar, onceki = false;
  for (const k of metin) {
    if (k === ' ') { x += kelimeArasi; onceki = false; continue; }
    if (onceki) x += harfArasi;
    const secenek = atlas.karakterler[k];
    if (!secenek?.length) { eksik.push(k); x += pyRound(EKSIK_GENISLIK * xh); onceki = true; continue; }
    const n = sayac.get(k) ?? 0; sayac.set(k, n + 1);
    const g = bellek.glif(stil, renk, k, n % secenek.length);
    parcalar.push({ x, g });
    x += g.w;
    onceki = true;
  }
  const W = Math.max(x + kenar, 1), H = pyRound(YUKSEKLIK * xh), tabanY = pyRound(TABAN_Y * xh);
  const kagit = kagitRengi(atlas);
  const rgb = new Uint8ClampedArray(W * H * 3);
  const yuzey = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) yuzey[i * 3 + c] = kagit[c];
  for (const { x: gx, g } of parcalar) {
    const gy = pyRound(tabanY - g.taban);
    for (let y = Math.max(0, gy); y < Math.min(H, gy + g.h); y++) {
      for (let xx = gx; xx < Math.min(W, gx + g.w); xx++) {
        const s = ((y - gy) * g.w + (xx - gx)) * 4, d = (y * W + xx) * 3;
        for (let c = 0; c < 3; c++) {
          yuzey[d + c] = stil === 'tukenmez'
            ? yuzey[d + c] * (1 - g.rgba[s + 3] / 255) + g.rgba[s + c] * (g.rgba[s + 3] / 255)
            : yuzey[d + c] * g.rgba[s + c] / 255;
        }
      }
    }
  }
  // tukenmez: np.round; yumusak: astype(uint8) truncates
  for (let i = 0; i < yuzey.length; i++) rgb[i] = stil === 'tukenmez' ? pyRound(yuzey[i]) : Math.floor(yuzey[i]);
  return { w: W, h: H, rgb, eksik };
}
