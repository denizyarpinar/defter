import { closePdf, openPdf } from '../okuma/pdf';

export interface TrialImage { blob: Blob; text: string | null; width: number; height: number; hash: string; preparationMs: number }
const jpeg = (canvas: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Görüntü hazırlanamadı.')), 'image/jpeg', 0.92));   // dil-kontrol: yoksay
export async function prepare(file: File, rotation: number): Promise<TrialImage> {
  const start = performance.now();
  if (![0, 90, 180, 270].includes(rotation)) throw new Error('Geçersiz yön.');   // dil-kontrol: yoksay
  const canvas = document.createElement('canvas'); let text: string | null = null;
  try {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      const doc = await openPdf(await file.arrayBuffer());
      try {
        const page = await doc.getPage(1); // Explicitly only page one, including text inspection.
        const reader = (page.streamTextContent() as ReadableStream<{ items: { str?: string; hasEOL?: boolean }[] }>).getReader();
        const chunks: string[] = [];
        try { for (let r = await reader.read(); !r.done; r = await reader.read()) for (const item of r.value.items) if (item.str) chunks.push(item.str + (item.hasEOL ? '\n' : ' ')); }
        finally { reader.releaseLock(); }
        const existing = chunks.join('').trim();
        if (existing) text = existing;
        const base = page.getViewport({ scale: 1 });
        const v = page.getViewport({ scale: Math.min(2, 2000 / Math.max(base.width, base.height)), rotation: (page.rotate + rotation) % 360 });
        canvas.width = Math.ceil(v.width); canvas.height = Math.ceil(v.height);
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: v, annotationMode: 0 }).promise;
      } finally { await closePdf(doc); }
    } else {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      try {
        const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
        const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
        canvas.width = rotation % 180 ? h : w; canvas.height = rotation % 180 ? w : h;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(rotation * Math.PI / 180);
        ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
      } finally { bitmap.close(); }
    }
    const blob = await jpeg(canvas);
    if (blob.size > 2_000_000) throw new Error('Hazırlanan görüntü 2 MB üstünde. Otomatik kalite düşürülmedi.');   // dil-kontrol: yoksay
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('');
    return { blob, text, width: canvas.width, height: canvas.height, hash, preparationMs: performance.now() - start };
  } finally { canvas.width = canvas.height = 0; }
}
