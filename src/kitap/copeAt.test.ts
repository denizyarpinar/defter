import { describe, expect, it } from 'vitest';
import { KITAP } from '../drive/icindekilerSahte';
import type { Book, Topic, Unit } from '../model/types';
import {
  adEsitMi, bekleyenSay, gidenKonular, jsonaGeriKoy, jsondanCikar, kitabaGeriKoy, kitaptanCikar, komsuKonu, rafaGeriKoy, raftanCikar
} from './copeAt';
import { IcindekilerUyusmuyor } from './icindekiler';

const K1 = 'Unite-01-Logik/Konu-01-Aussagen', K2 = 'Unite-01-Logik/Konu-02-Beweisen';
const kitap = () => structuredClone({ ...KITAP, kurdele: { konu: K1, materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 3, ek: 1 } });

describe('jsondanCikar / jsonaGeriKoy: a topic', () => {
  it('out: the topic goes, the book\'s ribbon on it → null; unknown fields, cover, other topics stay; the input is not changed', () => {
    const k = kitap();
    const r = jsondanCikar(k, { tur: 'konu', konu: K1 });
    expect(r.degisti).toBe(true);
    expect(r.json.uniteler).toEqual([{ ...KITAP.uniteler[0], konular: [KITAP.uniteler[0].konular[1]] }, KITAP.uniteler[1]]);
    expect(r.json).toMatchObject({ kurdele: null, bilinmeyen: 7, kapak: KITAP.kapak });
    expect(r.cikan).toMatchObject({ tur: 'konu', uniteKlasor: 'Unite-01-Logik', onceki: null, sira: 0, kurdele: k.kurdele });
    expect(k.uniteler[0].konular).toHaveLength(2);
  });

  it('back: at its old place with its status and ribbons; the book ribbon back while nothing took its place', () => {
    const { json, cikan } = jsondanCikar(kitap(), { tur: 'konu', konu: K1 });
    const g = jsonaGeriKoy(json, cikan!);
    expect(g.degisti).toBe(true);
    expect(g.json).toEqual(kitap());
    // another ribbon meanwhile: it stays
    const g2 = jsonaGeriKoy({ ...json, kurdele: { konu: K2, sayfa: 1 } }, cikan!);
    expect(g2.json.kurdele).toEqual({ konu: K2, sayfa: 1 });
    // there already (a retry) → no change
    expect(jsonaGeriKoy(g.json, cikan!).degisti).toBe(false);
  });

  it('back after the one that stood before it, also when other topics moved meanwhile', () => {
    const { json, cikan } = jsondanCikar(kitap(), { tur: 'konu', konu: K2 });
    expect(cikan).toMatchObject({ onceki: K1, sira: 1 });
    const u = (json.uniteler as typeof KITAP.uniteler)[0];
    (u.konular as unknown[]).unshift({ baslik: 'Neu', klasor: 'Unite-01-Logik/Konu-09-Neu', durum: 'okunmadi' });
    const g = jsonaGeriKoy(json, cikan!);
    expect((g.json.uniteler as typeof KITAP.uniteler)[0].konular.map(t => t.baslik)).toEqual(['Neu', 'Aussagen', 'Beweisen']);
  });

  it('a ribbon on another topic is not touched; not there (a retry) → no change', () => {
    const k = { ...kitap(), kurdele: { konu: K2, sayfa: 2 } };
    expect(jsondanCikar(k, { tur: 'konu', konu: K1 }).json.kurdele).toEqual({ konu: K2, sayfa: 2 });
    expect(jsondanCikar(k, { tur: 'konu', konu: 'Unite-01-Logik/Konu-07-Yok' })).toMatchObject({ degisti: false, cikan: null });
  });

  it('the last topic of a unit without its own klasor: the folder is written as klasor (stays known)', () => {
    const k = { surum: 2, uniteler: [{ baslik: 'A', konular: [{ baslik: 'x', klasor: 'Unite-01-A/Konu-01-x', durum: 'okunmadi' }] }] };
    const { json, cikan } = jsondanCikar(k, { tur: 'konu', konu: 'Unite-01-A/Konu-01-x' });
    expect(json.uniteler).toEqual([{ baslik: 'A', klasor: 'Unite-01-A', konular: [] }]);
    expect(jsonaGeriKoy(json, cikan!).json.uniteler).toEqual([{ baslik: 'A', klasor: 'Unite-01-A', konular: k.uniteler[0].konular }]);
  });

  it('the unit gone meanwhile → IcindekilerUyusmuyor; an odd list is not written over', () => {
    const { json, cikan } = jsondanCikar(kitap(), { tur: 'konu', konu: K1 });
    expect(() => jsonaGeriKoy({ ...json, uniteler: [] }, cikan!)).toThrow(IcindekilerUyusmuyor);
    expect(() => jsondanCikar({ surum: 2, uniteler: [1] }, { tur: 'konu', konu: K1 })).toThrow(IcindekilerUyusmuyor);
  });
});

