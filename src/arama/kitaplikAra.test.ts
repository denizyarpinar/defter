import { describe, expect, it } from 'vitest';
import type { MaterialKind } from '../okuma/konuKesfi';
import { adAnahtari, dosyaAnahtari } from './adEsle';
import type { AgacDosyasi, AgacKitabi, AgacKonusu } from './kitaplikAgaci';
import { birlestir } from './kitaplikAra';

const kitap = (id: string, baslik: string, sira: number): AgacKitabi => ({ id, baslik, sira, anahtar: adAnahtari(baslik) });
const konu = (k: AgacKitabi, baslik: string, sira: number, klasor?: string): AgacKonusu =>
  ({ kitap: k, uniteBaslik: 'Logik', baslik, klasor, sira, anahtar: adAnahtari(baslik) });
const dosya = (id: string, ad: string, k: AgacKitabi, t: AgacKonusu | null, materyal: MaterialKind | null = null, cozumMu = false): AgacDosyasi =>
  ({ id, ad, modifiedTime: '', kitap: k, konu: t, materyal, cozumMu, anahtar: dosyaAnahtari(ad) });

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
