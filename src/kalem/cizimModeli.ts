import { applyDiff, baseOf, computeDiff, isEmptyDiff, type PenDiff, type PendingRecord, type StrokeBase } from './bekleyenFark';
import type { DefterInk } from './cizimKatmani';
import { validateStroke, type PageStrokes, type Stroke } from './cizgi';
import { UndoStack } from './gecmis';
import { PdfYazilamaz, readStrokesForPen } from './pdfNotlari';
import { strokeHit, type Pt } from './silgi';

// Pen mode (task 4.6): the strokes in memory, per PDF file (a material can be several files).
// Key = file id + modifiedTime. Each file is read once (pdf-lib, readStrokesForPen): ids and
// tools are exact there. Not written to Drive yet (task 4.8b).
// Task 4.7: eraser and undo / redo. Every change is an operation in one history (all files).
// Each operation has its own number (revision); a file's revision is the number of the last
// operation applied to it now (0 = as loaded).
// Task 4.7b: one eraser drag may cross pages (and files); it is still one operation.
// Task 4.8a: the file as loaded is kept as ids (base); diff() = the model now − base, which goes to
// the device (bekleyenKayit.ts). A pending record found when the file loads is applied to it (not in the
// undo history). "Kaydedilmedi" = the difference is not empty (everything undone: clean again).

export type FileState = 'yukleniyor' | 'hazir' | 'hata';

interface FileModel {
  state: FileState;
  pages: PageStrokes;
  error: unknown;
  reported: boolean;
  promise: Promise<void>;
  revs: number[];   // the operations applied to this file now, oldest first
  saved: number;
  base: StrokeBase; // the strokes in the file as loaded (before a pending record)
  restored: PendingRecord | null;   // the pending record applied at load
}

// A file's page (page: 0-based in the PDF)
export interface Place { key: string; page: number }

// A stroke the eraser took, on its page, at the place it had in that page's list then
export interface Removed extends Place { s: Stroke; index: number }

export type PenOp = { rev: number } & ({ tur: 'ekle'; key: string; page: number; stroke: Stroke } | { tur: 'sil'; removed: Removed[] });

// What an undo / redo changed (to draw those pages again, or to tell where)
export interface Changed { tur: PenOp['tur']; places: Place[] }

// The pages an operation touched, each once, in order
function placesOf(op: PenOp | Removed[]): Place[] {
  const list = Array.isArray(op) ? op : op.tur === 'sil' ? op.removed : [op];
  const out: Place[] = [];
  for (const r of list) if (!out.some(p => p.key === r.key && p.page === r.page)) out.push({ key: r.key, page: r.page });
  return out;
}

const keysOf = (op: PenOp) => [...new Set(placesOf(op).map(p => p.key))];

export class PenModel {
  private files = new Map<string, FileModel>();
  private history = new UndoStack<PenOp>();
  private lastRev = 0;
  private erasing: Removed[] | null = null;

  constructor(private read: (bytes: Uint8Array) => Promise<PageStrokes> = readStrokesForPen) {}

  state(key: string): FileState | undefined {
    return this.files.get(key)?.state;
  }

