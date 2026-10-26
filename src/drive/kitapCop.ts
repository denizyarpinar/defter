import { t } from '../dil';
import { rafaGeriKoy, raftanCikar, type RafYeri } from '../kitap/copeAt';
import {
  CopAgHatasi, CopCakisma, CopIzinYok, CopKilitli, CopYazmaYok, CopYeriBeklenmedik, driveAltAgac, driveCopDurumu, driveOge, kokYeri, zincirKontrol,
  type CopDrive
} from './copeAt';
import { DriveError, getModifiedTime, readJsonStrict, updateJson } from './drive';
import { jsonDegistir, type JsonDrive } from './jsonDegistir';
import { driveKokApi, type KokKaynagi } from './kok';
import { tekrarlanabilir } from './pdfOlustur';

// Task 6.K5b: a book (or a half-made one, 6.K4b-2) to the trash, and "Geri al" (CLAUDE.md → 6.K5b).
// - Trash: the book's other writers first (shelves, reading state, cover) → the folder is checked (a folder, a child
//   of the root's kitaplar/, named as the book; a half-made one: ours (defter=1) and without kitap.json) → its shelf
//   entry out of kitaplik.json (modifiedTime; the places kept) → the folder trashed=true. A half-made book has no
//   shelf entry: that step is skipped; so it is when the owner's root has no kitaplik.json.
// - Geri al: the folder trashed=false → the entry back on its shelf at its place. "Vazgeç" after a failed step is
//   the same "Geri al" of what was done (the book never falls into "Yeni gelenler").
// - Each step is marked done: "Tekrar dene" goes on where it stopped. Everything it needs is kept in the operation
//   (not in the loaded library), so "Geri al" works after the library was loaded again.

export type KitapCopDrive = CopDrive & JsonDrive;

export const driveKitapCopApi: KitapCopDrive = {
  oge: driveOge,
  kokCocuklari: id => driveKokApi.kokCocuklari(id),
  altAgac: driveAltAgac,
  copDurumu: driveCopDurumu,
  jsonOku: id => readJsonStrict(id, 'kitaplik.json okunurken'),
  degisimZamani: id => getModifiedTime(id, 'kitaplik.json okunurken'),
  jsonYaz: (id, obj) => updateJson(id, obj, 'kitaplik.json kaydedilirken')
};

export interface KitapCopIsi {
  kitapId: string;           // the folder's name
  ad: string;                // shown (the title)
  klasorId: string;
  yarim: boolean;
  geriAl: boolean;
  rafTamam: boolean;
  klasorTamam: boolean;
  kitaplikId: string | null; // found on the first try
  yerler: RafYeri[];         // where the entry was (for "Geri al")
  klasorGeri: boolean;
  rafGeri: boolean;
}

export const yeniKitapCopIsi = (kitapId: string, ad: string, klasorId: string, yarim = false): KitapCopIsi => ({
  kitapId, ad, klasorId, yarim, geriAl: false, rafTamam: false, klasorTamam: false, kitaplikId: null, yerler: [], klasorGeri: false, rafGeri: false
});

// The same operation turned into its "Geri al" (also "Vazgeç" after a failed step)
export function kitapGeriAlIsi(is: KitapCopIsi): KitapCopIsi {
  is.geriAl = true;
  is.klasorGeri = is.rafGeri = false;
  return is;
}

// Something reached Drive already (Vazgeç has to put it back)
export const kitapCopBasladi = (is: KitapCopIsi): boolean => is.rafTamam || is.klasorTamam || is.yerler.length > 0;

export interface KitapCopSecenek {
  kilitAcik: boolean;                // writable context, independent of URL parameters
  kokKaynagi: KokKaynagi | null;     // null: no root loaded → locked
  kokId: string;
  yazabilir: () => boolean;          // signed in and not the sample library
  oncesi?: () => Promise<void>;      // the shelves / reading state / cover waiting: written first
}

export async function kitapCopYaz(drive: KitapCopDrive, is: KitapCopIsi, s: KitapCopSecenek): Promise<void> {
  // checks without any request
  if (!s.kilitAcik || s.kokKaynagi === null) throw new CopKilitli();
  if (!s.yazabilir()) throw new CopYazmaYok();
  try {
    if (!is.geriAl) await s.oncesi?.();
    const yer = await kokYeri(drive, s.kokId);
    const klasor = await zincirKontrol(drive, [is.klasorId], s.kokId, yer);
    if (klasor.name !== is.kitapId) throw new CopYeriBeklenmedik(t('cop.neden.adFarkli', { ad: is.kitapId }));
    if (is.yarim) {
      if (klasor.appProperties?.defter !== '1') throw new CopYeriBeklenmedik(t('cop.neden.uygulamaninDegil'));
      if ((await drive.kokCocuklari(is.klasorId)).some(c => c.name === 'kitap.json')) throw new CopYeriBeklenmedik(t('cop.neden.yarimDegil'));
    }
    is.kitaplikId ??= yer.kitaplikId;
    const kitaplikId = is.yarim ? null : is.kitaplikId;
    const cakisma = () => new CopCakisma('kitaplik.json');

    if (!is.geriAl) {
      if (!is.rafTamam) {
        if (kitaplikId) {
          await jsonDegistir(drive, kitaplikId, latest => {
            const r = raftanCikar(latest, is.kitapId);
            if (r.yerler.length) is.yerler = r.yerler;   // kept before the write
            return r;
          }, cakisma);
        }
        is.rafTamam = true;
      }
      if (!is.klasorTamam) {
        if (!klasor.trashed) await drive.copDurumu(is.klasorId, true);
        is.klasorTamam = true;
      }
      return;
    }

    if (!is.klasorGeri) {
      if (klasor.trashed) await drive.copDurumu(is.klasorId, false);
      is.klasorGeri = true;
    }
    if (!is.rafGeri) {
      if (kitaplikId && is.yerler.length) await jsonDegistir(drive, kitaplikId, latest => rafaGeriKoy(latest, is.yerler, is.kitapId), cakisma);
      is.rafGeri = true;
    }
  } catch (e) {
    if (e instanceof TypeError) throw new CopAgHatasi();
    if (e instanceof DriveError && e.status === 403) throw new CopIzinYok();
    if (tekrarlanabilir(e)) throw new CopAgHatasi();
    throw e;
  }
}
