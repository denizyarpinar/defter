import type { PendingStore } from './bekleyenDepo';
import { isEmptyDiff, type PendingRecord } from './bekleyenFark';

// Task 4.8a: writes the pending records to the device. A change marks its file; 300 ms after the last
// change (or at once: flush, when the page hides / closes or the reader closes) the records are taken
// from the model at once (synchronously: the model may be cleared right after), then written one after
// another (one queue, never two writes at the same time). An empty difference removes the record.

export const SAVE_DELAY_MS = 300;

// fileId → its record now (empty difference: the record goes), null: the model doesn't have the file
export type Snapshot = (fileId: string) => PendingRecord | null;

export class PendingSaver {
  private dirty = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<void> = Promise.resolve();

  // written: after each write, whether the file should now have a record on the device
  // (store.ok tells whether it really went there)
  constructor(private store: PendingStore, private snapshot: Snapshot, private written: (fileId: string, has: boolean) => void = () => {}) {}

  changed(fileId: string): void {
    this.dirty.add(fileId);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }

  // Writes what changed now. The records are taken before this returns.
  flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const recs: [string, PendingRecord | null][] = [];
    for (const id of this.dirty) recs.push([id, this.snapshot(id)]);
    this.dirty.clear();
    return this.enqueue(async () => {
      for (const [id, rec] of recs) {
        if (!rec) continue;
        const has = !isEmptyDiff(rec);
        if (has) await this.store.put(rec);
        else await this.store.delete(id);
        this.written(id, has);
      }
    });
  }

  // Task 4.8b: the file was uploaded to Drive; yuklenenModifiedTime = its new version. The record (made
  // against an older version) goes, after the writes queued before it. A record already against the new
  // version (strokes drawn after the upload, model rebased) is kept. Not called yet.
  clearPending(fileId: string, yuklenenModifiedTime: string): Promise<void> {
    return this.enqueue(async () => {
      const rec = await this.store.get(fileId);
      if (!rec || rec.kaynakModifiedTime === yuklenenModifiedTime) return;
      await this.store.delete(fileId);
      this.written(fileId, false);
    });
  }

  // The queue is empty (tests)
  idle(): Promise<void> {
    return this.queue;
  }

  private enqueue(job: () => Promise<void>): Promise<void> {
    const next = this.queue.then(job).catch(e => console.warn('Kalem: bekleyen çizim yazılamadı.', e));
    this.queue = next;
    return next;
  }
}
