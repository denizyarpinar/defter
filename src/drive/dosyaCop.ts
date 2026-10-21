import { jsonaKurdeleGeriKoy, jsondanKurdeleCikar, type CikanKurdeleler } from '../kitap/dosyaCop';
import type { MaterialKind } from '../okuma/konuKesfi';
import { CopAgHatasi, CopCakisma, CopIzinYok, CopKilitli, CopYazmaYok, CopYeriBeklenmedik, kokYeri, zincirKontrol, type CopDrive, type CopOgesi } from './copeAt';
import { DriveError, FOLDER_MIME, listChildren } from './drive';
import { dosyaEbeveyniGecerliMi } from './ebeveyn';
import { driveIcindekilerApi } from './icindekilerYaz';
import { klasorleriBul, type KlasorDrive } from './icindekilerCop';
import { jsonDegistir, type JsonDrive } from './jsonDegistir';
import type { KokKaynagi } from './kok';
import { tekrarlanabilir } from './pdfOlustur';

// Task 6.K6b: the reader's open file (and its solution) to the trash, and "Geri al" (CLAUDE.md → 6.K6b).
// - Only files.update trashed=true / false (driveCopDurumu). Never a folder here (an empty Uebungen stays).
// - Before any write, each try: the topic's folder chain (topic → unit → book → the root's kitaplar/) and each file:
//   a PDF with the expected name, right in the topic's folder or in its Uebungen / Oedevler. Anything else: no request.
// - Trash: the book's other kitap.json writers first (oncesi) → the ribbons pointing at the files out of kitap.json
//   (modifiedTime) → the file → its solution. Geri al: the solution → the file → the ribbons back.
// - Geri al: a file with the same name (not in the trash) in the same folder meanwhile → nothing comes back, the
//   ribbons stay out (GeriAlAdDolu): the old file stays in Drive's trash.
// - Each step is marked done: "Tekrar dene" goes on where it stopped. Already in / out of the trash = done.

export interface DosyaCopDrive extends Pick<CopDrive, 'oge' | 'kokCocuklari' | 'copDurumu'>, KlasorDrive, JsonDrive {
  cocuklar(ebeveynId: string): Promise<{ id: string; name: string; mimeType: string }[]>;   // not in the trash
}

export const driveDosyaCopApi: DosyaCopDrive = {
  oge: driveIcindekilerApi.oge,
  kokCocuklari: id => driveIcindekilerApi.kokCocuklari(id),
  copDurumu: driveIcindekilerApi.copDurumu,
  klasorler: ids => driveIcindekilerApi.klasorler(ids),
  jsonOku: id => driveIcindekilerApi.jsonOku(id),
  degisimZamani: id => driveIcindekilerApi.degisimZamani(id),
  jsonYaz: (id, obj) => driveIcindekilerApi.jsonYaz(id, obj),
  cocuklar: id => listChildren(id)
};

export class GeriAlAdDolu extends Error {
  constructor() { super('Aynı adlı yeni bir dosya var; eski dosya Drive çöpünde kaldı.'); }
}

export interface DosyaCopIsi {
  kitapId: string;
  konu: string;                       // the topic's folder path (topicKey)
  materyal: MaterialKind;
  dosyalar: { id: string; ad: string }[];   // the file first, then its solution (when it goes too)
  basladi: boolean;                   // the first try ran: the list is fixed
  konuId: string | null;              // found on the first try
  uniteId: string | null;
  geriAl: boolean;
  jsonTamam: boolean;
  copte: boolean[];                   // each file in the trash
  cikan: CikanKurdeleler | null;      // what went out of kitap.json
  geriGelen: boolean[];               // "Geri al": each file out of the trash
  jsonGeri: boolean;
  bellek: CikanKurdeleler | null;     // the book in memory (the reader: for "Geri al")
}

export const yeniDosyaCopIsi = (kitapId: string, konu: string, materyal: MaterialKind, dosyalar: { id: string; ad: string }[]): DosyaCopIsi => ({
  kitapId, konu, materyal, dosyalar, basladi: false, konuId: null, uniteId: null, geriAl: false, jsonTamam: false,
  copte: dosyalar.map(() => false), cikan: null, geriGelen: dosyalar.map(() => false), jsonGeri: false, bellek: null
});

// The same operation turned into its "Geri al" (the steps start again)
export function dosyaGeriAlIsi(is: DosyaCopIsi): DosyaCopIsi {
  is.geriAl = true;
  is.geriGelen = is.dosyalar.map(() => false);
  is.jsonGeri = false;
  return is;
}

