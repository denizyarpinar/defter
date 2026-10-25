import { describe, expect, it, vi } from 'vitest';
import { bosKayit } from './sema';

// Task 6.4e-2b: the device copy of a record; the store itself is faked (Node has no IndexedDB)
const depo = new Map<string, unknown>();
vi.mock('../../okuma/temizDepo', () => ({
  depoOku: async (_: string, k: string) => depo.get(k) ?? null,
  depoYaz: async (_: string, k: string, v: unknown) => { depo.set(k, v); },
  depoSil: async (_: string, k: string) => { depo.delete(k); },
}));
const { kayitOnbellegeYaz, kayitOnbellektenOku, kayitOnbellektenSil } = await import('./kayitOnbellek');

const kayit = (id: string) => ({ ...bosKayit({ id, ad: 'ozet.pdf' }), sayfalar: [] });

describe('kayitOnbellek', () => {
  it('key = account + file: another account does not see it', async () => {
    await kayitOnbellegeYaz('a@x', 'f1', kayit('f1'));
    expect((await kayitOnbellektenOku('a@x', 'f1'))!.kaynak.id).toBe('f1');
    expect(await kayitOnbellektenOku('b@x', 'f1')).toBeNull();
    await kayitOnbellektenSil('a@x', 'f1');
    expect(await kayitOnbellektenOku('a@x', 'f1')).toBeNull();
  });

  it('broken or another PDF\'s copy → null (Drive is read)', async () => {
    depo.set('a@x|f2', '{');
    depo.set('a@x|f3', JSON.stringify({ tur: 'baska' }));
    depo.set('a@x|f4', JSON.stringify(kayit('f9')));
    depo.set('a@x|f5', 42);
    for (const f of ['f2', 'f3', 'f4', 'f5']) expect(await kayitOnbellektenOku('a@x', f)).toBeNull();
  });
});
