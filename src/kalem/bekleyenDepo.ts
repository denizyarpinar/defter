import type { PendingRecord } from './bekleyenFark';

// Task 4.8a: the pending strokes on the device (IndexedDB "defter-kalem", store "bekleyen", one record per
// file id). Its own database: the PDF cache (defter-pdf) and its version are not touched.
// Without IndexedDB (private tab, quota full, old browser) nothing rejects: ok becomes false, the strokes
// stay in memory only and the reader warns once.
// The first time it is opened the browser is asked to keep the data (navigator.storage.persist): Safari
// can remove a site's data after 7 days unused unless the app is on the home screen.

export interface PendingStore {
  readonly ok: boolean;   // false: the last use failed (nothing is kept on the device)
  get(fileId: string): Promise<PendingRecord | null>;
  put(rec: PendingRecord): Promise<void>;
  delete(fileId: string): Promise<void>;
  listIds(): Promise<string[]>;
}

const DB_NAME = 'defter-kalem';
const STORE = 'bekleyen';

const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = tx.onabort = () => reject(tx.error);
});

function askPersist(): void {
  try {
    const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!s?.persist) return;
    s.persist().then(yes => console.info(`Kalem: kalıcı depolama ${yes ? 'verildi' : 'verilmedi'}.`), () => {});
  } catch { /* not there: nothing to ask */ }
}

export class IdbPendingStore implements PendingStore {
  ok = true;
  private db: Promise<IDBDatabase> | null = null;
  private asked = false;
  private warned = false;

  private open(): Promise<IDBDatabase> {
    if (!this.asked) { this.asked = true; askPersist(); }
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') throw new Error('IndexedDB yok');
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'fileId' }); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    this.db.catch(() => { this.db = null; });
    return this.db;
  }

  // One transaction; a failure gives `fallback` and ok = false (warned once in the console)
  private async run<T>(mode: IDBTransactionMode, fallback: T, fn: (s: IDBObjectStore) => IDBRequest | null): Promise<T> {
    try {
      const tx = (await this.open()).transaction(STORE, mode);
      const r = fn(tx.objectStore(STORE));
      const [value] = await Promise.all([r ? req(r) : Promise.resolve(undefined), done(tx)]);
      this.ok = true;
      return value as T;
    } catch (e) {
      this.ok = false;
      if (!this.warned) { this.warned = true; console.warn('Kalem: çizimler cihaza kaydedilemiyor (IndexedDB).', e); }
      return fallback;
    }
  }

  async get(fileId: string): Promise<PendingRecord | null> {
    return (await this.run<PendingRecord | undefined>('readonly', undefined, s => s.get(fileId))) ?? null;
  }

  async put(rec: PendingRecord): Promise<void> {
    await this.run('readwrite', undefined, s => s.put(rec));
  }

  async delete(fileId: string): Promise<void> {
    await this.run('readwrite', undefined, s => s.delete(fileId));
  }

  async listIds(): Promise<string[]> {
    return (await this.run<IDBValidKey[]>('readonly', [], s => s.getAllKeys())).map(String);
  }
}
