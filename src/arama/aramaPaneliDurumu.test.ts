import { describe, expect, it } from 'vitest';
import { parseBook } from '../model/parse';
import {
  adlarGeldi, bosPanel, durumMetni, gidisPlani, gosterimSirasi, gruplar, hataGeldi, konuKonumu, metinBasladi, metinGeldi,
  satirBilgisi, secimAdim, SEKMEDE_YOK, tekrarSorgu, vurguAraligi, yeniSorgu, type PanelDurumu,
} from './aramaPaneliDurumu';
import type { KitaplikSonucu } from './kitaplikAra';

// Task 6.3e: the library search panel without DOM.

const r = (o: Partial<KitaplikSonucu> & Pick<KitaplikSonucu, 'eslesme'>): KitaplikSonucu => ({
  ad: 'x', kitapId: 'mathe', kitapBaslik: 'Mathe 1', materyal: null, cozumMu: false, konuDisi: false, ...o,
});
const kitap = r({ eslesme: 'kitap', ad: 'Mathe 1' });
const konu = r({ eslesme: 'konu', ad: 'Beweisen', uniteBaslik: 'Logik', konuBaslik: 'Beweisen', konuSira: 1 });
const ad = r({ eslesme: 'ad', dosyaId: 'u', ad: 'Uebung_Beweis.pdf', konuBaslik: 'Aussagenlogik', konuSira: 0, materyal: 'uebungen' });
const cozum = r({ eslesme: 'ad', dosyaId: 'uc', ad: 'Uebung_Beweis_cozum.pdf', konuBaslik: 'Aussagenlogik', konuSira: 0, materyal: 'uebungen', cozumMu: true });
const disi = r({ eslesme: 'ad', dosyaId: 'd', ad: 'Beweis-Tipps.pdf', konuDisi: true });
const ikisi = r({ eslesme: 'ikisi', dosyaId: 'i', ad: 'beweis.pdf', konuSira: 0, materyal: 'ozet' });
const metin = r({ eslesme: 'metin', dosyaId: 'm', ad: 'ozet.pdf', konuBaslik: 'Aussagenlogik', konuSira: 0, materyal: 'ozet' });
const metinDisi = r({ eslesme: 'metin', dosyaId: 'md', ad: 'notlar.pdf', konuDisi: true });

const yaz = (d: PanelDurumu, q: string, agacHazir = true) => yeniSorgu(d, q, agacHazir);

