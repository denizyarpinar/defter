import { describe, expect, it, vi } from 'vitest';
import { driveFetch, FOLDER_MIME, listChildren, type DriveFile } from '../drive/drive';
import { SourceResolver } from './kaynakCoz';
import { discoverTopic } from './konuKesfi';
import { driveKonuAra, jsondaYolBul, KONU_ARA, konuAdi, konuAraAcik, konuAraSorgusu, konuKesfet, tekEslesme } from './konuAra';

vi.mock('../drive/drive', async importOriginal => ({
  ...await importOriginal<typeof import('../drive/drive')>(),
  listChildren: vi.fn(),
  driveFetch: vi.fn()
}));

describe('flag', () => {
  it('defaults on', () => expect(KONU_ARA).toBe(true));
  it.each(['', '?konuAra=1', '?konuTasi=1'])('on: %s', s => expect(konuAraAcik(s)).toBe(true));
  it('?konuAra=0 turns it off', () => expect(konuAraAcik('?lang=tr&konuAra=0')).toBe(false));
});

describe('konuAdi', () => {
  it('takes the Konu-NN name of a unit/topic path', () => expect(konuAdi('Unite-01-A/Konu-03-Beweis')).toBe('Konu-03-Beweis'));
  it.each(['Konu-03-B', 'a/b/Konu-03', 'Unite-01/Ozet', '../Konu-01', 'Unite-01/Konu-x', ''])('no search for %s', y => expect(konuAdi(y)).toBeNull());
});

describe('jsondaYolBul', () => {
  const json = (...ys: string[]) => ({ uniteler: [{ konular: ys.map(klasor => ({ klasor })) }, { konular: 'bozuk' }] });
  it('the one path with that folder name', () => expect(jsondaYolBul(json('U1/Konu-01-A', 'U2/Konu-02-B'), 'Konu-02-B')).toBe('U2/Konu-02-B'));
  it('none or twice → null', () => {
    expect(jsondaYolBul(json('U1/Konu-01-A'), 'Konu-02-B')).toBeNull();
    expect(jsondaYolBul(json('U1/Konu-02-B', 'U2/Konu-02-B'), 'Konu-02-B')).toBeNull();
    expect(jsondaYolBul(null, 'Konu-02-B')).toBeNull();
  });
});

describe('query and match', () => {
  it('escapes the name and lists every parent', () =>
    expect(konuAraSorgusu("Konu-01-O'Neil", ['u1', 'u2'])).toBe(`name = 'Konu-01-O\\'Neil' and ('u1' in parents or 'u2' in parents) and mimeType = '${FOLDER_MIME}' and trashed = false`));
  it('exactly one folder with one parent', () => {
    const f = (id: string, parents = ['u2']) => ({ id, name: 'Konu-01-A', parents });
    expect(tekEslesme([f('t1')], 'Konu-01-A')?.id).toBe('t1');
    expect(tekEslesme([], 'Konu-01-A')).toBeNull();
    expect(tekEslesme([f('t1'), f('t9', ['u1'])], 'Konu-01-A')).toBeNull();
    expect(tekEslesme([f('t1', ['u1', 'u2'])], 'Konu-01-A')).toBeNull();
  });
});

