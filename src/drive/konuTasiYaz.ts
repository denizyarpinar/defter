import { t } from '../dil';
import { jsondaTasi, jsondaYolSayisi } from '../kitap/konuTasi';
import { driveFetch, DriveError, FOLDER_MIME, ok } from './drive';
import { kokYeri, zincirKontrol, type CopDrive } from './copeAt';
import { jsonDegistir, type JsonDrive } from './jsonDegistir';

export interface TasiIsi {
  islemId: string; kitapId: string; kokId: string; kitapKlasorId: string; kitapJsonId: string;
  konuKlasorId: string; kaynakId: string; hedefId: string; eskiYol: string; yeniYol: string;
  hedefAnahtar?: string;
  eskiSira: number; hedefSira: number; yon: 'ileri' | 'geri';
  klasorTamam: boolean; jsonTamam: boolean; toparla?: boolean; iptal?: boolean;
}
export interface TasiDepo { oku(): TasiIsi | null; yaz(is: TasiIsi): void; sil(): void }
export const TASI_ANAHTARI = 'defter-konu-tasi';
const stringFields = ['islemId', 'kitapId', 'kokId', 'kitapKlasorId', 'kitapJsonId', 'konuKlasorId', 'kaynakId', 'hedefId', 'eskiYol', 'yeniYol'] as const;
export function tasiCoz(value: unknown): TasiIsi {
  if (!value || typeof value !== 'object') throw new Error(t('tasi.depo'));
  const v = value as TasiIsi;
  if (stringFields.some(k => typeof v[k] !== 'string' || !v[k]) || !['ileri', 'geri'].includes(v.yon)
    || !Number.isInteger(v.eskiSira) || v.eskiSira < 0 || !Number.isInteger(v.hedefSira) || v.hedefSira < 0
    || typeof v.klasorTamam !== 'boolean' || typeof v.jsonTamam !== 'boolean') throw new Error(t('tasi.depo'));
  return v;
}
export const tasiDepo: TasiDepo = {
  oku() { try { const s = localStorage.getItem(TASI_ANAHTARI); return s ? tasiCoz(JSON.parse(s)) : null; } catch { throw new Error(t('tasi.depo')); } },
  yaz(is) { try { localStorage.setItem(TASI_ANAHTARI, JSON.stringify(is)); } catch { throw new Error(t('tasi.depo')); } },
  sil() { try { localStorage.removeItem(TASI_ANAHTARI); } catch { throw new Error(t('tasi.depo')); } }
};
export type TasiDrive = Pick<CopDrive, 'oge' | 'kokCocuklari'> & JsonDrive & {
  tasi?(id: string, hedef: string, kaynak: string): Promise<void>;
};
export async function driveKonuTasi(id: string, hedef: string, kaynak: string): Promise<void> {
  const query = new URLSearchParams({ addParents: hedef, removeParents: kaynak, fields: 'id,parents' });
  await ok(await driveFetch(`files/${encodeURIComponent(id)}?${query}`, { method: 'PATCH' }), t('tasi.suruyor'));
}
export function tersTasi(is: TasiIsi): TasiIsi {
  return { ...is, islemId: crypto.randomUUID(), kaynakId: is.hedefId, hedefId: is.kaynakId,
    eskiYol: is.yeniYol, yeniYol: is.eskiYol, eskiSira: is.hedefSira, hedefSira: is.eskiSira,
    hedefAnahtar: 'k:' + is.eskiYol.split('/')[0],
    yon: is.yon === 'ileri' ? 'geri' : 'ileri', klasorTamam: false, jsonTamam: false, toparla: false, iptal: false };
}