describe('query and answers', () => {
  it('empty / one letter / building the tree / names', () => {
    const d = bosPanel(false);
    expect(yaz(d, '').asama).toBe('bos');
    expect(yaz(d, 'b').asama).toBe('kisa');
    expect(durumMetni(yaz(d, 'b'))?.metin).toBe('En az 2 harf yaz.');
    expect(yaz(d, 'be', false).asama).toBe('agac');
    expect(durumMetni(yaz(d, 'be', false))?.metin).toBe('Kitaplık taranıyor…');
    expect(yaz(d, 'be').asama).toBe('ad');
  });

  it('an old answer (cancelled or late) is dropped', () => {
    let d = yaz(bosPanel(false), 'bew');
    const eski = d.istek;
    d = yaz(d, 'bewe');
    expect(adlarGeldi(d, eski, [ad])).toBe(d);
    expect(metinGeldi(d, eski, { sonuclar: [metin], eksik: false })).toBe(d);
    expect(hataGeldi(d, eski, 'x')).toBe(d);
    expect(metinBasladi(d, eski)).toBe(d);
    d = adlarGeldi(d, d.istek, [ad]);
    expect(d.sonuclar).toEqual([ad]);
  });

  it('names → text: "Metinde aranıyor…", then all results; the names arriving after the text change nothing', () => {
    let d = yaz(bosPanel(false), 'beweis');
    const n = d.istek;
    d = adlarGeldi(d, n, [ad]);
    expect(durumMetni(d)).toBeNull();
    d = metinBasladi(d, n);
    expect(durumMetni(d)?.metin).toBe('Metinde aranıyor…');
    d = metinGeldi(d, n, { sonuclar: [ad, metin], eksik: true });
    expect(d.asama).toBe('bitti');
    expect(durumMetni(d)?.metin).toBe('Daha çok sonuç var, aramayı daralt');
    expect(adlarGeldi(d, n, [])).toBe(d);
  });

  it('Enter before the names: the names come while Drive searches, the status stays', () => {
    let d = yaz(bosPanel(false), 'beweis');
    d = metinBasladi(d, d.istek);
    d = adlarGeldi(d, d.istek, [ad]);
    expect(d.asama).toBe('metin');
    expect(d.sonuclar).toEqual([ad]);
  });

  it('typing keeps the old results until the new names come; a short query clears them', () => {
    let d = adlarGeldi(yaz(bosPanel(false), 'bew'), 1, [ad]);
    d = yaz(d, 'bewe');
    expect(d.sonuclar).toEqual([ad]);
    expect(yaz(d, 'b').sonuclar).toEqual([]);
  });

  it('no results / sample library / errors', () => {
    const n = (d: PanelDurumu) => d.istek;
    let d = yaz(bosPanel(false), 'zzz');
    d = metinGeldi(d, n(d), { sonuclar: [], eksik: false });
    expect(durumMetni(d)).toEqual({ metin: 'Sonuç yok', hata: false, tekrar: false });

    let o = yaz(bosPanel(true), 'zzz');
    o = adlarGeldi(o, n(o), []);
    expect(o.asama).toBe('bitti');
    expect(durumMetni(o)?.metin).toBe('Sonuç yok · Örnek kitaplıkta metin araması yok');
    expect(metinBasladi(o, n(o))).toBe(o);   // never a text search

    let t = yaz(bosPanel(false), 'beweis');
    t = metinGeldi(t, n(t), { sonuclar: [ad], eksik: false, driveHata: "Drive'a bağlanılamadı." });
    expect(durumMetni(t)).toEqual({ metin: "Drive'a bağlanılamadı.", hata: true, tekrar: true });
    expect(t.sonuclar).toEqual([ad]);

    let h = yaz(bosPanel(false), 'beweis', false);
    h = hataGeldi(h, n(h), 'Kitaplık okunamadı.');
    expect(durumMetni(h)).toEqual({ metin: 'Kitaplık okunamadı.', hata: true, tekrar: true });
    const tekrar = tekrarSorgu(h, false);
    expect(tekrar).toMatchObject({ q: 'beweis', asama: 'agac', istek: h.istek + 1, hata: null });
  });
});

describe('groups and choosing', () => {
  it('groups in order; ikisi with the names; files in no topic last in their group', () => {
    const l = gosterimSirasi([metinDisi, metin, disi, ad, ikisi, konu, kitap, cozum]);
    expect(l).toEqual([kitap, konu, ad, ikisi, cozum, disi, metin, metinDisi]);
    expect(gruplar(l).map(g => `${g.baslik}:${g.ogeler.map(o => o.i).join(',')}`))
      .toEqual(['Kitaplar:0', 'Konular:1', 'Dosya adında:2,3,4,5', 'Dosyanın metninde:6,7']);
  });

  it('↑/↓ skip files in no topic and stop at the ends', () => {
    let d: PanelDurumu = { ...bosPanel(false), sonuclar: [ad, disi, metin, metinDisi] };
    expect(secimAdim(d, -1).secili).toBe(2);   // nothing chosen: ↑ the last one that can be opened
    d = secimAdim(d, 1);
    expect(d.secili).toBe(0);
    d = secimAdim(d, 1);
    expect(d.secili).toBe(2);
    expect(secimAdim(d, 1).secili).toBe(2);
    expect(secimAdim(secimAdim(d, -1), -1).secili).toBe(0);
  });

  it('the chosen row stays chosen when the text results come', () => {
    let d = adlarGeldi(yaz(bosPanel(false), 'beweis'), 1, [ad, cozum]);
    d = secimAdim(secimAdim(d, 1), 1);
    expect(d.sonuclar[d.secili]).toBe(cozum);
    d = metinGeldi(d, d.istek, { sonuclar: [konu, ad, cozum, metin], eksik: false });
    expect(d.sonuclar[d.secili]).toBe(cozum);
  });
});

