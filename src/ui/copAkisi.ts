import type { AgacOgesi } from '../drive/copeAt';
import { FOLDER_MIME } from '../drive/drive';
import { dosyaCopYaz, dosyaGeriAlIsi, yeniDosyaCopIsi, type DosyaCopDrive, type DosyaCopSecenek } from '../drive/dosyaCop';
import type { DriveLocation } from '../drive/driveLibrary';
import { klasorleriBul, yeniCopIsi } from '../drive/icindekilerCop';
import type { IcindekilerDrive } from '../drive/icindekilerYaz';
import { kitapCopYaz, kitapGeriAlIsi, yeniKitapCopIsi, type KitapCopDrive, type KitapCopIsi, type KitapCopSecenek } from '../drive/kitapCop';
import type { KokKaynagi } from '../drive/kok';
import { bekleyenSay, gidenKonular, type CopHedefi } from '../kitap/copeAt';
import { dosyaCopSayimi, kitabaKurdeleGeriKoy, kitaptanKurdeleCikar, type DosyaCopHedefi } from '../kitap/dosyaCop';
import { kitapKonuAnahtari, uniteKlasoru } from '../kitap/icindekiler';
import type { Book } from '../model/types';
import { usesUnits } from '../model/units';
import { copOnayAc } from './copOnay';
import { ENGEL_FOTO, type CopOzeti, type CopTuru } from './copOnayDurumu';
import type { IcindekilerBaglantisi } from './icindekilerBaglami';
import { toast, toastUzat } from './toast';

// Task 6.K5b: the trash dialog tied to Drive (main.ts gives the parts). For a topic / unit (the contents' queue),
// a book and a half-made book (kitapCop.ts).
// - Counted first (Drive is only read): topics, files, and changes on the device not in Drive yet inside it.
// - Done → a protected toast "Çöpe atıldı: <ad> · Geri al" (8 s; other toasts wait). A book: the library is loaded
//   again meanwhile and the toast stays at least 4 s after that.
// - "Geri al" keeps everything it needs in its own operation (ids, shelf places, what went out of kitap.json), so it
//   works after the library was loaded again. A failing "Geri al" opens the dialog in its error state: it can finish
//   it even when the toast is gone.
// - Task 6.K6b: the reader's open file (dosyaCopIste; drive/dosyaCop.ts): the same dialog with "Çözümü de çöpe at";
//   a summary while photos for its topic wait on the device → only a note (no new ozet.pdf may come from them).
// - ?olcum=1: the last events (copIzi).

export interface CopAkisiGirdisi {
  kilitAcik: () => boolean;                    // ?kurulum=1 and a root loaded
  kokKaynagi: () => KokKaynagi | null;
  yazabilir: () => boolean;                    // signed in, a Drive library
  loc: () => DriveLocation | null;
  icApi: IcindekilerDrive;
  kitapApi: KitapCopDrive;
  dosyaApi: DosyaCopDrive;
  baglanti: () => IcindekilerBaglantisi | null;
  bekleyenKalem: () => Promise<string[]>;      // file ids
  bekleyenFoto: () => Promise<string[]>;       // the topic folder of each waiting photo record
  oncesi: () => Promise<void>;                 // shelves / reading state / cover waiting: written first
  mesgul: () => string | null;                 // something else is being written (no trash now)
  kitaplikYenile: () => Promise<void>;
  girisYap: () => Promise<void>;
}

// Task 6.K6b: what the reader gives for its open file
export interface DosyaCopIstegi {
  kitap: Book;
  konu: string;                          // the topic's folder path
  konuKlasorId: string;                  // its Drive folder (the photo records name it)
  hedef: DosyaCopHedefi;
  kalemYukleniyor: (fileId: string) => boolean;   // waiting / going in the pen uploader
  bitti: (giden: readonly string[]) => void;       // in the trash: the reader moves on
  geriGeldi: (gelen: readonly string[]) => void;   // "Geri al" done: the reader shows it again
}

const GERI_AL_MS = 8000;
const YENILEME_SONRASI_MS = 4000;
const IZ_UZUNLUK = 6;
const olaylar: string[] = [];
const iz = (olay: string) => {
  const d = new Date();
  olaylar.push(`${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')} ${olay}`);
  if (olaylar.length > IZ_UZUNLUK) olaylar.shift();
};

// The ?olcum=1 line
export const copIzi = (): string => olaylar.length ? olaylar.map(x => '\n  ' + x).join('') : '–';

