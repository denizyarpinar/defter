import { DriveError, SessionExpired } from '../drive/drive';
import { PdfConflict, PdfReadOnly, PdfSampleNoWrite, PdfUploadSession, uploadPdf, type PdfDrive } from '../drive/pdfYazici';
import { isSampleId } from '../okuma/ornekKaynak';
import { applyDiff, isEmptyDiff, touchedPages, type PenDiff, type PendingRecord, type RemovedStroke } from './bekleyenFark';
import type { PageStrokes } from './cizgi';
import { PdfYazilamaz, readDefterStrokes, writeDefterStrokes } from './pdfNotlari';

// Task 4.8b: the pending strokes go into the PDF on Drive. One file at a time, files one after another.
// For each file (uploadRecord):
//   a. the file's modifiedTime now (uploadPdf checks headRevisionId itself, before and after the backup)
//   b. its bytes of that version (from the PDF cache when it is the same version, else downloaded)
//   c. the Defter strokes in it + the pending difference by id (strokes another device added stay)
//   d. only the pages the difference touches are written
//   e. uploadPdf on the same file id; PdfConflict (changed meanwhile) → from a. again, at most 3 times
// No error removes the pending record. The sample library never uploads.
// Task 4.9d: the ?kalemYaz=1 safety lock is gone (real Drive tests done in 4.8c).

export const MAX_TRIES = 3;
export const IDLE_MS = 30_000;    // upload 30 s after the last change
export const RETRY_MS = 60_000;   // offline / Drive busy: try again every 60 s (and when back online)

export interface UploadDeps {
  drive: PdfDrive;
  bytes(fileId: string, modifiedTime: string): Promise<Uint8Array>;
  read?(bytes: Uint8Array): Promise<PageStrokes>;
  write?(bytes: Uint8Array, pages: PageStrokes): Promise<Uint8Array>;
}

export interface Uploaded {
  fileId: string;
  kaynakModifiedTime: string;   // the version the sent difference was against (the model's key)
  modifiedTime: string;         // the new version on Drive
  bytes: Uint8Array;            // the file as uploaded
  pages: PageStrokes;           // all Defter strokes in it
  sent: PenDiff;
  removed: RemovedStroke[];     // strokes the upload took out of the file
}

export async function uploadRecord(deps: UploadDeps, rec: PendingRecord): Promise<Uploaded> {
  const read = deps.read ?? readDefterStrokes, write = deps.write ?? writeDefterStrokes;
  const sent: PenDiff = { eklenen: rec.eklenen, silinenIdler: rec.silinenIdler };
  const touched = touchedPages(sent);
  for (let attempt = 1; ; attempt++) {
    const mt = await deps.drive.modifiedTime(rec.fileId);
    const bytes = await deps.bytes(rec.fileId, mt);
    const pages = await read(bytes);
    const removed: RemovedStroke[] = [];
    const gone = new Set(sent.silinenIdler.map(d => d.id));
    for (const [sayfa, list] of pages) for (const stroke of list) if (gone.has(stroke.id)) removed.push({ sayfa, stroke });
    applyDiff(pages, sent);
    const changed: PageStrokes = new Map(touched.map(i => [i, pages.get(i) ?? []]));
    let out: Uint8Array;
    try {
      out = await write(bytes, changed);
    } catch (e) {
      // the file has fewer pages now (another program changed it): the strokes don't fit, they stay on the device
      if (e instanceof RangeError) throw new PdfYazilamaz('PDF\'in sayfaları değişmiş; çizimler sayfalara yerleşmedi.');
      throw e;
    }
    try {
      const r = await uploadPdf(deps.drive, rec.fileId, out, mt);
      for (const [i, list] of [...pages]) if (!list.length) pages.delete(i);
      return { fileId: rec.fileId, kaynakModifiedTime: rec.kaynakModifiedTime, modifiedTime: r.modifiedTime, bytes: out, pages, sent, removed };
    } catch (e) {
      if (e instanceof PdfConflict && attempt < MAX_TRIES) continue;
      throw e;
    }
  }
}

export type UploadStatus =
  | { tur: 'bos' }
  | { tur: 'kaydediliyor' }
  | { tur: 'kaydedildi' }
  | { tur: 'cevrimdisi' }                         // tried again online / every 60 s
  | { tur: 'hata'; mesaj: string; tekrar: boolean };   // tekrar: tried again by itself too

