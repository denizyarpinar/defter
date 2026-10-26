import { dil } from '../dil';
import { parseSampleFolders, setSampleFolders } from '../okuma/ornekKaynak';
import { katmanOku, kitapCevir, kitaplikCevir, type OrnekKatman } from './ornekCeviri';
import { parseBook, parseLibrary } from './parse';
import type { Book, Library } from './types';

// Reads the sample library from public/ornek/ until Drive is connected (task 1.4).
// A web server can't list a folder, so ornek/index.json lists the book folders
// (and, task 3.6, the files of the sample topics: ornekKaynak.ts).
// Task 6.5-2a: in English the names come from ornek/en.json (ornekCeviri.ts); ids and folders stay the same.

const BASE = `${import.meta.env.BASE_URL}ornek/`;

export interface LoadedLibrary {
  library: Library;
  books: Map<string, Book>;
}

async function getJson(path: string): Promise<unknown | null> {
  const res = await fetch(BASE + path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  // the dev server answers a missing file with index.html (200), so check the type
  if (!(res.headers.get('content-type') || '').includes('json')) return null;
  try { return await res.json(); } catch { return {}; }   // broken JSON → all defaults
}

// The English layer when the interface is English; null in Turkish, or when it can't be read (Turkish names stay)
export async function ornekKatmani(): Promise<OrnekKatman | null> {
  if (dil() !== 'en') return null;
  try { const j = await getJson('en.json'); return j ? katmanOku(j) : null; } catch { return null; }
}

export async function loadLocalLibrary(): Promise<LoadedLibrary> {
  const index = await getJson('index.json');
  const ids = (index && typeof index === 'object' && Array.isArray((index as { kitaplar?: unknown }).kitaplar))
    ? ((index as { kitaplar: unknown[] }).kitaplar.filter(x => typeof x === 'string') as string[])
    : [];
  setSampleFolders(parseSampleFolders(index && typeof index === 'object' ? (index as { klasorler?: unknown }).klasorler : null));
  const katman = await ornekKatmani();
  const library = parseLibrary(katman ? kitaplikCevir(await getJson('kitaplik.json'), katman) : await getJson('kitaplik.json'));
  const books = new Map<string, Book>();
  await Promise.all(ids.map(async id => {
    const json = await getJson(`kitaplar/${encodeURIComponent(id)}/kitap.json`);
    books.set(id, parseBook(id, katman ? kitapCevir(id, json, katman) : json));
  }));
  return { library, books };
}