  // Loads the file's strokes once (a second call while it loads gets the same promise).
  // Never rejects: a failure becomes the 'hata' state (takeError).
  // pending (task 4.8a): the file's record on the device, applied by id after reading (also when it was
  // made against another version of the file: then marked baskaSurum). A failing pending is ignored.
  ensure(key: string, bytes: () => Promise<Uint8Array>, pending?: () => Promise<PendingRecord | null>): Promise<void> {
    const have = this.files.get(key);
    if (have) return have.promise;
    const f: FileModel = { state: 'yukleniyor', pages: new Map(), error: null, reported: false, promise: Promise.resolve(), revs: [], saved: 0, base: new Map(), restored: null };
    this.files.set(key, f);
    f.promise = (async () => {
      try {
        const [pages, rec] = await Promise.all([
          bytes().then(b => this.read(b)),
          pending ? pending().catch(() => null) : null
        ]);
        if (this.files.get(key) !== f) return;   // cleared meanwhile
        f.base = baseOf(pages);
        if (rec && !isEmptyDiff(rec)) {
          applyDiff(pages, rec);
          const mt = versionOf(key);
          f.restored = rec.kaynakModifiedTime === mt || rec.baskaSurum ? rec
            : { ...rec, baskaSurum: { oncekiModifiedTime: rec.kaynakModifiedTime } };
        }
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
    validateStroke(s);
    this.list(key, page).push(s);
    this.record({ rev: 0, key, page, tur: 'ekle', stroke: s });
  }

  // Eraser drag (task 4.7): the strokes the eraser (from → to, radius r pt) touches go at once.
  // The whole drag is one operation (eraseEnd), also across pages and files. Returns how many went now.
  eraseAt(key: string, page: number, from: Pt, to: Pt, r: number): number {
    const list = this.list(key, page);
    const e = this.erasing ??= [];
    let n = 0;
    for (let i = 0; i < list.length;) {
      if (strokeHit(list[i], from, to, r)) { e.push({ key, page, s: list[i], index: i }); list.splice(i, 1); n++; }
      else i++;
    }
    return n;
  }

  // The drag ended: what it erased becomes one operation (nothing erased: no operation)
  eraseEnd(): void {
    const e = this.erasing;
    this.erasing = null;
    if (e?.length) this.record({ rev: 0, tur: 'sil', removed: e });
  }

  // The drag was cancelled (second finger, pointercancel): what it erased comes back, on every page.
  // Returns those pages ([] when nothing was erased or no drag was going on).
  eraseCancel(): Place[] {
    const e = this.erasing;
    this.erasing = null;
    if (!e) return [];
    this.restore(e);
    return placesOf(e);
  }

  get canUndo(): boolean { return this.history.canUndo; }
  get canRedo(): boolean { return this.history.canRedo; }

  undo(): Changed | null {
    this.eraseCancel();
    const op = this.history.undo();
    if (!op) return null;
    if (op.tur === 'ekle') removeIds(this.list(op.key, op.page), [op.stroke]);
    else this.restore(op.removed);
    for (const key of keysOf(op)) {
      const revs = this.files.get(key)!.revs;
      if (revs[revs.length - 1] === op.rev) revs.pop();
    }
    return { tur: op.tur, places: placesOf(op) };
  }

  redo(): Changed | null {
    this.eraseCancel();
    const op = this.history.redo();
    if (!op) return null;
    if (op.tur === 'ekle') this.list(op.key, op.page).push(op.stroke);
    else for (const r of op.removed) removeIds(this.list(r.key, r.page), [r.s]);
    for (const key of keysOf(op)) this.files.get(key)!.revs.push(op.rev);
    return { tur: op.tur, places: placesOf(op) };
  }

  // The file's revision now (0: as it was loaded)
  revision(key: string): number {
    const revs = this.files.get(key)?.revs;
    return revs?.length ? revs[revs.length - 1] : 0;
  }

  // Task 4.8: the file was written as it is now (rev = its revision now): that becomes the base, the
  // difference is empty. An older rev (changed during the upload) is ignored here; task 4.8b decides.
  markSaved(key: string, rev: number): void {
    const f = this.files.get(key);
    if (f?.state !== 'hazir' || rev !== this.revision(key)) return;
    f.saved = rev;
    f.base = baseOf(f.pages);
    f.restored = null;
  }

  // Task 4.8a: the model now − the file as loaded (empty while not loaded)
  diff(key: string): PenDiff {
    const f = this.files.get(key);
    return f?.state === 'hazir' ? computeDiff(f.base, f.pages) : { eklenen: [], silinenIdler: [] };
  }

  // The pending record applied when the file loaded (null: none)
  restored(key: string): PendingRecord | null {
    return this.files.get(key)?.restored ?? null;
  }

  // The loaded file key with this file id (the reader uses one version per file)
  keyOf(fileId: string): string | null {
    for (const [key, f] of this.files) if (f.state === 'hazir' && fileIdOf(key) === fileId) return key;
    return null;
  }

  isDirty(key: string): boolean {
    return !isEmptyDiff(this.diff(key));
  }

  // strokes are not as in the file (in any file)
  get dirty(): boolean {
    for (const key of this.files.keys()) if (this.isDirty(key)) return true;
    return false;
  }

  private list(key: string, page: number): Stroke[] {
    const f = this.files.get(key);
    if (f?.state !== 'hazir') throw new Error(`Çizim modeli hazır değil: ${key}`);
    let list = f.pages.get(page);
    if (!list) f.pages.set(page, list = []);
    return list;
  }

  private record(op: PenOp): void {
    op.rev = ++this.lastRev;
    for (const key of keysOf(op)) this.files.get(key)!.revs.push(op.rev);
    this.history.push(op);
  }

  // Back in reverse order, each at the index it had on its page: every page is exactly as before
  // (also the drawing order)
  private restore(removed: readonly Removed[]): void {
    for (let i = removed.length - 1; i >= 0; i--) {
      const r = removed[i], list = this.list(r.key, r.page);
      list.splice(Math.min(r.index, list.length), 0, r.s);
    }
  }

  strokes(key: string, page: number): readonly Stroke[] {
    return this.files.get(key)?.pages.get(page) ?? [];
  }

  // For the SVG layer (penLayerSvg)
  inks(key: string, page: number): DefterInk[] {
    return this.strokes(key, page).map(s => ({ lines: [s.noktalar], color: s.renk, width: s.kalinlik, opacity: s.opaklik, pressure: s.basinc }));
  }

  clear(): void {
    this.files.clear();
    this.history.clear();
    this.erasing = null;
  }
}

// key = file id + '@' + modifiedTime (the id may have ':' but no '@' after it; modifiedTime has none)
export const fileIdOf = (key: string) => key.slice(0, key.lastIndexOf('@'));
export const versionOf = (key: string) => key.slice(key.lastIndexOf('@') + 1);

function removeIds(list: Stroke[], strokes: readonly Stroke[]): void {
  for (const s of strokes) {
    const i = list.indexOf(s);
    if (i >= 0) list.splice(i, 1);
  }
}
