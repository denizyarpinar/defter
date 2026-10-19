import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FOLDER_MIME, type DriveFile } from './drive';
import type { KokDrive } from './kok';

// Task 6.K3: a half made sample book (defterOrnek folder without kitap.json) is not shown; the user's own folder
// without kitap.json still is (grey cover). Drive's listing and reading are faked.

const klasor = (id: string, name: string, appProperties?: Record<string, string>): DriveFile =>
  ({ id, name, mimeType: FOLDER_MIME, modifiedTime: '', ...(appProperties ? { appProperties } : {}) });
const dosya = (id: string, name: string): DriveFile => ({ id, name, mimeType: 'application/json', modifiedTime: '' });

let agac: Record<string, DriveFile[]> = {};

vi.mock('./drive', async orijinal => ({
  ...await orijinal<typeof import('./drive')>(),
  listChildren: async (parentId: string, opts: { foldersOnly?: boolean; name?: string } = {}) =>
    (agac[parentId] ?? []).filter(f => (!opts.foldersOnly || f.mimeType === FOLDER_MIME) && (!opts.name || f.name === opts.name)),
  readJson: async (id: string) => id === 'LJ' ? { raflar: [{}, {}] } : { surum: 2, baslik: 'Kitap ' + id, uniteler: [] }
}));

const { loadDriveLibrary } = await import('./driveLibrary');

const kokDrive: KokDrive = {
  adlaAra: async () => [],
  defterKokAra: async () => [{ id: 'D', name: 'Defter Library' }],
  kokCocuklari: async () => [{ name: 'kitaplar', mimeType: FOLDER_MIME }, { name: 'kitaplik.json', mimeType: 'application/json' }]
};

describe('loadDriveLibrary: the sample book folder', () => {
  beforeEach(() => {
    agac = {
      D: [klasor('K', 'kitaplar'), dosya('LJ', 'kitaplik.json')],
      K: [
        klasor('B1', 'programlamaya-giris', { defter: '1', defterOrnek: '1' }),   // half made sample: no kitap.json
        klasor('B2', 'kendi-notlarim'),                                           // the user's, no kitap.json
        klasor('B3', 'tam-ornek', { defterOrnek: '1' })                            // a whole sample
      ],
      B3: [dosya('J3', 'kitap.json')]
    };
  });

  it('half made sample: skipped; own folder without kitap.json: grey; whole sample: shown', async () => {
    const r = await loadDriveLibrary('dar', kokDrive);
    expect([...r.books.keys()].sort()).toEqual(['kendi-notlarim', 'tam-ornek']);
    expect(r.books.get('kendi-notlarim')!.hasJson).toBe(false);
    expect(r.books.get('tam-ornek')!.hasJson).toBe(true);
    expect(r.loc.bookFolderIds.has('programlamaya-giris')).toBe(false);
    expect(r.loc.bookFileIds.get('tam-ornek')).toBe('J3');
  });
});
