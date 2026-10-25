import type { AtlasKodlama, AtlasOrnek, ElYazisiAtlas } from './atlasSema';

// Task 6.4e-1: the atlas PNG → ink density D (float32), the same numbers as tools/atlas/paket.py `coz`.
// numpy works in float32 there (a Python float is cast to float32 first), so every step is rounded with
// Math.fround: the browser gets the Python values bit for bit.
// dogrusal: D = px / olcek · karekok: D = (px/255)² · 255 / olcek.

export interface AtlasD { w: number; h: number; D: Float32Array }   // the whole page, row by row

// 8-bit values (one per pixel, or every `adim`-th byte: 4 for RGBA image data) → D
export function dCoz(px: ArrayLike<number>, olcek: number, kodlama: AtlasKodlama, adim = 1): Float32Array {
  const n = Math.floor(px.length / adim);
  const out = new Float32Array(n);
  const o = Math.fround(olcek);
  const tablo = new Float32Array(256);   // only 256 different values
  for (let v = 0; v < 256; v++) {
    let x = v;
    if (kodlama === 'karekok') {
      const a = Math.fround(x / 255);
      x = Math.fround(Math.fround(a * a) * 255);
    }
    tablo[v] = Math.fround(x / o);
  }
  for (let i = 0; i < n; i++) out[i] = tablo[px[i * adim]];
  return out;
}

// One sample's box out of the page
export function ornekD(sayfa: AtlasD, o: Pick<AtlasOrnek, 'x' | 'y' | 'w' | 'h'>): AtlasD {
  const D = new Float32Array(o.w * o.h);
  for (let y = 0; y < o.h; y++) D.set(sayfa.D.subarray((o.y + y) * sayfa.w + o.x, (o.y + y) * sayfa.w + o.x + o.w), y * o.w);
  return { w: o.w, h: o.h, D };
}

// Browser: the PNG (8-bit grey) → D. No colour conversion, no premultiplied alpha; grey is in R.
export async function pngCoz(png: Blob, atlas: Pick<ElYazisiAtlas, 'olcek' | 'kodlama' | 'sayfa'>): Promise<AtlasD> {
  const bmp = await createImageBitmap(png, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  try {
    const { width: w, height: h } = bmp;
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error('El yazısı atlası çözülemedi: tarayıcı canvas vermedi. Sayfayı yenile.');
    ctx.drawImage(bmp, 0, 0);
    const veri = ctx.getImageData(0, 0, w, h, { colorSpace: 'srgb' }).data;
    return { w, h, D: dCoz(veri, atlas.olcek, atlas.kodlama, 4) };
  } finally {
    bmp.close();
  }
}
