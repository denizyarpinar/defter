import { describe, expect, it } from 'vitest';
import { FOLDER_MIME } from '../drive/drive';
import type { DriveLocation } from '../drive/driveLibrary';
import type { Getirici } from '../drive/saltOkunur';
import { parseBook, parseLibrary } from '../model/parse';
import type { Book } from '../model/types';
import { agacAl, agacBellekte, agacCikar, agacKitapKlasorleri, agacGecersiz, agacKur, klasorHaritasi, kitapSirasi, type HamDosya, type HamKlasor } from './kitaplikAgaci';

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

const cikar = () => agacCikar(klasorHaritasi(klasorler, bookFolderIds), dosyalar, { bookFolderIds, books, library });
const dosya = (id: string) => cikar().dosyalar.find(f => f.id === id);

describe('klasorHaritasi', () => {
  it('keeps only the folders under the books', () => {
    const h = klasorHaritasi(klasorler, bookFolderIds);
    expect(h.has(aussage)).toBe(true);
    expect(h.has(disari)).toBe(false);
    expect(h.has(kitaplarK)).toBe(false);
    expect(h.get(mathe)).toEqual({ ad: 'mathe-1', ust: null });
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

function sahteDrive() {
  const sorgular: string[] = [];
  const getir: Getirici = async (path, init) => {
    expect(init?.method ?? 'GET').toBe('GET');
    const q = new URLSearchParams(path.slice('files?'.length)).get('q')!;
    sorgular.push(q);
    const ids = [...q.matchAll(/'([^']+)' in parents/g)].map(m => m[1]);
    const ic = (x: { parents?: string[] }) => ids.includes(x.parents![0]);
    const files = [...klasorler.filter(ic).map(k => ({ ...k, mimeType: FOLDER_MIME })), ...dosyalar.filter(f => f.mimeType === 'application/pdf' && ic(f))];
    return new Response(JSON.stringify({ files }));
  };
  return { getir, sorgular };
}
const loc: DriveLocation = { rootId: ROOT, libraryFileId: null, bookFolderIds, bookFileIds: new Map() };

describe('agacKur', () => {
  it('level by level from the book folders, folders and PDFs in one query', async () => {
    const d = sahteDrive();
    const a = await agacKur({ loc, books, library }, d.getir);
    // books → Unite / notlar → topics → Uebungen, oedevler, Eski → nothing more
    expect(a.sure.istek).toBe(4);
    expect(a.sure.katmanlar.map(k => [k.klasor, k.pdf])).toEqual([[2, 3], [2, 1], [3, 3], [0, 4]]);
    expect(d.sorgular[0]).toContain(`'${mathe}' in parents`);
    expect(d.sorgular[0]).toContain(`(mimeType = '${FOLDER_MIME}' or mimeType = 'application/pdf')`);
    expect(d.sorgular.some(q => q.includes(`'${ROOT}'`) || q.includes(`'${kitaplarK}'`))).toBe(false);
    expect(a.sure.klasor).toBe(10);   // 3 books + 2 + 2 + 3
    const ozet = (l: typeof a.dosyalar) => l.map(f => `${f.id}:${f.materyal}:${f.konu?.baslik}`).sort();
    expect(ozet(a.dosyalar)).toEqual(ozet(cikar().dosyalar));
  });

  // 6.K4b-2: a book folder that is not in the library (a half made book) is not scanned
  it('only the library\'s book folders', async () => {
    const yarimli = new Map([...bookFolderIds, ['deneme-6', 'yarim-klasor']]);
    expect([...agacKitapKlasorleri(yarimli, books).keys()]).toEqual(['mathe-1', 'prog', 'json-yok']);
    const d = sahteDrive();
    const a = await agacKur({ loc: { ...loc, bookFolderIds: yarimli }, books, library }, d.getir);
    expect(d.sorgular.some(q => q.includes('yarim-klasor'))).toBe(false);
    expect(a.kitaplar.map(k => k.id)).not.toContain('deneme-6');
    expect(a.sure.klasor).toBe(10);
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
