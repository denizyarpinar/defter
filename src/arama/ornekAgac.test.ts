import { describe, expect, it } from 'vitest';
import { parseBook, parseLibrary } from '../model/parse';
import type { Book } from '../model/types';
import { parseSampleFolders } from '../okuma/ornekKaynak';
import { gidisPlani } from './aramaPaneliDurumu';
import { birlestir } from './kitaplikAra';
import { ornekAgac } from './ornekAgac';

// Task 6.3e: the library search in the sample library (public/ornek), names only.

const jsons = import.meta.glob<unknown>('/public/ornek/kitaplar/*/kitap.json', { eager: true, import: 'default' });
const index = Object.values(import.meta.glob<{ kitaplar: string[]; klasorler: unknown }>('/public/ornek/index.json', { eager: true, import: 'default' }))[0];
const libJson = Object.values(import.meta.glob<unknown>('/public/ornek/kitaplik.json', { eager: true, import: 'default' }))[0];
const books = new Map<string, Book>(index.kitaplar.map(id => [id, parseBook(id, jsons[`/public/ornek/kitaplar/${id}/kitap.json`] ?? null)]));
const agac = ornekAgac(parseLibrary(libJson), books, parseSampleFolders(index.klasorler));

describe('ornekAgac', () => {
  it('every sample book, its topics and the files of index.json with their material', () => {
    expect(agac.kitaplar.length).toBe(books.size);
    const prg = agac.dosyalar.filter(f => f.kitap.id === 'programlamaya-giris');
    expect(prg.map(f => `${f.konu?.klasor}|${f.ad}|${f.materyal}|${f.cozumMu}`)).toEqual(expect.arrayContaining([
      'Unite-01-Temeller/Konu-01-Degiskenler|ozet.pdf|ozet|false',
      'Unite-01-Temeller/Konu-01-Degiskenler|blatt-01.pdf|uebungen|false',
      'Unite-01-Temeller/Konu-01-Degiskenler|blatt-01_cozum.pdf|uebungen|true',
      'Unite-01-Temeller/Konu-01-Degiskenler|odev-01.pdf|oedevler|false',
    ]));
    expect(new Set(agac.dosyalar.map(f => f.id)).size).toBe(agac.dosyalar.length);   // ids apart (same demo PDF)
  });

  it('a name search finds the Übungen sheet and its solution; the plan opens the Übungen tab at it', () => {
    const r = birlestir(agac, 'blatt', null).filter(s => s.kitapId === 'programlamaya-giris');
    expect(r.map(s => `${s.eslesme}:${s.ad}`)).toEqual(['ad:blatt-01.pdf', 'ad:blatt-02.pdf', 'ad:blatt-01_cozum.pdf']);   // solutions after the sheets (kitaplikAra)
    const p = gidisPlani(r[2], books.get('programlamaya-giris')!);
    expect(p).toEqual({ tur: 'okuyucu', kitapId: 'programlamaya-giris', unit: 0, topic: 0, dosya: { materyal: 'uebungen', ad: 'blatt-01_cozum.pdf' }, metinAra: false });
  });
});
