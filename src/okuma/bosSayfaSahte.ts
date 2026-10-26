import type { DriveLocation } from '../drive/driveLibrary';
import { FOLDER_MIME } from '../drive/drive';
import type { JsonDrive } from '../drive/jsonDegistir';
import type { KlasorBilgisi, PdfOlusturDrive } from '../drive/pdfOlustur';
import type { PdfDrive } from '../drive/pdfYazici';
import type { OcrDrive } from '../ocr/kayit/kayitDrive';
import type { OcrKayit } from '../ocr/kayit/sema';

// Task 6.S-4, development only (`npm run dev`, never in the build): window.defterBosSayfaSahte(o) gives the open
// reader's file on screen a writable copy in memory ("sahte-pdf"), so blank pages, the pen's save and the removal
// run the real code without Google or Drive (scripts/bos-sayfa-kontrol.mjs). Drive: the PDF, the folder chain
// R → kitaplar → book → topic, kitap.json and .ocr.json, all in memory. Nothing is sent anywhere.

export const SAHTE_ID = 'sahte-pdf';

export interface BosSayfaSahteDurum {
  surum: number;            // the fake PDF's version (t<n>)
  bytes: Uint8Array;
  kitapJson: unknown;
  ocr: OcrKayit | null;
  log: string[];
}

export interface BosSayfaSahte {
  loc: DriveLocation;
  pdfDrive: PdfDrive;
  dosyaDrive: PdfOlusturDrive;
  jsonDrive: JsonDrive;
  ocrDrive: OcrDrive;
  kitapJsonId: string;
  durum: BosSayfaSahteDurum;
}

export interface SahteSecenek { kitapJson?: unknown; ocr?: OcrKayit | null }

export function bosSayfaSahte(bytes: Uint8Array, kitapId: string, ad: string, o: SahteSecenek = {}): BosSayfaSahte {
  const d: BosSayfaSahteDurum = { surum: 1, bytes, kitapJson: structuredClone(o.kitapJson ?? { surum: 2, uniteler: [] }), ocr: o.ocr ?? null, log: [] };
  const revs = [{ id: 'r1', keepForever: false }];
  let jsonSurum = 1, ocrSurum = 1;
  const yukle = async (_id: string, b: Uint8Array) => {
    d.bytes = b.slice(); d.surum++; revs.push({ id: `r${d.surum}`, keepForever: false });
    d.log.push(`pdf t${d.surum}`);
    return { id: SAHTE_ID, modifiedTime: `t${d.surum}`, headRevisionId: `r${d.surum}` };
  };
  const pdfDrive: PdfDrive = {
    async durum() { return { canEdit: true, modifiedTime: `t${d.surum}`, headRevisionId: `r${d.surum}`, trashed: false }; },
    async listRevisions() { return { revisions: revs.map(r => ({ ...r })) }; },
    async headRevisionId() { return `r${d.surum}`; },
    async keepRevision(_f, r) { const x = revs.find(v => v.id === r); if (x) x.keepForever = true; },
    async modifiedTime() { return `t${d.surum}`; },
    uploadMedia: (id, b, s) => { s?.ilerleme?.(b.byteLength, b.byteLength); return yukle(id, b); },
    uploadResumable: (id, b, s) => { s?.ilerleme?.(b.byteLength, b.byteLength); return yukle(id, b); },
  };
  const agac: Record<string, Omit<KlasorBilgisi, 'id' | 'canAddChildren'>> = {
    K: { name: 'kitaplar', mimeType: FOLDER_MIME, trashed: false, parents: ['R'] },
    B: { name: kitapId, mimeType: FOLDER_MIME, trashed: false, parents: ['K'] },
    C: { name: 'Konu', mimeType: FOLDER_MIME, trashed: false, parents: ['B'] },
    [SAHTE_ID]: { name: ad, mimeType: 'application/pdf', trashed: false, parents: ['C'] },
  };
  const yok = async (): Promise<never> => { throw new Error('sahte Drive: yeni dosya yok'); };
  const dosyaDrive: PdfOlusturDrive = {
    async klasorBilgisi(id) { const k = agac[id]; if (!k) throw new Error(`sahte Drive: ${id} yok`); return { id, canAddChildren: true, ...k }; },
    async cocuklar() { return []; },
    yeniId: yok, yukleMultipart: yok, yukleResumable: yok, dosyaBilgisi: yok,
  };
  const jsonDrive: JsonDrive = {
    async jsonOku() { return structuredClone(d.kitapJson); },
    async degisimZamani() { return `j${jsonSurum}`; },
    async jsonYaz(_id, obj) { d.kitapJson = structuredClone(obj); jsonSurum++; d.log.push('kitap.json'); },
  };
  const ocrDrive: OcrDrive = {
    async ara() { return d.ocr ? [{ id: 'ocr1', createdTime: '2026-10-01T00:00:00Z' }] : []; },
    async durum() { return { modifiedTime: `o${ocrSurum}`, headRevisionId: `o${ocrSurum}` }; },
    async oku() { return JSON.stringify(d.ocr); },
    async yaz(_id, k) { d.ocr = structuredClone(k); ocrSurum++; d.log.push('ocr.json'); },
    olustur: yok, async yerKontrol() {},
  };
  const loc: DriveLocation = { rootId: 'R', libraryFileId: null, bookFolderIds: new Map([[kitapId, 'B']]), bookFileIds: new Map([[kitapId, 'KJ']]) };
  return { loc, pdfDrive, dosyaDrive, jsonDrive, ocrDrive, kitapJsonId: 'KJ', durum: d };
}

declare global {
  interface Window {
    defterBosSayfaSahte?: (o?: SahteSecenek | false) => Promise<BosSayfaSahteDurum | null>;
  }
}

// kur(o): the reader puts the fake in place for its file on screen (false: off); its state back
export function installBosSayfaSahte(kur: (o: SahteSecenek | false) => Promise<BosSayfaSahteDurum | null>): void {
  window.defterBosSayfaSahte = o => kur(o ?? {});
}
