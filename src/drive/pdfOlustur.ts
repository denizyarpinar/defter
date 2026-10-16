import { isSampleId } from '../okuma/ornekKaynak';
import { DriveError, driveFetch, FOLDER_MIME, ok, qv } from './drive';
import type { DriveLocation } from './driveLibrary';
import { multipartPdfBody, readResult, RESUMABLE_LIMIT, resumableUpload, UPLOAD, type UploadResult } from './pdfYazici';

// Creates a NEW PDF in Drive (Faz 5, task 5.5). Nothing in the app calls this yet (5.7 will).
// Rules (CLAUDE.md → Faz 5 → Yeni dosya):
// - Only inside the active tree: Kitaplık/kitaplar/<kitap>/ (its subfolders too). Only PDF.
// - Same name in the folder → AyniIsimVar, nothing is created and nothing is renamed.
// - No duplicate on retry: the id is taken first (files.generateIds) and every retry uploads with that id.
//   Drive then answers "already exists" and the file with that id is checked (size). Listing the folder
//   again is only a backup check (Drive's list can be late).
// - Never deletes, never writes over a file. Marked with appProperties defter: "1".
// - Temporary lock (until the real tests in 5.9): works only with ?dosyaOlustur=1 in the URL.

export type OlusanPdf = UploadResult;   // id, modifiedTime, headRevisionId

export interface KlasorBilgisi { id: string; name: string; mimeType: string; trashed: boolean; parents: string[]; canAddChildren: boolean }
export interface KlasorOgesi { id: string; name: string }
export interface YeniPdfMeta { id: string; name: string; parents: string[]; mimeType: 'application/pdf'; appProperties: { defter: '1' } }

export interface PdfOlusturDrive {
  klasorBilgisi(id: string): Promise<KlasorBilgisi>;
  cocuklar(parentId: string): Promise<KlasorOgesi[]>;          // every page, not in the trash
  yeniId(): Promise<string>;                                    // files.generateIds
  yukleMultipart(meta: YeniPdfMeta, bytes: Uint8Array): Promise<OlusanPdf>;
  yukleResumable(meta: YeniPdfMeta, bytes: Uint8Array): Promise<OlusanPdf>;
  dosyaBilgisi(id: string): Promise<OlusanPdf & { size?: string }>;
}

// ---- errors (Turkish, say what to do) ----

export class DosyaOlusturKilitli extends Error {
  constructor() { super('Yeni dosya oluşturma şimdilik kilitli. Denemek için adresin sonuna ?dosyaOlustur=1 ekle ve sayfayı yenile.'); }
}

export class DosyaYazmaYok extends Error {
  constructor() { super('Drive kitaplığı açık değil, dosya oluşturulmadı. Google ile giriş yap ve kitaplığın yüklenmesini bekle.'); }
}

export class PdfDegil extends Error {
  constructor(neden: string) { super(`Sadece PDF dosyası oluşturulabilir: ${neden}. Dosyayı PDF olarak hazırlayıp tekrar dene.`); }
}

export class YerDisi extends Error {
  constructor() { super('Bu klasöre dosya oluşturulamaz. Yeni dosyalar sadece Drive\'daki Kitaplık/kitaplar/<kitap>/ klasörü ve alt klasörlerine konur.'); }
}

export class YetkiYok extends Error {
  constructor() { super('Bu klasöre dosya ekleme iznin yok. Drive\'da klasörün sahibi ya da düzenleyicisi olduğundan emin ol.'); }
}

export class AyniIsimVar extends Error {
  readonly mevcutId: string;
  constructor(ad: string, mevcutId: string) {
    super(`Bu klasörde "${ad}" adında bir dosya zaten var; üzerine yazılmadı. Var olan dosyayı kullan ya da başka bir ad seç.`);
    this.mevcutId = mevcutId;
  }
}

export class IdAlinamadi extends Error {
  constructor() { super('Drive yeni dosya için kimlik vermedi, dosya oluşturulmadı. Biraz bekleyip tekrar dene.'); }
}

export class DosyaOlusturAgHatasi extends Error {
  constructor() { super('PDF Drive\'a yüklenemedi (bağlantı ya da Drive sorunu). İnternet bağlantını kontrol edip tekrar dene; tekrar denemede ikinci dosya oluşmaz.'); }
}

