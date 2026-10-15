import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { SessionExpired, driveFetch, ok } from '../drive/drive';
import type { BookPage } from './kitapSayfalari';
import { closePdf, openPdf } from './pdf';
import { getPdf } from './pdfOnbellek';

// What goes on a page of the reader: PDF pages, notebook photos, or a card (link, missing file).
// One PageContent per open reader; close() frees the PDFs in the worker.

export const A4 = 1.4142;   // height / width; cards and unknown sizes

export type PageKind = 'pdf' | 'image' | 'link' | 'missing' | 'unsupported';

export function pageKind(p: BookPage): PageKind {
  if (p.tur === 'link') return 'link';
  if (!p.dosyaId) return 'missing';
  if (p.pdfSayfa) return 'pdf';
  if (p.mimeType?.startsWith('image/')) return 'image';
  return 'unsupported';
}

export class PageContent {
  private docs = new Map<string, Promise<PDFDocumentProxy>>();
  private images = new Map<string, Promise<Blob>>();
  private closed = false;

  // height / width of every page, before anything is drawn (so the list doesn't jump)
  async ratios(pages: BookPage[]): Promise<number[]> {
    return Promise.all(pages.map(async p => {
      try {
        const kind = pageKind(p);
        if (kind === 'pdf') {
          const page = await (await this.doc(p)).getPage(p.pdfSayfa!);
          const v = page.getViewport({ scale: 1 });   // includes the page's rotation
          return v.height / v.width;
        }
        if (kind === 'image') return await imageRatio(p.dosyaId!);
      } catch (e) {
        // a page whose size can't be read becomes A4; drawing it will show the problem
        if (e instanceof SessionExpired && !this.closed) throw e;
        if (!this.closed) console.warn('Sayfa ölçüsü okunamadı.', p, e);
      }
      return A4;
    }));
  }

  private doc(p: BookPage): Promise<PDFDocumentProxy> {
    const id = p.dosyaId!;
    let d = this.docs.get(id);
    if (!d) {
      d = getPdf(id, p.modifiedTime!).then(openPdf);
      d.catch(() => this.docs.delete(id));
      this.docs.set(id, d);
    }
    return d;
  }

  // Draws the PDF page into the canvas (its width/height are already set). cancel() stops it.
  // rect (0–1 fractions of the page): only that part, filling the canvas (sharp zoom, task 3.4).
  drawPdf(p: BookPage, canvas: HTMLCanvasElement, rect?: { x: number; y: number; w: number }): { promise: Promise<void>; cancel: () => void } {
    let task: RenderTask | null = null, cancelled = false;
    const promise = (async () => {
      const page = await (await this.doc(p)).getPage(p.pdfSayfa!);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const r = rect ?? { x: 0, y: 0, w: 1 };
      const scale = canvas.width / (r.w * base.width);
      task = page.render({
        canvas,
        viewport: page.getViewport({ scale }),
        transform: rect ? [1, 0, 0, 1, -r.x * base.width * scale, -r.y * base.height * scale] : undefined,
      });
      try { await task.promise; } catch (e) { if (!cancelled) throw e; }
    })();
    return { promise, cancel: () => { cancelled = true; task?.cancel(); } };
  }

  // The photo's bytes; kept while the reader is open (the browser decodes it only when shown).
  image(p: BookPage): Promise<Blob> {
    const id = p.dosyaId!;
    let b = this.images.get(id);
    if (!b) {
      b = driveFetch(`files/${encodeURIComponent(id)}?alt=media`)
        .then(r => ok(r, 'Resim indirilirken'))
        .then(r => r.blob());
      b.catch(() => this.images.delete(id));
      this.images.set(id, b);
    }
    return b;
  }

  async close(): Promise<void> {
    this.closed = true;
    const docs = [...this.docs.values()];
    this.docs.clear(); this.images.clear();
    await Promise.all(docs.map(d => d.then(closePdf, () => {})));
  }
}

// Photo size from Drive without downloading it. rotation = number of 90° turns (EXIF).
// If Drive doesn't know the size: A4; the reader corrects it when the photo is shown.
async function imageRatio(id: string): Promise<number> {
  const res = await ok(await driveFetch(`files/${encodeURIComponent(id)}?fields=imageMediaMetadata(width,height,rotation)`), 'Resim bilgisi okunurken');
  const m = (await res.json() as { imageMediaMetadata?: { width?: number; height?: number; rotation?: number } }).imageMediaMetadata;
  if (!m?.width || !m.height) return A4;
  return (m.rotation ?? 0) % 2 ? m.width / m.height : m.height / m.width;
}
