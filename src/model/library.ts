import { emptyShelf } from './parse';
import { MAX_SHELVES, MIN_SHELVES, type Book, type Library } from './types';

// In-memory library operations (task 1.5 will save them to Drive).

// Books on shelves that really exist, top shelf first.
export function shelfBooks(lib: Library, books: Map<string, Book>, shelfIdx: number): string[] {
  return lib.raflar[shelfIdx]?.kitaplar.filter(id => books.has(id)) ?? [];
}

// "Yeni gelenler": books that are on no shelf.
export function newArrivals(lib: Library, books: Map<string, Book>): string[] {
  const placed = new Set(lib.raflar.flatMap(s => s.kitaplar));
  return [...books.keys()].filter(id => !placed.has(id)).sort();
}

export function shelfOf(lib: Library, id: string): number {
  return lib.raflar.findIndex(s => s.kitaplar.includes(id));
}

// Move a book to a shelf at a position (index among the shelf's visible books).
export function moveBook(lib: Library, books: Map<string, Book>, id: string, toShelf: number, at: number): void {
  for (const s of lib.raflar) { const i = s.kitaplar.indexOf(id); if (i >= 0) s.kitaplar.splice(i, 1); }
  const list = lib.raflar[toShelf].kitaplar;
  // `at` counts only visible books; map it to an index in the full list (which may hold unknown ids)
  const visible = list.filter(b => books.has(b));
  const before = visible[at];
  const idx = before === undefined ? list.length : list.indexOf(before);
  list.splice(idx, 0, id);
}

export function addShelf(lib: Library): boolean {
  if (lib.raflar.length >= MAX_SHELVES) return false;
  lib.raflar.push(emptyShelf(lib.raflar.length, new Set(lib.raflar.map(s => s.id))));
  return true;
}

// Books of a deleted shelf go to the shelf below (or above, if it was the last one).
export function deleteShelf(lib: Library, idx: number): { name: string; movedTo: string | null } | null {
  if (lib.raflar.length <= MIN_SHELVES) return null;
  const [gone] = lib.raflar.splice(idx, 1);
  const to = lib.raflar[Math.min(idx, lib.raflar.length - 1)];
  to.kitaplar.push(...gone.kitaplar);
  return { name: gone.ad, movedTo: gone.kitaplar.length ? to.ad : null };
}

// Whole days since the book was last opened (null = never).
export function daysSinceOpened(b: Book): number | null {
  if (!b.sonAcilis) return null;
  return Math.max(0, Math.floor((Date.now() - Date.parse(b.sonAcilis)) / 864e5));
}
