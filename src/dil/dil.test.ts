import { afterEach, describe, expect, it } from 'vitest';
import { en } from './en';
import { tr } from './tr';
import { dil, dilAyarla, dilBelirle, t } from './index';
import { boyut, gunOnce, sayi } from './bicim';
import { DONUS_ANAHTARI, donusAl, donusCoz, donusYaz } from './donus';

const degiskenler = (v: string | { bir: string; cok: string }) =>
  [...new Set((typeof v === 'string' ? v : v.bir + v.cok).match(/\{\w+\}/g) ?? [])].sort();

afterEach(() => dilAyarla('tr'));

describe('dictionaries', () => {
  it('en and tr have the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort());
  });

  it('every key has the same {names} in both languages', () => {
    for (const k of Object.keys(tr) as (keyof typeof tr)[]) expect([k, degiskenler(en[k])]).toEqual([k, degiskenler(tr[k])]);
  });

  it('a plural is a plural in both (not a string in one)', () => {
    for (const k of Object.keys(tr) as (keyof typeof tr)[]) expect([k, typeof en[k]]).toEqual([k, typeof tr[k]]);
  });

  it('no empty text', () => {
    for (const s of [tr, en]) for (const v of Object.values(s)) expect(typeof v === 'string' ? v : v.bir && v.cok).toBeTruthy();
  });
});

describe('t', () => {
  it('the tests start in Turkish', () => expect(dil()).toBe('tr'));

  it('puts the values in', () => {
    expect(t('giris.devamEt', { ad: 'Deniz' })).toBe('Deniz olarak devam et');
    dilAyarla('en');
    expect(t('giris.devamEt', { ad: 'Deniz' })).toBe('Continue as Deniz');
    expect(t('panel.rafSayisi', { n: 3, en: 8 })).toBe('3/8 shelves');
  });

  it('a missing value stays as {name}', () => expect(t('giris.devamEt')).toBe('{ad} olarak devam et'));

  it('plural: en 1 page / 2 pages, tr 2 sayfa', () => {
    dilAyarla('en');
    expect(t('genel.sayfaSayisi', { n: 1 })).toBe('1 page');
    expect(t('genel.sayfaSayisi', { n: 2 })).toBe('2 pages');
    expect(t('genel.sayfaSayisi', { n: 0 })).toBe('0 pages');
    dilAyarla('tr');
    expect(t('genel.sayfaSayisi', { n: 1 })).toBe('1 sayfa');
    expect(t('genel.sayfaSayisi', { n: 2 })).toBe('2 sayfa');
  });
});

describe('dilBelirle', () => {
  it('?lang first, then the saved one, then English', () => {
    expect(dilBelirle('?lang=tr', 'en')).toBe('tr');
    expect(dilBelirle('?demo&lang=en', 'tr')).toBe('en');
    expect(dilBelirle('?demo', 'tr')).toBe('tr');
    expect(dilBelirle('', null)).toBe('en');
  });

  it('a wrong value counts as missing', () => {
    expect(dilBelirle('?lang=de', 'tr')).toBe('tr');
    expect(dilBelirle('?lang=TR', null)).toBe('en');
    expect(dilBelirle('', 'fr')).toBe('en');
  });
});

describe('bicim', () => {
  it('numbers and sizes by language', () => {
    expect(sayi(3.45, 1)).toBe('3,5');
    expect(boyut(3.4 * 1024 * 1024)).toBe('3,4 MB');
    expect(boyut(850 * 1024)).toBe('850 KB');
    dilAyarla('en');
    expect(sayi(1234.5, 1)).toBe('1,234.5');
    expect(boyut(3.4 * 1024 * 1024)).toBe('3.4 MB');
  });

  it('days ago', () => {
    expect(gunOnce(0)).toBe('bugün');
    expect(gunOnce(3)).toBe('3 gün önce');
    dilAyarla('en');
    expect(gunOnce(1)).toBe('yesterday');
    expect(gunOnce(3)).toBe('3 days ago');
  });
});

describe('donus', () => {
  const bellek = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m };
  };

  it('written, read once, then gone', () => {
    const s = bellek();
    const d = { kaynak: 'demo' as const, kitapId: 'programlamaya-giris', okuyucu: { unit: 0, topic: 1, materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 3, mod: 'pdf' as const } };
    donusYaz(d, s);
    expect(s.m.has(DONUS_ANAHTARI)).toBe(true);
    expect(donusAl(s)).toEqual(d);
    expect(donusAl(s)).toBeNull();
  });

  it('broken values give null (or drop the broken part)', () => {
    expect(donusCoz('{')).toBeNull();
    expect(donusCoz('{"kaynak":"x","kitapId":"a"}')).toBeNull();
    expect(donusCoz('{"kaynak":"drive","kitapId":""}')).toBeNull();
    expect(donusCoz('{"kaynak":"drive","kitapId":"a","okuyucu":{"unit":-1,"topic":0}}')).toEqual({ kaynak: 'drive', kitapId: 'a' });
    expect(donusCoz('{"kaynak":"drive","kitapId":"a","okuyucu":{"unit":0,"topic":2,"sayfa":0,"mod":"x"}}')).toEqual({ kaynak: 'drive', kitapId: 'a', okuyucu: { unit: 0, topic: 2 } });
  });

  it('a storage that throws stays quiet', () => {
    const hata = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => { throw new Error('no'); } };
    expect(() => donusYaz({ kaynak: 'demo', kitapId: 'a' }, hata)).not.toThrow();
    expect(donusAl(hata)).toBeNull();
    expect(donusAl(null)).toBeNull();
  });
});
