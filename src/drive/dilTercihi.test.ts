import { describe, expect, it } from 'vitest';
import { DilCakisma, dilTercihiYaz } from './dilTercihi';
import type { JsonDrive } from './jsonDegistir';

function sahte(ilk: unknown, zamanlar: string[] = []) {
  let icerik = ilk;
  const yazilan: unknown[] = [];
  let n = 0;
  const drive: JsonDrive = {
    jsonOku: async () => icerik,
    degisimZamani: async () => zamanlar[n++] ?? 't',
    jsonYaz: async (_id, obj) => { yazilan.push(obj); icerik = obj; }
  };
  return { drive, yazilan };
}

describe('dilTercihiYaz', () => {
  it('writes only ayarlar.dil into the latest file', async () => {
    const { drive, yazilan } = sahte({ surum: 1, raflar: [{ id: 'r' }], oda: { mod: 'auto' }, x: 1 });
    expect(await dilTercihiYaz(drive, 'lib', 'tr')).toBe(true);
    expect(yazilan).toEqual([{ surum: 1, raflar: [{ id: 'r' }], oda: { mod: 'auto' }, x: 1, ayarlar: { dil: 'tr' } }]);
  });

  it('Drive has it already → nothing written', async () => {
    const { drive, yazilan } = sahte({ ayarlar: { dil: 'tr' } });
    expect(await dilTercihiYaz(drive, 'lib', 'tr')).toBe(false);
    expect(yazilan).toEqual([]);
  });

  it('changed meanwhile → once more; again → DilCakisma, nothing written', async () => {
    const bir = sahte({}, ['a', 'b', 'c', 'c']);
    expect(await dilTercihiYaz(bir.drive, 'lib', 'en')).toBe(true);
    expect(bir.yazilan).toHaveLength(1);
    const iki = sahte({}, ['a', 'b', 'c', 'd']);
    await expect(dilTercihiYaz(iki.drive, 'lib', 'en')).rejects.toBeInstanceOf(DilCakisma);
    expect(iki.yazilan).toEqual([]);
  });
});
