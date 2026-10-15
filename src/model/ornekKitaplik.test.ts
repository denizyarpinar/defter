import { describe, expect, it } from 'vitest';
import { availableKinds } from '../okuma/konuKesfi';
import { localTopic, parseSampleFolders } from '../okuma/ornekKaynak';
import { parseBook } from './parse';
import { bookUnits, usesUnits } from './units';

// Task 3.6: the sample library in public/ornek: three surum 2 books open the demo PDFs.

// read through Vite (no Node types in this project): path → parsed JSON / file exists
const books = import.meta.glob<unknown>('/public/ornek/kitaplar/*/kitap.json', { eager: true, import: 'default' });
const demoFiles = new Set(Object.keys(import.meta.glob('/public/demo/*.pdf', { query: '?url' })).map(p => p.slice('/public/'.length)));
const index = Object.values(import.meta.glob<{ kitaplar: string[]; klasorler: unknown }>('/public/ornek/index.json', { eager: true, import: 'default' }))[0];
const folders = parseSampleFolders(index.klasorler);
const hasBook = (id: string) => `/public/ornek/kitaplar/${id}/kitap.json` in books;
const book = (id: string) => parseBook(id, books[`/public/ornek/kitaplar/${id}/kitap.json`]);

const SHOWCASE = ['programlamaya-giris', 'lineer-cebir', 'algorithms'];

describe('sample library', () => {
  it.each(SHOWCASE)('%s is parsed as surum 2 with units and topics', id => {
    const b = book(id);
    expect(b.surum).toBe(2);
    expect(usesUnits(b)).toBe(true);
    expect(b.uniteler.length).toBeGreaterThan(0);
    expect(b.uniteler.every(u => u.konular.length > 0)).toBe(true);
    expect(bookUnits(b).flatMap(u => u.konular).length).toBeGreaterThan(2);
  });

  it.each(SHOWCASE)('%s: every topic folder is in index.json and has materials', id => {
    for (const t of book(id).uniteler.flatMap(u => u.konular)) {
      const m = localTopic(folders[id], t.klasor);
      expect(m, t.klasor).not.toBeNull();
      if (t.klasor) expect(availableKinds(m!).length, t.klasor).toBeGreaterThan(0);
    }
  });

  it('every file in the map exists under public/', () => {
    const files = Object.values(folders).flatMap(topics => Object.values(topics).flatMap(f => Object.values(f)));
    expect(files.length).toBeGreaterThan(0);
    for (const f of new Set(files)) expect(demoFiles.has(f), f).toBe(true);
  });

  it('a ribbon in a sample book points to a topic that has that material', () => {
    const b = book('programlamaya-giris');
    const r = b.kurdele as { konu: string; materyal: 'ozet'; dosya: string; sayfa: number };
    const m = localTopic(folders[b.id], r.konu)!;
    expect(m[r.materyal].map(x => x.file.name)).toContain(r.dosya);
  });

  it('the other sample books stay surum 1', () => {
    const others = index.kitaplar.filter(id => !SHOWCASE.includes(id) && hasBook(id));
    expect(others.length).toBeGreaterThan(20);
    for (const id of others) expect(book(id).surum, id).toBe(1);
  });
});
