import { libraryToJson } from '../model/serialize';
import { parseLibrary } from '../model/parse';
import { DriveError, driveFetch, FOLDER_MIME, ok, qv } from './drive';
import { driveKokApi, KOK_ADI, kokBul, type KokDrive, type KokEksik, type KokKaynagi, type KokModu } from './kok';
import { IdZatenVar, tekrarlanabilir } from './pdfOlustur';
import { UPLOAD } from './pdfYazici';

// Task 6.K2a: sets up an empty library in Drive: "Defter Library" (in My Drive's root) → kitaplar/ → kitaplik.json.
// Rules (CLAUDE.md → Faz 6.K):
// - Only under the app's own root (appProperties defterKok = "1"), only when asked (a tap; today the dev helper),
//   and only with ?kurulum=1 (kilitAcik). Locked → KurulumKilitli before any request.
// - Everything created carries appProperties { defter: "1", defterIslem: <islemId> } (the root also defterKok: "1").
// - "Is it there?" first, no duplicates: the root is looked up (kokBul), missing parts only ('yarim'); every item
//   is looked up by its defterIslem first; the id is taken beforehand (files.generateIds) and every retry uses it
//   (Drive's 409 "already exists" = an earlier try did arrive).
// - The owner's old "Kitaplık" (found by name) is never written to and never marked; with it there is no new root.
// - Creates only. No files.delete, no update. kitaplik.json is created last: it marks the set-up as done.

export interface KurulumOgesi { id: string; name: string; parents?: string[]; appProperties?: Record<string, string> }

export interface YeniOgeMeta {
  id?: string;                           // from generateIds; missing when Drive gave none
  name: string;
  parents: string[];
  mimeType: string;
  appProperties: Record<string, string>;
}

export interface KurulumDrive extends KokDrive {
  yeniId(): Promise<string>;                                                  // files.generateIds
  olustur(meta: YeniOgeMeta, icerik?: string): Promise<{ id: string }>;      // a folder, or a JSON file with icerik
  islemleAra(ebeveynId: string, ad: string, islemId: string): Promise<KurulumOgesi[]>;
  ogeBilgisi(id: string): Promise<KurulumOgesi>;
}

// ---- errors (Turkish, say what to do) ----

export class KurulumKilitli extends Error {
  constructor() { super('Kurulum kilitli: hiçbir şey oluşturulmadı. Denemek için adrese ?kurulum=1 ekle.'); }
}

export class KurulumYazmaYok extends Error {
  constructor() { super('Kurulum yapılamaz: Google ile giriş yapılmamış ya da örnek kitaplık açık. Google ile giriş yap ve tekrar dene.'); }
}

export class KurulumIzinYok extends Error {
  constructor() { super('Drive klasör oluşturmaya izin vermedi. Google girişinde Drive iznini onayladığından emin ol, sonra tekrar dene.'); }
}

export class KurulumAgHatasi extends Error {
  constructor() { super('Kurulum bitmedi: Drive\'a bağlanılamadı ya da Drive meşgul. İnternet bağlantını kontrol edip tekrar dene; tekrar denemede çift klasör oluşmaz.'); }
}

export class KurulumBeklenmedik extends Error {
  constructor(ne: string) { super(`Kurulum durdu: ${ne}. Drive'da "${KOK_ADI}" klasörüne bakıp tekrar dene.`); }
}

// ---- the real Drive ----

const WHAT = 'Kitaplık kurulurken';

// Create answers: "already exists" (409, or the text in the error) → IdZatenVar, other errors → DriveError.
async function olusturmaYaniti(res: Response): Promise<Response> {
  if (res.ok) return res;
  const text = await res.text().catch(() => '');
  if (res.status === 409 || /already exists/i.test(text)) throw new IdZatenVar();
  throw new DriveError(res.status, WHAT);
}

export const driveKurulumApi: KurulumDrive = {
  ...driveKokApi,
  async yeniId() {
    const res = await ok(await driveFetch('files/generateIds?count=1&space=drive&type=files'), WHAT);
    const id = (await res.json() as { ids?: string[] }).ids?.[0];
    if (!id) throw new DriveError(500, WHAT);
    return id;
  },
  async olustur(meta, icerik) {
    let res: Response;
    if (icerik === undefined) {
      res = await driveFetch('files?fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(meta)
      });
    } else {
      const boundary = 'defter' + Math.random().toString(36).slice(2);
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`
        + `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${icerik}\r\n--${boundary}--`;
      res = await driveFetch(`${UPLOAD}files?uploadType=multipart&fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
      });
    }
    return await (await olusturmaYaniti(res)).json() as { id: string };
  },
  async islemleAra(ebeveynId, ad, islemId) {
    const q = `'${qv(ebeveynId)}' in parents and name = '${qv(ad)}' and appProperties has { key='defterIslem' and value='${qv(islemId)}' } and trashed = false`;
    const params = new URLSearchParams({ q, fields: 'files(id,name)', pageSize: '10' });
    const j = await (await ok(await driveFetch('files?' + params), WHAT)).json() as { files?: KurulumOgesi[] };
    return j.files ?? [];
  },
  async ogeBilgisi(id) {
    const res = await ok(await driveFetch(`files/${encodeURIComponent(id)}?fields=id,name,parents,appProperties`), WHAT);
    return await res.json() as KurulumOgesi;
  }
};

// ---- creating one item ----

export interface KurulumSecenek {
  bekleMs?: number;     // wait before a retry
  deneme?: number;      // tries at most
}

