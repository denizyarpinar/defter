import { describe, expect, it } from 'vitest';
import { moveBook, newArrivals, shelfBooks } from './library';
import { parseBook, parseLibrary } from './parse';
import type { Book } from './types';

// Task 6.K4c: a shelf may list a book id whose folder is gone (trashed in Drive). It is not shown and not an error;
// it stays in kitaplik.json until K5 cleans the shelves up.

const kitaplar = (...ids: string[]) => new Map<string, Book>(ids.map(id => [id, parseBook(id, null)]));

describe('a shelf id without its book', () => {
  const lib = () => parseLibrary({ raflar: [{ id: 'a', kitaplar: ['gone', 'x'] }, { id: 'b', kitaplar: ['y', 'gone-2'] }] });

  it('is not on the shelf and not among "Yeni gelenler"', () => {
    const l = lib();
    const books = kitaplar('x', 'y', 'z');
    expect(shelfBooks(l, books, 0)).toEqual(['x']);
    expect(shelfBooks(l, books, 1)).toEqual(['y']);
    expect(newArrivals(l, books)).toEqual(['z']);
  });

  it('a move keeps it in the list (it is not dropped from kitaplik.json)', () => {
    const l = lib();
    const books = kitaplar('x', 'y', 'z');
    moveBook(l, books, 'z', 0, 0);
    expect(l.raflar[0].kitaplar).toEqual(['gone', 'z', 'x']);
    moveBook(l, books, 'x', 1, 1);
    expect(l.raflar[1].kitaplar).toEqual(['y', 'gone-2', 'x']);
    expect(shelfBooks(l, books, 0)).toEqual(['z']);
  });
});
