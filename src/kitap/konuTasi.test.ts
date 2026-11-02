import { describe, expect, it } from 'vitest';
import { jsondaTasi, kitaptaTasi, konuTasiAcik, KONU_TASI, yolCevir } from './konuTasi';
import { parseBook } from '../model/parse';

const eski = 'A/Konu-01', yeni = 'B/Konu-01';
const book = () => ({ surum: 2, baslik: 'Book', unknown: { a: 7 }, kurdele: { konu: eski, materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 4 },
  uniteler: [{ baslik: 'A', klasor: 'A', extra: 9, konular: [{ baslik: 'Topic', klasor: eski, durum: 'okundu', custom: { x: true }, kurdeleler: { ozet: { dosya: 'ozet.pdf', sayfa: 4 } } }] },
    { baslik: 'B', klasor: 'B', konular: Array.from({ length: 3 }, (_, i) => ({ baslik: String(i), klasor: 'B/Konu-0' + (i + 2), durum: 'okunmadi' })) }] });

describe('topic move model', () => {
  it('defaults off', () => expect(KONU_TASI).toBe(false));
  it.each(['', '?konuTasi=0', '?konuTasi=true', '?konuTasi=01'])('disabled: %s', search => expect(konuTasiAcik(search)).toBe(false));
  it.each(['?konuTasi=1', '?lang=tr&konuTasi=1'])('explicit opt in: %s', search => expect(konuTasiAcik(search)).toBe(true));
  it.each([0, 1, 2, 3, 100])('inserts at target index %i, preserves metadata/ribbon and input', index => {
    const original = book(), before = structuredClone(original);
    const result = jsondaTasi(original, eski, 'k:B', index, yeni);
    expect(original).toEqual(before);
    const b = result.json as ReturnType<typeof book>;
    expect(b.uniteler[1].konular[Math.min(index, 3)]).toEqual({ ...before.uniteler[0].konular[0], klasor: yeni });
    expect(b.kurdele).toEqual({ ...before.kurdele, konu: yeni });
    expect(b.unknown).toEqual(before.unknown);
    expect(b.uniteler[0].extra).toBe(9);
  });
  it.each([0, 1, 2, 3])('inverse restores original at index %i', index => {
    const b = book(), before = structuredClone(b);
    const originalTopic = b.uniteler[0].konular[0];
    kitaptaTasi(b, eski, 'k:B', index, yeni);
    expect(b.uniteler[1].konular[index]).toBe(originalTopic);
    expect(kitaptaTasi(b, eski, 'k:B', index, yeni)).toBe(false);
    kitaptaTasi(b, yeni, 'k:A', 0, eski);
    expect(b).toEqual(before);
  });
  it('raw JSON and parsed book agree', () => {
    const raw = book(), memory = parseBook('book', raw);
    const result = jsondaTasi(raw, eski, 'k:B', 1, yeni).json;
    kitaptaTasi(memory, eski, 'k:B', 1, yeni);
    expect(memory).toEqual(parseBook('book', result));
  });
  it('last topic preserves inferred source folder', () => {
    const b = book(); delete (b.uniteler[0] as { klasor?: string }).klasor;
    kitaptaTasi(b, eski, 'k:B', 0, yeni);
    expect(b.uniteler[0].klasor).toBe('A');
  });
  it('legacy empty target gains folder', () => {
    const b = book(); b.uniteler[1].konular = []; delete (b.uniteler[1] as { klasor?: string }).klasor;
    kitaptaTasi(b, eski, 'b:B#0', 0, yeni);
    expect(b.uniteler[1].klasor).toBe('B');
    expect(kitaptaTasi(b, eski, 'b:B#0', 0, yeni)).toBe(false);
  });
  it.each([-1, 1.5, NaN])('rejects invalid index %s before mutation', index => {
    const b = book(), before = structuredClone(b);
    expect(() => kitaptaTasi(b, eski, 'k:B', index, yeni)).toThrow(); expect(b).toEqual(before);
  });
  it.each(['B/Renamed', '../Konu-01', 'B/X/Konu-01', 'C/Konu-01'])('rejects invalid path %s', path => {
    const b = book(), before = structuredClone(b);
    expect(() => kitaptaTasi(b, eski, 'k:B', 0, path)).toThrow(); expect(b).toEqual(before);
  });
  it('rejects duplicate destination', () => {
    const b = book(); b.uniteler[1].konular.push({ baslik: 'duplicate', klasor: yeni, durum: 'okunmadi', custom: { x: true }, kurdeleler: { ozet: { dosya: 'ozet.pdf', sayfa: 4 } } });
    expect(() => kitaptaTasi(b, eski, 'k:B', 0, yeni)).toThrow();
  });
  it.each([null, {}, { surum: 1 }, { surum: 2, uniteler: null }])('rejects broken/old book %j', value => expect(() => jsondaTasi(value, eski, 'k:B', 0, yeni)).toThrow());
  it('only changes exact path references', () => {
    expect(yolCevir(eski, eski, yeni)).toBe(yeni);
    expect(yolCevir(eski + 'suffix', eski, yeni)).toBe(eski + 'suffix');
  });
});
