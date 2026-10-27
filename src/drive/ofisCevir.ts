import { ofisAlt } from '../defter/dosyaTuru';
import { isSampleId } from '../okuma/ornekKaynak';
import { driveFetch, ok } from './drive';
import type { DriveLocation } from './driveLibrary';
import { DosyaYazmaYok, drivePdfOlusturApi, yerKontrol } from './pdfOlustur';
import { RESUMABLE_LIMIT, UPLOAD } from './pdfYazici';
import { t } from '../dil';

// Task 6.1b: Word / PowerPoint → PDF with Drive (core only, no UI yet; 6.1c adds the panel).
// Rules (CLAUDE.md → Faz 6):
// - The file is uploaded with conversion as a TEMPORARY Google file into the target topic folder
//   (no new folder), named "~çeviri – <name>", marked appProperties defter / defterGecici / defterIslem.
// - The PDF comes from files.export; then the temporary file goes to the trash (trashed=true, 30 days to undo).
//   Only a file that is still marked defterGecici, is a Google Doc / Slides and not trashed yet is trashed;
//   files.delete is never used. A failed trashing does not spoil the PDF (copeAtildi: false).
// - Before every conversion, temporary files older than 1 hour (left from a crash) are swept to the trash.
//   A failed sweep does not stop the conversion (console.warn, on purpose).
// - Only in the Drive library (yer not null). The temporary lock was removed in task 6.1e.

export const GOOGLE_DOC = 'application/vnd.google-apps.document';
export const GOOGLE_SLIDES = 'application/vnd.google-apps.presentation';
export const GECICI_ON_EK = '~çeviri – ';   // dil-kontrol: yoksay
export const SUPURME_YASI_MS = 60 * 60 * 1000;
export const SUPURME_EN_FAZLA = 20;

export type CeviriTuru = 'document' | 'presentation';
const GOOGLE_TURU: Record<CeviriTuru, string> = { document: GOOGLE_DOC, presentation: GOOGLE_SLIDES };
const googleTuruMu = (mime: string | undefined) => mime === GOOGLE_DOC || mime === GOOGLE_SLIDES;

// the upload's own type by extension (browsers often give no type for .odp / .ppt / .rtf)
const KAYNAK_MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  odp: 'application/vnd.oasis.opendocument.presentation'
};

// docx/doc/odt/rtf → document; pptx/ppt/odp → presentation; key, pages, anything else → null.
// Same table as dosyaTuru (ofisAlt), so "cevrilebilir" there and this always agree.
export function cevirTuru(ad: string, mime: string): CeviriTuru | null {
  const alt = ofisAlt(ad, mime);
  return alt === 'word' ? 'document' : alt === 'powerpoint' ? 'presentation' : null;
}

function kaynakMimesi(ad: string, mime: string): string {
  const uzanti = ad.trim().toLowerCase().split('.').pop() ?? '';
  return KAYNAK_MIME[uzanti] ?? (mime || 'application/octet-stream');
}

// ---- errors (Turkish, say what to do) ----

export class OfisDesteklenmiyor extends Error {
  constructor(ad: string) { super(t('ofis.desteklenmiyor', { ad })); }
}

export class OfisCokBuyuk extends Error {
  constructor() { super(t('ofis.cokBuyuk')); }
}

// neden: izin = the Google permission (scope) is not enough ("Tekrar çevir" can't help);
// ag = no connection; sunucu = Drive answered with an error (429 / 5xx / a missing answer)
export type OfisYuklenemediNeden = 'izin' | 'ag' | 'sunucu';

export class OfisYuklenemedi extends Error {
  readonly durum?: number;
  readonly neden: OfisYuklenemediNeden;
  constructor(durum?: number, neden: OfisYuklenemediNeden = durum ? 'sunucu' : 'ag') {
    super(neden === 'izin' ? t('ofis.izin')
      : t('ofis.yuklenemedi', { durum: durum ? t('ofis.hataKodu', { durum }) : '' }));
    this.durum = durum;
    this.neden = neden;
  }
}

export class OfisCevrilemedi extends Error {
  readonly durum?: number;
  constructor(durum?: number) {
    super(t('ofis.cevrilemedi', { durum: durum ? t('ofis.hataKodu', { durum }) : '' }));
    this.durum = durum;
  }
}

