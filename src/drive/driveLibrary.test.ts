import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FOLDER_MIME, type DriveFile } from './drive';
import type { KokDrive } from './kok';
import { newArrivals, shelfBooks } from '../model/library';

// Task 6.K3: a half made sample book (defterOrnek folder without kitap.json) is not shown; the user's own folder
// without kitap.json still is (grey cover). Drive's listing and reading are faked.

const klasor = (id: string, name: string, appProperties?: Record<string, string>): DriveFile =>
  ({ id, name, mimeType: FOLDER_MIME, modifiedTime: '', ...(appProperties ? { appProperties } : {}) });
const dosya = (id: string, name: string): DriveFile => ({ id, name, mimeType: 'application/json', modifiedTime: '' });

let agac: Record<string, DriveFile[]> = {};
let kitaplikJson: unknown = { raflar: [{}, {}] };

vi.mock('./drive', async orijinal => ({
  ...await orijinal<typeof import('./drive')>(),
  listChildren: async (parentId: string, opts: { foldersOnly?: boolean; name?: string } = {}) =>
    (agac[parentId] ?? []).filter(f => (!opts.foldersOnly || f.mimeType === FOLDER_MIME) && (!opts.name || f.name === opts.name)),
  readJson: async (id: string) => id === 'LJ' ? kitaplikJson : { surum: 2, baslik: 'Kitap ' + id, uniteler: [] }
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
    expect(r.yarimlar).toEqual([{ ad: 'programlamaya-giris', id: 'B1', neden: 'ornek' }]);
  });
});

// Task 6.K4b-2: a half made wizard book (defterIslem folder without kitap.json) is skipped the same way
describe('loadDriveLibrary: the half made wizard book', () => {
  beforeEach(() => {
    agac = {
      D: [klasor('K', 'kitaplar'), dosya('LJ', 'kitaplik.json')],
      K: [
        klasor('W1', 'deneme-6', { defter: '1', defterIslem: 'islem-6' }),   // half made: no kitap.json
        klasor('W2', 'mathe-2', { defter: '1', defterIslem: 'islem-2' }),    // whole
        klasor('E1', 'eski-kitap')                                           // no marks, no kitap.json
      ],
      W1: [klasor('U1', 'Unite-01-A')],
      W2: [dosya('JW', 'kitap.json')]
    };
  });

  it('defterIslem + no kitap.json: skipped and listed; defterIslem + kitap.json: a book; no marks: grey as before', async () => {
    const r = await loadDriveLibrary('dar', kokDrive);
    expect([...r.books.keys()].sort()).toEqual(['eski-kitap', 'mathe-2']);
    expect(r.books.get('mathe-2')!.hasJson).toBe(true);
    expect(r.books.get('eski-kitap')!.hasJson).toBe(false);
    expect(r.loc.bookFolderIds.has('deneme-6')).toBe(false);
    expect([...r.loc.bookFolderIds.keys()].sort()).toEqual(['eski-kitap', 'mathe-2']);
    expect(r.yarimlar).toEqual([{ ad: 'deneme-6', id: 'W1', neden: 'sihirbaz' }]);
    const { sonYarimlar } = await import('./driveLibrary');
    expect(sonYarimlar()).toEqual(r.yarimlar);
  });
});

// Task 6.K4c: the owner's "Kitaplık" (by name). A shelf id whose folder is gone (trashed) is skipped quietly,
// and stays in kitaplik.json (cleaned up in K5).
describe('loadDriveLibrary: the owner\'s "Kitaplık", a shelf id without its folder', () => {
  const sahipKok: KokDrive = { ...kokDrive, adlaAra: async () => [{ id: 'S', name: 'Kitaplık' }] };
  beforeEach(() => {
    kitaplikJson = { raflar: [{ id: 'raf-1', ad: 'Raf 1', kitaplar: ['cop-kitap', 'mathe-2'] }, { id: 'raf-2', ad: 'Raf 2', kitaplar: ['cop-2'] }] };
    agac = {
      S: [klasor('K', 'kitaplar'), dosya('LJ', 'kitaplik.json')],
      K: [
        klasor('W2', 'mathe-2', { defter: '1', defterIslem: 'islem-2' }),
        klasor('W3', 'yarim', { defter: '1', defterIslem: 'islem-3' }),   // half made: skipped in the owner's root too
        klasor('E1', 'eski-kitap')                                       // the owner's old book: grey as before
      ],
      W2: [dosya('JW', 'kitap.json')]
    };
  });

  it('the gone ids: no book, no warning, not on a shelf, not among "Yeni gelenler"; kept in the library', async () => {
    const r = await loadDriveLibrary('tam', sahipKok);
    expect(r.loc.rootId).toBe('S');
    expect([...r.books.keys()].sort()).toEqual(['eski-kitap', 'mathe-2']);
    expect(r.warnings).toEqual([]);
    expect(r.yarimlar).toEqual([{ ad: 'yarim', id: 'W3', neden: 'sihirbaz' }]);
    expect(shelfBooks(r.library, r.books, 0)).toEqual(['mathe-2']);
    expect(shelfBooks(r.library, r.books, 1)).toEqual([]);
    expect(newArrivals(r.library, r.books)).toEqual(['eski-kitap']);
    expect(r.library.raflar[0].kitaplar).toEqual(['cop-kitap', 'mathe-2']);
  });
});

// Task 6.4d-3: "_…" folders (the app's _sistem data) are not books: not shown, not on a shelf, not among "Yeni gelenler"
describe('loadDriveLibrary: "_" folders', () => {
  beforeEach(() => {
    kitaplikJson = { raflar: [{ id: 'raf-1', ad: 'Raf 1', kitaplar: ['_sistem', 'mathe-2'] }] };
    agac = {
      D: [klasor('K', 'kitaplar'), dosya('LJ', 'kitaplik.json'), klasor('SIS', '_sistem', { defter: '1', defterSistem: '1' })],
      K: [
        klasor('W2', 'mathe-2'),
        klasor('G1', '_sistem', { defter: '1', defterSistem: '1' }),
        klasor('G2', '_eski')
      ],
      W2: [dosya('JW', 'kitap.json')],
      G1: [dosya('JG', 'kitap.json')]
    };
  });

  it('skipped quietly: no book, no folder id, no half made entry, no warning', async () => {
    const r = await loadDriveLibrary('dar', kokDrive);
    expect([...r.books.keys()]).toEqual(['mathe-2']);
    expect([...r.loc.bookFolderIds.keys()]).toEqual(['mathe-2']);
    expect(r.yarimlar).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(shelfBooks(r.library, r.books, 0)).toEqual(['mathe-2']);
    expect(newArrivals(r.library, r.books)).toEqual([]);
  });
});
