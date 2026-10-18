import { describe, expect, it } from 'vitest';
import { FOLDER_MIME } from '../drive/drive';
import type { DriveLocation } from '../drive/driveLibrary';
import type { Getirici } from '../drive/saltOkunur';
import { parseBook, parseLibrary } from '../model/parse';
import type { Book } from '../model/types';
import { agacAl, agacBellekte, agacCikar, agacGecersiz, agacKur, klasorHaritasi, kitapSirasi, type HamDosya, type HamKlasor } from './kitaplikAgaci';

// A small Drive: Kitaplık/kitaplar/<books>/... (+ a folder outside Kitaplık)
let n = 0;
const klasorler: HamKlasor[] = [];
const dosyalar: HamDosya[] = [];
const klasor = (name: string, ust: string, id = `d${++n}`) => { klasorler.push({ id, name, parents: [ust] }); return id; };
const pdf = (name: string, ust: string, id = `f${++n}`) => { dosyalar.push({ id, name, mimeType: 'application/pdf', modifiedTime: '2026-10-18T00:00:00Z', parents: [ust] }); return id; };

const ROOT = 'root1';
const kitaplarK = klasor('kitaplar', ROOT);
const mathe = klasor('mathe-1', kitaplarK);
const logik = klasor('Unite-01-Logik', mathe);
const aussage = klasor('Konu-01-Aussagenlogik', logik);
const ueb = klasor('Uebungen', aussage);
const oed = klasor('oedevler', aussage);   // lower case: still found
const beweis = klasor('Konu-02-Beweisen', logik);   // empty topic
const derin = klasor('Eski', aussage);
const prog = klasor('prog', kitaplarK);     // surum 1
const notlar = klasor('notlar', prog);
const bos = klasor('json-yok', kitaplarK);  // no kitap.json
const disari = klasor('Baska', 'root-baska');

const F = {
  orijinal: pdf('orijinal.pdf', aussage),
  ozet: pdf('Ozet.pdf', aussage),
  brifing: pdf('brifing.pdf', aussage),        // ozet exists: not a material
  ueb1: pdf('Uebung_01.pdf', ueb),
  ueb1c: pdf('Uebung_01_cozum.pdf', ueb),
  oed1: pdf('Oedev_01.pdf', oed),
  derin: pdf('alt.pdf', derin),
  matheKok: pdf('Formelsammlung.pdf', mathe),  // in the book, in no topic
  progDers: pdf('ders.pdf', notlar),
  progBaska: pdf('baska.pdf', prog),
  bos1: pdf('x.pdf', bos),
  disari: pdf('disari.pdf', disari),
};
dosyalar.push({ id: 'json1', name: 'kitap.json', mimeType: 'application/json', modifiedTime: '', parents: [mathe] });

const books = new Map<string, Book>([
  ['mathe-1', parseBook('mathe-1', { surum: 2, baslik: 'Mathe 1', sirt: 'MATHE', uniteler: [
    { baslik: 'Logik', konular: [
      { baslik: 'Aussagenlogik', klasor: 'Unite-01-Logik/Konu-01-Aussagenlogik' },
      { baslik: 'Beweisen', klasor: 'unite-01-logik/Konu-02-Beweisen' },   // other case: still found
    ] },
  ] })],
  ['prog', parseBook('prog', { surum: 1, baslik: 'Programmiergrundlagen', bolumler: [
    { baslik: 'Einführung', kaynaklar: [{ tur: 'pdf', dosya: 'notlar/ders.pdf' }] },
  ] })],
  ['json-yok', parseBook('json-yok', null)],
]);
const bookFolderIds = new Map([['mathe-1', mathe], ['prog', prog], ['json-yok', bos]]);
const library = parseLibrary({ raflar: [{ kitaplar: ['prog'] }, { kitaplar: ['mathe-1'] }] });

const cikar = () => agacCikar(klasorHaritasi(klasorler, ROOT), dosyalar, { bookFolderIds, books, library });
const dosya = (id: string) => cikar().dosyalar.find(f => f.id === id);

describe('klasorHaritasi', () => {
  it('keeps only the folders under Kitaplık', () => {
    const h = klasorHaritasi(klasorler, ROOT);
    expect(h.has(aussage)).toBe(true);
    expect(h.has(disari)).toBe(false);
    expect(h.get(aussage)).toEqual({ ad: 'Konu-01-Aussagenlogik', ust: logik });
  });
});

