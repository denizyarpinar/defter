import type { DefterInk } from './cizimKatmani';
import { validateStroke, type PageStrokes, type Stroke } from './cizgi';
import { PdfYazilamaz, readStrokesForPen } from './pdfNotlari';

// Pen mode (task 4.6): the strokes in memory, per PDF file (a material can be several files).
// Key = file id + modifiedTime. Each file is read once (pdf-lib, readStrokesForPen): ids and
// tools are exact there. Nothing is saved yet (task 4.8): closing the reader drops it all.

export type FileState = 'yukleniyor' | 'hazir' | 'hata';

interface FileModel {
  state: FileState;
  pages: PageStrokes;
  error: unknown;
  reported: boolean;
  promise: Promise<void>;
}

export class PenModel {
  dirty = false;   // strokes were added that are not in the file
  private files = new Map<string, FileModel>();

  constructor(private read: (bytes: Uint8Array) => Promise<PageStrokes> = readStrokesForPen) {}

  state(key: string): FileState | undefined {
    return this.files.get(key)?.state;
  }

  // Loads the file's strokes once (a second call while it loads gets the same promise).
  // Never rejects: a failure becomes the 'hata' state (takeError).
  ensure(key: string, bytes: () => Promise<Uint8Array>): Promise<void> {
    const have = this.files.get(key);
    if (have) return have.promise;
    const f: FileModel = { state: 'yukleniyor', pages: new Map(), error: null, reported: false, promise: Promise.resolve() };
    this.files.set(key, f);
    f.promise = (async () => {
      try {
        const pages = await this.read(await bytes());
        if (this.files.get(key) !== f) return;   // cleared meanwhile
        f.pages = pages;
        f.state = 'hazir';
      } catch (e) {
        f.error = e;
        f.state = 'hata';
      }
    })();
    return f.promise;
  }

  // The file's error, only the first time it is asked (one message per file).
  takeError(key: string): unknown {
    const f = this.files.get(key);
    if (!f || f.state !== 'hata' || f.reported) return null;
    f.reported = true;
    return f.error;
  }

  // Pen turned on again: files that failed for another reason than the PDF itself (network) are tried again.
  retryFailed(): void {
    for (const [key, f] of this.files) if (f.state === 'hata' && !(f.error instanceof PdfYazilamaz)) this.files.delete(key);
  }

  get loading(): boolean {
    for (const f of this.files.values()) if (f.state === 'yukleniyor') return true;
    return false;
  }

  // page: 0-based page index in the PDF
  add(key: string, page: number, s: Stroke): void {
    const f = this.files.get(key);
    if (f?.state !== 'hazir') throw new Error(`Çizim modeli hazır değil: ${key}`);
    validateStroke(s);
    const list = f.pages.get(page);
    if (list) list.push(s); else f.pages.set(page, [s]);
    this.dirty = true;
  }

  strokes(key: string, page: number): readonly Stroke[] {
    return this.files.get(key)?.pages.get(page) ?? [];
  }

  // For the SVG layer (penLayerSvg)
  inks(key: string, page: number): DefterInk[] {
    return this.strokes(key, page).map(s => ({ lines: [s.noktalar], color: s.renk, width: s.kalinlik, opacity: s.opaklik }));
  }

  clear(): void {
    this.files.clear();
    this.dirty = false;
  }
}
