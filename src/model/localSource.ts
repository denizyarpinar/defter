import { parseBook, parseLibrary } from './parse';
import type { Book, Library } from './types';

// Reads the sample library from public/ornek/ until Drive is connected (task 1.4).
// A web server can't list a folder, so ornek/index.json lists the book folders.

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

export async function loadLocalLibrary(): Promise<LoadedLibrary> {
  const index = await getJson('index.json');
  const ids = (index && typeof index === 'object' && Array.isArray((index as { kitaplar?: unknown }).kitaplar))
    ? ((index as { kitaplar: unknown[] }).kitaplar.filter(x => typeof x === 'string') as string[])
    : [];
  const library = parseLibrary(await getJson('kitaplik.json'));
  const books = new Map<string, Book>();
  await Promise.all(ids.map(async id => {
    books.set(id, parseBook(id, await getJson(`kitaplar/${encodeURIComponent(id)}/kitap.json`)));
  }));
  return { library, books };
}