describe('jsondanCikar / jsonaGeriKoy: a unit', () => {
  it('the unit with its topics; the ribbon inside it → null; back at its place', () => {
    const r = jsondanCikar(kitap(), { tur: 'unite', klasor: 'Unite-01-Logik' });
    expect(r.json.uniteler).toEqual([KITAP.uniteler[1]]);
    expect(r.json.kurdele).toBeNull();
    expect(r.cikan).toMatchObject({ tur: 'unite', onceki: null, sira: 0 });
    expect(jsonaGeriKoy(r.json, r.cikan!).json).toEqual(kitap());
  });

  it('gidenKonular: a unit takes its topics along', () => {
    expect(gidenKonular(KITAP.uniteler, { tur: 'unite', klasor: 'Unite-01-Logik' })).toEqual([K1, K2]);
    expect(gidenKonular(KITAP.uniteler, { tur: 'konu', konu: K2 })).toEqual([K2]);
  });
});

describe('the book in memory', () => {
  const topic = (baslik: string, klasor: string): Topic => ({ baslik, klasor, durum: 'okundu', kurdeleler: { ozet: { dosya: 'o.pdf', sayfa: 2 } }, extra: {} });
  const book = (): Book => ({
    id: 'b', hasJson: true, surum: 2, baslik: 'B', sirt: '', kod: '', ders: '', kapak: { renk: '#000', stil: 'kumas', extra: {} },
    sonAcilis: null, kurdele: { konu: K1, materyal: 'ozet', dosya: 'o.pdf', sayfa: 2 }, bolumler: [], extra: {},
    uniteler: [{ baslik: 'Logik', klasor: 'Unite-01-Logik', konular: [topic('A', K1), topic('B', K2)], extra: {} } as Unit]
  });
  it('the same Topic object goes and comes back; the ribbon too', () => {
    const b = book();
    const t = b.uniteler[0].konular[0];
    const c = kitaptanCikar(b, { tur: 'konu', konu: K1 })!;
    expect(b.uniteler[0].konular.map(x => x.baslik)).toEqual(['B']);
    expect(b.kurdele).toBeNull();
    expect(kitabaGeriKoy(b, c)).toBe(true);
    expect(b.uniteler[0].konular[0]).toBe(t);
    expect(b.kurdele).toMatchObject({ konu: K1 });
  });
});

