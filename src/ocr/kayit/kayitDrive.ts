import { driveFetch, ok, qv, updateJson } from '../../drive/drive';
import type { DriveLocation } from '../../drive/driveLibrary';
import { drivePdfOlusturApi, yerKontrol } from '../../drive/pdfOlustur';
import { UPLOAD } from '../../drive/pdfYazici';
import { isSampleId } from '../../okuma/ornekKaynak';
import { kayitBirlestir, sayfaBirlestir } from './birlestir';
import { duzeltmeUygula, type DuzeltmeHedefi } from './elleDuzelt';
import { bosKayit, kayitOku, ocrDosyaAdi, sayfaKontrol, OcrKayitBozuk, type OcrKayit, type OcrParca, type OcrSayfa } from './sema';

// Task 6.4c-1: the reading record of one PDF in Drive (`<pdf name>.ocr.json` in the PDF's folder).
// - Found by appProperties { defter: "1", defterOcr: "1", defterOcrKaynak: <pdf id> } in that folder, not trashed.
// - sayfaYaz: in a lock per PDF (navigator.locks 'defter-ocr-<id>') → find → none: check the place
//   (kitaplar/<kitap>/ only, yerKontrol), create, find again → the oldest file (createdTime) is the main one;
//   the others are never deleted or written, their pages are merged into the main one on every write.
// - Before writing: modifiedTime + headRevisionId → the latest content → merge → the same again; changed
//   meanwhile → from the start, at most 3 rounds, then OcrKayitCakisma. PATCH on the same id.
// - A broken file or a newer surum: OcrKayitBozuk / OcrKayitYeniSurum, nothing written.
// - The sample library: no request at all.
// - Task 6.4e-3: duzeltmeYaz, a hand correction, the same rounds on the existing file (never creates one).

export interface OcrKaynakDosya { id: string; ad: string; klasorId: string }   // the PDF and its folder
export interface OcrDosya { id: string; createdTime: string }
export interface OcrDurum { modifiedTime: string; headRevisionId: string }

export interface OcrDrive {
  ara(k: OcrKaynakDosya): Promise<OcrDosya[]>;
  durum(id: string): Promise<OcrDurum>;
  oku(id: string): Promise<string>;
  yaz(id: string, kayit: OcrKayit): Promise<void>;
  olustur(k: OcrKaynakDosya, kayit: OcrKayit): Promise<string>;
  yerKontrol(klasorId: string): Promise<void>;   // throws YerDisi outside kitaplar/<kitap>/
}

export const MAX_TUR = 3;

export class OcrKayitCakisma extends Error {
  constructor() { super('Okuma kaydı bu arada başka bir cihazda değişti, üç denemede de yazılamadı. Biraz sonra tekrar dene.'); }
}
export class OcrOrnekYazmaYok extends Error {
  constructor() { super('Örnek kitaplıkta okuma kaydı tutulmaz. Kendi notların için Google ile giriş yap.'); }
}

const WHAT = 'Okuma kaydı';

