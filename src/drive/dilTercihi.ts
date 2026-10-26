import { ayarlarDilYaz } from '../dil/driveTercih';
import type { Dil } from '../dil';
import { getModifiedTime, readJsonStrict, updateJson } from './drive';
import { jsonDegistir, type JsonDrive } from './jsonDegistir';

// Task 6.5-2b: the language choice into kitaplik.json → ayarlar.dil. The same way as the other kitaplik.json writers:
// modifiedTime → the latest file (broken JSON: never written over) → only ayarlar.dil → modifiedTime again; changed
// meanwhile → once more, then DilCakisma. PATCH on the same id; no file is created.

export const driveDilApi: JsonDrive = {
  jsonOku: id => readJsonStrict(id, 'kitaplik.json okunurken'),
  degisimZamani: id => getModifiedTime(id, 'kitaplik.json okunurken'),
  jsonYaz: (id, obj) => updateJson(id, obj, 'kitaplik.json kaydedilirken')
};

export class DilCakisma extends Error {
  constructor() { super('kitaplik.json changed meanwhile; the language was not written.'); }
}

// true: written (false: Drive had it already)
export const dilTercihiYaz = (drive: JsonDrive, fileId: string, dil: Dil): Promise<boolean> =>
  jsonDegistir(drive, fileId, latest => ayarlarDilYaz(latest, dil), () => new DilCakisma());
