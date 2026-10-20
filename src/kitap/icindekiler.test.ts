import { describe, expect, it } from 'vitest';
import { parseBook } from '../model/parse';
import { icindekilerUygula, IcindekilerUyusmuyor, kitabaUygula, kitabiEsitle, kitapUniteAnahtarlari, uniteAnahtarlari, uniteKlasoru, uniteKlasoruBul } from './icindekiler';

const dosya = () => ({
  surum: 2, baslik: 'Mathe', kapak: { renk: '#123', stil: 'deri', parlak: true }, sonAcilis: '2026-10-01',
  kurdele: { konu: 'Unite-01-Logik/Konu-02-Beweisen', materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 4, ek: 1 },
  bilinmeyen: { a: 1 },
  uniteler: [
    { baslik: 'Logik', not: 'x', konular: [
      { baslik: 'Aussagen', klasor: 'Unite-01-Logik/Konu-01-Aussagen', durum: 'okundu', kurdeleler: { ozet: { dosya: 'ozet.pdf', sayfa: 3 } }, renk: 'mavi' },
      { baslik: 'Beweisen', klasor: 'Unite-01-Logik/Konu-02-Beweisen', durum: 'okunuyor' }
    ] },
    { baslik: 'Mengen', klasor: 'Unite-02-Mengen', konular: [] },
    { baslik: 'Leer', konular: [] }
  ]
});

describe('unit keys', () => {
  it('folder: its own klasor, else the one folder of its topics; else the title (+ which one)', () => {
    expect(uniteKlasoru(' Unite-02-X ', [])).toBe('Unite-02-X');
    expect(uniteKlasoru(undefined, ['Unite-01-A/Konu-01-B', 'Unite-01-A/Konu-02-C', ''])).toBe('Unite-01-A');
    expect(uniteKlasoru(undefined, ['Unite-01-A/Konu-01-B', 'Unite-09-Z/Konu-02-C'])).toBe('');
    expect(uniteKlasoru(undefined, ['Konu-01-B'])).toBe('');
    expect(uniteAnahtarlari([
      { baslik: 'A', konular: [] }, { baslik: 'A', konular: [] }, { baslik: 'B', klasor: 'Unite-03-B', konular: [] }
    ])).toEqual(['b:A#0', 'b:A#1', 'k:Unite-03-B']);
    expect(uniteAnahtarlari(dosya().uniteler)).toEqual(['k:Unite-01-Logik', 'k:Unite-02-Mengen', 'b:Leer#0']);
  });
});