export function copAkisiKur(g: CopAkisiGirdisi) {
  async function ozet(agac: AgacOgesi[], kokKlasor: string, konu: number): Promise<CopOzeti> {
    const dosyalar = agac.filter(f => f.mimeType !== FOLDER_MIME);
    const klasorIdleri = new Set([kokKlasor, ...agac.filter(f => f.mimeType === FOLDER_MIME).map(f => f.id)]);
    const [kalem, foto] = await Promise.all([
      g.bekleyenKalem().catch(() => [] as string[]),
      g.bekleyenFoto().catch(() => [] as string[])
    ]);
    return { konu, dosya: dosyalar.length, bekleyen: bekleyenSay({ kalemIdleri: kalem, fotoKonulari: foto, dosyaIdleri: new Set(dosyalar.map(f => f.id)), klasorIdleri }) };
  }

  // the toast with "Geri al"; a failing "Geri al" → the dialog in its error state
  function geriAlToast(tur: CopTuru, ad: string, geriAl: () => Promise<void>): void {
    let calisti = false;
    toast(`Çöpe atıldı: ${ad}`, {
      etiket: 'Geri al',
      calistir: () => {
        if (calisti) return;
        calisti = true;
        iz('geri al ' + tur);
        geriAl().then(() => { iz('geri alındı'); toast(`Geri alındı: ${ad}`); }, e => {
          iz('geri al hata');
          copOnayAc({ tur, ad, ilkHata: e, calistir: geriAl, girisYap: g.girisYap, basarili: () => { iz('geri alındı'); toast(`Geri alındı: ${ad}`); } });
        });
      }
    }, GERI_AL_MS, true);
  }

  // ---- a topic / unit ----

  function icerik(b: Book, hedef: CopHedefi): void {
    const loc = g.loc(), bag = g.baglanti();
    const kitapKlasorId = loc?.bookFolderIds.get(b.id);
    if (!loc || !bag || !kitapKlasorId || !g.kilitAcik()) return;
    if (bag.kuyruk.hataVar) { toast('Önce yarım kalan içindekiler kaydını bitir (Tekrar dene ya da Vazgeç).'); return; }
    const konular = gidenKonular(b.uniteler, hedef);
    const ad = hedef.tur === 'konu'
      ? b.uniteler.flatMap(u => u.konular).find(t => kitapKonuAnahtari(t) === hedef.konu)?.baslik ?? hedef.konu
      : b.uniteler.find(u => uniteKlasoru(u.klasor, u.konular.map(t => t.klasor)) === hedef.klasor)?.baslik ?? hedef.klasor;
    const c = yeniCopIsi(hedef, ad);
    iz(`aç ${hedef.tur}: ${ad}`);
    copOnayAc({
      tur: hedef.tur, ad,
      onizle: async () => {
        const k = await klasorleriBul(g.icApi, hedef, kitapKlasorId);
        c.klasorId = k.klasorId;
        c.uniteKlasorId = k.uniteKlasorId;
        return ozet(await g.icApi.altAgac([k.klasorId]), k.klasorId, hedef.tur === 'konu' ? 1 : konular.length);
      },
      calistir: () => bag.copCalistir(b.id, c),
      vazgec: () => bag.copGeriAl(b.id, c),
      girisYap: g.girisYap,
      basarili: () => { iz(`çöpe atıldı ${hedef.tur}`); geriAlToast(hedef.tur, ad, () => bag.copGeriAl(b.id, c)); }
    });
  }

  // ---- a book / a half-made book ----

  function kitapAkisi(tur: 'kitap' | 'yarim', is: KitapCopIsi, konu: number, sonra: (cop: boolean) => void): void {
    const loc = g.loc();
    if (!loc) return;
    const kokId = loc.rootId, kokKaynagi = g.kokKaynagi();   // kept: "Geri al" after the library is loaded again
    const s = (): KitapCopSecenek => ({ kilitAcik: g.kilitAcik(), kokKaynagi, kokId, yazabilir: g.yazabilir, oncesi: g.oncesi });
    const yenile = async () => {
      if (tur !== 'kitap') return;
      try { await g.kitaplikYenile(); } catch (e) { console.warn('Kitaplık yenilenemedi.', e); toast('Kitaplık yenilenemedi; sayfayı yenile.'); }
      toastUzat(YENILEME_SONRASI_MS);
    };
    const geriAl = async () => {
      if (!is.geriAl) kitapGeriAlIsi(is);
      await kitapCopYaz(g.kitapApi, is, s());
      await yenile();
    };
    iz(`aç ${tur}: ${is.kitapId}`);
    copOnayAc({
      tur, ad: is.ad,
      onizle: async () => ozet(await g.kitapApi.altAgac([is.klasorId]), is.klasorId, konu),
      calistir: () => kitapCopYaz(g.kitapApi, is, s()),
      vazgec: async () => { if (!is.geriAl) kitapGeriAlIsi(is); await kitapCopYaz(g.kitapApi, is, s()); },
      girisYap: g.girisYap,
      basarili: () => {
        iz(`çöpe atıldı ${tur}`);
        geriAlToast(tur, is.ad, geriAl);
        void yenile();
      },
      kapandi: sonra
    });
  }

  function kitap(b: Book): void {
    const klasorId = g.loc()?.bookFolderIds.get(b.id);
    if (!klasorId || !g.kilitAcik()) return;
    const m = g.mesgul();
    if (m) { toast(m); return; }
    const konu = usesUnits(b) ? b.uniteler.reduce((n, u) => n + u.konular.length, 0) : b.bolumler.length;
    kitapAkisi('kitap', yeniKitapCopIsi(b.id, b.baslik.trim() || b.id, klasorId), konu, () => {});
  }

  // ---- task 6.K6b: the reader's open file ----

  function dosya(d: DosyaCopIstegi): void {
    const loc = g.loc(), b = d.kitap, h = d.hedef;
    if (!loc || !g.kilitAcik()) return;
    const m = g.mesgul();
    if (m) { toast(m); return; }
    const kokId = loc.rootId, kokKaynagi = g.kokKaynagi();   // kept: "Geri al" after the library is loaded again
    const s = (): DosyaCopSecenek => ({
      kilitAcik: g.kilitAcik(), kokKaynagi, kokId, yazabilir: g.yazabilir, surum: b.surum,
      kitapKlasorId: loc.bookFolderIds.get(b.id), kitapJsonId: loc.bookFileIds.get(b.id), oncesi: g.oncesi
    });
    const is = yeniDosyaCopIsi(b.id, d.konu, h.materyal, [{ id: h.dosya.id, ad: h.dosya.name }]);
    const ad = () => is.dosyalar.length > 1 ? `${h.dosya.name} ve çözümü` : h.dosya.name;
    const ids = () => is.dosyalar.map(x => x.id);
    const geriAl = async () => {
      if (!is.geriAl) dosyaGeriAlIsi(is);
      await dosyaCopYaz(g.dosyaApi, is, s());
      if (is.bellek) { kitabaKurdeleGeriKoy(b, d.konu, h.materyal, is.bellek); is.bellek = null; }
      d.geriGeldi(ids());
    };
    iz(`aç dosya: ${h.dosya.name}`);
    copOnayAc({
      tur: 'dosya', ad: h.etiket,
      ...(h.cozum ? { cozumKutusu: { ad: h.cozum.name } } : {}),
      onizle: async () => {
        const [kalem, foto] = await Promise.all([
          g.bekleyenKalem().catch(() => [] as string[]),
          g.bekleyenFoto().catch(() => [] as string[])
        ]);
        const n = dosyaCopSayimi({ hedef: h, konuKlasorId: d.konuKlasorId, kalemIdleri: kalem, fotoKonulari: foto, yukleniyor: d.kalemYukleniyor });
        return { konu: 0, dosya: 1, bekleyen: n.bekleyen, ...(n.engel ? { engel: ENGEL_FOTO } : {}) };
      },
      calistir: async cozumDahil => {
        if (!is.basladi && cozumDahil && h.cozum) {
          is.dosyalar.push({ id: h.cozum.id, ad: h.cozum.name });
          is.copte.push(false);
          is.geriGelen.push(false);
        }
        await dosyaCopYaz(g.dosyaApi, is, s());
      },
      vazgec: geriAl,
      girisYap: g.girisYap,
      basarili: () => {
        iz('çöpe atıldı dosya');
        // the ribbons in memory follow kitap.json (the reading state never writes them back)
        is.bellek = kitaptanKurdeleCikar(b, d.konu, h.materyal, is.dosyalar.map(x => x.ad));
        d.bitti(ids());
        geriAlToast('dosya', ad(), geriAl);
      }
    });
  }

  return {
    dosyaCopIste: dosya,
    copIste(b: Book, hedef: CopHedefi | { tur: 'kitap' }): void {
      if (hedef.tur === 'kitap') kitap(b); else icerik(b, hedef);
    },
    // the wizard's YarimKitapVar: true when it is in the trash now
    yarimCopeAt(ad: string, klasorId: string): Promise<boolean> {
      return new Promise(res => {
        if (!g.kilitAcik() || !g.loc()) { res(false); return; }
        kitapAkisi('yarim', yeniKitapCopIsi(ad, ad, klasorId, true), 0, res);
      });
    }
  };
}
