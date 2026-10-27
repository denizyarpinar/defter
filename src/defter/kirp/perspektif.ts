import { JPEG_KALITE, MAX_KENAR } from '../ayarlar';
import { cikisBoyutu, homografi, type Kose4 } from './kirpHesap';

// Task 5.8b: 4 corners → straightened rectangular page (task 5.8c: used by hazirlaKirpli in gorsel.ts).
// Each output pixel is mapped back into the photo with the homography (output rectangle →
// corners) and sampled bilinearly. Output long edge ≤ MAX_KENAR; JPEG with JPEG_KALITE.

export function duzelt(src: HTMLCanvasElement, k: Kose4, maxKenar = MAX_KENAR): HTMLCanvasElement {
  const { width: W, height: H } = cikisBoyutu(k, maxKenar);
  const M = homografi([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], k);
  if (!M) throw new Error('Köşelerden dönüşüm hesaplanamadı');   // dil-kontrol: yoksay
  const sctx = src.getContext('2d', { willReadFrequently: true });
  if (!sctx) throw new Error('Canvas açılamadı');   // dil-kontrol: yoksay
  const sw = src.width, sh = src.height;
  const s = sctx.getImageData(0, 0, sw, sh).data;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('Canvas açılamadı');   // dil-kontrol: yoksay
  const img = octx.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const py = y + 0.5;
    for (let x = 0; x < W; x++) {
      const px = x + 0.5;
      const iw = 1 / (M[6] * px + M[7] * py + M[8]);
      let fx = (M[0] * px + M[1] * py + M[2]) * iw - 0.5;
      let fy = (M[3] * px + M[4] * py + M[5]) * iw - 0.5;
      fx = fx < 0 ? 0 : fx > sw - 1 ? sw - 1 : fx;
      fy = fy < 0 ? 0 : fy > sh - 1 ? sh - 1 : fy;
      const x0 = fx | 0, y0 = fy | 0;
      const x1 = x0 + 1 < sw ? x0 + 1 : x0, y1 = y0 + 1 < sh ? y0 + 1 : y0;
      const ax = fx - x0, ay = fy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      const o = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * ax;
        const bot = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * ax;
        d[o + c] = top + (bot - top) * ay;
      }
      d[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

export async function jpeg(c: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', JPEG_KALITE));
  if (!blob) throw new Error('JPEG oluşturulamadı');   // dil-kontrol: yoksay
  return blob;
}
