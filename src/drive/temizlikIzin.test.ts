import { describe, expect, it } from 'vitest';
import { copIzni, eslesme, FOLDER_MIME, IZIN_LISTESI, kilitAcik, klasorIciTamam, OZET, type IzinOgesi } from './temizlikIzin';

const oge: IzinOgesi = { id: 'a', ad: 'tahta.pdf', ebeveyn: 'p', tur: 'dosya', islem: 'cop' };
const iyi = { id: 'a', name: 'tahta.pdf', parents: ['p'], trashed: false, mimeType: 'application/pdf' };

describe('IZIN_LISTESI', () => {
  it('35 items: 30 to trash (2 folders), 5 inside those folders; ids unique', () => {
    expect(IZIN_LISTESI).toHaveLength(35);
    expect(IZIN_LISTESI.filter(o => o.islem === 'cop')).toHaveLength(30);
    expect(IZIN_LISTESI.filter(o => o.islem === 'cop' && o.tur === 'klasor').map(o => o.ad)).toEqual(['Defter-ceviri-deneme', 'Konu-99-Test-5.7']);
    expect(new Set(IZIN_LISTESI.map(o => o.id)).size).toBe(35);
    for (const o of IZIN_LISTESI.filter(x => x.islem === 'klasorle'))
      expect(IZIN_LISTESI.find(x => x.id === o.ebeveyn)?.tur).toBe('klasor');
  });

  it('never: Konu-01 ozet.pdf, 01_Programmiergrundlagen.pdf, kept names outside the test folders', () => {
    const ids = IZIN_LISTESI.map(o => o.id);
    expect(ids).not.toContain(OZET.id);
    expect(ids).not.toContain('1H76AEgfIJomeABYjwBUkLEkkr9HP4BgP');
    for (const o of IZIN_LISTESI.filter(x => /^(orijinal|ozet|brifing|sorular)\.pdf$|\.json$/i.test(x.ad)))
      expect(o.islem).toBe('klasorle');   // only Konu-99's ozet.pdf, which goes with its folder
  });

  it('copIzni only for cop items', () => {
    expect(copIzni('1wwxe0XABj833onJBQmyI2KU7Bm4b5_eB')).toBe(true);
    expect(copIzni('1RVYQrYARDyW8lLnaEUBKuRih0dRVUxwv')).toBe(false);   // klasorle
    expect(copIzni(OZET.id)).toBe(false);
    expect(copIzni('bilinmiyor')).toBe(false);
  });
});

describe('eslesme', () => {
  it('the same file → ok', () => expect(eslesme(oge, iyi)).toEqual({ tamam: true }));

  it.each([
    ['name', { ...iyi, name: 'tahta (1).pdf' }, 'ad farklı'],
    ['parent', { ...iyi, parents: ['x'] }, 'üst klasör farklı'],
    ['no parents', { ...iyi, parents: undefined }, 'üst klasör farklı'],
    ['trashed', { ...iyi, trashed: true }, 'zaten çöpte'],
    ['trashed missing', { ...iyi, trashed: undefined }, 'trashed bilinmiyor'],
    ['folder instead of file', { ...iyi, mimeType: FOLDER_MIME }, 'tür farklı'],
    ['other id', { ...iyi, id: 'b' }, 'id farklı'],
  ])('%s → skipped', (_, m, neden) => {
    const e = eslesme(oge, m);
    expect(e.tamam).toBe(false);
    expect(!e.tamam && e.neden).toContain(neden);
  });

  it('a folder item needs a folder', () => {
    expect(eslesme({ ...oge, tur: 'klasor' }, { ...iyi, mimeType: FOLDER_MIME }).tamam).toBe(true);
    expect(eslesme({ ...oge, tur: 'klasor' }, iyi).tamam).toBe(false);
  });
});

describe('klasorIciTamam', () => {
  const K99 = '1GOJWYdRhqquNl9ehtk6jSqbhgOkHdP1r';
  it('only listed contents → ok (also empty)', () => {
    expect(klasorIciTamam(K99, [{ id: '1RVYQrYARDyW8lLnaEUBKuRih0dRVUxwv', name: 'ozet.pdf' }]).tamam).toBe(true);
    expect(klasorIciTamam(K99, []).tamam).toBe(true);
  });
  it('an unknown file inside → the folder is skipped', () => {
    const e = klasorIciTamam(K99, [{ id: '1RVYQrYARDyW8lLnaEUBKuRih0dRVUxwv', name: 'ozet.pdf' }, { id: 'yeni', name: 'gercek-not.pdf' }]);
    expect(e.tamam).toBe(false);
    expect(!e.tamam && e.neden).toContain('gercek-not.pdf');
  });
});

describe('kilitAcik', () => {
  it('only ?temizlik=1', () => {
    expect(kilitAcik('?temizlik=1')).toBe(true);
    expect(kilitAcik('?a=b&temizlik=1')).toBe(true);
    expect(kilitAcik('')).toBe(false);
    expect(kilitAcik('?temizlik=0')).toBe(false);
    expect(kilitAcik('?temizlik')).toBe(false);
  });
});