describe('Drive search pagination', () => {
  const ad = 'Konu-01-A';
  const file = (id: string) => ({ id, name: ad, parents: ['u1'] });
  const respond = (pages: object[]) => {
    const fetch = vi.mocked(driveFetch).mockReset();
    for (const page of pages) fetch.mockResolvedValueOnce(new Response(JSON.stringify(page)));
    return fetch;
  };
  it('finds a match on the second page after an empty first page', async () => {
    const fetch = respond([{ files: [], nextPageToken: 'page-2' }, { files: [file('t1')] }]);
    const found = await driveKonuAra(ad, ['u1']);
    expect(tekEslesme(found, ad)?.id).toBe('t1');
    expect(fetch).toHaveBeenCalledTimes(2);
    const first = new URLSearchParams(fetch.mock.calls[0][0].split('?')[1]);
    const second = new URLSearchParams(fetch.mock.calls[1][0].split('?')[1]);
    expect(first.get('fields')).toContain('nextPageToken');
    expect(first.has('pageToken')).toBe(false);
    expect(second.get('pageToken')).toBe('page-2');
    expect(second.get('q')).toBe(first.get('q'));
  });
  it('one match per page is ambiguous; skips remaining pages and parent groups', async () => {
    const fetch = respond([
      { files: [file('t1')], nextPageToken: 'page-2' },
      { files: [file('t2')], nextPageToken: 'page-3' }
    ]);
    const found = await driveKonuAra(ad, Array.from({ length: 41 }, (_, i) => 'u' + i));
    expect(found.map(f => f.id)).toEqual(['t1', 't2']);
    expect(tekEslesme(found, ad)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('checks all parent groups before accepting a unique match', async () => {
    const fetch = respond([{ files: [file('t1')] }, { files: [file('t2')] }]);
    expect(tekEslesme(await driveKonuAra(ad, Array.from({ length: 41 }, (_, i) => 'u' + i)), ad)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('konuKesfet (the reader opening)', () => {
  const setup = (bulunan: Record<string, string>, bul: (k: string) => Promise<string | null>) => {
    const o = { kesfet: vi.fn(async (k: string) => bulunan[k] ?? null), bul: vi.fn(bul), unut: vi.fn() };
    return o;
  };
  it('found by its path: no search', async () => {
    const o = setup({ old: 'M' }, async () => 'new');
    expect(await konuKesfet('old', o)).toEqual({ m: 'M', klasor: 'old' }); expect(o.bul).not.toHaveBeenCalled();
  });
  it('not found: searched once, the remembered null goes, the new path is read', async () => {
    const o = setup({ new: 'M' }, async () => 'new');
    expect(await konuKesfet('old', o)).toEqual({ m: 'M', klasor: 'new' });
    expect(o.bul).toHaveBeenCalledTimes(1); expect(o.unut).toHaveBeenCalledWith('old');
  });
  it('the new path empty too: still only one search (no loop)', async () => {
    const o = setup({}, async () => 'new');
    expect(await konuKesfet('old', o)).toEqual({ m: null, klasor: 'new' });
    expect(o.bul).toHaveBeenCalledTimes(1); expect(o.kesfet).toHaveBeenCalledTimes(2);
  });
  it('network error: as today (not found) and the null is not remembered', async () => {
    const o = setup({}, async () => { throw new TypeError('Failed to fetch'); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await konuKesfet('old', o)).toEqual({ m: null, klasor: 'old' }); expect(o.unut).toHaveBeenCalledWith('old');
  });
  it('not anywhere: as today', async () => {
    const o = setup({}, async () => null);
    expect(await konuKesfet('old', o)).toEqual({ m: null, klasor: 'old' }); expect(o.unut).not.toHaveBeenCalled();
  });
  it('no context or empty path: no search', async () => {
    const o = setup({}, async () => 'new');
    expect(await konuKesfet('', o)).toEqual({ m: null, klasor: '' });
    expect(await konuKesfet('old', { kesfet: o.kesfet, unut: o.unut })).toEqual({ m: null, klasor: 'old' }); expect(o.bul).not.toHaveBeenCalled();
  });

  // K5: the photo / file adding finds the folder by the open topic's path (Okuyucu.topicFolderId → resolveFolder)
  it('the folder id is found by the fixed path; the old one would fail', async () => {
    const tree: Record<string, DriveFile[]> = {
      kb: [{ id: 'u1', name: 'Unite-01-A', mimeType: FOLDER_MIME }, { id: 'u2', name: 'Unite-02-B', mimeType: FOLDER_MIME }] as DriveFile[],
      u1: [], u2: [{ id: 't1', name: 'Konu-01-X', mimeType: FOLDER_MIME }] as DriveFile[], t1: [{ id: 'f1', name: 'ozet.pdf', mimeType: 'application/pdf' }] as DriveFile[]
    };
    vi.mocked(listChildren).mockImplementation(async (p: string, o?: { name?: string }) => (tree[p] ?? []).filter(f => !o?.name || f.name === o.name));
    let r = new SourceResolver('kb');
    const k = await konuKesfet('Unite-01-A/Konu-01-X', {
      kesfet: x => discoverTopic(r, x), bul: async () => 'Unite-02-B/Konu-01-X', unut: () => { r = new SourceResolver('kb'); }
    });
    expect(k.klasor).toBe('Unite-02-B/Konu-01-X'); expect(k.m?.ozet.length).toBe(1);
    expect(await r.resolveFolder(k.klasor)).toBe('t1');
    expect(await r.resolveFolder('Unite-01-A/Konu-01-X')).toBeNull();
  });
});
