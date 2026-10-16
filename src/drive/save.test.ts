import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book, Library } from '../model/types';
import { createJson, readJson, updateJson } from './drive';
import type { DriveLocation } from './driveLibrary';
import { DriveSaver } from './save';

vi.mock('./drive', () => ({ createJson: vi.fn(), readJson: vi.fn(), updateJson: vi.fn() }));

const book = (id: string) => ({ id, kapak: { renk: '#123456', stil: 'deri', extra: {} } }) as unknown as Book;

function setup(withJson: boolean) {
  const loc: DriveLocation = {
    rootId: 'root', libraryFileId: 'lib',
    bookFolderIds: new Map([['b', 'folder-b']]),
    bookFileIds: new Map(withJson ? [['b', 'file-b']] : [])
  };
  const ui = { saving: vi.fn(), saved: vi.fn(), failed: vi.fn(), warn: vi.fn() };
  const saver = new DriveSaver(loc, { library: {} as Library, books: new Map([['b', book('b')]]) }, ui);
  return { saver, ui };
}

describe('DriveSaver.coverChanged', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis); vi.clearAllMocks(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('without kitap.json: warns, writes nothing, creates no file', async () => {
    const { saver, ui } = setup(false);
    saver.coverChanged('b');
    expect(ui.warn).toHaveBeenCalledWith('Bu kitapta kitap.json yok; kapak kaydedilemedi.');
    expect(saver.hasUnsaved).toBe(false);
    await vi.runAllTimersAsync();
    expect(createJson).not.toHaveBeenCalled();
    expect(updateJson).not.toHaveBeenCalled();
    expect(ui.saving).not.toHaveBeenCalled();
  });

  it('with kitap.json: updates the same file and keeps other fields', async () => {
    vi.mocked(readJson).mockResolvedValue({ baslik: 'X', kapak: { renk: '#000', not: 1 } });
    const { saver, ui } = setup(true);
    saver.coverChanged('b');
    expect(saver.hasUnsaved).toBe(true);
    await vi.runAllTimersAsync();
    expect(ui.warn).not.toHaveBeenCalled();
    expect(createJson).not.toHaveBeenCalled();
    expect(updateJson).toHaveBeenCalledWith('file-b', { baslik: 'X', kapak: { renk: '#123456', not: 1, stil: 'deri' } }, 'b/kitap.json kaydedilirken');
    expect(ui.saved).toHaveBeenCalled();
  });
});
