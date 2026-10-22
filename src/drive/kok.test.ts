import { describe, expect, it } from 'vitest';
import { FOLDER_MIME } from './drive';
import { eksikler, kokBul, kokSec, kokTamMi, type KokAday, type KokCocuk, type KokDrive } from './kok';

const eski: KokAday = { id: 'K-eski', name: 'Kitaplık', createdTime: '2026-09-01T00:00:00Z' };
const d1: KokAday = { id: 'D1', name: 'Defter Library', createdTime: '2026-10-19T10:00:00Z' };
const d2: KokAday = { id: 'D2', name: 'Defter Library', createdTime: '2026-10-19T09:00:00Z' };
const tam: KokCocuk[] = [{ name: 'kitaplar', mimeType: FOLDER_MIME }, { name: 'kitaplik.json', mimeType: 'application/json' }];

describe('kokSec', () => {
  it('dar: only the defterKok root; the name list is ignored', () => {
    expect(kokSec({ mod: 'dar', adla: [eski], defterKok: [d1] })).toEqual({ tur: 'bulundu', kok: d1, kaynak: 'defterKok' });
    expect(kokSec({ mod: 'dar', adla: [eski], defterKok: [] })).toEqual({ tur: 'yok' });
  });
  it('tam: the old "Kitaplık" first, also when a defterKok root exists', () => {
    expect(kokSec({ mod: 'tam', adla: [eski], defterKok: [d1] })).toEqual({ tur: 'bulundu', kok: eski, kaynak: 'ad' });
  });
  it('tam without "Kitaplık": the defterKok root', () => {
    expect(kokSec({ mod: 'tam', adla: [], defterKok: [d1] })).toEqual({ tur: 'bulundu', kok: d1, kaynak: 'defterKok' });
    expect(kokSec({ mod: 'tam', adla: [], defterKok: [] })).toEqual({ tur: 'yok' });
  });
  it('two "Kitaplık": the first, with the old warning (as before)', () => {
    const s = kokSec({ mod: 'tam', adla: [eski, { id: 'K2', name: 'Kitaplık' }], defterKok: [] });
    expect(s).toMatchObject({ tur: 'bulundu', kok: eski, kaynak: 'ad' });
    expect(s.tur === 'bulundu' && s.uyari).toContain('2 tane "Kitaplık"');
  });
  it('two defterKok roots: cokKok, the oldest, with a warning', () => {
    const s = kokSec({ mod: 'dar', adla: null, defterKok: [d1, d2] });
    expect(s).toMatchObject({ tur: 'cokKok', kok: d2, kokler: [d2, d1] });
    expect(s.tur === 'cokKok' && s.uyari).toContain('en eskisi');
  });
});

describe('kokTamMi', () => {
  const sec = { tur: 'bulundu', kok: d1, kaynak: 'defterKok' } as const;
  it('whole root: bulundu', () => expect(kokTamMi(sec, tam)).toEqual(sec));
  it('kitaplar missing', () => expect(kokTamMi(sec, [tam[1]])).toEqual({ tur: 'yarim', kok: d1, kaynak: 'defterKok', eksik: ['kitaplar'] }));
  it('kitaplik.json missing', () => expect(kokTamMi(sec, [tam[0]])).toEqual({ tur: 'yarim', kok: d1, kaynak: 'defterKok', eksik: ['kitaplik.json'] }));
  it('both missing', () => expect(kokTamMi(sec, [])).toEqual({ tur: 'yarim', kok: d1, kaynak: 'defterKok', eksik: ['kitaplar', 'kitaplik.json'] }));
  it('a file named "kitaplar" or a folder named "kitaplik.json" does not count', () => {
    expect(eksikler([{ name: 'kitaplar', mimeType: 'text/plain' }, { name: 'kitaplik.json', mimeType: FOLDER_MIME }])).toEqual(['kitaplar', 'kitaplik.json']);
  });
  it('the old "Kitaplık" can be yarim too (kaynak ad)', () => {
    expect(kokTamMi({ tur: 'bulundu', kok: eski, kaynak: 'ad' }, [tam[0]])).toMatchObject({ tur: 'yarim', kaynak: 'ad' });
  });
  it('cokKok keeps its type and gets eksik', () => {
    expect(kokTamMi({ tur: 'cokKok', kok: d2, kokler: [d2, d1], uyari: 'u' }, [])).toMatchObject({ tur: 'cokKok', eksik: ['kitaplar', 'kitaplik.json'] });
  });
});

describe('kokBul', () => {
  function fake(adla: KokAday[], defterKok: KokAday[]) {
    const calls: string[] = [];
    const drive: KokDrive = {
      adlaAra: async () => { calls.push('ad'); return adla; },
      defterKokAra: async () => { calls.push('defterKok'); return defterKok; },
      kokCocuklari: async id => { calls.push('cocuk:' + id); return tam; }
    };
    return { drive, calls };
  }
  it('dar: never asks for "Kitaplık" by name', async () => {
    const f = fake([eski], [d1]);
    expect(await kokBul(f.drive, 'dar')).toMatchObject({ tur: 'bulundu', kok: d1 });
    expect(f.calls).toEqual(['defterKok', 'cocuk:D1']);
  });
  it('tam with "Kitaplık": no defterKok search', async () => {
    const f = fake([eski], [d1]);
    expect(await kokBul(f.drive, 'tam')).toMatchObject({ tur: 'bulundu', kok: eski, kaynak: 'ad' });
    expect(f.calls).toEqual(['ad', 'cocuk:K-eski']);
  });
  it('nothing: yok, no child listing', async () => {
    const f = fake([], []);
    expect(await kokBul(f.drive, 'tam')).toEqual({ tur: 'yok' });
    expect(f.calls).toEqual(['ad', 'defterKok']);
  });
});
