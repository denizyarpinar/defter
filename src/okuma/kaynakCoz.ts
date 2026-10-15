import { FOLDER_MIME, listChildren, type DriveFile } from '../drive/drive';

// kaynak.dosya ("ders.pdf", "defter/1-hafta.jpg") → the Drive file inside the book's folder.
// Reads only. Names with ' are escaped in the query by drive.ts (qv).

export type ResolvedFile = DriveFile;

// Folder lookups are remembered per resolver, so a book with many sources asks Drive once per folder.
export class SourceResolver {
  private folders = new Map<string, Promise<string | null>>();

  constructor(private readonly bookFolderId: string) {}

  // null: the path is invalid or the file is not there
  async resolve(dosya: string): Promise<ResolvedFile | null> {
    const parts = splitPath(dosya);
    if (!parts) return null;
    const parent = await this.walk(parts.slice(0, -1));
    if (!parent) return null;
    const files = await listChildren(parent, { name: parts[parts.length - 1] });
    return files.find(f => f.mimeType !== FOLDER_MIME) ?? null;
  }

  // "Unite-01-Logik/Konu-01-Aussagenlogik" → the folder's Drive id (null: not there)
  async resolveFolder(klasor: string): Promise<string | null> {
    const parts = splitPath(klasor);
    return parts ? this.walk(parts) : null;
  }

  private async walk(parts: string[]): Promise<string | null> {
    let parent: string | null = this.bookFolderId;
    for (let i = 0; i < parts.length && parent; i++) parent = await this.folder(parent, parts[i]);
    return parent;
  }

  private folder(parentId: string, name: string): Promise<string | null> {
    const key = `${parentId}/${name}`;
    let p = this.folders.get(key);
    if (!p) {
      p = listChildren(parentId, { foldersOnly: true, name }).then(f => f[0]?.id ?? null);
      p.catch(() => this.folders.delete(key));   // don't remember a failed request
      this.folders.set(key, p);
    }
    return p;
  }
}

export function resolveSource(bookFolderId: string, dosya: string): Promise<ResolvedFile | null> {
  return new SourceResolver(bookFolderId).resolve(dosya);
}

// "defter/x.jpg" → ["defter", "x.jpg"]; "./" and empty parts are skipped; ".." → null (stay inside the book).
export function splitPath(dosya: string): string[] | null {
  const parts = dosya.replace(/\\/g, '/').split('/').map(s => s.trim()).filter(s => s && s !== '.');
  if (!parts.length || parts.includes('..')) return null;
  return parts;
}