// Drive says a file with this id already exists (an earlier try did arrive).
export class IdZatenVar extends Error {
  constructor() { super('Bu kimlikle bir dosya zaten var.'); }
}

// ---- the real Drive ----

const WHAT = 'PDF oluşturulurken';
const FIELDS = 'id,modifiedTime,headRevisionId';

// Upload answers: "already exists" (409, or the text in the error) → IdZatenVar, other errors → DriveError.
async function yuklemeYaniti(res: Response): Promise<Response> {
  if (res.ok) return res;
  const text = await res.text().catch(() => '');
  if (res.status === 409 || /already exists/i.test(text)) throw new IdZatenVar();
  throw new DriveError(res.status, WHAT);
}

export const drivePdfOlusturApi: PdfOlusturDrive = {
  async klasorBilgisi(id) {
    const res = await ok(await driveFetch(`files/${encodeURIComponent(id)}?fields=id,name,mimeType,trashed,parents,capabilities/canAddChildren`), WHAT);
    const j = await res.json() as { id?: string; name?: string; mimeType?: string; trashed?: boolean; parents?: string[]; capabilities?: { canAddChildren?: boolean } };
    return {
      id: j.id ?? id, name: j.name ?? '', mimeType: j.mimeType ?? '', trashed: j.trashed === true,
      parents: j.parents ?? [], canAddChildren: j.capabilities?.canAddChildren === true
    };
  },
  async cocuklar(parentId) {
    const out: KlasorOgesi[] = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({ q: `'${qv(parentId)}' in parents and trashed = false`, fields: 'nextPageToken,files(id,name)', pageSize: '1000' });
      if (pageToken) params.set('pageToken', pageToken);
      const j = await (await ok(await driveFetch('files?' + params), WHAT)).json() as { files?: KlasorOgesi[]; nextPageToken?: string };
      out.push(...(j.files ?? []));
      pageToken = j.nextPageToken ?? '';
    } while (pageToken);
    return out;
  },
  async yeniId() {
    const res = await ok(await driveFetch('files/generateIds?count=1&space=drive&type=files'), WHAT);
    const id = (await res.json() as { ids?: string[] }).ids?.[0];
    if (!id) throw new IdAlinamadi();
    return id;
  },
  async yukleMultipart(meta, bytes) {
    const { body, contentType } = multipartPdfBody(meta, bytes);
    const res = await yuklemeYaniti(await driveFetch(`${UPLOAD}files?uploadType=multipart&fields=${FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body
    }));
    return readResult(res);
  },
  yukleResumable(meta, bytes) {
    return resumableUpload(`${UPLOAD}files?uploadType=resumable&fields=${FIELDS}`, 'POST', JSON.stringify(meta), bytes, yuklemeYaniti);
  },
  async dosyaBilgisi(id) {
    const res = await ok(await driveFetch(`files/${encodeURIComponent(id)}?fields=${FIELDS},size`), WHAT);
    const j = await res.json() as Partial<OlusanPdf> & { size?: string };
    return { id: j.id ?? id, modifiedTime: j.modifiedTime ?? '', headRevisionId: j.headRevisionId ?? '', size: j.size };
  }
};

// ---- createPdf ----

export interface CreatePdfSecenek {
  kilitAcik?: () => boolean;    // default: ?dosyaOlustur=1 in the URL
  bekleMs?: number;             // wait before a retry
  deneme?: number;              // upload tries at most
}

const urlKilidiAcik = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('dosyaOlustur') === '1';
const MAX_DERINLIK = 10;
const ayniAd = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();   // the reader matches names this way too

// no connection (fetch failed) or Drive busy: worth another try
const tekrarlanabilir = (e: unknown) => e instanceof TypeError || (e instanceof DriveError && (e.status === 429 || e.status >= 500));

function pdfMi(ad: string, bytes: Uint8Array): void {
  if (!ad.trim() || ad !== ad.trim()) throw new PdfDegil('dosya adı boş ya da başında/sonunda boşluk var');
  if (ad.includes('/')) throw new PdfDegil('dosya adında "/" olamaz');
  if (!/\.pdf$/i.test(ad) || ad.length <= 4) throw new PdfDegil('dosya adı .pdf ile bitmeli');
  const head = String.fromCharCode(...bytes.subarray(0, 5));
  if (head !== '%PDF-') throw new PdfDegil('içerik bir PDF değil');
}

// parentId must be <kitap> or one of its subfolders: … → <kitap> → kitaplar → Kitaplık (rootId).
// Returns the target folder (for its capabilities).
async function yerKontrol(drive: PdfOlusturDrive, yer: DriveLocation, parentId: string): Promise<KlasorBilgisi> {
  const zincir: KlasorBilgisi[] = [];
  let id = parentId;
  for (let i = 0; i < MAX_DERINLIK; i++) {
    if (id === yer.rootId) break;
    const k = await drive.klasorBilgisi(id);
    if (k.mimeType !== FOLDER_MIME || k.trashed || k.parents.length !== 1) throw new YerDisi();
    zincir.push(k);
    id = k.parents[0];
  }
  if (id !== yer.rootId || zincir.length < 2) throw new YerDisi();
  const kitaplar = zincir[zincir.length - 1];
  const kitap = zincir[zincir.length - 2];
  if (kitaplar.name !== 'kitaplar' || ![...yer.bookFolderIds.values()].includes(kitap.id)) throw new YerDisi();
  return zincir[0];
}

// The file with this id is there: accept it only if it is exactly ours (same size).
async function olusmusDosya(drive: PdfOlusturDrive, id: string, bytes: Uint8Array): Promise<OlusanPdf> {
  const f = await drive.dosyaBilgisi(id);
  if (Number(f.size) !== bytes.byteLength) throw new DosyaOlusturAgHatasi();
  return { id: f.id, modifiedTime: f.modifiedTime, headRevisionId: f.headRevisionId };
}

// yer: the active Drive library (main.ts: writer() ? driveLoc : null); null → nothing is written.
export async function createPdf(
  drive: PdfOlusturDrive, yer: DriveLocation | null, parentId: string, ad: string, bytes: Uint8Array,
  secenek: CreatePdfSecenek = {}
): Promise<OlusanPdf> {
  // checks without any request
  if (!(secenek.kilitAcik ?? urlKilidiAcik)()) throw new DosyaOlusturKilitli();
  if (!yer || isSampleId(parentId)) throw new DosyaYazmaYok();
  pdfMi(ad, bytes);
  try {
    const hedef = await yerKontrol(drive, yer, parentId);
    if (!hedef.canAddChildren) throw new YetkiYok();
    const ayni = (await drive.cocuklar(parentId)).find(f => ayniAd(f.name, ad));
    if (ayni) throw new AyniIsimVar(ad, ayni.id);

    let id: string;
    try { id = await drive.yeniId(); } catch (e) { throw e instanceof IdAlinamadi || tekrarlanabilir(e) ? new IdAlinamadi() : e; }
    const meta: YeniPdfMeta = { id, name: ad, parents: [parentId], mimeType: 'application/pdf', appProperties: { defter: '1' } };
    const yukle = () => bytes.byteLength > RESUMABLE_LIMIT ? drive.yukleResumable(meta, bytes) : drive.yukleMultipart(meta, bytes);
    const max = secenek.deneme ?? 3;
    for (let deneme = 1; ; deneme++) {
      try {
        return await yukle();
      } catch (e) {
        if (e instanceof IdZatenVar) return await olusmusDosya(drive, id, bytes);
        if (!tekrarlanabilir(e)) throw e;
        if (deneme >= max) throw new DosyaOlusturAgHatasi();
      }
      await new Promise(r => setTimeout(r, secenek.bekleMs ?? 2000));
      // backup check only (the list can be late): someone else's file with this name → stop; ours → done
      let ogeler: KlasorOgesi[] | null = null;
      try { ogeler = await drive.cocuklar(parentId); } catch (e) { if (!tekrarlanabilir(e)) throw e; }
      const bulunan = ogeler?.find(f => ayniAd(f.name, ad));
      if (bulunan && bulunan.id !== id) throw new AyniIsimVar(ad, bulunan.id);
      if (bulunan) return await olusmusDosya(drive, id, bytes);
    }
  } catch (e) {
    throw e instanceof TypeError ? new DosyaOlusturAgHatasi() : e;   // fetch failed: no connection
  }
}
