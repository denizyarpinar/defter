import { describe, expect, it } from 'vitest';
import { GENEL, konuEkle, konuTasi, listeAyristir, listeYaz, SINIR, uniteEkle, uniteTasi, yazilmisSatir, type ListeUnite } from './kitapListesi';

const turler = (metin: string) => listeAyristir(metin).uyarilar.map(u => `${u.satir}:${u.tur}${u.engel ? '!' : ''}`);

describe('listeAyristir', () => {
  it('units and topics, Turkish and German letters as typed', () => {
    const r = listeAyristir('# Logik\nAussagenlogik\nPrädikatenlogik\n# Değişkenler\nKoşullar ve döngüler');
    expect(r.uniteler).toEqual([
      { ad: 'Logik', konular: ['Aussagenlogik', 'Prädikatenlogik'] },
      { ad: 'Değişkenler', konular: ['Koşullar ve döngüler'] }
    ]);
    expect(r.uyarilar).toEqual([]);
    expect(r.satirlar).toEqual({ unite: [1, 4], konu: [[2, 3], [5]] });
  });

  it('empty lines and spaces do not count; Windows line ends', () => {
    const r = listeAyristir('\r\n  # A  \r\n\r\n   x  \r\n\n\ny\n   \n');
    expect(r.uniteler).toEqual([{ ad: 'A', konular: ['x', 'y'] }]);
    expect(r.satirlar.konu).toEqual([[4, 7]]);
  });

  it('list prefixes go, only once; a unit keeps its "1."', () => {
    const r = listeAyristir('# 1. Woche\n- a\n* b\n• c\n1. d\n12) e\n- - f\n1.5 Grenzwerte\n-g\n- \n3.');
    expect(r.uniteler).toEqual([{ ad: '1. Woche', konular: ['a', 'b', 'c', 'd', 'e', '- f', '1.5 Grenzwerte', '-g'] }]);
  });

  it('"##" is a unit too; "#" alone gets a name', () => {
    expect(listeAyristir('## A\nx\n#\ny').uniteler).toEqual([{ ad: 'A', konular: ['x'] }, { ad: 'Ünite 2', konular: ['y'] }]);
  });

  it('topics before the first "#" → "Genel" + a warning', () => {
    const r = listeAyristir('\nerste\nzweite\n# B\nc');
    expect(r.uniteler).toEqual([{ ad: GENEL, konular: ['erste', 'zweite'] }, { ad: 'B', konular: ['c'] }]);
    expect(r.satirlar.unite).toEqual([2, 4]);
    expect(turler('\nerste\nzweite\n# B\nc')).toEqual(['2:genel']);
  });

  it('no unit → bosListe (closes Oluştur)', () => {
    expect(turler('')).toEqual(['0:bosListe!']);
    expect(turler('\n  \n- \n')).toEqual(['0:bosListe!']);
  });

  it('a unit without topics and the same topic twice: warnings only', () => {
    expect(turler('# A\n# B\nx\nX\ny\n# C\nx')).toEqual(['1:konusuzUnite', '4:ayniKonu']);
    expect(turler('# A\nIşık\nışık')).toEqual(['3:ayniKonu']);
  });

  it('names longer than 80 characters close Oluştur', () => {
    const uzun = 'a'.repeat(SINIR.ad + 1);
    expect(turler(`# ${uzun}\n${'b'.repeat(SINIR.ad)}\n- ${uzun}`)).toEqual(['1:uzunAd!', '3:uzunAd!']);
    expect(turler(`# ${'ü'.repeat(SINIR.ad)}\nx`)).toEqual([]);   // characters, not bytes
  });

  it('31 units / 51 topics: one warning at the first one over', () => {
    const uniteler = Array.from({ length: SINIR.unite + 2 }, (_, i) => `# U${i}\nx`).join('\n');
    expect(turler(uniteler)).toEqual([`${2 * SINIR.unite + 1}:cokUnite!`]);
    const konular = '# A\n' + Array.from({ length: SINIR.konu + 2 }, (_, i) => `k${i}`).join('\n');
    expect(turler(konular)).toEqual([`${SINIR.konu + 2}:cokKonu!`]);
    expect(turler('# A\n' + Array.from({ length: SINIR.konu }, (_, i) => `k${i}`).join('\n'))).toEqual([]);
  });
});

describe('listeYaz', () => {
  const agac: ListeUnite[] = [
    { ad: 'Logik', konular: ['Aussagenlogik', '- tirelı', '1. sayılı', '#etiket'] },
    { ad: '#1 Woche', konular: [] },
    { ad: 'Größen ve Işık', konular: ['Maße'] }
  ];
  it('writes "# unit" and "- topic"', () => {
    expect(listeYaz([{ ad: 'A', konular: ['x', 'y'] }, { ad: 'B', konular: [] }])).toBe('# A\n- x\n- y\n\n# B');
  });
  it('round trip: ayristir(yaz(x)) = x', () => {
    expect(listeAyristir(listeYaz(agac)).uniteler).toEqual(agac);
    const r = listeAyristir('a\n# B\n- c\n\n\n1) d');
    expect(listeAyristir(listeYaz(r.uniteler)).uniteler).toEqual(r.uniteler);
  });
  it('yazilmisSatir finds the written lines', () => {
    const satirlar = listeYaz(agac).split('\n');
    expect(satirlar[yazilmisSatir(agac, 0, null) - 1]).toBe('# Logik');
    expect(satirlar[yazilmisSatir(agac, 0, 3) - 1]).toBe('- #etiket');
    expect(satirlar[yazilmisSatir(agac, 1, null) - 1]).toBe('# #1 Woche');
    expect(satirlar[yazilmisSatir(agac, 2, 0) - 1]).toBe('- Maße');
  });
});

describe('tree changes', () => {
  const a: ListeUnite[] = [{ ad: 'A', konular: ['a1', 'a2'] }, { ad: 'B', konular: ['b1'] }];
  it('add a topic / a unit; the old tree stays', () => {
    expect(konuEkle(a, 1)).toEqual({ agac: [a[0], { ad: 'B', konular: ['b1', 'Yeni konu'] }], konum: { u: 1, k: 1 } });
    expect(uniteEkle(a).agac[2]).toEqual({ ad: 'Yeni ünite', konular: [] });
    expect(a[1].konular).toEqual(['b1']);
  });
  it('a topic moves inside its unit, at the edge into the next one', () => {
    expect(konuTasi(a, 0, 0, 1).agac[0].konular).toEqual(['a2', 'a1']);
    const asagi = konuTasi(a, 0, 1, 1);
    expect(asagi.agac).toEqual([{ ad: 'A', konular: ['a1'] }, { ad: 'B', konular: ['a2', 'b1'] }]);
    expect(asagi.konum).toEqual({ u: 1, k: 0 });
    const yukari = konuTasi(a, 1, 0, -1);
    expect(yukari.agac).toEqual([{ ad: 'A', konular: ['a1', 'a2', 'b1'] }, { ad: 'B', konular: [] }]);
    expect(yukari.konum).toEqual({ u: 0, k: 2 });
    expect(konuTasi(a, 0, 0, -1).agac).toEqual(a);   // the very first: stays
    expect(konuTasi(a, 1, 0, 1).agac).toEqual(a);    // the very last: stays
  });
  it('a unit moves with its topics', () => {
    expect(uniteTasi(a, 1, -1)).toEqual({ agac: [a[1], a[0]], konum: { u: 0, k: null } });
    expect(uniteTasi(a, 0, -1).agac).toEqual(a);
  });
});
