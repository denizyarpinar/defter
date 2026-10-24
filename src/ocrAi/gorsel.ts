import { closePdf, openPdf } from '../okuma/pdf';

// The one image both models get: EXIF orientation applied, turned by hand, long edge ≤ 2000 px, JPEG.
export type Donus = 0 | 90 | 180 | 270;
export const UZUN_KENAR = 2000;
const MAX_BAYT = 2.9 * 1024 * 1024;   // the function accepts at most 3 MB

export interface Kaynak { kaynak: CanvasImageSource; w: number; h: number; kapat(): void }
export interface Hazir { blob: Blob; base64: string; w: number; h: number }

export const pdfMi = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

export async function kaynakAc(file: File, sayfa = 1): Promise<Kaynak> {
  if (pdfMi(file)) {
    const doc = await openPdf(await file.arrayBuffer());
    try {
      if (!Number.isInteger(sayfa) || sayfa < 1 || sayfa > doc.numPages) throw new Error(`PDF'te ${doc.numPages} sayfa var; 1–${doc.numPages} arası bir sayfa seç.`);
      const page = await doc.getPage(sayfa);
      const v1 = page.getViewport({ scale: 1 });
      const v = page.getViewport({ scale: UZUN_KENAR / Math.max(v1.width, v1.height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(v.width); canvas.height = Math.round(v.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport: v, annotationMode: 0 }).promise;
      return { kaynak: canvas, w: canvas.width, h: canvas.height, kapat: () => { canvas.width = canvas.height = 0; } };
    } finally { await closePdf(doc); }
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Sadece JPEG, PNG ya da PDF seç (HEIC için önce JPEG olarak kaydet).');
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return { kaynak: bmp, w: bmp.width, h: bmp.height, kapat: () => bmp.close() };
}

const toBlob = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error('JPEG oluşturulamadı.'))), 'image/jpeg', q));

async function base64(b: Blob): Promise<string> {
  const u = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function jpegHazirla(k: Kaynak, donus: Donus): Promise<Hazir> {
  const yan = donus === 90 || donus === 270;
  const ow = yan ? k.h : k.w, oh = yan ? k.w : k.h;
  const s = Math.min(1, UZUN_KENAR / Math.max(ow, oh));
  const w = Math.min(UZUN_KENAR, Math.round(ow * s)), h = Math.min(UZUN_KENAR, Math.round(oh * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2); ctx.rotate(donus * Math.PI / 180); ctx.scale(s, s);
  ctx.drawImage(k.kaynak, -k.w / 2, -k.h / 2);
  try {
    let blob = await toBlob(c, 0.9);
    for (const q of [0.8, 0.7]) if (blob.size > MAX_BAYT) blob = await toBlob(c, q);
    if (blob.size > MAX_BAYT) throw new Error('Görsel 3 MB altına indirilemedi.');
    return { blob, base64: await base64(blob), w, h };
  } finally { c.width = c.height = 0; }
}
