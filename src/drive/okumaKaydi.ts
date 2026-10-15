import { applyPatch, mergePatch, type ReadingPatch } from '../model/okumaYamasi';
import { BrokenJson, DriveError, getModifiedTime, readJsonStrict, updateJson } from './drive';
import type { SaveUi } from './save';

// Writes the reading state (ribbon, topic status, last opened) to kitap.json (task 3.5).
// - 5 s after the last change, or right away with flush() (reader closed, tab hidden, page closed).
// - Every write: read modifiedTime + the latest file, apply only our patch, nothing changed → no write.
//   modifiedTime changed meanwhile (another device wrote) → read again and try once more.
// - Always PATCH on the existing file id; a book without kitap.json is skipped (no file is ever created).
// - Failed / offline: the patch stays waiting and is tried again (online event, every 30 s).

export interface ReadingDrive {
  modifiedTime(fileId: string, bookId: string): Promise<string>;
  read(fileId: string, bookId: string): Promise<unknown>;
  write(fileId: string, json: unknown, bookId: string, keepalive: boolean): Promise<void>;
}

export const driveReadingApi: ReadingDrive = {
  modifiedTime: (f, b) => getModifiedTime(f, `${b}/kitap.json okunurken`),
  read: (f, b) => readJsonStrict(f, `${b}/kitap.json okunurken`),
  write: (f, json, b, keepalive) => updateJson(f, json, `${b}/kitap.json kaydedilirken`, keepalive)
};

export class WriteConflict extends Error {
  constructor() { super('Okuma yerin kaydedilemedi: kitap.json başka bir cihazda aynı anda değişiyor. Biraz sonra kendiliğinden tekrar denenecek.'); }
}

export interface ReadingSaverOptions { delay: number; retry: number }

export class ReadingSaver {
  private pending = new Map<string, ReadingPatch>();   // book id → changes not written yet
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<void> = Promise.resolve();
  private writing = false;
  private failing = false;
  private readonly onOnline = () => { if (this.pending.size) void this.flush(); };
  private readonly fileIdOf: (bookId: string) => string | undefined;
  private readonly drive: ReadingDrive;
  private readonly ui: SaveUi;
  private readonly opts: ReadingSaverOptions;

  constructor(fileIdOf: (bookId: string) => string | undefined, drive: ReadingDrive, ui: SaveUi, opts: ReadingSaverOptions = { delay: 5000, retry: 30000 }) {
    this.fileIdOf = fileIdOf;
    this.drive = drive;
    this.ui = ui;
    this.opts = opts;
    globalThis.addEventListener?.('online', this.onOnline);
  }

  get hasUnsaved(): boolean {
    return this.pending.size > 0 || this.writing;
  }

  change(bookId: string, patch: ReadingPatch): void {
    if (!this.fileIdOf(bookId)) return;   // no kitap.json: nothing is written (and nothing created)
    const old = this.pending.get(bookId);
    this.pending.set(bookId, old ? mergePatch(old, patch) : patch);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.opts.delay);
  }

  // Write everything waiting now. Resolves when done; on failure the changes stay waiting.
  flush(keepalive = false): Promise<void> {
    clearTimeout(this.timer); this.timer = undefined;
    clearTimeout(this.retryTimer); this.retryTimer = undefined;
    this.queue = this.queue.then(() => this.writeAll(keepalive));
    return this.queue;
  }

  dispose(): void {
    clearTimeout(this.timer);
    clearTimeout(this.retryTimer);
    globalThis.removeEventListener?.('online', this.onOnline);
  }

  private async writeAll(keepalive: boolean): Promise<void> {
    if (!this.pending.size) return;
    this.writing = true;
    let failure: unknown = null;
    for (const id of [...this.pending.keys()]) {
      const patch = this.pending.get(id);
      const fileId = this.fileIdOf(id);
      this.pending.delete(id);
      if (!patch || !fileId) continue;
      try {
        await this.writeOne(id, fileId, patch, keepalive);
      } catch (e) {
        // newer changes made during the write go on top
        const newer = this.pending.get(id);
        this.pending.set(id, newer ? mergePatch(patch, newer) : patch);
        failure = e;
      }
    }
    this.writing = false;
    if (failure) {
      this.failing = true;
      const msg = failure instanceof TypeError ? 'Okuma yerin kaydedilemedi: internet yok gibi. Bağlantı gelince kendiliğinden kaydedilecek.'
        : failure instanceof Error ? failure.message : 'Okuma yerin kaydedilemedi.';
      this.ui.failed(msg, () => void this.flush());
      // no permission / file gone / broken file: trying again won't help, only the button
      const hopeless = failure instanceof BrokenJson || (failure instanceof DriveError && (failure.status === 403 || failure.status === 404));
      if (!hopeless) this.retryTimer = setTimeout(() => void this.flush(), this.opts.retry);
    } else if (this.failing) {
      this.failing = false;
      this.ui.saved();   // the warning goes away
    }
  }

  // true: written; false: the file already had these values.
  private async writeOne(bookId: string, fileId: string, patch: ReadingPatch, keepalive: boolean): Promise<boolean> {
    for (let attempt = 0; ; attempt++) {
      const before = await this.drive.modifiedTime(fileId, bookId);
      const latest = await this.drive.read(fileId, bookId);
      if (typeof latest !== 'object' || latest === null || Array.isArray(latest)) throw new BrokenJson(`${bookId}/kitap.json okunurken`);
      const { json, changed } = applyPatch(latest, patch);
      if (!changed) return false;
      const now = await this.drive.modifiedTime(fileId, bookId);
      if (now !== before) {
        if (attempt === 0) continue;   // another device wrote meanwhile: read again, once
        throw new WriteConflict();
      }
      await this.drive.write(fileId, json, bookId, keepalive);
      return true;
    }
  }
}
