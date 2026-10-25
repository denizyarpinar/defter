// Task 6.4e-2b: the clean view's copies on the device (IndexedDB "defter-temiz"): the last read handwriting
// records ("kayit", key = account + PDF id) and the atlas ("atlas", key = account). Its own database: the PDF
// cache and the pen's pending strokes are not touched. Only copies: Drive stays the source, nothing is
// written to Drive from here. Without IndexedDB (private tab, an old browser) every call gives nothing and
// never throws (warned once); the reader then reads Drive as before. Sign-out empties both stores.

export type TemizDepoAdi = 'kayit' | 'atlas';

const DB_NAME = 'defter-temiz';
const STORES: TemizDepoAdi[] = ['kayit', 'atlas'];

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
    r.onupgradeneeded = () => { for (const s of STORES) r.result.createObjectStore(s); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  db.catch(() => { db = null; });
  return db;
}

async function calistir<T>(ad: TemizDepoAdi, mode: IDBTransactionMode, fallback: T, fn: (s: IDBObjectStore) => IDBRequest | null): Promise<T> {
  try {
    const tx = (await ac()).transaction(ad, mode);
    const r = fn(tx.objectStore(ad));
    const [value] = await Promise.all([r ? req(r) : Promise.resolve(undefined), done(tx)]);
    return (value ?? fallback) as T;
  } catch (e) {
    if (!uyarildi) { uyarildi = true; console.warn('Temiz yazı: kayıt ve atlas cihazda tutulamıyor (IndexedDB); Drive\'dan okunuyor.', e); }
    return fallback;
  }
}

export const depoOku = (ad: TemizDepoAdi, anahtar: string): Promise<unknown> =>
  calistir<unknown>(ad, 'readonly', null, s => s.get(anahtar));

export const depoYaz = (ad: TemizDepoAdi, anahtar: string, deger: unknown): Promise<void> =>
  calistir<void>(ad, 'readwrite', undefined, s => s.put(deger, anahtar));

export const depoSil = (ad: TemizDepoAdi, anahtar: string): Promise<void> =>
  calistir<void>(ad, 'readwrite', undefined, s => s.delete(anahtar));

// Sign-out: both stores empty (another account must not see them)
export async function depoTemizle(): Promise<void> {
  await Promise.all(STORES.map(ad => calistir<void>(ad, 'readwrite', undefined, s => s.clear())));
}
