import { libraryToJson } from '../model/serialize';
import { parseLibrary } from '../model/parse';
import { DriveError, driveFetch, FOLDER_MIME, ok, qv } from './drive';
import { driveKokApi, KOK_ADI, kokBul, type KokDrive, type KokEksik, type KokKaynagi, type KokModu } from './kok';
import { IdZatenVar, tekrarlanabilir } from './pdfOlustur';
import { multipartPdfBody, UPLOAD } from './pdfYazici';

// Task 6.K2a: sets up an empty library in Drive: "Defter Library" (in My Drive's root) → kitaplar/ → kitaplik.json.
// Rules (CLAUDE.md → Faz 6.K):
// - Only under the app's own root (appProperties defterKok = "1"), only when asked (a tap; today the dev helper),
//   in a writable context (kilitAcik). Unavailable context → KurulumKilitli before any request.
// - Everything created carries appProperties { defter: "1", defterIslem: <islemId> } (the root also defterKok: "1").
// - "Is it there?" first, no duplicates: the root is looked up (kokBul), missing parts only ('yarim'); every item
//   is looked up by its defterIslem first; the id is taken beforehand (files.generateIds) and every retry uses it
//   (Drive's 409 "already exists" = an earlier try did arrive).
// - The owner's old "Kitaplık" (found by name) is never written to and never marked; with it there is no new root.
// - Creates only. No files.delete, no update. kitaplik.json is created last: it marks the set-up as done.
// Task 6.K3: with the "Örnek bir kitap da koy" box, a sample book (the sample library's programlamaya-giris, the
// copyright-free demo PDFs) goes into kitaplar/ before kitaplik.json, and onto shelf 1. Its items are also marked
// defterOrnek = "1" and are looked up by that mark (not by islemId), so "Kurulumu tamamla" never makes a second one.
// A failing sample never stops the set-up: kitaplik.json is then written without it (ornekHata).

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
  olustur(meta: YeniOgeMeta, icerik?: string | Uint8Array): Promise<{ id: string }>;   // a folder, a JSON file (string) or a PDF (bytes)
  islemleAra(ebeveynId: string, ad: string, islemId: string): Promise<KurulumOgesi[]>;
  cocukAra(ebeveynId: string, ad: string): Promise<KurulumOgesi[]>;          // by name only, with appProperties (6.K3)
  ogeBilgisi(id: string): Promise<KurulumOgesi>;
}

// ---- errors (Turkish, say what to do) ----