describe('agacCikar', () => {
  it('materials as the reader finds them, solutions with their X', () => {
    const d = (id: string) => { const f = dosya(id)!; return [f.konu?.baslik ?? null, f.materyal, f.cozumMu]; };
    expect(d(F.orijinal)).toEqual(['Aussagenlogik', 'orijinal', false]);
    expect(d(F.ozet)).toEqual(['Aussagenlogik', 'ozet', false]);
    expect(d(F.brifing)).toEqual(['Aussagenlogik', null, false]);
    expect(d(F.ueb1)).toEqual(['Aussagenlogik', 'uebungen', false]);
    expect(d(F.ueb1c)).toEqual(['Aussagenlogik', 'uebungen', true]);
    expect(d(F.oed1)).toEqual(['Aussagenlogik', 'oedevler', false]);
    expect(d(F.derin)).toEqual(['Aussagenlogik', null, false]);
  });

  it('a file in no topic, a book without kitap.json, surum 1 sources', () => {
    expect(dosya(F.matheKok)!.konu).toBeNull();
    expect(dosya(F.bos1)!.konu).toBeNull();
    expect(dosya(F.bos1)!.kitap.baslik).toBe('json-yok');
    expect(dosya(F.progDers)!.konu?.baslik).toBe('Einführung');
    expect(dosya(F.progDers)!.konu?.klasor).toBeUndefined();
    expect(dosya(F.progBaska)!.konu).toBeNull();
  });

  it('only PDFs under a book; empty topics are topics too', () => {
    const a = cikar();
    expect(a.dosyalar.map(f => f.id)).not.toContain(F.disari);
    expect(a.dosyalar.map(f => f.id)).not.toContain('json1');
    expect(a.konular.map(t => `${t.kitap.id}:${t.uniteBaslik}:${t.baslik}:${t.sira}`)).toEqual(['prog:Genel:Einführung:0', 'mathe-1:Logik:Aussagenlogik:0', 'mathe-1:Logik:Beweisen:1']);
    expect(a.klasorIdleri).not.toContain(beweis);   // no PDF in it
    expect(new Set(a.klasorIdleri)).toEqual(new Set([aussage, ueb, oed, derin, mathe, notlar, prog, bos]));
  });

  it('book order: shelves, then the books on no shelf', () => {
    expect(kitapSirasi(library, books)).toEqual(['prog', 'mathe-1', 'json-yok']);
    expect(cikar().kitaplar.map(k => [k.id, k.sira])).toEqual([['prog', 0], ['mathe-1', 1], ['json-yok', 2]]);
  });

  it('search keys: no .pdf, no _cozum, normalized', () => {
    expect(dosya(F.ueb1c)!.anahtar).toBe('uebung_01');
    expect(cikar().kitaplar[1].anahtar).toBe('mathe 1\nmathe');
  });
});

// ---- building with Drive (a fake read-only fetcher) ----

function sahteDrive(klasorSayfa = 1) {
  const istekler: string[] = [];
  const getir: Getirici = async (path, init) => {
    expect(init?.method ?? 'GET').toBe('GET');
    istekler.push(path);
    const p = new URLSearchParams(path.slice('files?'.length));
    const q = p.get('q')!, token = p.get('pageToken');
    const json = (files: unknown[], next?: string) => new Response(JSON.stringify({ files, nextPageToken: next }));
    if (q.startsWith(`mimeType = '${FOLDER_MIME}'`)) {
      const s = token ? +token : 1;
      return json(s === 1 ? klasorler : [], s < klasorSayfa ? String(s + 1) : undefined);
    }
    const ids = [...q.matchAll(/'([^']+)' in parents/g)].map(m => m[1]);
    if (q.includes(FOLDER_MIME)) return json(klasorler.filter(k => ids.includes(k.parents![0])));
    return json(dosyalar.filter(f => f.mimeType === 'application/pdf' && ids.includes(f.parents![0])));
  };
  return { getir, istekler };
}
const loc: DriveLocation = { rootId: ROOT, libraryFileId: null, bookFolderIds, bookFileIds: new Map() };

describe('agacKur', () => {
  it('one folder query, then the PDFs of the folders under the books', async () => {
    const d = sahteDrive();
    const a = await agacKur({ loc, books, library }, d.getir);
    expect(a.sure.yontem).toBe('tekSorgu');
    expect(a.sure.istek).toBe(2);   // folders + 1 group of PDFs
    expect(a.dosyalar).toHaveLength(dosyalar.filter(f => f.mimeType === 'application/pdf').length - 1);
  });

  it('more than 3 pages of folders: BFS from the root', async () => {
    const d = sahteDrive(4);
    const a = await agacKur({ loc, books, library }, d.getir);
    expect(a.sure.yontem).toBe('bfs');
    expect(d.istekler.filter(u => new URLSearchParams(u.slice(6)).get('q')!.startsWith('mimeType')).length).toBe(3);
    expect(cikar().dosyalar.map(f => [f.id, f.materyal])).toEqual(a.dosyalar.map(f => [f.id, f.materyal]));
  });
});

describe('agacAl (memory)', () => {
  it('kept for 10 minutes, built again when invalidated or expired', async () => {
    agacGecersiz();
    const o = { loc, books, library };
    const d = sahteDrive();
    const t = 1_000_000;
    const a = await agacAl(o, d.getir, t);
    expect(agacBellekte(o, t + 1000)).toBe(true);
    expect(await agacAl(o, d.getir, t + 9 * 60_000)).toBe(a);
    expect(await agacAl(o, d.getir, t + 11 * 60_000)).not.toBe(a);
    agacGecersiz();
    expect(agacBellekte(o)).toBe(false);
  });

  it('a failed build is not kept', async () => {
    agacGecersiz();
    const o = { loc, books, library };
    const hata: Getirici = async () => new Response('', { status: 500 });
    await expect(agacAl(o, hata)).rejects.toThrow();
    expect(agacBellekte(o)).toBe(false);
  });
});
