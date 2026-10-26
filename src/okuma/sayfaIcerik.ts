import { t } from '../dil';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import type { TextContent } from 'pdfjs-dist/types/src/display/api';
import { SessionExpired, driveFetch, ok } from '../drive/drive';
import { defterInks, type DefterInk } from '../kalem/cizimKatmani';
import { hideDefterNotes, isDefterAnnotation } from '../kalem/defterNotu';
import type { PenViewport } from '../kalem/koordinat';
import { noteRender } from '../ui/tani';
import type { BookPage } from './kitapSayfalari';
import type { MetinParcasi, SayfaMetni } from './metinAra';
import { closePdf, openPdf, pdfjs } from './pdf';
import { getPdf } from './pdfOnbellek';

// What goes on a page of the reader: PDF pages, notebook photos, or a card (link, missing file).
// One PageContent per open reader; close() frees the PDFs in the worker.

export const A4 = 1.4142;   // height / width; cards and unknown sizes

const HIDE_OWN_NOTES = hideDefterNotes();   // ?defterNot=goster / ?cizimKontrol=1: draw them too (task 4.4)

// A page's Defter strokes (task 4.5) and its viewport at scale 1 (the pen layer's coordinates)
export interface DefterNotes { inks: DefterInk[]; viewport: PenViewport }

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
  private ownNotes = new WeakMap<PDFPageProxy, Promise<DefterNotes>>();   // pdf.js keeps one proxy per page
  private closed = false;
  private retired: Promise<PDFDocumentProxy>[] = [];   // task 5.8g: older versions, closed in close()

  // Task 5.8g: the file has a new version (pages added at the end, its bytes already in the cache): its pages
  // are drawn from that one from now on. The old document isn't closed now (a drawing may be going on).
  // Not opened yet: nothing to do (it opens with the version of its pages).
  newVersion(id: string, modifiedTime: string): void {
    const old = this.docs.get(id);
    if (this.closed || !old) return;
    this.retired.push(old);
    const d = getPdf(id, modifiedTime).then(openPdf);
    d.catch(() => { if (this.docs.get(id) === d) this.docs.delete(id); });
    this.docs.set(id, d);
  }

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
  // cancelled(): true once cancel() was called (the promise then ends quietly, nothing was drawn).
  drawPdf(p: BookPage, canvas: HTMLCanvasElement, rect?: { x: number; y: number; w: number }): { promise: Promise<void>; cancel: () => void; cancelled: () => boolean } {
    let task: RenderTask | null = null, cancelled = false;
    const promise = (async () => {
      const doc = await this.doc(p);
      const page = await doc.getPage(p.pdfSayfa!);
      if (HIDE_OWN_NOTES) await this.hideOwnNotes(doc, page);
      const { AnnotationMode } = await pdfjs();
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const r = rect ?? { x: 0, y: 0, w: 1 };
      const scale = canvas.width / (r.w * base.width);
      task = page.render({
        canvas,
        viewport: page.getViewport({ scale }),
        transform: rect ? [1, 0, 0, 1, -r.x * base.width * scale, -r.y * base.height * scale] : undefined,
        annotationMode: AnnotationMode.ENABLE_STORAGE,   // notes are drawn, except those marked noView below
      });
      const t0 = performance.now();
      try { await task.promise; } catch (e) { if (!cancelled) throw e; return; }
      if (cancelled) return;
      const ms = performance.now() - t0;
      noteRender(ms);   // ?fps=1 box (task 3.7)
      // dev only (task 3.6): how long each page takes; removed from the build
      if (import.meta.env.DEV) {
        console.log(`[render] ${p.ad ?? p.dosyaId} s.${p.pdfSayfa} · ${canvas.width}×${canvas.height}${rect ? ' · zoom' : ''} · ${Math.round(ms)} ms`);
      }
    })();
    return { promise, cancel: () => { cancelled = true; task?.cancel(); }, cancelled: () => cancelled };
  }

  // Task 4.4: Defter's own Ink notes are left out of the canvas (the pen layer draws them);
  // notes from other apps and form fields are drawn as before. Once per page, before its first
  // render, so the main and the zoom canvas both wait for it and the page isn't drawn twice.
  // Pages without Defter notes don't touch the storage (its hash is part of pdf.js's render cache).
  private async hideOwnNotes(doc: PDFDocumentProxy, page: PDFPageProxy): Promise<void> {
    try {
      await this.pageNotes(doc, page);
    } catch {
      // the page is still drawn (with the Defter notes); tried again next time
    }
  }

  // Task 4.5: the Defter strokes of a page, for the pen layer. Same request as hideOwnNotes (asked once per page).
  async defterNotes(p: BookPage): Promise<DefterNotes> {
    const doc = await this.doc(p);
    return this.pageNotes(doc, await doc.getPage(p.pdfSayfa!));
  }

  // Task 4.6: the page's viewport at scale 1 (rotation and CropBox in it), for the pen layer and pen mode.
  async viewport(p: BookPage): Promise<PenViewport> {
    const doc = await this.doc(p);
    return (await doc.getPage(p.pdfSayfa!)).getViewport({ scale: 1 });
  }

  // Task 6.3b: the page's text items (pdf.js getTextContent) from the document that is open, no download;
  // with its viewport at scale 1 (rotation and CropBox), for the rectangles of the matches.
  async textContent(p: BookPage): Promise<SayfaMetni> {
    const page = await (await this.doc(p)).getPage(p.pdfSayfa!);
    // Task 6.3c: not getTextContent(): it reads its stream with `for await`, which iPad Safari's ReadableStream
    // doesn't have (every page failed: "bulunamadı"). The same stream, read with reader.read().
    const reader = (page.streamTextContent() as ReadableStream<{ items: TextContent['items']; styles: TextContent['styles'] }>).getReader();
    const parcalar: MetinParcasi[] = [];
    const stiller: TextContent['styles'] = {};   // 6.3c-2: every chunk brings the styles of its new fonts
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      Object.assign(stiller, r.value.styles);
      for (const it of r.value.items) if ('str' in it) parcalar.push({ str: it.str, transform: it.transform, width: it.width, height: it.height, hasEOL: it.hasEOL, font: stiller[it.fontName]?.fontFamily });
    }
    const v = page.getViewport({ scale: 1 });
    return { parcalar, gorunum: { transform: v.transform, width: v.width, height: v.height } };
  }

  private pageNotes(doc: PDFDocumentProxy, page: PDFPageProxy): Promise<DefterNotes> {
    let h = this.ownNotes.get(page);
    if (!h) {
      h = page.getAnnotations({ intent: 'display' }).then(annots => {
        if (HIDE_OWN_NOTES) for (const a of annots) if (isDefterAnnotation(a)) doc.annotationStorage.setValue(a.id, { noView: true });
        return { inks: defterInks(annots), viewport: page.getViewport({ scale: 1 }) };   // includes the page's rotation
      });
      h.catch(e => {
        if (!this.closed) console.warn('Sayfanın notları okunamadı.', e);
        if (this.ownNotes.get(page) === h) this.ownNotes.delete(page);   // tried again next time
      });
      this.ownNotes.set(page, h);
    }
    return h;
  }

  // The photo's bytes; kept while the reader is open (the browser decodes it only when shown).
  image(p: BookPage): Promise<Blob> {
    const id = p.dosyaId!;
    let b = this.images.get(id);
    if (!b) {
      b = driveFetch(`files/${encodeURIComponent(id)}?alt=media`)
        .then(r => ok(r, t('okuyucu.resimIndirilirken')))
        .then(r => r.blob());
      b.catch(() => this.images.delete(id));
      this.images.set(id, b);
    }
    return b;
  }

  async close(): Promise<void> {
    this.closed = true;
    const docs = [...this.docs.values(), ...this.retired];
    this.docs.clear(); this.images.clear(); this.retired = [];
    await Promise.all(docs.map(d => d.then(closePdf, () => {})));
  }
}

// Photo size from Drive without downloading it. rotation = number of 90° turns (EXIF).
// If Drive doesn't know the size: A4; the reader corrects it when the photo is shown.
async function imageRatio(id: string): Promise<number> {
  const res = await ok(await driveFetch(`files/${encodeURIComponent(id)}?fields=imageMediaMetadata(width,height,rotation)`), t('okuyucu.resimBilgisi'));
  const m = (await res.json() as { imageMediaMetadata?: { width?: number; height?: number; rotation?: number } }).imageMediaMetadata;
  if (!m?.width || !m.height) return A4;
  return (m.rotation ?? 0) % 2 ? m.width / m.height : m.height / m.width;
}
