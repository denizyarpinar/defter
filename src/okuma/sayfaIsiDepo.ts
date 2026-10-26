import { isAnahtari, type SayfaIsi } from '../defter/bosSayfaIsi';

// Task 6.S-4: blank-page jobs whose PDF step is done but kitap.json / .ocr.json are not yet (bosSayfaIsi.ts), on the
// device (IndexedDB "defter-sayfa-isi"). Its own database. Without IndexedDB nothing is kept (warned once): the job then
// lives only in memory while the tab is open. Sign-out empties it.

const DB_NAME = 'defter-sayfa-isi';
const STORE = 'isler';

const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = tx.onabort = () => reject(tx.error);
});

let db: Promise<IDBDatabase> | null = null;
let uyarildi = false;

function ac(): Promise<IDBDatabase> {
  db ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB yok');
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  db.catch(() => { db = null; });
  return db;
}

async function calistir<T>(mode: IDBTransactionMode, fallback: T, fn: (s: IDBObjectStore) => IDBRequest | null): Promise<T> {
  try {
    const tx = (await ac()).transaction(STORE, mode);
    const r = fn(tx.objectStore(STORE));
    const [value] = await Promise.all([r ? req(r) : Promise.resolve(undefined), done(tx)]);
    return (value ?? fallback) as T;
  } catch (e) {
    if (!uyarildi) { uyarildi = true; console.warn('Sayfa işleri cihazda tutulamıyor (IndexedDB); yarım kalan iş sadece bu sekmede tekrar denenir.', e); }
    return fallback;
  }
}

export const isKaydet = (is: SayfaIsi): Promise<void> => calistir<void>('readwrite', undefined, s => s.put(structuredClone(is), isAnahtari(is)));
export const isSil = (is: SayfaIsi): Promise<void> => calistir<void>('readwrite', undefined, s => s.delete(isAnahtari(is)));
export const isler = (): Promise<SayfaIsi[]> => calistir<SayfaIsi[]>('readonly', [], s => s.getAll());
export const isleriTemizle = (): Promise<void> => calistir<void>('readwrite', undefined, s => s.clear());
