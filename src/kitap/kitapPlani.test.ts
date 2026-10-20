import { describe, expect, it } from 'vitest';
import { bookToJson } from '../model/serialize';
import { parseBook } from '../model/parse';
import { listeAyristir } from './kitapListesi';
import { kitapPlani, planMetni, type KitapGirdisi } from './kitapPlani';

const girdi = (o: Partial<KitapGirdisi> = {}): KitapGirdisi => ({
  kitapAdi: 'Programmieren 1', rafId: 'raf-1', renk: '#24476b', mevcutIdler: ['mathe-1'],
  uniteler: listeAyristir('# Grundlagen\nWerte, Typen, Ausdrücke\nKontrollstrukturen\n# Objekte\nKlassen\n# Leer').uniteler,
  ...o
});

describe('kitapPlani', () => {
  it('order: book folder → unit folders → topic folders → kitap.json → shelf entry', () => {
    const p = kitapPlani(girdi());
    expect(p.kitapId).toBe('programmieren-1');
    expect(p.ogeler).toEqual([
      { tur: 'klasor', yol: 'programmieren-1' },
      { tur: 'klasor', yol: 'programmieren-1/Unite-01-Grundlagen' },
      { tur: 'klasor', yol: 'programmieren-1/Unite-02-Objekte' },
      { tur: 'klasor', yol: 'programmieren-1/Unite-03-Leer' },
      { tur: 'klasor', yol: 'programmieren-1/Unite-01-Grundlagen/Konu-01-Werte-Typen-Ausdruecke' },
      { tur: 'klasor', yol: 'programmieren-1/Unite-01-Grundlagen/Konu-02-Kontrollstrukturen' },
      { tur: 'klasor', yol: 'programmieren-1/Unite-02-Objekte/Konu-03-Klassen' },
      { tur: 'json', yol: 'programmieren-1/kitap.json' },
      { tur: 'rafKaydi', rafId: 'raf-1', kitapId: 'programmieren-1' }
    ]);
    expect(p.engel).toBeNull();
  });

  it('no Uebungen / Oedevler folders', () => {
    expect(kitapPlani(girdi()).ogeler.some(o => o.tur !== 'rafKaydi' && /Uebungen|Oedevler/.test(o.yol))).toBe(false);
  });

  it('kitap.json: surum 2, the sample book\'s fields and order, names as typed', () => {
    const j = kitapPlani(girdi()).kitapJson;
    expect(Object.keys(j)).toEqual(['surum', 'baslik', 'sirt', 'kod', 'ders', 'kapak', 'sonAcilis', 'kurdele', 'uniteler']);
    expect(j).toEqual({
      surum: 2, baslik: 'Programmieren 1', sirt: 'Programmieren 1', kod: '', ders: '',
      kapak: { renk: '#24476b', stil: 'kumas' }, sonAcilis: null, kurdele: null,
      uniteler: [
        { baslik: 'Grundlagen', klasor: 'Unite-01-Grundlagen', konular: [
          { baslik: 'Werte, Typen, Ausdrücke', klasor: 'Unite-01-Grundlagen/Konu-01-Werte-Typen-Ausdruecke', durum: 'okunmadi' },
          { baslik: 'Kontrollstrukturen', klasor: 'Unite-01-Grundlagen/Konu-02-Kontrollstrukturen', durum: 'okunmadi' }
        ] },
        { baslik: 'Objekte', klasor: 'Unite-02-Objekte', konular: [{ baslik: 'Klassen', klasor: 'Unite-02-Objekte/Konu-03-Klassen', durum: 'okunmadi' }] },
        { baslik: 'Leer', klasor: 'Unite-03-Leer', konular: [] }
      ]
    });
  });

  it('the app reads it back unchanged (parseBook → bookToJson)', () => {
    const p = kitapPlani(girdi());
    const b = parseBook(p.kitapId, p.kitapJson);
    expect(b.surum).toBe(2);
    expect(b.kapak.renk).toBe('#24476b');
    expect(b.uniteler[0].konular[0].klasor).toBe('Unite-01-Grundlagen/Konu-01-Werte-Typen-Ausdruecke');
    const { bolumler, ...geri } = bookToJson(b);   // the app adds an empty surum 1 list when it writes
    expect(bolumler).toEqual([]);
    expect(geri).toEqual(p.kitapJson);
  });

  it('every topic folder is a plan item under its unit; the same name twice gets two folders', () => {
    const p = kitapPlani(girdi({ uniteler: [{ ad: 'A', konular: ['Übung', 'Übung'] }] }));
    const klasorler = p.ogeler.filter(o => o.tur === 'klasor').map(o => o.yol);
    expect(klasorler).toContain('programmieren-1/Unite-01-A/Konu-01-Uebung');
    expect(klasorler).toContain('programmieren-1/Unite-01-A/Konu-02-Uebung');
    const json = p.kitapJson as { uniteler: { konular: { klasor: string }[] }[] };
    for (const k of json.uniteler[0].konular) expect(klasorler).toContain(`programmieren-1/${k.klasor}`);
  });

  it('the name: empty, too long, a book with that folder already', () => {
    expect(kitapPlani(girdi({ kitapAdi: '  ' })).engel).toBe('Kitap adı gerekli.');
    expect(kitapPlani(girdi({ kitapAdi: 'x'.repeat(81) })).engel).toMatch(/en fazla 80/);
    expect(kitapPlani(girdi({ kitapAdi: 'Mathe 1' })).engel).toMatch(/zaten var \(klasör: mathe-1\)/);
    expect(kitapPlani(girdi({ kitapAdi: 'Mathe 1', mevcutIdler: ['Mathe-1'] })).engel).toMatch(/zaten var/);
    expect(kitapPlani(girdi({ kitapAdi: '  Mathe 2 ' })).kitapJson.baslik).toBe('Mathe 2');
  });

  it('planMetni: count and one line per item', () => {
    const t = planMetni(kitapPlani(girdi())).split('\n');
    expect(t[0]).toBe('plan: 9 öğe');
    expect(t[1]).toBe('1. klasör: kitaplar/programmieren-1');
    expect(t[8]).toBe('8. dosya: kitaplar/programmieren-1/kitap.json');
    expect(t[9]).toBe('9. raf: programmieren-1 → raf-1 (kitaplik.json)');
  });
});
