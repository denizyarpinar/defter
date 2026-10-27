import { libraryToJson } from '../model/serialize';
import type { Book, Library } from '../model/types';
import { createJson, readJson, updateJson } from './drive';
import type { DriveLocation } from './driveLibrary';
import { t } from '../dil';

// Writes changes back to Drive, 1.5 s after the last change.
// Always reads the latest file first and changes only our fields (raflar + oda, or kapak).

const DELAY = 1500;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export interface SaveUi {
  saving(): void;
  saved(): void;
  failed(message: string, retry: () => void): void;
}

export interface DriveSaverUi extends SaveUi {
  warn(message: string): void;   // a change that can't be saved (no retry)
}

export class DriveSaver {
  private timers = new Map<string, number>();
  private queue: Promise<void> = Promise.resolve();
  private waiting = new Set<string>();   // keys with a change not written yet
  private readonly loc: DriveLocation;
  private readonly data: { library: Library; books: Map<string, Book> };
  private readonly ui: DriveSaverUi;

  constructor(loc: DriveLocation, data: { library: Library; books: Map<string, Book> }, ui: DriveSaverUi) {
    this.loc = loc;
    this.data = data;
    this.ui = ui;
  }

  get hasUnsaved(): boolean {
    return this.waiting.size > 0;
  }

  libraryChanged(): void {
    this.schedule('lib', () => this.saveLibrary());
  }

  coverChanged(id: string): void {
    // never create a kitap.json: without one the cover stays in this session only
    if (!this.loc.bookFileIds.has(id)) { this.ui.warn('Bu kitapta kitap.json yok; kapak kaydedilemedi.'); return; }
    this.schedule('cover:' + id, () => this.saveCover(id));
  }

  // Task 6.K5a: changes still waiting for their timer go now; resolves when the queue is empty
  // (a failed one stays waiting, as before).
  bekleyenleriYaz(): Promise<void> {
    for (const [key, t] of [...this.timers]) {
      clearTimeout(t);
      const job = this.jobs.get(key);
      if (job) this.run(key, job);
    }
    return this.queue;
  }

  private jobs = new Map<string, () => Promise<void>>();

  private schedule(key: string, job: () => Promise<void>): void {
    this.waiting.add(key);
    this.jobs.set(key, job);
    clearTimeout(this.timers.get(key));
    this.timers.set(key, window.setTimeout(() => this.run(key, job), DELAY));
  }

  // One write at a time, in order.
  private run(key: string, job: () => Promise<void>): void {
    this.timers.delete(key);
    this.queue = this.queue.then(async () => {
      if (this.timers.has(key)) return;   // changed again meanwhile: the newer timer will save
      this.ui.saving();
      try {
        await job();
        this.waiting.delete(key);
        if (!this.waiting.size) this.ui.saved();
      } catch (e) {
        const msg = e instanceof TypeError ? t('kayit.internetYok')
          : e instanceof Error ? e.message : t('kayit.kaydedilemedi');
        this.ui.failed(msg, () => this.run(key, job));
      }
    });
  }

  // kitaplik.json: latest file + our raflar and oda
  private async saveLibrary(): Promise<void> {
    const ours = libraryToJson(this.data.library);
    if (!this.loc.libraryFileId) {
      this.loc.libraryFileId = await createJson(this.loc.rootId, 'kitaplik.json', ours, t('kayit.kitaplikOlusturulurken'));
      return;
    }
    const latest = await readJson(this.loc.libraryFileId, 'kitaplik.json okunurken');
    const base = isObj(latest) ? latest : {};
    const oda = { ...(isObj(base.oda) ? base.oda : {}), ...(ours.oda as Obj) };
    await updateJson(this.loc.libraryFileId, { ...base, raflar: ours.raflar, oda }, 'kitaplik.json kaydedilirken');
  }

  // kitap.json: latest file + our kapak (a missing kitap.json is never created)
  private async saveCover(id: string): Promise<void> {
    const book = this.data.books.get(id);
    const fileId = this.loc.bookFileIds.get(id);
    if (!book || !fileId) return;
    const kapak = { ...book.kapak.extra, renk: book.kapak.renk, stil: book.kapak.stil };
    const latest = await readJson(fileId, `${id}/kitap.json okunurken`);
    const base = isObj(latest) ? latest : {};
    await updateJson(fileId, { ...base, kapak: { ...(isObj(base.kapak) ? base.kapak : {}), ...kapak } }, `${id}/kitap.json kaydedilirken`);
  }
}
