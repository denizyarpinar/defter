import type { LoadedLibrary } from '../model/localSource';
import { parseBook, parseLibrary } from '../model/parse';
import type { Book } from '../model/types';
import { findRootFolders, listChildren, readJson, type DriveFile } from './drive';

// Reads the "Kitaplık" folder from My Drive (see CLAUDE.md → Veri modeli). Reads only; never moves/deletes.

export const ROOT_NAME = 'Kitaplık';
const MAX_PARALLEL = 4;

// Where things are in Drive, so changes can be written back.
export interface DriveLocation {
  rootId: string;
  libraryFileId: string | null;            // kitaplik.json (null: not created yet)
  bookFolderIds: Map<string, string>;      // book id (folder name) → folder id
  bookFileIds: Map<string, string>;        // book id → kitap.json file id
}

export class LibraryNotFound extends Error {
  constructor() { super(`Drive'da "${ROOT_NAME}" klasörü bulunamadı.`); }
}

export interface DriveLoad extends LoadedLibrary {
  loc: DriveLocation;
  warnings: string[];
}

// Run tasks with at most `n` at the same time.
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => { while (next < items.length) await fn(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

export async function loadDriveLibrary(): Promise<DriveLoad> {
  const warnings: string[] = [];
  const roots = await findRootFolders(ROOT_NAME);
  if (!roots.length) throw new LibraryNotFound();
  if (roots.length > 1) warnings.push(`Drive'ın ana dizininde ${roots.length} tane "${ROOT_NAME}" klasörü var; ilki kullanılıyor. Karışmaması için birini yeniden adlandır.`);
  const rootId = roots[0].id;

  const children = await listChildren(rootId);
  const libFile = children.find(f => f.name === 'kitaplik.json' && !f.mimeType.endsWith('.folder'));
  const kitaplar = children.find(f => f.name === 'kitaplar' && f.mimeType.endsWith('.folder'));

  // no kitaplik.json yet: 5 empty shelves, the file is created on the first save
  const library = parseLibrary(libFile ? await readJson(libFile.id, 'kitaplik.json okunurken') : { raflar: [{}, {}, {}, {}, {}] });

  const loc: DriveLocation = { rootId, libraryFileId: libFile?.id ?? null, bookFolderIds: new Map(), bookFileIds: new Map() };
  const books = new Map<string, Book>();
  if (!kitaplar) {
    warnings.push(`"${ROOT_NAME}" klasöründe "kitaplar" klasörü yok. Kitapları göstermek için içine "kitaplar" adlı bir klasör aç.`);
    return { library, books, loc, warnings };
  }

  const folders: DriveFile[] = [];
  for (const f of await listChildren(kitaplar.id, { foldersOnly: true })) {
    if (loc.bookFolderIds.has(f.name)) { warnings.push(`"kitaplar" içinde iki tane "${f.name}" klasörü var; ilki kullanılıyor.`); continue; }
    loc.bookFolderIds.set(f.name, f.id);
    folders.push(f);
  }
  await pool(folders, MAX_PARALLEL, async f => {
    const [file] = await listChildren(f.id, { name: 'kitap.json' });
    if (file) loc.bookFileIds.set(f.name, file.id);
    books.set(f.name, parseBook(f.name, file ? await readJson(file.id, `${f.name}/kitap.json okunurken`) : null));
  });
  return { library, books, loc, warnings };
}
