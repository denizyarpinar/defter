import { describe, expect, it } from 'vitest';
import type { DriveLocation } from '../drive/driveLibrary';
import type { Getirici } from '../drive/saltOkunur';
import { parseBook, parseLibrary } from '../model/parse';
import type { MaterialKind } from '../okuma/konuKesfi';
import { adAnahtari, dosyaAnahtari } from './adEsle';
import type { AgacDosyasi, AgacKitabi, AgacKonusu } from './kitaplikAgaci';
import { birlestir, kitaplikAra } from './kitaplikAra';

const kitap = (id: string, baslik: string, sira: number): AgacKitabi => ({ id, baslik, sira, anahtar: adAnahtari(baslik) });
const konu = (k: AgacKitabi, baslik: string, sira: number, klasor?: string): AgacKonusu =>
  ({ kitap: k, uniteBaslik: 'Logik', baslik, klasor, sira, anahtar: adAnahtari(baslik) });
const dosya = (id: string, ad: string, k: AgacKitabi, t: AgacKonusu | null, materyal: MaterialKind | null = null, cozumMu = false): AgacDosyasi =>
  ({ id, ad, modifiedTime: '', klasorId: `kl-${id}`, kitap: k, konu: t, materyal, cozumMu, anahtar: dosyaAnahtari(ad) });

const prog = kitap('prog', 'Programmiergrundlagen', 0);
const mathe = kitap('mathe-1', 'Mathe 1', 1);
const aussage = konu(mathe, 'Aussagenlogik', 0, 'L/A');
const beweis = konu(mathe, 'Beweisen', 1, 'L/B');   // empty topic
const progKonu = konu(prog, 'Einführung', 0);
const agac = {
  kitaplar: [prog, mathe],
  konular: [progKonu, aussage, beweis],
  dosyalar: [
    dosya('m-ozet', 'ozet.pdf', mathe, aussage, 'ozet'),
    dosya('m-orj', 'orijinal.pdf', mathe, aussage, 'orijinal'),
    dosya('m-ueb', 'Uebung_Beweis.pdf', mathe, aussage, 'uebungen'),
    dosya('m-uebc', 'Uebung_Beweis_cozum.pdf', mathe, aussage, 'uebungen', true),
    dosya('m-dis', 'Beweis-Tipps.pdf', mathe, null),
    dosya('p-ders', 'ders.pdf', prog, progKonu),
  ],
};
const ozet = (l: ReturnType<typeof birlestir>) => l.map(r => `${r.eslesme}:${r.dosyaId ?? r.ad}`);

describe('birlestir', () => {
  it('topic row first (an empty topic too), then names, solution after its X, topic-less last', () => {
    const r = birlestir(agac, 'beweis', null);
    expect(ozet(r)).toEqual(['konu:Beweisen', 'ad:m-ueb', 'ad:m-uebc', 'ad:m-dis']);
    expect(r[0].dosyaId).toBeUndefined();
    expect(r[0]).toMatchObject({ kitapId: 'mathe-1', konuKlasor: 'L/B', konuBaslik: 'Beweisen', uniteBaslik: 'Logik', konuSira: 1 });
    expect(r[3].konuDisi).toBe(true);
  });

  it('text results after the names; both = ikisi; ids the tree does not know are dropped', () => {
    const r = birlestir(agac, 'beweis', new Set(['m-ozet', 'm-ueb', 'p-ders', 'baska-yerde', 'cop']));
    expect(ozet(r)).toEqual(['konu:Beweisen', 'ikisi:m-ueb', 'ad:m-uebc', 'ad:m-dis', 'metin:p-ders', 'metin:m-ozet']);
  });

  it('text: book order, then topic order, then material order', () => {
    const r = birlestir(agac, 'wort', new Set(['m-orj', 'm-ozet', 'p-ders', 'm-dis']));
    expect(ozet(r)).toEqual(['metin:p-ders', 'metin:m-orj', 'metin:m-ozet', 'metin:m-dis']);
  });

  it('a matching book: only its row, not its topics', () => {
    const r = birlestir({ ...agac, konular: [...agac.konular, konu(mathe, 'Mathe-Grundlagen', 2)] }, 'mathe', null);
    expect(ozet(r)).toEqual(['kitap:Mathe 1']);
    expect(r[0]).toMatchObject({ kitapId: 'mathe-1', kitapBaslik: 'Mathe 1' });
    expect(r[0].konuBaslik).toBeUndefined();
  });

  it('a query shorter than 2 letters: nothing', () => {
    expect(birlestir(agac, 'b', new Set(['m-ozet']))).toEqual([]);
  });
});