interface OgeIstegi {
  ad: string;
  ebeveynId: string;
  mimeType: string;
  icerik?: string;
  appProps?: Record<string, string>;
  islemId: string;
}

const bekle = (ms: number) => new Promise(r => setTimeout(r, ms));

// An item with the id Drive says exists: ours only if it has our name and islemId.
async function bizimMi(drive: KurulumDrive, id: string, o: OgeIstegi): Promise<string> {
  const f = await drive.ogeBilgisi(id);
  if (f.name !== o.ad || f.appProperties?.defterIslem !== o.islemId) throw new KurulumBeklenmedik(`"${o.ad}" için alınan kimlik başka bir dosyada`);
  return f.id;
}

async function olusturOge(drive: KurulumDrive, o: OgeIstegi, s: KurulumSecenek): Promise<string> {
  // an earlier try with this islemId may have arrived (its answer lost)
  const [onceki] = await drive.islemleAra(o.ebeveynId, o.ad, o.islemId);
  if (onceki) return onceki.id;

  // the id first, so a retry can't make a second one; without it every retry looks for the islemId first
  let id: string | undefined;
  try { id = await drive.yeniId(); } catch (e) { if (!(e instanceof DriveError) && !(e instanceof TypeError)) throw e; }
  const meta: YeniOgeMeta = {
    ...(id ? { id } : {}),
    name: o.ad, parents: [o.ebeveynId], mimeType: o.mimeType,
    appProperties: { ...o.appProps, defter: '1', defterIslem: o.islemId }
  };
  const max = s.deneme ?? 3;
  for (let deneme = 1; ; deneme++) {
    try {
      return (await drive.olustur(meta, o.icerik)).id;
    } catch (e) {
      if (e instanceof IdZatenVar && id) return await bizimMi(drive, id, o);
      if (!tekrarlanabilir(e)) throw e;
      if (deneme >= max) throw new KurulumAgHatasi();
    }
    await bekle(s.bekleMs ?? 2000);
    if (!id) {
      const [bulunan] = await drive.islemleAra(o.ebeveynId, o.ad, o.islemId);
      if (bulunan) return bulunan.id;
    }
  }
}

// ---- kitaplikKur ----

export interface KitaplikKurSecenek extends KurulumSecenek {
  islemId: string;
  mod: KokModu;               // aktifKapsam() === 'tam' ? 'tam' : 'dar'
  kilitAcik: boolean;         // ?kurulum=1
  yazabilir: () => boolean;   // signed in and not the sample library
}

export interface KurulumSonucu {
  kokId: string;
  kaynak: KokKaynagi;
  zatenVardi: boolean;          // nothing was created
  olusturulan: string[];        // in order: KOK_ADI, 'kitaplar', 'kitaplik.json'
  uyari?: string;
}

// The same as the library a missing kitaplik.json gives today: 5 empty shelves, the default room.
export const bosKitaplikJson = (): Record<string, unknown> => libraryToJson(parseLibrary({ raflar: [{}, {}, {}, {}, {}] }));

export async function kitaplikKur(drive: KurulumDrive, s: KitaplikKurSecenek): Promise<KurulumSonucu> {
  // checks without any request
  if (!s.kilitAcik) throw new KurulumKilitli();
  if (!s.yazabilir()) throw new KurulumYazmaYok();
  try {
    const kok = await kokBul(drive, s.mod);
    // the owner's old "Kitaplık" (whole or not): no writing, no second root
    if (kok.tur !== 'yok' && kok.tur !== 'cokKok' && kok.kaynak === 'ad') return { kokId: kok.kok.id, kaynak: 'ad', zatenVardi: true, olusturulan: [] };

    const uyari = kok.tur !== 'yok' ? kok.uyari : undefined;
    const eksik: KokEksik[] = kok.tur === 'yok' ? ['kitaplar', 'kitaplik.json'] : kok.tur === 'bulundu' ? [] : kok.eksik;
    const olusturulan: string[] = [];
    let kokId: string;
    if (kok.tur === 'yok') {
      kokId = await olusturOge(drive, { ad: KOK_ADI, ebeveynId: 'root', mimeType: FOLDER_MIME, appProps: { defterKok: '1' }, islemId: s.islemId }, s);
      olusturulan.push(KOK_ADI);
    } else {
      kokId = kok.kok.id;
    }
    if (eksik.includes('kitaplar')) {
      await olusturOge(drive, { ad: 'kitaplar', ebeveynId: kokId, mimeType: FOLDER_MIME, islemId: s.islemId }, s);
      olusturulan.push('kitaplar');
    }
    // last: the set-up is done once this file is there
    if (eksik.includes('kitaplik.json')) {
      await olusturOge(drive, {
        ad: 'kitaplik.json', ebeveynId: kokId, mimeType: 'application/json',
        icerik: JSON.stringify(bosKitaplikJson(), null, 2), islemId: s.islemId
      }, s);
      olusturulan.push('kitaplik.json');
    }
    return { kokId, kaynak: 'defterKok', zatenVardi: !olusturulan.length, olusturulan, ...(uyari ? { uyari } : {}) };
  } catch (e) {
    if (e instanceof TypeError) throw new KurulumAgHatasi();   // fetch failed: no connection
    if (e instanceof DriveError && e.status === 403) throw new KurulumIzinYok();
    if (tekrarlanabilir(e)) throw new KurulumAgHatasi();
    throw e;
  }
}