describe('icindekilerUygula', () => {
  it('a new unit: at the end with its folder; everything else stays; the input is not changed', () => {
    const d = dosya(), once = JSON.stringify(d);
    const { json, degisti } = icindekilerUygula(d, { tur: 'uniteEkle', baslik: 'Graphen', klasor: 'Unite-04-Graphen' });
    expect(degisti).toBe(true);
    expect(JSON.stringify(d)).toBe(once);
    const u = json.uniteler as Record<string, unknown>[];
    expect(u.at(-1)).toEqual({ baslik: 'Graphen', klasor: 'Unite-04-Graphen', konular: [] });
    const { uniteler: _a, ...rest } = json, { uniteler: _b, ...eski } = d;
    expect(rest).toEqual(eski);
    expect(u.slice(0, 3)).toEqual(d.uniteler);
    // a retry: there already, no second one
    expect(icindekilerUygula(json, { tur: 'uniteEkle', baslik: 'Graphen', klasor: 'Unite-04-Graphen' }).degisti).toBe(false);
  });

  it('a new topic: in its unit, okunmadi; the unit gets its folder when it had none', () => {
    const { json } = icindekilerUygula(dosya(), { tur: 'konuEkle', unite: 'b:Leer#0', uniteKlasor: 'Unite-03-Leer', baslik: 'Neu', klasor: 'Unite-03-Leer/Konu-03-Neu' });
    const leer = (json.uniteler as { klasor?: string; konular: unknown[] }[])[2];
    expect(leer.klasor).toBe('Unite-03-Leer');
    expect(leer.konular).toEqual([{ baslik: 'Neu', klasor: 'Unite-03-Leer/Konu-03-Neu', durum: 'okunmadi' }]);
    // the retry finds the unit by its folder now (its key changed) and the topic by its folder
    const tekrar = icindekilerUygula(json, { tur: 'konuEkle', unite: 'b:Leer#0', uniteKlasor: 'Unite-03-Leer', baslik: 'Neu', klasor: 'Unite-03-Leer/Konu-03-Neu' });
    expect(tekrar.degisti).toBe(false);
  });

  it('names: only baslik changes; statuses, ribbons and unknown fields stay', () => {
    let { json } = icindekilerUygula(dosya(), { tur: 'konuAdi', konu: 'Unite-01-Logik/Konu-01-Aussagen', baslik: 'Aussagenlogik' });
    ({ json } = icindekilerUygula(json, { tur: 'uniteAdi', unite: 'k:Unite-01-Logik', baslik: 'Logik & Beweise' }));
    const u = (json.uniteler as Record<string, unknown>[])[0];
    expect(u).toEqual({ ...dosya().uniteler[0], baslik: 'Logik & Beweise', konular: [
      { ...dosya().uniteler[0].konular[0], baslik: 'Aussagenlogik' }, dosya().uniteler[0].konular[1]
    ] });
    expect(json.kurdele).toEqual(dosya().kurdele);
    expect(json.kapak).toEqual(dosya().kapak);
  });

  it('order: by keys; one added meanwhile by another device stays at the end; an unknown key is skipped', () => {
    const d = dosya();
    d.uniteler.push({ baslik: 'Neu (iPad)', klasor: 'Unite-05-Neu', konular: [] });
    const { json, degisti } = icindekilerUygula(d, { tur: 'uniteSirasi', sira: ['b:Leer#0', 'k:Unite-01-Logik', 'k:yok', 'k:Unite-02-Mengen'] });
    expect(degisti).toBe(true);
    expect((json.uniteler as { baslik: string }[]).map(u => u.baslik)).toEqual(['Leer', 'Logik', 'Mengen', 'Neu (iPad)']);
    const k = icindekilerUygula(dosya(), { tur: 'konuSirasi', unite: 'k:Unite-01-Logik', sira: ['Unite-01-Logik/Konu-02-Beweisen', 'Unite-01-Logik/Konu-01-Aussagen'] });
    const konular = (k.json.uniteler as { konular: { baslik: string; kurdeleler?: unknown }[] }[])[0].konular;
    expect(konular.map(t => t.baslik)).toEqual(['Beweisen', 'Aussagen']);
    expect(konular[1].kurdeleler).toEqual({ ozet: { dosya: 'ozet.pdf', sayfa: 3 } });
    // the same order: nothing to write
    expect(icindekilerUygula(dosya(), { tur: 'uniteSirasi', sira: ['k:Unite-01-Logik', 'k:Unite-02-Mengen', 'b:Leer#0'] }).degisti).toBe(false);
  });

  it('found by key in a file another device reordered', () => {
    const d = dosya();
    d.uniteler.reverse();
    const { json } = icindekilerUygula(d, { tur: 'uniteAdi', unite: 'k:Unite-02-Mengen', baslik: 'Mengenlehre' });
    expect((json.uniteler as { baslik: string }[]).map(u => u.baslik)).toEqual(['Leer', 'Mengenlehre', 'Logik']);
  });

  it('does not fit (gone, odd list) → IcindekilerUyusmuyor', () => {
    expect(() => icindekilerUygula(dosya(), { tur: 'konuAdi', konu: 'Unite-09/Konu-99', baslik: 'x' })).toThrow(IcindekilerUyusmuyor);
    expect(() => icindekilerUygula(dosya(), { tur: 'uniteAdi', unite: 'k:Unite-09', baslik: 'x' })).toThrow(IcindekilerUyusmuyor);
    expect(() => icindekilerUygula({ surum: 2, uniteler: [{ baslik: 'A', konular: 'x' }] }, { tur: 'uniteEkle', baslik: 'B', klasor: 'Unite-02-B' })).toThrow(IcindekilerUyusmuyor);
    expect(() => icindekilerUygula({ surum: 2, uniteler: ['x'] }, { tur: 'uniteEkle', baslik: 'B', klasor: 'Unite-02-B' })).toThrow(IcindekilerUyusmuyor);
  });
});

describe('kitabaUygula (the book in memory)', () => {
  it('the same objects move / are renamed (the reader keeps its topic)', () => {
    const b = parseBook('mathe', dosya());
    const aussagen = b.uniteler[0].konular[0], mengen = b.uniteler[1];
    expect(mengen.klasor).toBe('Unite-02-Mengen');
    kitabaUygula(b, { tur: 'uniteSirasi', sira: ['k:Unite-02-Mengen', 'k:Unite-01-Logik'] });
    expect(b.uniteler[0]).toBe(mengen);
    kitabaUygula(b, { tur: 'konuSirasi', unite: 'k:Unite-01-Logik', sira: ['Unite-01-Logik/Konu-02-Beweisen'] });
    expect(b.uniteler[1].konular[1]).toBe(aussagen);
    kitabaUygula(b, { tur: 'konuAdi', konu: 'Unite-01-Logik/Konu-01-Aussagen', baslik: 'Aussagenlogik' });
    expect(aussagen.baslik).toBe('Aussagenlogik');
    expect(aussagen.kurdeleler).toEqual({ ozet: { dosya: 'ozet.pdf', sayfa: 3 } });
    expect(aussagen.extra).toEqual({ renk: 'mavi' });
    kitabaUygula(b, { tur: 'konuEkle', unite: 'b:Leer#0', uniteKlasor: 'Unite-03-Leer', baslik: 'Neu', klasor: 'Unite-03-Leer/Konu-03-Neu' });
    expect(b.uniteler[2]).toMatchObject({ klasor: 'Unite-03-Leer', konular: [{ baslik: 'Neu', klasor: 'Unite-03-Leer/Konu-03-Neu', durum: 'okunmadi', kurdeleler: {} }] });
    expect(kitapUniteAnahtarlari(b)).toEqual(['k:Unite-02-Mengen', 'k:Unite-01-Logik', 'k:Unite-03-Leer']);
  });
});