export class OfisIptal extends Error {
  constructor() { super(t('ofis.iptal')); }
}

export class OfisGeciciDegil extends Error {
  constructor() { super(t('ofis.geciciDegil')); }
}

// ---- options ----

export interface OfisSecenek {
  simdi?: () => number;         // clock for the sweep (tests)
}

const iptalMi = (e: unknown) => e instanceof Error && e.name === 'AbortError';
const iptalKontrol = (signal?: AbortSignal) => { if (signal?.aborted) throw new OfisIptal(); };
const fileUrl = (id: string) => `files/${encodeURIComponent(id)}`;

// ---- trashing (the only exception to "nothing is deleted") ----

const COP = t('ofis.copeAtilirken');

// Reads the file first; trashes it only if it is our temporary Google file and not trashed yet.
export async function copeAtGecici(id: string): Promise<void> {
  const res = await ok(await driveFetch(`${fileUrl(id)}?fields=id,mimeType,trashed,appProperties`), COP);
  const j = await res.json() as { mimeType?: string; trashed?: boolean; appProperties?: Record<string, string> };
  if (j.appProperties?.defterGecici !== '1' || !googleTuruMu(j.mimeType) || j.trashed !== false) throw new OfisGeciciDegil();
  await ok(await driveFetch(`${fileUrl(id)}?fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ trashed: true })
  }), COP);
}

// Temporary files older than 1 hour (at most 20) → trash. Returns how many were trashed.
// One file failing does not stop the others.
export async function supurGecici(simdi: number): Promise<number> {
  const sinir = simdi - SUPURME_YASI_MS;
  const q = `appProperties has { key='defterGecici' and value='1' } and (mimeType='${GOOGLE_DOC}' or mimeType='${GOOGLE_SLIDES}')`
    + ` and trashed=false and createdTime < '${new Date(sinir).toISOString()}'`;
  const params = new URLSearchParams({ q, fields: 'files(id,name,mimeType,createdTime)', pageSize: String(SUPURME_EN_FAZLA) });
  const res = await ok(await driveFetch('files?' + params), t('ofis.eskiAranirken'));
  const files = (await res.json() as { files?: { id: string; name?: string; createdTime?: string }[] }).files ?? [];
  let n = 0;
  for (const f of files.slice(0, SUPURME_EN_FAZLA)) {
    const t = Date.parse(f.createdTime ?? '');
    if (!(t < sinir)) continue;   // newer than 1 hour (or no date): maybe another conversion is using it
    try {
      await copeAtGecici(f.id);
      n++;
    } catch (e) {
      console.warn(`Eski geçici çeviri dosyası çöpe atılamadı (${f.name ?? f.id}): ${e instanceof Error ? e.message : e}`);
    }
  }
  return n;
}

// trashing after a conversion: a failure only warns
async function copeAtSessiz(id: string): Promise<boolean> {
  try {
    await copeAtGecici(id);
    return true;
  } catch (e) {
    console.warn(`Geçici çeviri dosyası çöpe atılamadı (${id}); bir sonraki çeviride süpürülür: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

// ---- upload with conversion, export ----

interface GeciciMeta { name: string; parents: string[]; mimeType: string; appProperties: { defter: '1'; defterGecici: '1'; defterIslem: string } }

async function yuklemeHatasi(res: Response): Promise<Error> {
  const text = await res.text().catch(() => '');
  if (/insufficient.*scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(text)) return new OfisYuklenemedi(res.status, 'izin');
  if (res.status === 400) return new OfisCevrilemedi(res.status);   // Drive could not turn the file into a Google file
  return new OfisYuklenemedi(res.status);
}

// ≤ 5 MB multipart, bigger resumable. Returns the temporary file's id.
async function yukle(meta: GeciciMeta, dosya: Blob, mime: string, signal?: AbortSignal): Promise<string> {
  let res: Response;
  try {
    if (dosya.size <= RESUMABLE_LIMIT) {
      const boundary = 'defter' + Math.random().toString(36).slice(2);
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
        `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, dosya, `\r\n--${boundary}--`
      ]);
      res = await driveFetch(`${UPLOAD}files?uploadType=multipart&fields=id`, {
        method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body, signal
      });
    } else {
      const bas = await driveFetch(`${UPLOAD}files?uploadType=resumable&fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(dosya.size) },
        body: JSON.stringify(meta), signal
      });
      if (!bas.ok) throw await yuklemeHatasi(bas);
      const oturum = bas.headers.get('Location');
      if (!oturum || !oturum.startsWith('https://')) throw new OfisYuklenemedi(undefined, 'sunucu');
      res = await driveFetch(oturum, { method: 'PUT', headers: { 'Content-Type': mime }, body: dosya, signal });
    }
  } catch (e) {
    if (iptalMi(e)) throw new OfisIptal();   // if Drive made the file anyway, the sweep finds it later
    if (e instanceof TypeError) throw new OfisYuklenemedi();   // fetch failed: no connection
    throw e;
  }
  if (!res.ok) throw await yuklemeHatasi(res);
  const id = (await res.json() as { id?: string }).id;
  if (!id) throw new OfisYuklenemedi(undefined, 'sunucu');
  return id;
}

