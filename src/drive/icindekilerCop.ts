import { t } from '../dil';
import { jsonaGeriKoy, jsondanCikar, type Cikan, type CopHedefi } from '../kitap/copeAt';
import { CopCakisma, CopYeriBeklenmedik, kokYeri, zincirKontrol, type CopDrive } from './copeAt';
import { jsonDegistir, type JsonDrive } from './jsonDegistir';

// Task 6.K5b: a topic / unit to the trash, and "Geri al" (CLAUDE.md → 6.K5b). Runs in the contents' queue
// (icindekilerYaz.ts), so the book's other kitap.json writers finish first and "Tekrar dene" / "Vazgeç" work as in 6.K5a.
// - Trash: the folder is found (once; kept for retries) → the parent chain is checked (no request before) →
//   out of kitap.json (the latest file; modifiedTime) → the folder trashed=true. Each step is marked done, so
//   "Tekrar dene" goes on where it stopped. A folder in the trash already = done.
// - Geri al: the folder trashed=false → back into kitap.json at its old place (the folder first: the contents never
//   name a folder in the trash).
// - Vazgeç after the kitap.json step: the context runs "Geri al" (the topic comes back into kitap.json).

export interface CopIsi {
  hedef: CopHedefi;
  ad: string;                         // shown in the dialog / toast
  klasorId: string | null;            // the topic / unit folder (found on the first try)
  uniteKlasorId: string | null;       // topic: its unit's folder
  geriAl: boolean;                    // false: to the trash; true: "Geri al"
  jsonTamam: boolean;                 // out of kitap.json
  klasorTamam: boolean;               // the folder in the trash
  cikan: Cikan | null;                // what went out of kitap.json (for "Geri al")
  klasorGeri: boolean;                // "Geri al": the folder out of the trash
  jsonGeri: boolean;                  // "Geri al": back in kitap.json
  bellek: Cikan | null;               // the book in memory (the context: for "Geri al")
}

export const yeniCopIsi = (hedef: CopHedefi, ad: string, klasorId: string | null = null, uniteKlasorId: string | null = null): CopIsi => ({
  hedef, ad, klasorId, uniteKlasorId, geriAl: false, jsonTamam: false, klasorTamam: false, cikan: null, klasorGeri: false, jsonGeri: false, bellek: null
});

// The same operation turned into its "Geri al" (the steps start again)
export function geriAlIsi(c: CopIsi): CopIsi {
  c.geriAl = true;
  c.klasorGeri = c.jsonGeri = false;
  return c;
}

export interface CopYeri { kokId: string; kitapKlasorId: string; kitapJsonId: string }

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function json2(j: unknown): Obj {
  if (!isObj(j) || typeof j.surum !== 'number' || j.surum < 2) throw new CopYeriBeklenmedik(t('cop.neden.jsonEski'));
  return j;
}

const tekKlasor = (liste: readonly { id: string; name: string }[], ad: string) => {
  const uyan = liste.filter(f => f.name === ad);
  if (uyan.length !== 1) throw new CopYeriBeklenmedik(t(uyan.length ? 'cop.neden.cokKlasor' : 'cop.neden.adliKlasorYok', { ad }));
  return uyan[0].id;
};

export type KlasorDrive = { klasorler(ebeveynIdleri: readonly string[]): Promise<{ id: string; name: string }[]> };

// The folder ids by name (read only): the unit folder in the book's folder, the topic folder in it
export async function klasorleriBul(drive: KlasorDrive, hedef: CopHedefi, kitapKlasorId: string): Promise<{ klasorId: string; uniteKlasorId: string | null }> {
  const parca = (hedef.tur === 'konu' ? hedef.konu : hedef.klasor).split('/');
  if (parca.length !== (hedef.tur === 'konu' ? 2 : 1) || parca.some(p => !p.trim())) throw new CopYeriBeklenmedik(t('cop.neden.klasorBilinmiyor'));
  const uniteKlasorId = tekKlasor(await drive.klasorler([kitapKlasorId]), parca[0]);
  if (hedef.tur === 'unite') return { klasorId: uniteKlasorId, uniteKlasorId: null };
  return { klasorId: tekKlasor(await drive.klasorler([uniteKlasorId]), parca[1]), uniteKlasorId };
}

export async function copYaz(drive: CopDrive & JsonDrive & KlasorDrive, c: CopIsi, y: CopYeri): Promise<void> {
  if (!c.klasorId) {
    const k = await klasorleriBul(drive, c.hedef, y.kitapKlasorId);
    c.klasorId = k.klasorId;
    c.uniteKlasorId = k.uniteKlasorId;
  }
  const yer = await kokYeri(drive, y.kokId);
  const zincir = c.hedef.tur === 'konu' ? [c.klasorId, c.uniteKlasorId ?? '', y.kitapKlasorId] : [c.klasorId, y.kitapKlasorId];
  const klasor = await zincirKontrol(drive, zincir, y.kokId, yer);   // before any write
  const cakisma = () => new CopCakisma('kitap.json');

  if (!c.geriAl) {
    if (!c.jsonTamam) {
      await jsonDegistir(drive, y.kitapJsonId, latest => {
        const r = jsondanCikar(json2(latest), c.hedef);
        if (r.cikan) c.cikan = r.cikan;   // kept before the write: a lost answer still knows what went
        return r;
      }, cakisma);
      c.jsonTamam = true;
    }
    if (!c.klasorTamam) {
      if (!klasor.trashed) await drive.copDurumu(c.klasorId, true);
      c.klasorTamam = true;
    }
    return;
  }

  if (!c.klasorGeri) {
    if (klasor.trashed) await drive.copDurumu(c.klasorId, false);
    c.klasorGeri = true;
  }
  if (!c.jsonGeri) {
    const cikan = c.cikan;
    if (cikan) await jsonDegistir(drive, y.kitapJsonId, latest => jsonaGeriKoy(json2(latest), cikan), cakisma);
    c.jsonGeri = true;
  }
}