export function driveOcrApi(yer: DriveLocation): OcrDrive {
  return {
    async ara(k) {
      const q = [
        `'${qv(k.klasorId)}' in parents`, 'trashed = false',
        "appProperties has { key='defter' and value='1' }",
        "appProperties has { key='defterOcr' and value='1' }",
        `appProperties has { key='defterOcrKaynak' and value='${qv(k.id)}' }`
      ].join(' and ');
      const params = new URLSearchParams({ q, fields: 'files(id,createdTime)', orderBy: 'createdTime', pageSize: '100' });
      const res = await ok(await driveFetch('files?' + params), `${WHAT} aranırken`);
      return ((await res.json()) as { files?: OcrDosya[] }).files ?? [];
    },
    async durum(id) {
      const res = await ok(await driveFetch(`files/${encodeURIComponent(id)}?fields=modifiedTime,headRevisionId`), `${WHAT} okunurken`);
      const j = await res.json() as Partial<OcrDurum>;
      return { modifiedTime: j.modifiedTime ?? '', headRevisionId: j.headRevisionId ?? '' };
    },
    async oku(id) {
      return (await ok(await driveFetch(`files/${encodeURIComponent(id)}?alt=media`), `${WHAT} okunurken`)).text();
    },
    yaz: (id, kayit) => updateJson(id, kayit, `${WHAT} yazılırken`),
    async olustur(k, kayit) {
      const boundary = 'defter' + Math.random().toString(36).slice(2);
      const meta = {
        name: ocrDosyaAdi(k.ad), parents: [k.klasorId], mimeType: 'application/json',
        appProperties: { defter: '1', defterOcr: '1', defterOcrKaynak: k.id }
      };
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`
        + `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(kayit, null, 2)}\r\n--${boundary}--`;
      const res = await ok(await driveFetch(`${UPLOAD}files?uploadType=multipart&fields=id`, {
        method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body
      }), `${WHAT} oluşturulurken`);
      return ((await res.json()) as { id: string }).id;
    },
    async yerKontrol(klasorId) { await yerKontrol(drivePdfOlusturApi, yer, klasorId); }
  };
}

// The same record in a lock per PDF (all tabs of this browser); without navigator.locks no lock
function kilitle<T>(ad: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request(ad, fn) as Promise<T> : fn();
}

// oldest first (createdTime, then id)
const sirala = (d: OcrDosya[]) => [...d].sort((a, b) => a.createdTime.localeCompare(b.createdTime) || a.id.localeCompare(b.id));

function cozumle(metin: string, pdfId: string): OcrKayit {
  let x: unknown;
  try { x = JSON.parse(metin); } catch { throw new OcrKayitBozuk('geçerli JSON değil'); }
  const k = kayitOku(x);
  if (k.kaynak.id !== pdfId) throw new OcrKayitBozuk('başka bir PDF’in kaydı');
  return k;
}

// The other copies' pages into the main record (a broken copy is skipped)
async function kopyalarla(drive: OcrDrive, kayit: OcrKayit, digerleri: OcrDosya[], pdfId: string): Promise<OcrKayit> {
  for (const d of digerleri) {
    try { kayit = kayitBirlestir(kayit, cozumle(await drive.oku(d.id), pdfId)); }
    catch (e) { console.warn(`${WHAT}: kopya ${d.id} birleştirilmedi: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return kayit;
}

export interface OcrOkuma { dosyaId: string | null; kayit: OcrKayit | null; kopyaSayisi: number }

// The record as one (main + copies merged); reads only. No file → kayit null.
export async function kayitOkuDrive(drive: OcrDrive, k: OcrKaynakDosya): Promise<OcrOkuma> {
  if (isSampleId(k.id)) return { dosyaId: null, kayit: null, kopyaSayisi: 0 };
  const [asil, ...digerleri] = sirala(await drive.ara(k));
  if (!asil) return { dosyaId: null, kayit: null, kopyaSayisi: 0 };
  const kayit = await kopyalarla(drive, cozumle(await drive.oku(asil.id), k.id), digerleri, k.id);
  return { dosyaId: asil.id, kayit, kopyaSayisi: digerleri.length + 1 };
}

export interface OcrYazma { dosyaId: string; yeni: boolean; kopyaSayisi: number; kayit: OcrKayit }

// The rounds on the main file: modifiedTime + headRevisionId → the latest content (+ the copies) → degistir →
// the same again; changed meanwhile → from the start. Nothing changed → nothing written.
async function turlar(drive: OcrDrive, k: OcrKaynakDosya, dosyalar: OcrDosya[], degistir: (k: OcrKayit) => OcrKayit): Promise<OcrKayit> {
  const [asil, ...digerleri] = dosyalar;
  for (let tur = 1; tur <= MAX_TUR; tur++) {
    const once = await drive.durum(asil.id);
    const birlesik = await kopyalarla(drive, cozumle(await drive.oku(asil.id), k.id), digerleri, k.id);
    const kayit = degistir(birlesik);
    const sonra = await drive.durum(asil.id);
    if (sonra.modifiedTime !== once.modifiedTime || sonra.headRevisionId !== once.headRevisionId) continue;
    if (JSON.stringify(kayit) !== JSON.stringify(birlesik) || digerleri.length) await drive.yaz(asil.id, kayit);
    return kayit;
  }
  throw new OcrKayitCakisma();
}

// Writes one page's reading (the new reading wins over the same fingerprint)
export async function sayfaYaz(drive: OcrDrive, k: OcrKaynakDosya, sayfa: OcrSayfa): Promise<OcrYazma> {
  if (isSampleId(k.id)) throw new OcrOrnekYazmaYok();
  sayfaKontrol(sayfa);
  return kilitle(`defter-ocr-${k.id}`, async () => {
    let dosyalar = sirala(await drive.ara(k));
    let yeni = false;
    if (!dosyalar.length) {
      await drive.yerKontrol(k.klasorId);
      const ilk = sayfaBirlestir(bosKayit(k), sayfa);
      const id = await drive.olustur(k, ilk);
      yeni = true;
      dosyalar = sirala(await drive.ara(k));
      if (!dosyalar.some(d => d.id === id)) dosyalar = sirala([...dosyalar, { id, createdTime: '￿' }]);   // not in the search yet
      if (dosyalar.length === 1) return { dosyaId: id, yeni, kopyaSayisi: 1, kayit: ilk };
      // another device created one at the same time: our page goes into the oldest file below
    }
    const kayit = await turlar(drive, k, dosyalar, x => sayfaBirlestir(x, sayfa));
    return { dosyaId: dosyalar[0].id, yeni, kopyaSayisi: dosyalar.length, kayit };
  });
}

export class OcrKayitYok extends Error {
  constructor() { super("Okuma kaydı Drive'da bulunamadı. Sayfaları kontrol et ile yenileyip tekrar dene."); }
}

// Task 6.4e-3: a hand correction of one part (elleDuzelt.ts) on the existing record, the same way as sayfaYaz
// (lock, the latest content, 3 rounds). Never creates a file. The page read again meanwhile → OcrSayfaDegisti.
export async function duzeltmeYaz(drive: OcrDrive, k: OcrKaynakDosya, h: DuzeltmeHedefi, degistir: (p: OcrParca) => OcrParca): Promise<OcrYazma> {
  if (isSampleId(k.id)) throw new OcrOrnekYazmaYok();
  return kilitle(`defter-ocr-${k.id}`, async () => {
    const dosyalar = sirala(await drive.ara(k));
    if (!dosyalar.length) throw new OcrKayitYok();
    const kayit = await turlar(drive, k, dosyalar, x => duzeltmeUygula(x, h, degistir));
    return { dosyaId: dosyalar[0].id, yeni: false, kopyaSayisi: dosyalar.length, kayit };
  });
}
