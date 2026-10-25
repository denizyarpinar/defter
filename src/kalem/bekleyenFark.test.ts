import { describe, expect, it, vi } from 'vitest';
import { applyDiff, baseOf, computeDiff, isEmptyDiff, remainingDiff, touchedPages, type PenDiff } from './bekleyenFark';
import type { PageStrokes, Stroke } from './cizgi';

// Task 4.8a: the net difference between the model and the file as loaded

const stroke = (id: string): Stroke => ({ id, arac: 'kalem', renk: '#222222', kalinlik: 2, opaklik: 1, noktalar: [1, 2, 3, 4] });
const pagesOf = (o: Record<number, string[]>): PageStrokes => new Map(Object.entries(o).map(([p, ids]) => [Number(p), ids.map(stroke)]));
const idsOf = (pages: PageStrokes) => Object.fromEntries([...pages].map(([p, l]) => [p, l.map(s => s.id)]));

describe('computeDiff', () => {
  const base = baseOf(pagesOf({ 0: ['a', 'b'], 2: ['c'] }));

  it('nothing changed: empty', () => {
    const d = computeDiff(base, pagesOf({ 0: ['a', 'b'], 2: ['c'] }));
    expect(isEmptyDiff(d)).toBe(true);
  });

  it('added strokes, with their page', () => {
    const d = computeDiff(base, pagesOf({ 0: ['a', 'b'], 1: ['yeni'], 2: ['c', 'yeni2'] }));
    expect(d.eklenen.map(e => [e.sayfa, e.stroke.id])).toEqual([[1, 'yeni'], [2, 'yeni2']]);
    expect(d.silinenIdler).toEqual([]);
  });

  it('removed strokes, with their page', () => {
    const d = computeDiff(base, pagesOf({ 0: ['b'] }));
    expect(d.eklenen).toEqual([]);
    expect(d.silinenIdler).toEqual([{ sayfa: 0, id: 'a' }, { sayfa: 2, id: 'c' }]);
  });

  it('a stroke added and erased again is not in it', () => {
    const d = computeDiff(base, pagesOf({ 0: ['a', 'b'], 2: ['c'] }));   // "x" drawn, then erased
    expect(isEmptyDiff(d)).toBe(true);
  });
});

describe('applyDiff', () => {
  it('adds and removes by id', () => {
    const pages = pagesOf({ 0: ['a', 'b'] });
    applyDiff(pages, { eklenen: [{ sayfa: 0, stroke: stroke('x') }, { sayfa: 3, stroke: stroke('y') }], silinenIdler: [{ sayfa: 0, id: 'a' }] });
    expect(idsOf(pages)).toEqual({ 0: ['b', 'x'], 3: ['y'] });
  });

  it('a stroke that is already there is not added twice', () => {
    const pages = pagesOf({ 0: ['a', 'x'] });   // another device already wrote "x"
    applyDiff(pages, { eklenen: [{ sayfa: 0, stroke: stroke('x') }, { sayfa: 0, stroke: stroke('x') }], silinenIdler: [] });
    expect(idsOf(pages)).toEqual({ 0: ['a', 'x'] });
  });

  it('removing a stroke that is not there is skipped quietly', () => {
    const pages = pagesOf({ 0: ['a'] });
    applyDiff(pages, { eklenen: [], silinenIdler: [{ sayfa: 0, id: 'yok' }, { sayfa: 5, id: 'a' }] });
    expect(idsOf(pages)).toEqual({ 0: ['a'] });
  });

  it('a broken stroke from the record is skipped', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pages = pagesOf({});
    applyDiff(pages, { eklenen: [{ sayfa: 0, stroke: { ...stroke('kotu'), renk: 'kirmizi' } }, { sayfa: 0, stroke: stroke('iyi') }], silinenIdler: [] });
    expect(idsOf(pages)).toEqual({ 0: ['iyi'] });
    warn.mockRestore();
  });

  it('diff then apply on the loaded file gives the model again', () => {
    const loaded = pagesOf({ 0: ['a', 'b'], 1: ['c'] });
    const now = pagesOf({ 0: ['b', 'x'], 1: ['c'], 4: ['y'] });
    const d = computeDiff(baseOf(loaded), now);
    applyDiff(loaded, d);
    expect(idsOf(loaded)).toEqual({ 0: ['b', 'x'], 1: ['c'], 4: ['y'] });
  });
});