// Re-read the real parent on EVERY try, including lost HTTP responses and recovery after a reload.
export async function konuTasiYaz(d: TasiDrive, is: TasiIsi, depo: TasiDepo = tasiDepo,
  yerel?: (is: TasiIsi) => Promise<void>): Promise<void> {
  try {
    tasiCoz(is);
    const old = depo.oku();
    if (old && old.islemId !== is.islemId) throw new Error(t('tasi.bekleyen'));
    if (is.toparla && !is.iptal) {
      // Recovery: folder already under the target and kitap.json already shows the new path → done; no write, no chain check.
      const [k, j] = await Promise.all([d.oge(is.konuKlasorId), d.jsonOku(is.kitapJsonId)]);
      if (k && !k.trashed && k.parents?.length === 1 && k.parents[0] === is.hedefId
        && jsondaYolSayisi(j, is.yeniYol) === 1 && jsondaYolSayisi(j, is.eskiYol) === 0) {
        if (yerel) await yerel(is);
        depo.sil(); return;
      }
    }
    const yer = await kokYeri(d, is.kokId);
    await zincirKontrol(d, [is.kaynakId, is.kitapKlasorId], is.kokId, yer);
    await zincirKontrol(d, [is.hedefId, is.kitapKlasorId], is.kokId, yer);
    const [konu, kaynak, hedef, json] = await Promise.all([d.oge(is.konuKlasorId), d.oge(is.kaynakId), d.oge(is.hedefId), d.oge(is.kitapJsonId)]);
    const ad = is.eskiYol.split('/'); const yeni = is.yeniYol.split('/');
    if (!konu || !kaynak || !hedef || !json) throw new Error(t('tasi.erisim'));
    if (konu.trashed || kaynak.trashed || hedef.trashed || json.trashed || konu.mimeType !== FOLDER_MIME
      || json.name !== 'kitap.json' || !json.parents?.includes(is.kitapKlasorId)
      || ad.length !== 2 || yeni.length !== 2 || ad[0] !== kaynak.name || yeni[0] !== hedef.name
      || ad[1] !== konu.name || yeni[1] !== konu.name || is.kaynakId === is.hedefId
      || konu.parents?.length !== 1 || ![is.kaynakId, is.hedefId].includes(konu.parents[0])) throw new Error(t('tasi.uyusmuyor'));
    const hedefte = konu.parents[0] === is.hedefId;
    const latest = await d.jsonOku(is.kitapJsonId);
    // Validate the latest JSON before the first parent mutation as well.
    if (!is.toparla || hedefte || is.iptal) jsondaTasi(latest, is.eskiYol, is.hedefAnahtar ?? 'k:' + yeni[0], is.hedefSira, is.yeniYol);
    if (is.toparla && !hedefte && !is.iptal) { depo.sil(); return; }
    depo.yaz(is); // must succeed BEFORE the first mutation
    if (is.iptal) {
      if (hedefte) await (d.tasi ?? driveKonuTasi)(is.konuKlasorId, is.kaynakId, is.hedefId);
      await jsonDegistir(d, is.kitapJsonId, latest => jsondaTasi(latest, is.yeniYol, 'k:' + ad[0], is.eskiSira, is.eskiYol), () => new Error(t('tasi.uyusmuyor')));
      if (yerel) await yerel(tersTasi(is));
      depo.sil(); return;
    }
    if (!hedefte) await (d.tasi ?? driveKonuTasi)(is.konuKlasorId, is.hedefId, is.kaynakId);
    is.klasorTamam = true; depo.yaz(is);
    await jsonDegistir(d, is.kitapJsonId, latest => jsondaTasi(latest, is.eskiYol, is.hedefAnahtar ?? 'k:' + yeni[0], is.hedefSira, is.yeniYol), () => new Error(t('tasi.uyusmuyor')));
    is.jsonTamam = true; depo.yaz(is);
    if (yerel) await yerel(is);
    depo.sil();
  } catch (e) {
    if (e instanceof DriveError && (e.status === 403 || e.status === 404)) throw new Error(t('tasi.erisim'));
    if (e instanceof TypeError) throw new Error(t('cop.hata.ag'));
    throw e;
  }
}
