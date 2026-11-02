import { DriveError } from '../drive/drive';
import { kitapUniteAnahtarlari, uniteKlasoruBul } from '../kitap/icindekiler';
import { t } from '../dil';
import { tasiDepo, tersTasi, type TasiIsi } from '../drive/konuTasiYaz';
import { klasorleriBul } from '../drive/icindekilerCop';
import { yeniIs, type IcindekilerDrive, type IcindekilerKuyrugu, type IcindekilerSecenek } from '../drive/icindekilerYaz';
import { konuTasiAcik } from '../kitap/konuTasi';
import { tasiKilitle } from '../kitap/konuTasiKilit';
import type { Book } from '../model/types';
import type { IcindekilerBaglami } from './icindekilerDuzenle';

export function konuTasiBagla(o: {
  baglam: IcindekilerBaglami; kuyruk: IcindekilerKuyrugu; drive: IcindekilerDrive;
  secenek(id: string): IcindekilerSecenek;
  kontrol(b: Book, yol: string, id: string): Promise<void>;
  bildirim(geri: () => void): void;
  yenidenYukle?(kitapId: string): Promise<void>;   // the book again from Drive's kitap.json (Vazgeç of a recovery)
  haber?(): void;                                  // redraw the status line
}): void {
  let hazirlaniyor = false;
  let toparlama: Promise<void> | null = null;
  // A recovery that can't go on: shown in the status line with "Vazgeç" (never a permanent lock)
  let sorun: { kitapId: string; metin: string } | null = null;
  const sorunYaz = (s: typeof sorun) => { sorun = s; o.haber?.(); };
  const calistir = (is: TasiIsi): Promise<boolean> => new Promise(resolve => {
    tasiKilitle(is.konuKlasorId, is.eskiYol, is.yeniYol, true);
    const job = yeniIs(is.islemId, is.kitapId, { tur: 'konuTasi', tasi: is });
    job.bitti = hata => {
      if (hata) { resolve(false); return; } // lock and journal stay until Retry / Cancel succeeds
      tasiKilitle(is.konuKlasorId, is.eskiYol, is.yeniYol, false);
      if (!is.iptal && !is.toparla) o.bildirim(() => {
        if (o.kuyruk.hasUnsaved || hazirlaniyor) return;
        void calistir(tersTasi(is));
      });
      resolve(true);
    };
    void o.kuyruk.ekle(job);
  });
  o.baglam.tasiBekleyen = b => o.kuyruk.bekleyenler.flatMap(i => i.kitapId === b.id && i.istek.tur === 'konuTasi' ? [i.istek.tasi] : []);
  const toparla = async (b: Book) => {
    if (!konuTasiAcik()) return;
    if (hazirlaniyor || o.kuyruk.hasUnsaved) {
      // a failed move is already in the status line (Tekrar dene / Vazgeç); only a running one waits
      if (!o.kuyruk.hataVar && o.kuyruk.bekleyenler.some(i => i.istek.tur === 'konuTasi')) throw new Error(t('tasi.bekleyen'));
      return;
    }
    let is: TasiIsi | null;
    try {
      is = tasiDepo.oku();
      if (!is || is.kitapId !== b.id) return;
      const s = o.secenek(b.id);
      if (is.kokId !== s.kokId || is.kitapJsonId !== s.kitapJsonId || is.kitapKlasorId !== s.kitapKlasorId) throw new Error(t('tasi.erisim'));
    } catch (e) {
      sorunYaz({ kitapId: b.id, metin: e instanceof Error ? e.message : t('tasi.depo') });
      return;
    }
    sorunYaz(null);
    is.toparla = true;
    await calistir(is);   // a failure stays in the queue's status line with Tekrar dene / Vazgeç
  };
  o.baglam.tasiSorun = () => sorun?.metin ?? null;
  // Vazgeç of a recovery: only the local record goes; Drive and kitap.json are not touched; the book is read again.
  o.baglam.tasiVazgec = async (id?: string) => {
    const kitapId = id ?? sorun?.kitapId ?? (() => { try { return tasiDepo.oku()?.kitapId; } catch { return undefined; } })();
    let is: TasiIsi | null = null;
    try { is = tasiDepo.oku(); } catch { /* broken record: removed below */ }
    try { tasiDepo.sil(); } catch { sorunYaz({ kitapId: kitapId ?? '', metin: t('tasi.depo') }); return; }
    if (is) tasiKilitle(is.konuKlasorId, is.eskiYol, is.yeniYol, false);
    sorun = null;
    if (kitapId && o.yenidenYukle) {
      try { await o.yenidenYukle(kitapId); } catch { sorunYaz({ kitapId, metin: t('tasi.yuklenemedi') }); return; }
    }
    o.haber?.();
  };
  o.baglam.toparla = b => {
    if (toparlama) return toparlama;
    toparlama = toparla(b).finally(() => { toparlama = null; });
    return toparlama;
  };
  o.baglam.konuTasi = async (b, konu, hedef, sira) => {
    if (!konuTasiAcik()) throw new Error(t('tasi.kapali'));
    if (hazirlaniyor || o.kuyruk.hasUnsaved || tasiDepo.oku()) throw new Error(t('tasi.bekleyen'));
    hazirlaniyor = true;
    try {
      const s = o.secenek(b.id);
      if (!s.yazabilir() || !s.kilitAcik || b.surum < 2 || !s.kitapKlasorId || !s.kitapJsonId || !hedef) throw new Error(t('tasi.uyusmuyor'));
      const source = b.uniteler.find(u => u.konular.some(k => k.klasor === konu));
      if (!source) throw new Error(t('tasi.uyusmuyor'));
      const oldIndex = source.konular.findIndex(k => k.klasor === konu);
      const from = await klasorleriBul(o.drive, { tur: 'konu', konu }, s.kitapKlasorId);
      const to = await klasorleriBul(o.drive, { tur: 'unite', klasor: hedef }, s.kitapKlasorId);
      const folders = await o.drive.klasorler([s.kitapKlasorId]);
      const index = b.uniteler.findIndex((_, i) => uniteKlasoruBul(b.uniteler, i, folders) === hedef);
      if (index < 0) throw new Error(t('tasi.uyusmuyor'));
      await o.kontrol(b, konu, from.klasorId);
      if (o.kuyruk.hasUnsaved) throw new Error(t('tasi.bekleyen'));
      void calistir({ islemId: crypto.randomUUID(), kitapId: b.id, kokId: s.kokId, kitapKlasorId: s.kitapKlasorId,
        kitapJsonId: s.kitapJsonId, konuKlasorId: from.klasorId, kaynakId: from.uniteKlasorId!, hedefId: to.klasorId,
        eskiYol: konu, yeniYol: hedef + '/' + konu.split('/')[1], eskiSira: oldIndex, hedefSira: sira,
        hedefAnahtar: kitapUniteAnahtarlari(b)[index], yon: 'ileri', klasorTamam: false, jsonTamam: false });
    } catch (e) {
      if (e instanceof DriveError && (e.status === 403 || e.status === 404)) throw new Error(t('tasi.erisim'));
      if (e instanceof TypeError) throw new Error(t('cop.hata.ag'));
      throw e;
    } finally { hazirlaniyor = false; }
  };
}