describe('a row', () => {
  it('path, name without .pdf, badges', () => {
    expect(satirBilgisi(cozum)).toEqual({ yol: 'Mathe 1 › Aussagenlogik', ad: 'Uebung_Beweis_cozum', rozetler: ['Ad', 'Übungen', 'Çözüm'] });
    expect(satirBilgisi(metin).rozetler).toEqual(['Metin', 'Özet']);
    expect(satirBilgisi(ikisi).rozetler).toEqual(['Ad + Metin', 'Özet']);
    expect(satirBilgisi(disi)).toMatchObject({ yol: 'Mathe 1', rozetler: ['Ad', 'konu dışı'] });
    expect(satirBilgisi(konu)).toEqual({ yol: 'Mathe 1 › Logik', ad: 'Beweisen', rozetler: ['Konu'] });
    expect(satirBilgisi(kitap)).toEqual({ yol: '', ad: 'Mathe 1', rozetler: ['Kitap'] });
  });

  it('the matching part of the name, with the search form (ä = ae, ı = i, case)', () => {
    expect(vurguAraligi('Uebung_Beweis', 'beweis')).toEqual([7, 13]);
    expect(vurguAraligi('Fehleranfällig', 'fehleranfaellig')).toEqual([0, 14]);
    expect(vurguAraligi('Fehleranfällig', 'anfä')).toEqual([6, 10]);
    expect(vurguAraligi('Fehleranfällig', 'anfa')).toEqual([6, 10]);   // "a" of "ä" → the whole ä
    expect(vurguAraligi('Değişkenler', 'DEĞİŞ')).toEqual([0, 5]);
    expect(vurguAraligi('Uebung', 'zz')).toBeNull();
    expect(vurguAraligi('Uebung', 'u')).toBeNull();
  });
});

describe('where a result goes', () => {
  const v2 = parseBook('mathe', {
    surum: 2, baslik: 'Mathe 1',
    uniteler: [
      { baslik: 'Logik', konular: [{ baslik: 'Aussagenlogik', klasor: 'L/A' }, { baslik: 'Beweisen', klasor: 'L/B' }] },
      { baslik: 'Mengen', konular: [{ baslik: 'Mengen', klasor: 'M/M' }] },
    ],
  });
  const v1 = parseBook('alt', { baslik: 'Alt', bolumler: [{ baslik: 'A', kaynaklar: [{ tur: 'pdf', dosya: 'a.pdf' }] }, { baslik: 'B', kaynaklar: [] }] });

  it('topic place → unit and index', () => {
    expect(konuKonumu(v2, 0)).toEqual({ unit: 0, topic: 0 });
    expect(konuKonumu(v2, 2)).toEqual({ unit: 1, topic: 0 });
    expect(konuKonumu(v2, 3)).toBeNull();
    expect(konuKonumu(v1, 1)).toEqual({ unit: 0, topic: 1 });
  });

  it('book, topic, file (name / text), solution', () => {
    expect(gidisPlani(kitap, v2)).toEqual({ tur: 'kitap', kitapId: 'mathe' });
    expect(gidisPlani(konu, v2)).toEqual({ tur: 'okuyucu', kitapId: 'mathe', unit: 0, topic: 1, metinAra: false });
    expect(gidisPlani(cozum, v2)).toEqual({ tur: 'okuyucu', kitapId: 'mathe', unit: 0, topic: 0, dosya: { materyal: 'uebungen', ad: 'Uebung_Beweis_cozum.pdf' }, metinAra: false });
    expect(gidisPlani(metin, v2)).toMatchObject({ dosya: { materyal: 'ozet', ad: 'ozet.pdf' }, metinAra: true });
    expect(gidisPlani(ikisi, v2)).toMatchObject({ metinAra: true });
  });

  it('a file in no topic: nothing; in the topic folder but not a tab: the topic + a note; surum 1: the chapter', () => {
    expect(gidisPlani(disi, v2)).toBeNull();
    const baska = r({ eslesme: 'metin', dosyaId: 'b', ad: 'eski.pdf', konuSira: 1 });
    expect(gidisPlani(baska, v2)).toEqual({ tur: 'okuyucu', kitapId: 'mathe', unit: 0, topic: 1, metinAra: false, uyari: SEKMEDE_YOK });
    expect(gidisPlani({ ...baska, kitapId: 'alt' }, v1)).toEqual({ tur: 'okuyucu', kitapId: 'alt', unit: 0, topic: 1, metinAra: true });
  });
});
