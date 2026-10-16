import { acilistaDuzelt, depoHatasi, GecisHatasi, IDB_YOK, toplamBoyut, type BekleyenFoto } from './bekleyenFotoKayit';

// Task 5.8e: the photos waiting to be added, on the device (IndexedDB "defter-foto", store "bekleyen",
// one record per islemId, index by topic folder). Its own database: defter-kalem and defter-pdf are
// not touched. Unlike the pen's store, nothing is swallowed: every failure (no IndexedDB, quota full)
// rejects with a BekleyenFotoHatasi, so "Ekle" can stop before any network.
// The first open of this page load turns records cut off while 'yukleniyor' back into 'bekliyor'.

const DB_NAME = 'defter-foto';
const STORE = 'bekleyen';
const KONU_INDEX = 'konuKlasorId';

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
    s.persist().then(yes => console.info(`Fotoğraf: kalıcı depolama ${yes ? 'verildi' : 'verilmedi'}.`), () => {});
  } catch { /* not there: nothing to ask */ }
}

async function acilisDuzeltmesi(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(STORE, 'readwrite');
  const s = tx.objectStore(STORE);
  const hepsi = await req(s.getAll() as IDBRequest<BekleyenFoto[]>);
  for (const k of hepsi) if (k.durum === 'yukleniyor') s.put(acilistaDuzelt(k));
  await done(tx);
}

export class BekleyenFotoDepo {
  private db: Promise<IDBDatabase> | null = null;
  private asked = false;

  private open(): Promise<IDBDatabase> {
    if (!this.asked) { this.asked = true; askPersist(); }
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') throw new Error(IDB_YOK);
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore(STORE, { keyPath: 'islemId' }).createIndex(KONU_INDEX, 'konuKlasorId');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }).then(async db => { await acilisDuzeltmesi(db); return db; });
    this.db.catch(() => { this.db = null; });
    return this.db;
  }

  // One transaction; any failure rejects as a BekleyenFotoHatasi
  private async run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | null): Promise<T> {
    try {
      const tx = (await this.open()).transaction(STORE, mode);
      const r = fn(tx.objectStore(STORE));
      const [value] = await Promise.all([r ? req(r) : Promise.resolve(undefined), done(tx)]);
      return value as T;
    } catch (e) {
      throw depoHatasi(e);
    }
  }

  // At "Ekle", before any network
  async kaydet(k: BekleyenFoto): Promise<void> {
    await this.run('readwrite', s => s.put(k));
  }

  async hepsi(): Promise<BekleyenFoto[]> {
    return (await this.run<BekleyenFoto[]>('readonly', s => s.getAll())).sort((a, b) => a.olusturma.localeCompare(b.olusturma));
  }

  async konuIcin(konuKlasorId: string): Promise<BekleyenFoto[]> {
    return (await this.run<BekleyenFoto[]>('readonly', s => s.index(KONU_INDEX).getAll(konuKlasorId)))
      .sort((a, b) => a.olusturma.localeCompare(b.olusturma));
  }

  // Read → gecis → write, in one transaction. No record → null. A failing gecis writes nothing.
  async durumGuncelle(islemId: string, gecis: (k: BekleyenFoto) => BekleyenFoto): Promise<BekleyenFoto | null> {
    try {
      const tx = (await this.open()).transaction(STORE, 'readwrite');
      const s = tx.objectStore(STORE);
      const k = await req(s.get(islemId) as IDBRequest<BekleyenFoto | undefined>);
      let yeni: BekleyenFoto | null = null;
      if (k) {
        try { yeni = gecis(k); } catch (e) { tx.abort(); throw e; }
        s.put(yeni);
      }
      await done(tx);
      return yeni;
    } catch (e) {
      throw e instanceof GecisHatasi ? e : depoHatasi(e);
    }
  }

  // Only after the pages are on Drive
  async sil(islemId: string): Promise<void> {
    await this.run('readwrite', s => s.delete(islemId));
  }

  async toplamBoyut(): Promise<number> {
    return toplamBoyut(await this.hepsi());
  }
}

export const bekleyenFotoDepo = new BekleyenFotoDepo();
