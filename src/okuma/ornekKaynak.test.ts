import { describe, expect, it } from 'vitest';
import { availableKinds, defaultKind } from './konuKesfi';
import { isSampleId, localTopic, parseSampleFolders, sampleBookFolder } from './ornekKaynak';

const D = 'demo/demo-dikey.pdf', S = 'demo/demo-slayt.pdf';
const topics = {
  'Unite-01/Konu-01': { 'orijinal.pdf': D, 'ozet.pdf': S, 'Uebungen/blatt-02.pdf': D, 'Uebungen/blatt-01.pdf': S, 'Uebungen/blatt-01_cozum.pdf': D, 'Oedevler/odev-01.pdf': S },
  'Unite-01/Konu-02': { 'brifing.pdf': S, 'sorular.pdf': D },
  'Unite-02/Konu-03': { 'orijinal.pdf': D, 'notlar.txt': D }
};
const names = (list: { file: { name: string } }[]) => list.map(m => m.file.name);

describe('localTopic', () => {
  it('sorts the files into materials with the same rules as Drive', () => {
    const m = localTopic(topics, 'Unite-01/Konu-01')!;
    expect(names(m.orijinal)).toEqual(['orijinal.pdf']);
    expect(names(m.ozet)).toEqual(['ozet.pdf']);
    expect(names(m.uebungen)).toEqual(['blatt-01.pdf', 'blatt-02.pdf']);
    expect(m.uebungen[0].cozum?.name).toBe('blatt-01_cozum.pdf');
    expect(names(m.oedevler)).toEqual(['odev-01.pdf']);
    expect(availableKinds(m)).toEqual(['orijinal', 'ozet', 'uebungen', 'oedevler']);
    expect(defaultKind(m)).toBe('ozet');
  });

  it('gives sample ids that point to the file under public/', () => {
    const f = localTopic(topics, 'Unite-01/Konu-01')!.ozet[0].file;
    expect(f.id.startsWith(`ornek:${S}#`)).toBe(true);
    expect(isSampleId(f.id)).toBe(true);
    expect(f.mimeType).toBe('application/pdf');
  });

  it('the same demo PDF under two names gets two ids (the page cache must not mix them)', () => {
    const m = localTopic(topics, 'Unite-01/Konu-01')!;
    const ids = [m.ozet[0].file, m.uebungen[0].file, m.oedevler[0].file].map(f => f.id);   // all demo-slayt.pdf
    expect(new Set(ids).size).toBe(3);
  });

  it('brifing + sorular make the Özet when there is no ozet.pdf', () => {
    expect(names(localTopic(topics, 'Unite-01/Konu-02')!.ozet)).toEqual(['brifing.pdf', 'sorular.pdf']);
  });

  it('only PDFs count', () => {
    const m = localTopic(topics, 'Unite-02/Konu-03')!;
    expect(availableKinds(m)).toEqual(['orijinal']);
  });

  it('matches the folder without case and extra slashes', () => {
    expect(localTopic(topics, 'unite-01/konu-02/')).not.toBeNull();
  });

  it('missing folder → null, empty klasor → no materials', () => {
    expect(localTopic(topics, 'Unite-09/Konu-99')).toBeNull();
    expect(localTopic(undefined, 'Unite-01/Konu-01')).toBeNull();
    expect(availableKinds(localTopic(topics, '')!)).toEqual([]);
  });
});

describe('sample ids', () => {
  it('Drive ids are never sample ids', () => {
    expect(isSampleId('1AbCdEfGhIjK')).toBe(false);
    expect(isSampleId(sampleBookFolder('lineer-cebir'))).toBe(true);
  });

  it('parseSampleFolders keeps only well-formed entries', () => {
    expect(parseSampleFolders({ a: { k: { 'ozet.pdf': S, bad: 3 }, x: 'no' }, b: [] })).toEqual({ a: { k: { 'ozet.pdf': S } } });
    expect(parseSampleFolders(null)).toEqual({});
  });
});