// What an error means for the user, and whether it is tried again by itself
export function describeError(e: unknown): { tur: 'cevrimdisi' } | { tur: 'hata'; mesaj: string; tekrar: boolean } | null {
  if (e instanceof SessionExpired) return null;
  if (e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { tur: 'cevrimdisi' };
  if (e instanceof PdfReadOnly) return { tur: 'hata', mesaj: 'Bu PDF\'e yazma iznin yok; çizimler cihazda kaldı.', tekrar: false };
  if (e instanceof PdfConflict) return { tur: 'hata', mesaj: 'PDF başka bir yerde değişip duruyor; çizimler cihazda kaldı. Biraz sonra tekrar dene.', tekrar: false };
  if (e instanceof PdfUploadSession) return { tur: 'hata', mesaj: `${e.message} Çizimler cihazda kaldı.`, tekrar: false };
  if (e instanceof PdfYazilamaz) return { tur: 'hata', mesaj: `Bu PDF'e çizim yazılamıyor: ${e.message} Çizimler cihazda kaldı.`, tekrar: false };
  if (e instanceof PdfSampleNoWrite) return { tur: 'hata', mesaj: e.message, tekrar: false };
  if (e instanceof DriveError && (e.status === 429 || e.status >= 500)) return { tur: 'hata', mesaj: `${e.message} Çizimler cihazda; kendiliğinden tekrar denenecek.`, tekrar: true };
  const why = e instanceof Error && e.message ? e.message : 'Bilinmeyen bir hata oldu.';
  return { tur: 'hata', mesaj: `Çizimler Drive'a kaydedilemedi: ${why} Çizimler cihazda kaldı.`, tekrar: false };
}

export interface UploaderHooks {
  // the file's pending record now (null / empty: nothing to upload)
  record(fileId: string): Promise<PendingRecord | null>;
  // the upload worked: memory, model and device record follow the new version
  done(u: Uploaded): void | Promise<void>;
  status(s: UploadStatus, fileId: string | null): void;
}

export class DriveUploader {
  private wanted: string[] = [];        // waiting, in order
  private retry = new Set<string>();    // failed for a reason that passes (offline, Drive busy)
  private running: Promise<void> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private idleFiles = new Set<string>();
  private readonly onOnline = () => { if (this.retry.size) void this.request([...this.retry]); };

  constructor(private deps: UploadDeps, private hooks: UploaderHooks,
    private opts = { idle: IDLE_MS, retry: RETRY_MS }) {
    globalThis.addEventListener?.('online', this.onOnline);
  }

  // May this file go to Drive at all? (not a sample file)
  canUpload(fileId: string): boolean {
    return !isSampleId(fileId);
  }

  get busy(): boolean { return this.running !== null; }

  // A change: the file is uploaded 30 s after the last one
  soon(fileId: string): void {
    if (!this.canUpload(fileId)) return;
    this.idleFiles.add(fileId);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      const ids = [...this.idleFiles];
      this.idleFiles.clear();
      void this.request(ids);
    }, this.opts.idle);
  }

  // Upload these files now (after the ones already waiting). Resolves when the queue is empty.
  request(fileIds: Iterable<string>): Promise<void> {
    for (const id of fileIds) {
      if (!this.canUpload(id)) continue;
      this.idleFiles.delete(id);
      if (!this.wanted.includes(id)) this.wanted.push(id);
    }
    if (!this.idleFiles.size && this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    if (!this.running && this.wanted.length) this.running = this.run();
    return this.running ?? Promise.resolve();
  }

  // the queue is empty (tests)
  idle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  dispose(): void {
    globalThis.removeEventListener?.('online', this.onOnline);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  // Clears `running` itself, with no await after the last look at `wanted`: a request coming in
  // at any moment either joins this round or starts a new one.
  private async run(): Promise<void> {
    await Promise.resolve();
    let last: UploadStatus | null = null, lastId: string | null = null;
    while (this.wanted.length) {
      const fileId = this.wanted.shift()!;
      const rec = await this.hooks.record(fileId).catch(() => null);
      if (!rec || isEmptyDiff(rec)) { this.retry.delete(fileId); continue; }
      this.hooks.status({ tur: 'kaydediliyor' }, fileId);
      try {
        const u = await uploadRecord(this.deps, rec);
        this.retry.delete(fileId);
        await this.hooks.done(u);
        if (!last || last.tur === 'kaydedildi') { last = { tur: 'kaydedildi' }; lastId = fileId; }
      } catch (e) {
        const d = describeError(e);
        if (!d) { this.wanted = []; last = { tur: 'bos' }; lastId = fileId; break; }   // signed out: stop
        if (d.tur === 'cevrimdisi' || d.tekrar) { this.retry.add(fileId); this.retryLater(); }
        else this.retry.delete(fileId);
        // an error outranks a success in the same round (it is what the user must see)
        if (!last || last.tur === 'kaydedildi' || (last.tur === 'cevrimdisi' && d.tur === 'hata')) { last = d; lastId = fileId; }
      }
    }
    this.running = null;
    if (last) this.hooks.status(last, lastId);
  }

  private retryLater(): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.retry.size) void this.request([...this.retry]);
    }, this.opts.retry);
  }
}
