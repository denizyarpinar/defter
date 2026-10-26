import type { TasinanKurdele } from '../kitap/sayfaKaydir';

// Task 6.S-4d: the backups of deleted pages, for "Geri al" (CLAUDE.md → 6.S-4d), on the device (IndexedDB
// "defter-silinen-sayfa"; its own database). One record per removal (key: its islemId): the page as a one-page PDF
// (with its notes), where it was and its neighbour's fingerprint (the anchor), and the ribbons that were on it.
// - Written BEFORE the PDF upload (ozeteEkle.ts → yedekle); `tamam` once the removal is done. Only a done one can
//   be put back (a removal that never reached Drive must not give a second copy of the page).
// - Kept 7 days, at most the newest 5 (budama: after each removal that worked, and when the reader opens).
//   A successful "Geri al" deletes its record. Sign-out empties it.
// - Without IndexedDB nothing is kept (warned once): the deleting then stops before Drive changes (yedekYaz throws).

const DB_NAME = 'defter-silinen-sayfa';
const STORE = 'yedekler';
export const YEDEK_OMRU_MS = 7 * 24 * 3600 * 1000;
export const YEDEK_EN_COK = 5;

export interface SilinenYedekKaydi {
  islemId: string;
  fileId: string;
  dosyaAdi: string;
  kitapId: string;
  konu: string;
  klasorId: string | null;
  indeks: number;                 // 0-based, where it was
  komsuIz: string;
  komsuYon: 'once' | 'sonra';
  sayfaBytes: Uint8Array;
  eskiSayfa: number;              // the file's page count before
  ayniIzVar: boolean;
  taraf?: 'sol' | 'sag';          // book mode: the side it was on (it comes back there)
  kurdeleler?: TasinanKurdele;    // the ribbons that were on it (the kitap.json step)
  tamam: boolean;
  zaman: string;                  // ISO
}

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

async function calistir<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | null): Promise<T> {
  const tx = (await ac()).transaction(STORE, mode);
  const r = fn(tx.objectStore(STORE));
  const [value] = await Promise.all([r ? req(r) : Promise.resolve(undefined), done(tx)]);
  return value as T;
}

// Reads never throw (no IndexedDB: nothing kept)
async function oku<T>(fallback: T, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  try { return (await calistir<T>('readonly', fn)) ?? fallback; } catch (e) {
    if (!uyarildi) { uyarildi = true; console.warn('Silinen sayfaların yedeği cihazda tutulamıyor (IndexedDB).', e); }
    return fallback;
  }
}

export class YedekYazilamadi extends Error {
  constructor(cause: unknown) { super('Sayfanın yedeği cihaza yazılamadı; sayfa silinmedi. Tarayıcının depolama iznini kontrol edip tekrar dene.', { cause }); }
}

// Throws: the deleting must stop when its backup can't be kept
export async function yedekYaz(k: SilinenYedekKaydi): Promise<void> {
  try { await calistir<void>('readwrite', s => s.put(structuredClone(k), k.islemId)); } catch (e) { throw new YedekYazilamadi(e); }
}

export const yedekAl = (islemId: string): Promise<SilinenYedekKaydi | null> => oku<SilinenYedekKaydi | null>(null, s => s.get(islemId));
export const yedekler = (): Promise<SilinenYedekKaydi[]> => oku<SilinenYedekKaydi[]>([], s => s.getAll());

export async function yedekSil(islemId: string): Promise<void> {
  try { await calistir<void>('readwrite', s => s.delete(islemId)); } catch (e) { console.warn('Sayfa yedeği cihazdan silinemedi.', e); }
}

// The records that go: older than 7 days, and all but the newest 5 (pure, tested)
export function budanacaklar(kayitlar: readonly Pick<SilinenYedekKaydi, 'islemId' | 'zaman'>[], simdi: number): string[] {
  const sirali = [...kayitlar].sort((a, b) => Date.parse(b.zaman) - Date.parse(a.zaman));
  return sirali.filter((k, i) => i >= YEDEK_EN_COK || !(simdi - Date.parse(k.zaman) < YEDEK_OMRU_MS)).map(k => k.islemId);
}

export async function yedekBuda(simdi = Date.now()): Promise<void> {
  for (const id of budanacaklar(await yedekler(), simdi)) await yedekSil(id);
}

export async function yedekleriTemizle(): Promise<void> {
  try { await calistir<void>('readwrite', s => s.clear()); } catch (e) { console.warn('Sayfa yedekleri cihazdan silinemedi.', e); }
}
