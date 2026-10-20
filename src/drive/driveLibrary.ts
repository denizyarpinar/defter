import type { LoadedLibrary } from '../model/localSource';
import { parseBook, parseLibrary } from '../model/parse';
import type { Book } from '../model/types';
import { yarimKitapNedeni, type YarimNeden } from '../model/yarimKitap';
import { listChildren, readJson, type DriveFile } from './drive';
import { kurulumGerekli, type KurulumDugmesi } from '../ui/kurulumDurumu';
import { driveKokApi, kokBul, ROOT_NAME, type KokDrive, type KokModu, type KokSonucu } from './kok';

// Reads the library's root folder (see CLAUDE.md → Veri modeli). Reads only; never moves/deletes.
// Task 6.K2a: the root is found by kok.ts (narrow: the app's defterKok root; full: "Kitaplık" first).
// Task 6.K2b: no root, or the app's own root half set up → LibraryNotFound (main.ts shows "Kitaplığını kur").
// Task 6.K3: a sample book folder (defterOrnek) without its kitap.json is a half made sample: not shown.
// Task 6.K4b-2: the same for a wizard book folder (defterIslem) without kitap.json (model/yarimKitap.ts).

export { ROOT_NAME };
const MAX_PARALLEL = 4;

// Where things are in Drive, so changes can be written back.
export interface DriveLocation {
  rootId: string;
  libraryFileId: string | null;            // kitaplik.json (null: not created yet)
  bookFolderIds: Map<string, string>;      // book id (folder name) → folder id
  bookFileIds: Map<string, string>;        // book id → kitap.json file id
}

export class LibraryNotFound extends Error {
  constructor(readonly kok: KokSonucu, readonly dugme: KurulumDugmesi) { super(`Drive'da "${ROOT_NAME}" klasörü bulunamadı.`); }
}

// The last root kokBul found (the ?olcum=1 box); null: not looked up yet
let sonBulunan: KokSonucu | null = null;
export const sonKok = (): KokSonucu | null => sonBulunan;

// A half made book folder that was skipped
export interface YarimKitap { ad: string; id: string; neden: YarimNeden }

// The half made books the last load skipped (the ?olcum=1 box); null: not loaded yet
let sonAtlanan: YarimKitap[] | null = null;
export const sonYarimlar = (): YarimKitap[] | null => sonAtlanan;

export interface DriveLoad extends LoadedLibrary {
  loc: DriveLocation;
  warnings: string[];
  yarimlar: YarimKitap[];
}

// Run tasks with at most `n` at the same time.
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => { while (next < items.length) await fn(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

export async function loadDriveLibrary(mod: KokModu, kokDrive: KokDrive = driveKokApi): Promise<DriveLoad> {
  const warnings: string[] = [];
  const kok = sonBulunan = await kokBul(kokDrive, mod);
  const dugme = kurulumGerekli(kok);
  if (dugme || kok.tur === 'yok') throw new LibraryNotFound(kok, dugme ?? 'kur');
  if (kok.uyari) warnings.push(kok.uyari);
  const rootId = kok.kok.id;
  const rootName = kok.kok.name;

  const children = await listChildren(rootId);
  const libFile = children.find(f => f.name === 'kitaplik.json' && !f.mimeType.endsWith('.folder'));
  const kitaplar = children.find(f => f.name === 'kitaplar' && f.mimeType.endsWith('.folder'));

  // no kitaplik.json yet: 5 empty shelves, the file is created on the first save
  const library = parseLibrary(libFile ? await readJson(libFile.id, 'kitaplik.json okunurken') : { raflar: [{}, {}, {}, {}, {}] });

  const loc: DriveLocation = { rootId, libraryFileId: libFile?.id ?? null, bookFolderIds: new Map(), bookFileIds: new Map() };
  const books = new Map<string, Book>();
  const yarimlar: YarimKitap[] = sonAtlanan = [];
  if (!kitaplar) {
    warnings.push(`"${rootName}" klasöründe "kitaplar" klasörü yok. Kitapları göstermek için içine "kitaplar" adlı bir klasör aç.`);
    return { library, books, loc, warnings, yarimlar };
  }

  const folders: DriveFile[] = [];
  for (const f of await listChildren(kitaplar.id, { foldersOnly: true })) {
    if (loc.bookFolderIds.has(f.name)) { warnings.push(`"kitaplar" içinde iki tane "${f.name}" klasörü var; ilki kullanılıyor.`); continue; }
    loc.bookFolderIds.set(f.name, f.id);
    folders.push(f);
  }
  await pool(folders, MAX_PARALLEL, async f => {
    const [file] = await listChildren(f.id, { name: 'kitap.json' });
    const neden = yarimKitapNedeni(f.appProperties, !!file);
    if (neden) { loc.bookFolderIds.delete(f.name); yarimlar.push({ ad: f.name, id: f.id, neden }); return; }
    if (file) loc.bookFileIds.set(f.name, file.id);
    books.set(f.name, parseBook(f.name, file ? await readJson(file.id, `${f.name}/kitap.json okunurken`) : null));
  });
  yarimlar.sort((a, b) => a.ad.localeCompare(b.ad));
  return { library, books, loc, warnings, yarimlar };
}
