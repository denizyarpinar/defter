import type { DriveFile } from '../drive/drive';
import { splitPath } from './kaynakCoz';
import { classifyTopic, emptyMaterials, type TopicMaterials } from './konuKesfi';

// Task 3.6: the sample library (?demo) has PDFs too, without Drive. A web server can't list
// folders, so ornek/index.json says which files each topic folder "has":
//   "klasorler": { "<book id>": { "<klasor>": { "ozet.pdf": "demo/demo-slayt.pdf", "Uebungen/blatt-01.pdf": "…" } } }
// The key is the name inside the topic folder, the value the file under public/ (one file can be used many times).
// The rules for names (ozet / brifing, Uebungen, _cozum, …) are the same as in Drive: classifyTopic.
// Sample files and folders get ids that start with "ornek:", so nothing of this ever goes to Drive.

export type SampleFolders = Record<string, Record<string, Record<string, string>>>;

const PREFIX = 'ornek:';
const VERSION = 'ornek';   // modifiedTime of every sample file

let folders: SampleFolders = {};

export const isSampleId = (id: string) => id.startsWith(PREFIX);
export const sampleBookFolder = (bookId: string) => PREFIX + bookId;

export function setSampleFolders(f: SampleFolders): void {
  folders = f;
}

// index.json's "klasorler" → only well-formed entries (book → klasor → name → file)
export function parseSampleFolders(v: unknown): SampleFolders {
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  const out: SampleFolders = {};
  if (!isObj(v)) return out;
  for (const [book, topics] of Object.entries(v)) {
    if (!isObj(topics)) continue;
    out[book] = {};
    for (const [klasor, files] of Object.entries(topics)) {
      if (!isObj(files)) continue;
      out[book][klasor] = Object.fromEntries(Object.entries(files).filter((e): e is [string, string] => typeof e[1] === 'string'));
    }
  }
  return out;
}

const key = (path: string) => (splitPath(path) ?? []).join('/').toLowerCase();

// One topic folder of the map → its materials. null: the folder isn't there (as in Drive).
export function localTopic(topics: Record<string, Record<string, string>> | undefined, klasor: string): TopicMaterials | null {
  if (!klasor.trim()) return emptyMaterials();
  const files = Object.entries(topics ?? {}).find(([k]) => key(k) === key(klasor))?.[1];
  if (!files) return null;

  // the same demo PDF stands for many files: the part after # keeps their ids apart (page caches use the id)
  const file = (name: string, src: string, dir = ''): DriveFile => ({
    id: `${PREFIX}${src}#${key(klasor)}/${dir}${name}`, name, modifiedTime: VERSION,
    mimeType: name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'
  });
  const root: DriveFile[] = [], sub: Record<string, DriveFile[]> = { uebungen: [], oedevler: [] };
  for (const [path, src] of Object.entries(files)) {
    const parts = splitPath(path);
    if (!parts) continue;
    if (parts.length === 1) root.push(file(parts[0], src));
    else if (parts.length === 2 && sub[parts[0].toLowerCase()]) sub[parts[0].toLowerCase()].push(file(parts[1], src, parts[0] + '/'));
  }
  return classifyTopic(root, sub.uebungen, sub.oedevler);
}

// Okuyucu's discover() for a sample book folder
export function discoverSampleTopic(folderId: string, klasor: string): Promise<TopicMaterials | null> {
  return Promise.resolve(localTopic(folders[folderId.slice(PREFIX.length)], klasor));
}

// The bytes of a sample PDF from public/ (not cached in IndexedDB: the browser caches it).
export async function fetchSample(id: string): Promise<ArrayBuffer> {
  const path = id.slice(PREFIX.length).split('#')[0];
  const res = await fetch(import.meta.env.BASE_URL + path);
  // the dev server answers a missing file with index.html (200)
  if (!res.ok || (res.headers.get('content-type') ?? '').includes('html')) {
    throw new Error(`Örnek PDF yüklenemedi: ${path}. Sayfayı yenile.`);
  }
  return res.arrayBuffer();
}

// Task 6.3e: the whole map, for the library search's sample tree (arama/ornekAgac.ts)
export const sampleFolders = (): SampleFolders => folders;