async function disaAktar(id: string, signal?: AbortSignal): Promise<Uint8Array> {
  try {
    const res = await driveFetch(`${fileUrl(id)}/export?mimeType=application%2Fpdf`, { signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 403 && /exportSizeLimitExceeded/i.test(text)) throw new OfisCokBuyuk();
      if (res.status === 429 || res.status >= 500) throw new OfisYuklenemedi(res.status);
      throw new OfisCevrilemedi(res.status);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new OfisCevrilemedi();
    return bytes;
  } catch (e) {
    if (iptalMi(e)) throw new OfisIptal();
    if (e instanceof TypeError) throw new OfisYuklenemedi();
    throw e;
  }
}

// ---- ofisuPdfeCevir ----

export interface OfisGirdi {
  dosya: File | Blob;
  ad: string;              // the file's name (with extension)
  klasorId: string;        // target topic folder: the temporary file goes here
  islemId: string;         // appProperties.defterIslem
  signal?: AbortSignal;
}

export interface OfisSonuc {
  bytes: Uint8Array;       // the PDF
  geciciId: string;        // the temporary Google file
  copeAtildi: boolean;     // false: trashing failed (the next sweep tries again)
  sureMs: number;
}

// yer: the active Drive library (main.ts: writer() ? driveLoc : null); null → nothing is written.
export async function ofisuPdfeCevir(g: OfisGirdi, yer: DriveLocation | null, secenek: OfisSecenek = {}): Promise<OfisSonuc> {
  const t0 = performance.now();
  // checks without any request
  if (!yer || isSampleId(g.klasorId)) throw new DosyaYazmaYok();
  const tur = cevirTuru(g.ad, g.dosya.type);
  if (!tur) throw new OfisDesteklenmiyor(g.ad);
  iptalKontrol(g.signal);

  await yerKontrol(drivePdfOlusturApi, yer, g.klasorId);   // only kitaplar/<kitap>/ and its subfolders
  iptalKontrol(g.signal);

  try {
    await supurGecici((secenek.simdi ?? Date.now)());
  } catch (e) {
    console.warn(`Eski geçici çeviri dosyaları süpürülemedi (çeviri sürüyor): ${e instanceof Error ? e.message : e}`);
  }
  iptalKontrol(g.signal);

  const meta: GeciciMeta = {
    name: GECICI_ON_EK + g.ad, parents: [g.klasorId], mimeType: GOOGLE_TURU[tur],
    appProperties: { defter: '1', defterGecici: '1', defterIslem: g.islemId }
  };
  const geciciId = await yukle(meta, g.dosya, kaynakMimesi(g.ad, g.dosya.type), g.signal);

  let bytes: Uint8Array;
  try {
    iptalKontrol(g.signal);
    bytes = await disaAktar(geciciId, g.signal);
  } catch (e) {
    await copeAtSessiz(geciciId);
    throw e;
  }
  const copeAtildi = await copeAtSessiz(geciciId);
  return { bytes, geciciId, copeAtildi, sureMs: performance.now() - t0 };
}