export class KurulumKilitli extends Error {
  constructor() { super('Kurulum kullanılamıyor: hiçbir şey oluşturulmadı. Google ile giriş yap ve tekrar dene.'); }
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

export class OrnekAdDolu extends Error {
  constructor(ad: string) { super(`Örnek kitap eklenmedi: "${ad}" adında başka bir dosya ya da klasör var, ona dokunulmadı.`); }
}

export class OrnekKaynakYok extends Error {
  constructor(ne: string) { super(`Örnek kitabın dosyaları yüklenemedi (${ne}). Sayfayı yenileyip tekrar dene.`); }
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
    if (icerik instanceof Uint8Array) {
      const { body, contentType } = multipartPdfBody(meta, icerik);
      res = await driveFetch(`${UPLOAD}files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': contentType }, body });
    } else if (icerik === undefined) {
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
  async cocukAra(ebeveynId, ad) {
    const q = `'${qv(ebeveynId)}' in parents and name = '${qv(ad)}' and trashed = false`;
    const params = new URLSearchParams({ q, fields: 'files(id,name,appProperties)', pageSize: '10' });
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
  icerik?: string | Uint8Array;
  appProps?: Record<string, string>;
  islemId: string;
  ornek?: boolean;      // a sample book item (6.K3): marked and looked up by defterOrnek
}

const bekle = (ms: number) => new Promise(r => setTimeout(r, ms));

const ornekMi = (f: KurulumOgesi) => f.appProperties?.defterOrnek === '1';

// An item with the id Drive says exists: ours only if it has our name and islemId (a sample item: defterOrnek).
async function bizimMi(drive: KurulumDrive, id: string, o: OgeIstegi): Promise<string> {
  const f = await drive.ogeBilgisi(id);
  if (f.name !== o.ad || (o.ornek ? !ornekMi(f) : f.appProperties?.defterIslem !== o.islemId)) throw new KurulumBeklenmedik(`"${o.ad}" için alınan kimlik başka bir dosyada`);
  return f.id;
}

// The item an earlier try made. A sample item: any earlier sample (any islemId); the same name without the mark is
// someone else's → OrnekAdDolu, nothing is written next to it.
async function oncekiOge(drive: KurulumDrive, o: OgeIstegi): Promise<string | undefined> {
  if (!o.ornek) return (await drive.islemleAra(o.ebeveynId, o.ad, o.islemId))[0]?.id;
  const ayni = await drive.cocukAra(o.ebeveynId, o.ad);
  const bizim = ayni.find(ornekMi);
  if (bizim) return bizim.id;
  if (ayni.length) throw new OrnekAdDolu(o.ad);
  return undefined;
}

async function olusturOge(drive: KurulumDrive, o: OgeIstegi, s: KurulumSecenek): Promise<string> {
  // an earlier try with this islemId may have arrived (its answer lost)
  const onceki = await oncekiOge(drive, o);
  if (onceki) return onceki;

  // the id first, so a retry can't make a second one; without it every retry looks for the islemId first
  let id: string | undefined;
  try { id = await drive.yeniId(); } catch (e) { if (!(e instanceof DriveError) && !(e instanceof TypeError)) throw e; }
  const meta: YeniOgeMeta = {
    ...(id ? { id } : {}),
    name: o.ad, parents: [o.ebeveynId], mimeType: o.mimeType,
    appProperties: { ...o.appProps, defter: '1', defterIslem: o.islemId, ...(o.ornek ? { defterOrnek: '1' } : {}) }
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
      const bulunan = await oncekiOge(drive, o);
      if (bulunan) return bulunan;
    }
  }
}

// ---- the sample book (6.K3) ----

export const ORNEK_KITAP = 'programlamaya-giris';

// Where the sample book comes from: the sample library in public/ (tests: a fake)
export interface OrnekKaynak {
  kitapJson(): Promise<unknown>;                                  // ornek/kitaplar/<ORNEK_KITAP>/kitap.json
  klasorler(): Promise<Record<string, Record<string, string>>>;   // index.json: topic folder → { file in it → demo PDF }
  pdf(yol: string): Promise<Uint8Array>;                          // a demo PDF ("demo/demo-dikey.pdf")
}

async function getir(yol: string): Promise<Response> {
  let res: Response;
  try { res = await fetch(import.meta.env.BASE_URL + yol); } catch { throw new OrnekKaynakYok(yol); }
  if (!res.ok) throw new OrnekKaynakYok(yol);
  return res;
}

// The same origin as the app; every demo PDF is fetched once (the sample uses the same 3 files 9 times)
export function webOrnekKaynak(): OrnekKaynak {
  const pdfler = new Map<string, Promise<Uint8Array>>();
  return {
    kitapJson: async () => (await getir(`ornek/kitaplar/${ORNEK_KITAP}/kitap.json`)).json(),
    klasorler: async () => {
      const j = await (await getir('ornek/index.json')).json() as { klasorler?: Record<string, Record<string, Record<string, string>>> };
      const k = j.klasorler?.[ORNEK_KITAP];
      if (!k) throw new OrnekKaynakYok('index.json');
      return k;
    },
    pdf: yol => {
      let p = pdfler.get(yol);
      if (!p) {
        p = getir(yol).then(async r => new Uint8Array(await r.arrayBuffer()));
        p.catch(() => pdfler.delete(yol));
        pdfler.set(yol, p);
      }
      return p;
    }
  };
}

export type OrnekOgesi =
  | { tur: 'klasor'; yol: string }               // '' = the book's own folder
  | { tur: 'pdf'; yol: string; kaynak: string }
  | { tur: 'json' };                             // kitap.json, last

const ebeveyn = (yol: string) => yol.includes('/') ? yol.slice(0, yol.lastIndexOf('/')) : '';
const sonAd = (yol: string) => yol.slice(yol.lastIndexOf('/') + 1);

// The order of creating: the book's folder, every folder (a parent before its children), the PDFs, kitap.json.
export function ornekPlani(klasorler: Record<string, Record<string, string>>): OrnekOgesi[] {
  const dizinler: string[] = [''];
  const pdfler: OrnekOgesi[] = [];
  for (const [konu, dosyalar] of Object.entries(klasorler)) {
    for (const [dosya, kaynak] of Object.entries(dosyalar)) {
      const yol = `${konu}/${dosya}`;
      const parcalar = yol.split('/');
      for (let i = 1; i < parcalar.length; i++) {
        const d = parcalar.slice(0, i).join('/');
        if (!dizinler.includes(d)) dizinler.push(d);
      }
      pdfler.push({ tur: 'pdf', yol, kaynak });
    }
  }
  return [...dizinler.map((yol): OrnekOgesi => ({ tur: 'klasor', yol })), ...pdfler, { tur: 'json' }];
}

// The sample library's kitap.json, as a new reader's book: nothing read yet, no ribbon. Every other field as it is.
export function ornekKitapJson(ham: unknown): Record<string, unknown> {
  const o = (ham && typeof ham === 'object' ? ham : {}) as Record<string, unknown>;
  const uniteler = Array.isArray(o.uniteler) ? o.uniteler.map(u => {
    const un = (u && typeof u === 'object' ? u : {}) as Record<string, unknown>;
    const konular = Array.isArray(un.konular)
      ? un.konular.map(k => ({ ...(k && typeof k === 'object' ? k : {}), durum: 'okunmadi' }))
      : [];
    return { ...un, konular };
  }) : [];
  return { ...o, sonAcilis: null, kurdele: null, uniteler };
}

export interface OrnekKitapSecenek extends KurulumSecenek {
  kitaplarId: string;
  islemId: string;
  kaynak: OrnekKaynak;
  ilerleme?: (i: number, n: number) => void;   // after every item (found or made)
}

// kitaplar/<ORNEK_KITAP>/ with its folders, PDFs and (last) kitap.json. 'zatenVardi': nothing had to be made.
export async function ornekKitapKur(drive: KurulumDrive, s: OrnekKitapSecenek): Promise<'eklendi' | 'zatenVardi'> {
  const ham = await s.kaynak.kitapJson();
  const plan = ornekPlani(await s.kaynak.klasorler());
  const n = plan.length;
  const oge = (ad: string, ebeveynId: string, mimeType: string, icerik?: string | Uint8Array): OgeIstegi =>
    ({ ad, ebeveynId, mimeType, icerik, islemId: s.islemId, ornek: true });

  // the book's folder; with our kitap.json in it the sample is whole already
  const kitapOgesi = oge(ORNEK_KITAP, s.kitaplarId, FOLDER_MIME);
  const vardi = await oncekiOge(drive, kitapOgesi);
  if (vardi && (await drive.cocukAra(vardi, 'kitap.json')).some(ornekMi)) {
    s.ilerleme?.(n, n);
    return 'zatenVardi';
  }
  const klasorId = new Map<string, string>([['', vardi ?? await olusturOge(drive, kitapOgesi, s)]]);
  let olustu = !vardi;
  let i = 1;
  s.ilerleme?.(i, n);
  for (const p of plan.slice(1)) {
    let o: OgeIstegi;
    if (p.tur === 'klasor') o = oge(sonAd(p.yol), klasorId.get(ebeveyn(p.yol))!, FOLDER_MIME);
    else if (p.tur === 'pdf') o = oge(sonAd(p.yol), klasorId.get(ebeveyn(p.yol))!, 'application/pdf');
    else o = oge('kitap.json', klasorId.get('')!, 'application/json', JSON.stringify(ornekKitapJson(ham), null, 2));
    let id = await oncekiOge(drive, o);
    if (!id) {
      if (p.tur === 'pdf') o.icerik = await s.kaynak.pdf(p.kaynak);   // fetched only when it has to be made
      id = await olusturOge(drive, o, s);
      olustu = true;
    }
    if (p.tur === 'klasor') klasorId.set(p.yol, id);
    s.ilerleme?.(++i, n);
  }
  return olustu ? 'eklendi' : 'zatenVardi';
}

// ---- kitaplikKur ----

export interface KitaplikKurSecenek extends KurulumSecenek {
  islemId: string;
  mod: KokModu;               // aktifKapsam() === 'tam' ? 'tam' : 'dar'
  kilitAcik: boolean;         // writable context, independent of URL parameters
  yazabilir: () => boolean;   // signed in and not the sample library
  ornek?: { kaynak: OrnekKaynak; ilerleme?: (i: number, n: number) => void };   // the box "Örnek bir kitap da koy" (6.K3)
}

export interface KurulumSonucu {
  kokId: string;
  kaynak: KokKaynagi;
  zatenVardi: boolean;          // nothing was created
  olusturulan: string[];        // in order: KOK_ADI, 'kitaplar', 'kitaplik.json'
  uyari?: string;
  ornek?: 'eklendi' | 'zatenVardi';   // the sample book is there (6.K3)
  ornekHata?: string;                  // the sample book failed; the set-up went on without it
}

// The same as the library a missing kitaplik.json gives today: 5 empty shelves, the default room.
// With the sample book (6.K3): the same, the book on shelf 1.
export const bosKitaplikJson = (ornekKitap?: string): Record<string, unknown> =>
  libraryToJson(parseLibrary({ raflar: [ornekKitap ? { kitaplar: [ornekKitap] } : {}, {}, {}, {}, {}] }));

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
    let kitaplarId: string | undefined;
    if (eksik.includes('kitaplar')) {
      kitaplarId = await olusturOge(drive, { ad: 'kitaplar', ebeveynId: kokId, mimeType: FOLDER_MIME, islemId: s.islemId }, s);
      olusturulan.push('kitaplar');
    }
    // the sample book (6.K3): before kitaplik.json, so it can stand on shelf 1; its failure doesn't stop the set-up
    let ornek: KurulumSonucu['ornek'];
    let ornekHata: string | undefined;
    if (s.ornek) {
      try {
        kitaplarId ??= (await drive.kokCocuklari(kokId)).find(c => c.name === 'kitaplar' && c.mimeType === FOLDER_MIME)?.id;
        if (!kitaplarId) throw new KurulumBeklenmedik('"kitaplar" klasörü bulunamadı');
        ornek = await ornekKitapKur(drive, { ...s, kitaplarId, kaynak: s.ornek.kaynak, ilerleme: s.ornek.ilerleme });
      } catch (e) {
        ornekHata = e instanceof Error ? e.message : String(e);
      }
    }
    // last: the set-up is done once this file is there
    if (eksik.includes('kitaplik.json')) {
      await olusturOge(drive, {
        ad: 'kitaplik.json', ebeveynId: kokId, mimeType: 'application/json',
        icerik: JSON.stringify(bosKitaplikJson(ornek ? ORNEK_KITAP : undefined), null, 2), islemId: s.islemId
      }, s);
      olusturulan.push('kitaplik.json');
    }
    return {
      kokId, kaynak: 'defterKok', zatenVardi: !olusturulan.length && ornek !== 'eklendi', olusturulan,
      ...(uyari ? { uyari } : {}), ...(ornek ? { ornek } : {}), ...(ornekHata !== undefined ? { ornekHata } : {})
    };
  } catch (e) {
    if (e instanceof TypeError) throw new KurulumAgHatasi();   // fetch failed: no connection
    if (e instanceof DriveError && e.status === 403) throw new KurulumIzinYok();
    if (tekrarlanabilir(e)) throw new KurulumAgHatasi();
    throw e;
  }
}
