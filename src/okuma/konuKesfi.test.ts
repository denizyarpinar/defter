import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FOLDER_MIME, listChildren, type DriveFile } from '../drive/drive';
import { SourceResolver } from './kaynakCoz';
import { availableKinds, classifyTopic, defaultKind, discoverTopic } from './konuKesfi';

vi.mock('../drive/drive', async importOriginal => ({
  ...await importOriginal<typeof import('../drive/drive')>(),
  listChildren: vi.fn()
}));

let n = 0;
const pdf = (name: string): DriveFile => ({ id: `f${++n}`, name, mimeType: 'application/pdf', modifiedTime: '2026-10-15T00:00:00Z' });
const folder = (name: string): DriveFile => ({ id: `d${++n}`, name, mimeType: FOLDER_MIME, modifiedTime: '2026-10-15T00:00:00Z' });
const names = (list: { file: DriveFile; cozum: DriveFile | null }[]) => list.map(m => [m.file.name, m.cozum?.name ?? null]);

describe('classifyTopic', () => {
  it('finds every material of a full topic', () => {
    const m = classifyTopic(
      [pdf('orijinal.pdf'), pdf('ozet.pdf'), folder('Uebungen'), folder('Oedevler')],
      [pdf('Uebung_01.pdf'), pdf('Uebung_01_cozum.pdf')],
      [pdf('Oedev_01.pdf')]
    );
    expect(names(m.orijinal)).toEqual([['orijinal.pdf', null]]);
    expect(names(m.ozet)).toEqual([['ozet.pdf', null]]);
    expect(names(m.uebungen)).toEqual([['Uebung_01.pdf', 'Uebung_01_cozum.pdf']]);
    expect(names(m.oedevler)).toEqual([['Oedev_01.pdf', null]]);
    expect(availableKinds(m)).toEqual(['orijinal', 'ozet', 'uebungen', 'oedevler']);
  });

  it('uses brifing + sorular when there is no ozet', () => {
    const m = classifyTopic([pdf('sorular.pdf'), pdf('brifing.pdf')], [], []);
    expect(names(m.ozet)).toEqual([['brifing.pdf', null], ['sorular.pdf', null]]);
  });

  it('prefers ozet over brifing', () => {
    const m = classifyTopic([pdf('brifing.pdf'), pdf('ozet.pdf'), pdf('sorular.pdf')], [], []);
    expect(names(m.ozet)).toEqual([['ozet.pdf', null]]);
  });

  it('takes brifing alone', () => {
    expect(names(classifyTopic([pdf('brifing.pdf')], [], []).ozet)).toEqual([['brifing.pdf', null]]);
  });

  it('ignores upper/lower case', () => {
    const m = classifyTopic([pdf('ORIJINAL.PDF'), pdf('Ozet.pdf')], [pdf('UEBUNG_02.PDF'), pdf('uebung_02_COZUM.pdf')], []);
    expect(names(m.orijinal)).toEqual([['ORIJINAL.PDF', null]]);
    expect(names(m.ozet)).toEqual([['Ozet.pdf', null]]);
    expect(names(m.uebungen)).toEqual([['UEBUNG_02.PDF', 'uebung_02_COZUM.pdf']]);
  });

  it('hides a solution without its exercise', () => {
    const m = classifyTopic([], [pdf('Uebung_01.pdf'), pdf('Uebung_02_cozum.pdf')], [pdf('Oedev_09_cozum.pdf')]);
    expect(names(m.uebungen)).toEqual([['Uebung_01.pdf', null]]);
    expect(m.oedevler).toEqual([]);
  });

  it('sorts exercises alphabetically, numbers by value', () => {
    const m = classifyTopic([], [pdf('Uebung_10.pdf'), pdf('b.pdf'), pdf('Uebung_2.pdf'), pdf('A.pdf')], []);
    expect(names(m.uebungen).map(x => x[0])).toEqual(['A.pdf', 'b.pdf', 'Uebung_2.pdf', 'Uebung_10.pdf']);
  });

  it('ignores files that are not PDFs and folders', () => {
    const m = classifyTopic([pdf('notlar.txt'), folder('orijinal.pdf')], [pdf('foto.jpg'), folder('alt.pdf')], []);
    expect(availableKinds(m)).toEqual([]);
    expect(defaultKind(m)).toBeNull();
  });
});

describe('defaultKind', () => {
  it('opens Özet first, then Orijinal, then the first found', () => {
    expect(defaultKind(classifyTopic([pdf('orijinal.pdf'), pdf('ozet.pdf')], [], []))).toBe('ozet');
    expect(defaultKind(classifyTopic([pdf('orijinal.pdf')], [pdf('u.pdf')], []))).toBe('orijinal');
    expect(defaultKind(classifyTopic([], [], [pdf('o.pdf')]))).toBe('oedevler');
  });
});

describe('discoverTopic', () => {
  // book/Unite-01/Konu-01/{orijinal.pdf, Uebungen/{Uebung_01.pdf, Uebung_01_cozum.pdf}}
  const uebungen = folder('Uebungen');
  const unite = folder('Unite-01'), konu = folder('Konu-01');
  const tree: Record<string, DriveFile[]> = {
    book: [unite], [unite.id]: [konu],
    [konu.id]: [pdf('orijinal.pdf'), uebungen],
    [uebungen.id]: [pdf('Uebung_01.pdf'), pdf('Uebung_01_cozum.pdf')]
  };
  const mock = vi.mocked(listChildren);

  beforeEach(() => {
    mock.mockReset();
    mock.mockImplementation(async (parent, opts = {}) =>
      (tree[parent] ?? []).filter(f => (!opts.foldersOnly || f.mimeType === FOLDER_MIME) && (!opts.name || f.name === opts.name)));
  });

  it('lists the topic with few Drive calls', async () => {
    const m = await discoverTopic(new SourceResolver('book'), 'Unite-01/Konu-01');
    expect(m && names(m.uebungen)).toEqual([['Uebung_01.pdf', 'Uebung_01_cozum.pdf']]);
    expect(m && names(m.orijinal)).toEqual([['orijinal.pdf', null]]);
    const listings = mock.mock.calls.filter(([, opts]) => !opts?.name);   // not the path lookups
    expect(listings.length).toBeLessThanOrEqual(3);
  });

  it('returns null when the folder is missing', async () => {
    expect(await discoverTopic(new SourceResolver('book'), 'Unite-01/Konu-99')).toBeNull();
  });

  it('has no materials when klasor is empty', async () => {
    const m = await discoverTopic(new SourceResolver('book'), '');
    expect(m && availableKinds(m)).toEqual([]);
    expect(mock).not.toHaveBeenCalled();
  });
});