// Task 4.8b
describe('remainingDiff', () => {
  const add = (sayfa: number, id: string) => ({ sayfa, stroke: stroke(id) });
  const del = (sayfa: number, id: string) => ({ sayfa, id });
  const diff = (eklenen: PenDiff['eklenen'], silinenIdler: PenDiff['silinenIdler'] = []): PenDiff => ({ eklenen, silinenIdler });

  it('nothing changed during the upload → nothing left', () => {
    const sent = diff([add(0, 'a')], [del(1, 'x')]);
    expect(isEmptyDiff(remainingDiff(sent, sent))).toBe(true);
  });

  it('drawn and erased (old strokes) during the upload stay', () => {
    const sent = diff([add(0, 'a')]);
    const now = diff([add(0, 'a'), add(2, 'b')], [del(1, 'x')]);
    expect(remainingDiff(sent, now)).toEqual(diff([add(2, 'b')], [del(1, 'x')]));
  });

  it('a sent stroke erased during the upload → deleted', () => {
    const sent = diff([add(0, 'a'), add(0, 'b')]);
    expect(remainingDiff(sent, diff([add(0, 'b')]))).toEqual(diff([], [del(0, 'a')]));
  });

  it('a sent deletion undone during the upload → the stroke comes back from the file', () => {
    const sent = diff([], [del(3, 'x')]);
    const back = stroke('x');
    expect(remainingDiff(sent, diff([]), [{ sayfa: 3, stroke: back }])).toEqual(diff([{ sayfa: 3, stroke: back }]));
    // still deleted → nothing
    expect(isEmptyDiff(remainingDiff(sent, sent, [{ sayfa: 3, stroke: back }]))).toBe(true);
  });
});

describe('touchedPages', () => {
  it('each page once, sorted', () => {
    expect(touchedPages({ eklenen: [{ sayfa: 4, stroke: stroke('a') }, { sayfa: 0, stroke: stroke('b') }], silinenIdler: [{ sayfa: 4, id: 'c' }, { sayfa: 2, id: 'd' }] })).toEqual([0, 2, 4]);
  });
});

describe('6.4e-4: the view stays in the pending record', () => {
  const temiz = (id: string): Stroke => ({ ...stroke(id), gorunum: 'temiz' });

  it('through IndexedDB (structured clone) and applyDiff', () => {
    const d = computeDiff(baseOf(new Map()), new Map([[0, [stroke('o'), temiz('t')]]]));
    const kayit = structuredClone(d);   // what IndexedDB stores
    const pages: PageStrokes = new Map();
    applyDiff(pages, kayit);
    expect(pages.get(0)!.map(s => [s.id, s.gorunum])).toEqual([['o', undefined], ['t', 'temiz']]);
  });

  it('remainingDiff keeps it (a clean stroke drawn during the upload)', () => {
    const sent: PenDiff = { eklenen: [{ sayfa: 0, stroke: stroke('o') }], silinenIdler: [] };
    const now: PenDiff = { eklenen: [{ sayfa: 0, stroke: stroke('o') }, { sayfa: 0, stroke: temiz('t') }], silinenIdler: [] };
    expect(remainingDiff(sent, now).eklenen.map(e => e.stroke.gorunum)).toEqual(['temiz']);
  });

  it('a damaged record (bad view) is skipped', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pages: PageStrokes = new Map();
    applyDiff(pages, { eklenen: [{ sayfa: 0, stroke: { ...stroke('x'), gorunum: 'baska' as 'temiz' } }], silinenIdler: [] });
    expect(pages.size).toBe(0);
    warn.mockRestore();
  });
});