describe('6.4c-3: handwriting records (.ocr.json) in the library search', () => {
  it('a record counts for its PDF: a text result marked el yazısı; the record is no row of its own', () => {
    const r = birlestir(agac, 'wort', new Set(['ocr-json-id']), [{ kaynak: 'm-ozet', klasor: 'kl-m-ozet' }]);
    expect(ozet(r)).toEqual(['metin:m-ozet']);
    expect(r[0]).toMatchObject({ dosyaId: 'm-ozet', materyal: 'ozet', konuSira: 0, elYazisi: true });
  });

  it('the PDF found by its own text too: one row, el yazısı', () => {
    const r = birlestir(agac, 'wort', new Set(['m-ozet']), [{ kaynak: 'm-ozet', klasor: 'kl-m-ozet' }]);
    expect(ozet(r)).toEqual(['metin:m-ozet']);
    expect(r[0].elYazisi).toBe(true);
  });

  it('name + handwriting = ikisi', () => {
    const r = birlestir(agac, 'beweis', null, [{ kaynak: 'm-ueb', klasor: 'kl-m-ueb' }]);
    expect(r.find(x => x.dosyaId === 'm-ueb')).toMatchObject({ eslesme: 'ikisi', elYazisi: true });
  });

  it('a record in another folder, or for a PDF the tree does not know: dropped', () => {
    expect(birlestir(agac, 'wort', null, [{ kaynak: 'm-ozet', klasor: 'baska-klasor' }])).toEqual([]);
    expect(birlestir(agac, 'wort', null, [{ kaynak: 'cop-pdf', klasor: 'kl-cop-pdf' }])).toEqual([]);
    expect(birlestir(agac, 'wort', null, [{ kaynak: 'm-ozet' }])).toEqual([]);
  });

  it('no records: the same results as before, no elYazisi field', () => {
    const ids = new Set(['m-ozet', 'm-ueb', 'p-ders']);
    const r = birlestir(agac, 'beweis', ids);
    expect(r).toEqual(birlestir(agac, 'beweis', ids, []));
    expect(r.some(x => 'elYazisi' in x)).toBe(false);
  });
});

// 6.4c-4: no lock and no option any more: both spellings and the handwriting records for everyone
describe('kitaplikAra (Drive, kilitsiz)', () => {
  it('fullText iki yazımla, appProperties ile; .ocr.json bulgusu PDF satırına el yazısı rozeti', async () => {
    const sorgular: { q: string; fields: string | null }[] = [];
    const getir: Getirici = async path => {
      const u = new URLSearchParams(path.slice('files?'.length));
      const q = u.get('q')!;
      if (!q.includes('fullText')) {
        // the tree: one PDF straight in the book folder
        return new Response(JSON.stringify({ files: q.includes("'kb' in parents") ? [{ id: 'p1', name: 'ozet.pdf', mimeType: 'application/pdf', modifiedTime: '', parents: ['kb'] }] : [] }));
      }
      sorgular.push({ q, fields: u.get('fields') });
      return new Response(JSON.stringify({ files: [{ id: 'j1', parents: ['kb'], appProperties: { defterOcr: '1', defterOcrKaynak: 'p1' } }] }));
    };
    const books = new Map([['b', parseBook('b', null)]]);
    const loc: DriveLocation = { rootId: 'kok', libraryFileId: null, bookFolderIds: new Map([['b', 'kb']]), bookFileIds: new Map() };
    const r = await kitaplikAra('Einrückung', { loc, books, library: parseLibrary({ raflar: [{ kitaplar: ['b'] }] }) }, { getir });
    expect(sorgular).toHaveLength(1);
    expect(sorgular[0].q).toContain("(fullText contains 'Einrückung' or fullText contains 'Einrueckung')");
    expect(sorgular[0].fields).toContain('appProperties');
    expect(r.sonuclar.find(x => x.dosyaId === 'p1')).toMatchObject({ elYazisi: true });
  });
});
