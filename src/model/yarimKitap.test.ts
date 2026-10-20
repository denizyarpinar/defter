import { describe, expect, it } from 'vitest';
import { yarimKitapNedeni } from './yarimKitap';

describe('yarimKitapNedeni', () => {
  it('a wizard folder (defterIslem) without kitap.json: half made', () => {
    expect(yarimKitapNedeni({ defter: '1', defterIslem: 'islem-1' }, false)).toBe('sihirbaz');
  });
  it('a sample folder (defterOrnek) without kitap.json: half made sample', () => {
    expect(yarimKitapNedeni({ defter: '1', defterIslem: 'k', defterOrnek: '1' }, false)).toBe('ornek');
  });
  it('with kitap.json: a book', () => {
    expect(yarimKitapNedeni({ defter: '1', defterIslem: 'islem-1' }, true)).toBeNull();
    expect(yarimKitapNedeni({ defterOrnek: '1' }, true)).toBeNull();
  });
  it('no marks (the owner\'s Kitaplık, surum 1): the old rule (grey cover)', () => {
    expect(yarimKitapNedeni(undefined, false)).toBeNull();
    expect(yarimKitapNedeni({ defter: '1' }, false)).toBeNull();
    expect(yarimKitapNedeni({ defterIslem: '' }, false)).toBeNull();
  });
});