describe('komsuKonu', () => {
  const u = (klasor: string, ...k: string[]) => ({ baslik: klasor, klasor, konular: k.map(x => ({ baslik: x, klasor: `${klasor}/${x}` })) });
  const L = [u('U1', 'a', 'b', 'c'), u('U2'), u('U3', 'd')];
  it('the next in its unit, else the one before, else a later unit, else an earlier one; none → null', () => {
    expect(komsuKonu(L, 'U1/b', new Set(['U1/b']))).toBe('U1/c');
    expect(komsuKonu(L, 'U1/c', new Set(['U1/c']))).toBe('U1/b');
    expect(komsuKonu(L, 'U1/a', new Set(['U1/a', 'U1/b', 'U1/c']))).toBe('U3/d');
    expect(komsuKonu(L, 'U3/d', new Set(['U3/d']))).toBe('U1/c');
    expect(komsuKonu([u('U1', 'a')], 'U1/a', new Set(['U1/a']))).toBeNull();
  });
});

describe('raftanCikar / rafaGeriKoy', () => {
  const lib = { surum: 1, raflar: [{ id: 'r1', kitaplar: ['a', 'x', 'b'], renk: 1 }, { id: 'r2', kitaplar: ['x'] }], oda: { mod: 'auto' } };
  it('every entry goes, the places are kept; other fields stay; not there → no change', () => {
    const r = raftanCikar(lib, 'x');
    expect(r).toEqual({ degisti: true, yerler: [{ rafId: 'r1', sira: 1 }, { rafId: 'r2', sira: 0 }], json: { surum: 1, raflar: [{ id: 'r1', kitaplar: ['a', 'b'], renk: 1 }, { id: 'r2', kitaplar: [] }], oda: { mod: 'auto' } } });
    expect(raftanCikar(r.json, 'x')).toMatchObject({ degisti: false, yerler: [] });
  });
  it('back on its old shelf at its old place; the shelf gone → the end of the first; on a shelf already → no change', () => {
    expect(rafaGeriKoy(raftanCikar(lib, 'x').json, [{ rafId: 'r1', sira: 1 }], 'x').json).toEqual({ ...lib, raflar: [lib.raflar[0], { id: 'r2', kitaplar: [] }] });
    expect(rafaGeriKoy({ raflar: [{ id: 'r9', kitaplar: ['q'] }] }, [{ rafId: 'r1', sira: 0 }], 'x').json).toEqual({ raflar: [{ id: 'r9', kitaplar: ['q', 'x'] }] });
    expect(rafaGeriKoy(lib, [{ rafId: 'r1', sira: 0 }], 'x').degisti).toBe(false);
    expect(rafaGeriKoy({ raflar: [] }, [{ rafId: 'r1', sira: 0 }], 'x').degisti).toBe(false);
  });
});

describe('bekleyenSay', () => {
  it('pen records of files inside + photo records of folders inside', () => {
    expect(bekleyenSay({ kalemIdleri: ['f1', 'z'], fotoKonulari: ['t1', 't1', 'q'], dosyaIdleri: new Set(['f1', 'f2']), klasorIdleri: new Set(['t1']) })).toBe(3);
    expect(bekleyenSay({ kalemIdleri: [], fotoKonulari: [], dosyaIdleri: new Set(), klasorIdleri: new Set() })).toBe(0);
  });
});

describe('adEsitMi (the book\'s name typed)', () => {
  it('no spaces around, any case; İ/I/ı/i are one letter (Turkish or English keyboard)', () => {
    expect(adEsitMi('istatistik', 'İstatistik')).toBe(true);
    expect(adEsitMi('ISTATISTIK', 'İstatistik')).toBe(true);
    expect(adEsitMi('ılık', 'ILIK')).toBe(true);
    expect(adEsitMi('informatik', 'Informatik')).toBe(true);
    expect(adEsitMi('  Mathe 1 ', 'mathe 1')).toBe(true);
    expect(adEsitMi('Çözüm Ğ', 'çözüm ğ')).toBe(true);
    expect(adEsitMi('Mathe 2', 'Mathe 1')).toBe(false);
    expect(adEsitMi('Mathe', 'Mathe 1')).toBe(false);
    expect(adEsitMi('   ', '')).toBe(false);
    expect(adEsitMi('', 'X')).toBe(false);
  });
});
