import { describe, expect, it } from 'vitest';
import { katmanOku, kitapCevir, kitaplikCevir } from './ornekCeviri';
import { parseBook } from './parse';

// Task 6.5-2a: the sample library's English layer (public/ornek/en.json)

const jsons = import.meta.glob<unknown>('/public/ornek/kitaplar/*/kitap.json', { eager: true, import: 'default' });
const libJson = Object.values(import.meta.glob<unknown>('/public/ornek/kitaplik.json', { eager: true, import: 'default' }))[0];
const enJson = Object.values(import.meta.glob<unknown>('/public/ornek/en.json', { eager: true, import: 'default' }))[0];
const katman = katmanOku(enJson);

const kitap = {
  surum: 2, baslik: 'Lineer Cebir', sirt: 'Lineer Cebir', ders: 'Matematik', bilinmeyen: 1,
  uniteler: [{ baslik: 'Dönüşümler', klasor: 'Unite-02', konular: [{ baslik: 'Determinant', klasor: 'Unite-02/Konu-03', durum: 'okundu' }, { baslik: 'Özdeğerler', klasor: '' }] }]
};

describe('ornekCeviri', () => {
  it('names by order; folders, status and unknown fields stay', () => {
    const k = katmanOku({ kitaplar: { la: { baslik: 'Linear Algebra', dil: 'en', uniteler: [{ baslik: 'Transformations', konular: ['Determinants'] }] } } });
    const c = kitapCevir('la', kitap, k) as typeof kitap & { dil: string };
    expect(c).toMatchObject({ baslik: 'Linear Algebra', sirt: 'Lineer Cebir', ders: 'Matematik', dil: 'en', bilinmeyen: 1 });
    expect(c.uniteler[0]).toMatchObject({ baslik: 'Transformations', klasor: 'Unite-02' });
    expect(c.uniteler[0].konular).toEqual([{ baslik: 'Determinants', klasor: 'Unite-02/Konu-03', durum: 'okundu' }, { baslik: 'Özdeğerler', klasor: '' }]);
    expect(kitap.baslik).toBe('Lineer Cebir');   // not changed in place
  });
  it('a book or shelf the layer lacks stays as it is', () => {
    const k = katmanOku({ raflar: { a: 'AI' } });
    expect(kitapCevir('baska', kitap, k)).toBe(kitap);
    expect(kitaplikCevir({ raflar: [{ id: 'a', ad: 'Yapay Zekâ' }, { id: 'b', ad: 'Dersler' }] }, k)).toEqual({ raflar: [{ id: 'a', ad: 'AI' }, { id: 'b', ad: 'Dersler' }] });
    expect(katmanOku(null)).toEqual({ raflar: {}, kitaplar: {} });
  });
  it('public/ornek/en.json covers every shelf and book name of the sample library', () => {
    const lib = kitaplikCevir(libJson, katman) as { raflar: { ad: string }[] };
    expect(lib.raflar.map(r => r.ad)).toEqual(['AI', 'Courses', 'Java', 'Systems', 'Software']);
    for (const [yol, json] of Object.entries(jsons)) {
      const id = yol.split('/').at(-2)!;
      expect(katman.kitaplar[id], id).toBeDefined();
      const b = parseBook(id, kitapCevir(id, json, katman));
      expect(b.dil, id).toBe('en');
      const adlar = [b.baslik, b.sirt, b.ders, ...b.uniteler.flatMap(u => [u.baslik, ...u.konular.map(t => t.baslik)]), ...b.bolumler.map(c => c.baslik)];
      for (const ad of adlar) expect(ad, `${id}: ${ad}`).not.toMatch(/[çğıöşüÇĞİÖŞÜâ]/);
    }
  });
  it('the sample book of the set-up (programlamaya-giris) in English', () => {
    const json = jsons['/public/ornek/kitaplar/programlamaya-giris/kitap.json'];
    const b = parseBook('programlamaya-giris', kitapCevir('programlamaya-giris', json, katman));
    expect(b.baslik).toBe('Introduction to Programming');
    expect(b.uniteler.map(u => u.konular.map(t => t.klasor))).toEqual(
      parseBook('programlamaya-giris', json).uniteler.map(u => u.konular.map(t => t.klasor)));
  });
});