describe('uniteKlasoruBul (an old empty unit)', () => {
  const uniteler = [
    { baslik: 'Logik', konular: [{ klasor: 'Unite-01-Logik/Konu-01-A' }] },
    { baslik: 'Leer', konular: [] }
  ];
  const f = (name: string, defter = true, id = name) => ({ id, name, appProperties: (defter ? { defter: '1' } : {}) as Record<string, string> });

  it('the one folder of ours named klasorAdi(unite, place, title), not used by another unit', () => {
    expect(uniteKlasoruBul(uniteler, 1, [f('Unite-01-Logik'), f('Unite-02-Leer'), f('Unite-03-X')])).toBe('Unite-02-Leer');
    expect(uniteKlasoruBul(uniteler, 0, [])).toBe('Unite-01-Logik');   // known from its topics
  });

  it('none, not ours, used by another unit, or two → null', () => {
    expect(uniteKlasoruBul(uniteler, 1, [f('Unite-03-Leer')])).toBeNull();
    expect(uniteKlasoruBul(uniteler, 1, [f('Unite-02-Leer', false)])).toBeNull();
    expect(uniteKlasoruBul(uniteler, 1, [f('Unite-02-Leer', true, 'a'), f('Unite-02-Leer', true, 'b')])).toBeNull();
    const kullanan = [{ baslik: 'Logik', konular: [{ klasor: 'Unite-02-Leer/Konu-01-A' }, { klasor: 'Unite-01-Logik/Konu-02-B' }] }, { baslik: 'Leer', konular: [] }];
    expect(uniteKlasoruBul(kullanan, 1, [f('Unite-02-Leer')])).toBeNull();
  });
});

describe('kitabiEsitle (6.K5a-2, Vazgeç)', () => {
  it('names and order from Drive by key; statuses and ribbons stay as in memory', () => {
    const b = parseBook('mathe', dosya());
    b.uniteler[0].konular[0].durum = 'calisildi';   // a newer status in memory (not written yet)
    const drive = dosya();
    drive.uniteler[0].baslik = 'Logik (Drive)';
    drive.uniteler[0].konular.reverse();
    drive.uniteler[0].konular[1].baslik = 'Aussagen (Drive)';
    drive.uniteler.reverse();   // Leer, Mengen, Logik
    drive.uniteler[0].baslik = 'Leer (Drive)';   // no folder: found by its place
    // the order changed too, so the folderless unit is not at its old place any more: it stays as it is
    expect(kitabiEsitle(b, drive)).toBe(true);
    expect(b.uniteler.map(u => u.baslik)).toEqual(['Mengen', 'Logik (Drive)', 'Leer']);
    expect(b.uniteler[1].konular.map(t => t.baslik)).toEqual(['Beweisen', 'Aussagen (Drive)']);
    expect(b.uniteler[1].konular[1].durum).toBe('calisildi');
    expect(b.uniteler[1].konular[1].kurdeleler).toEqual({ ozet: { dosya: 'ozet.pdf', sayfa: 3 } });
  });

  it('a unit without a folder at the same place takes its name; the same file: nothing changes', () => {
    const b = parseBook('mathe', dosya());
    expect(kitabiEsitle(b, dosya())).toBe(false);
    const drive = dosya();
    drive.uniteler[2].baslik = 'Leer 2';
    expect(kitabiEsitle(b, drive)).toBe(true);
    expect(b.uniteler[2].baslik).toBe('Leer 2');
  });

  it('only in Drive: not added; only in memory: kept at the end; not a file: nothing', () => {
    const b = parseBook('mathe', dosya());
    const drive = dosya();
    drive.uniteler.splice(1, 1);   // Mengen gone in Drive
    drive.uniteler.unshift({ baslik: 'Neu', klasor: 'Unite-09-Neu', konular: [] } as never);
    (drive.uniteler[1].konular as unknown[]).push({ baslik: 'Fremd', klasor: 'Unite-01-Logik/Konu-09-Fremd', durum: 'okunmadi' });
    kitabiEsitle(b, drive);
    expect(b.uniteler.map(u => u.baslik)).toEqual(['Logik', 'Leer', 'Mengen']);
    expect(b.uniteler[0].konular.map(t => t.baslik)).toEqual(['Aussagen', 'Beweisen']);
    expect(kitabiEsitle(b, null)).toBe(false);
    expect(kitabiEsitle(b, { uniteler: 'x' })).toBe(false);
  });
});