export interface DosyaCopSecenek {
  kilitAcik: boolean;                 // writable context, independent of URL parameters
  kokKaynagi: KokKaynagi | null;      // null: no root loaded → locked
  kokId: string;
  yazabilir: () => boolean;           // signed in and not the sample library
  surum: number;
  kitapKlasorId: string | undefined;
  kitapJsonId: string | undefined;
  oncesi?: () => Promise<void>;       // reading state / cover waiting: written first
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const adAnahtari = (s: string) => s.trim().toLowerCase();

function json2(j: unknown): Obj {
  if (!isObj(j) || typeof j.surum !== 'number' || j.surum < 2) throw new CopYeriBeklenmedik('kitap.json okunamadı ya da eski biçimde');
  return j;
}

// Each file checked where it is (before any write); returns them as Drive gives them now
async function dosyaKontrol(drive: DosyaCopDrive, is: DosyaCopIsi, konuId: string): Promise<CopOgesi[]> {
  const out: CopOgesi[] = [];
  for (const d of is.dosyalar) {
    const o = await drive.oge(d.id);
    if (!o) throw new CopYeriBeklenmedik(`"${d.ad}" Drive'da bulunamadı`);
    const ust = o.parents?.length === 1 && o.parents[0] !== konuId ? await drive.oge(o.parents[0]) : null;
    if (!dosyaEbeveyniGecerliMi(o, d.ad, konuId, ust && { ...ust, id: o.parents![0] })) throw new CopYeriBeklenmedik(`"${d.ad}" beklenen yerde değil`);
    out.push(o);
  }
  return out;
}

export async function dosyaCopYaz(drive: DosyaCopDrive, is: DosyaCopIsi, s: DosyaCopSecenek): Promise<void> {
  // checks without any request
  if (!s.kilitAcik || s.kokKaynagi === null) throw new CopKilitli();
  if (!s.yazabilir()) throw new CopYazmaYok();
  if (s.surum < 2 || !s.kitapJsonId || !s.kitapKlasorId) throw new CopYeriBeklenmedik('kitabın kitap.json\'u yok ya da eski biçimde');
  if (!is.dosyalar.length) throw new CopYeriBeklenmedik('dosya bilinmiyor');
  const jsonId = s.kitapJsonId, kitapKlasorId = s.kitapKlasorId;
  is.basladi = true;
  try {
    if (!is.geriAl) await s.oncesi?.();
    if (!is.konuId) {
      const k = await klasorleriBul(drive, { tur: 'konu', konu: is.konu }, kitapKlasorId);
      is.konuId = k.klasorId;
      is.uniteId = k.uniteKlasorId;
    }
    const yer = await kokYeri(drive, s.kokId);
    await zincirKontrol(drive, [is.konuId, is.uniteId ?? '', kitapKlasorId], s.kokId, yer);
    const ogeler = await dosyaKontrol(drive, is, is.konuId);
    const adlar = is.dosyalar.map(d => d.ad);
    const cakisma = () => new CopCakisma('kitap.json');

    if (!is.geriAl) {
      if (!is.jsonTamam) {
        await jsonDegistir(drive, jsonId, latest => {
          const r = jsondanKurdeleCikar(json2(latest), is.konu, is.materyal, adlar);
          if (r.cikan) is.cikan = r.cikan;   // kept before the write: a lost answer still knows what went
          return r;
        }, cakisma);
        is.jsonTamam = true;
      }
      for (const [i, d] of is.dosyalar.entries()) {
        if (is.copte[i]) continue;
        if (!ogeler[i].trashed) await drive.copDurumu(d.id, true);
        is.copte[i] = true;
      }
      return;
    }

    // Geri al: a new file with the same name in the same folder → nothing comes back
    const bizim = new Set(is.dosyalar.map(d => d.id));
    for (const [i, o] of ogeler.entries()) {
      if (is.geriGelen[i]) continue;
      const kardes = await drive.cocuklar(o.parents![0]);
      if (kardes.some(f => !bizim.has(f.id) && f.mimeType !== FOLDER_MIME && adAnahtari(f.name) === adAnahtari(o.name))) throw new GeriAlAdDolu();
    }
    for (let i = is.dosyalar.length - 1; i >= 0; i--) {
      if (is.geriGelen[i]) continue;
      if (ogeler[i].trashed) await drive.copDurumu(is.dosyalar[i].id, false);
      is.geriGelen[i] = true;
    }
    if (!is.jsonGeri) {
      const cikan = is.cikan;
      if (cikan) await jsonDegistir(drive, jsonId, latest => jsonaKurdeleGeriKoy(json2(latest), is.konu, is.materyal, cikan), cakisma);
      is.jsonGeri = true;
    }
  } catch (e) {
    if (e instanceof TypeError) throw new CopAgHatasi();
    if (e instanceof DriveError && e.status === 403) throw new CopIzinYok();
    if (tekrarlanabilir(e)) throw new CopAgHatasi();
    throw e;
  }
}
