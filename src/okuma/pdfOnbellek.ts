import { driveFetch, ok } from '../drive/drive';
import { fetchSample, isSampleId } from './ornekKaynak';

// Downloaded PDFs are kept in IndexedDB (see CLAUDE.md → Faz 3 → PDF).
// Key = file id + modifiedTime: when the file changes in Drive, the new version is downloaded.
// Over 500 MB in total → the least recently opened ones are removed.
// Without IndexedDB (private tab, quota full) the PDF is still returned, just not cached.
// Two stores: "bilgi" (small: size, last opened) and "veri" (the bytes), so the size check
// never has to read the PDFs themselves.

const DB_NAME = 'defter-pdf';
const META = 'bilgi';
const DATA = 'veri';
const MAX_BYTES = 500 * 1024 * 1024;

interface Meta {
  key: string;
  id: string;
  modifiedTime: string;
  size: number;
  lastOpened: number;
}

const keyOf = (id: string, modifiedTime: string) => `${id}@${modifiedTime}`;

const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = tx.onabort = () => reject(tx.error);
});

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const meta = r.result.createObjectStore(META, { keyPath: 'key' });
      meta.createIndex('id', 'id');
      meta.createIndex('lastOpened', 'lastOpened');
      r.result.createObjectStore(DATA);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

async function readCached(id: string, modifiedTime: string): Promise<ArrayBuffer | null> {
  const db = await openDb();
  const key = keyOf(id, modifiedTime);
  const tx = db.transaction([META, DATA], 'readwrite');
  const [meta, data] = await Promise.all([
    req(tx.objectStore(META).get(key)) as Promise<Meta | undefined>,
    req(tx.objectStore(DATA).get(key)) as Promise<ArrayBuffer | undefined>
  ]);
  if (meta && data) tx.objectStore(META).put({ ...meta, lastOpened: Date.now() } satisfies Meta);
  await done(tx);
  return meta && data ? data : null;
}

async function writeCached(id: string, modifiedTime: string, data: ArrayBuffer): Promise<void> {
  const db = await openDb();
  const key = keyOf(id, modifiedTime);

  // the new version replaces the old ones of the same file
  const tx = db.transaction([META, DATA], 'readwrite');
  const meta = tx.objectStore(META);
  for (const old of await req(meta.index('id').getAllKeys(id))) {
    if (old !== key) { meta.delete(old); tx.objectStore(DATA).delete(old); }
  }
  meta.put({ key, id, modifiedTime, size: data.byteLength, lastOpened: Date.now() } satisfies Meta);
  tx.objectStore(DATA).put(data, key);
  await done(tx);

  await evict(db, key);
}

// Remove the least recently opened PDFs until the total is ≤ 500 MB (never the one just opened).
async function evict(db: IDBDatabase, keep: string): Promise<void> {
  const tx = db.transaction([META, DATA], 'readwrite');
  const meta = tx.objectStore(META);
  const all = await req(meta.index('lastOpened').getAll()) as Meta[];   // oldest first
  let total = all.reduce((s, m) => s + m.size, 0);
  for (const m of all) {
    if (total <= MAX_BYTES) break;
    if (m.key === keep) continue;
    meta.delete(m.key);
    tx.objectStore(DATA).delete(m.key);
    total -= m.size;
  }
  await done(tx);
}

async function download(id: string): Promise<ArrayBuffer> {
  const res = await ok(await driveFetch(`files/${encodeURIComponent(id)}?alt=media`), 'PDF indirilirken');
  return res.arrayBuffer();
}

// The PDF's bytes: from the cache, or downloaded from Drive (and then cached).
// Sample library (task 3.6): straight from public/, never from Drive or the cache.
export async function getPdf(id: string, modifiedTime: string): Promise<ArrayBuffer> {
  if (isSampleId(id)) return fetchSample(id);
  try {
    const cached = await readCached(id, modifiedTime);
    if (cached) return cached;
  } catch (e) {
    console.warn('PDF önbelleği okunamadı, Drive\'dan indiriliyor.', e);
  }
  const data = await download(id);
  try {
    await writeCached(id, modifiedTime, data);
  } catch (e) {
    console.warn('PDF önbelleğe yazılamadı (gizli sekme ya da depolama dolu olabilir).', e);
  }
  return data;
}
