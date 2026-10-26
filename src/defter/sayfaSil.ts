import { t } from '../dil';
import type { PDFDocument } from 'pdf-lib';
import { pdfLib, SAVE_OPTIONS, yazilabilirAc } from '../kalem/pdfNotlari';
import { sayfaIzi } from '../ocr/kayit/parmakIzi';
import { MESAJLAR } from './sayfaEkle';
import { izleBul, SayfaYeriDegisti } from './sayfaOrtak';

// Task 6.S-4d: any page of a PDF out, and back in with "Geri al" (CLAUDE.md → 6.S-4d). Pure: no Drive, no DOM.
// - The page is found by its fingerprint (parmakIzi.ts, nearest to `indeks`); indeks only helps and checks.
// - The page that goes is kept as a one-page PDF (copyPages: its notes, Defter's Ink notes with their ids, its
//   boxes, /Rotate and resources), the backup the device stores BEFORE the upload (Okuyucu → silinenSayfaDepo.ts).
// - The last page never goes (SonSayfaSilinemez). A page with a form field (Widget) never goes (FormAlaniVar):
//   form fields stay. Encrypted / signed / unreadable → PdfYazilamaz (yazilabilirAc).
// - Back in: the copied page at its old place, found by the neighbour's fingerprint; no neighbour found → at the
//   end (sonaEklendi, the reader says so). Marked /DefterGeriId (islemId): a retry doesn't put it in twice.
// - Other pages, their content, boxes and notes stay as they are.

export const GERI_ID = 'DefterGeriId';

type Lib = typeof import('pdf-lib');

export class SonSayfaSilinemez extends Error {
  constructor() { super(t('sayfaBalon.sonSayfa')); }
}

export class FormAlaniVar extends Error {
  constructor() { super(t('sayfaIsi.formAlani')); }
}

export interface SilIstek {
  islemId: string;
  indeks: number;          // 0-based, in the reader's version
  iz?: string;             // the page's fingerprint in the reader's version
  yedekVar?: boolean;      // an earlier try of this job made the backup (it may have uploaded)
  oncekiSayfa?: number;    // that try's page count before the removal
}

// The anchor for putting the page back: the page before it, or (the first page) the one after it
export interface Capa { komsuIz: string; komsuYon: 'once' | 'sonra' }

export type Silindi =
  | { bytes: Uint8Array; silinenSayfaBytes: Uint8Array; indeks: number; eskiSayfa: number; yeniSayfa: number; ayniIzVar: boolean } & Capa
  | { zatenYok: true; sayfa: number };

function formAlaniVar(L: Lib, doc: PDFDocument, i: number): boolean {
  for (const ref of doc.getPage(i).node.Annots()?.asArray() ?? []) {
    const a = doc.context.lookup(ref);
    if (a instanceof L.PDFDict && a.get(L.PDFName.of('Subtype')) === L.PDFName.of('Widget')) return true;
  }
  return false;
}

// Page i of doc as a PDF of its own
async function tekSayfa(L: Lib, doc: PDFDocument, i: number): Promise<Uint8Array> {
  const tek = await L.PDFDocument.create({ updateMetadata: false });
  const [p] = await tek.copyPages(doc, [i]);
  tek.addPage(p);
  return tek.save(SAVE_OPTIONS);
}

export async function sayfaSil(pdfBytes: Uint8Array, r: SilIstek): Promise<Silindi> {
  const { L, doc } = await yazilabilirAc(pdfBytes, MESAJLAR);
  const n = doc.getPageCount();
  // an earlier try's upload arrived (its answer was lost): the page is gone already
  if (r.yedekVar && r.oncekiSayfa !== undefined && n === r.oncekiSayfa - 1) return { zatenYok: true, sayfa: n };
  const i = await izleBul(L, doc, r.indeks, r.iz);
  if (n < 2) throw new SonSayfaSilinemez();
  if (formAlaniVar(L, doc, i)) throw new FormAlaniVar();
  const iz = await sayfaIzi(L, doc, doc.getPage(i));
  let ayniIzVar = false;
  for (let k = 0; k < n && !ayniIzVar; k++) if (k !== i && await sayfaIzi(L, doc, doc.getPage(k)) === iz) ayniIzVar = true;
  const komsuYon: Capa['komsuYon'] = i > 0 ? 'sonra' : 'once';
  const komsuIz = await sayfaIzi(L, doc, doc.getPage(i > 0 ? i - 1 : i + 1));
  const silinenSayfaBytes = await tekSayfa(L, doc, i);
  doc.removePage(i);
  return { bytes: await doc.save(SAVE_OPTIONS), silinenSayfaBytes, indeks: i, eskiSayfa: n, yeniSayfa: n - 1, ayniIzVar, komsuIz, komsuYon };
}

export interface GeriKoyIstek {
  islemId: string;           // the removal's
  sayfaBytes: Uint8Array;    // the backup (sayfaSil → silinenSayfaBytes)
  indeks: number;            // where it was (0-based)
  komsuIz?: string;          // the anchor: the page before it (komsuYon 'sonra'), or after it when it was the first ('once')
  komsuYon: 'once' | 'sonra';
}

export type GeriKondu =
  | { bytes: Uint8Array; indeks: number; eskiSayfa: number; yeniSayfa: number; sonaEklendi: boolean }
  | { zatenVar: true; indeks: number; sayfa: number };

function geriIsaretli(L: Lib, doc: PDFDocument, islemId: string): number {
  return doc.getPages().findIndex(p => {
    const v = doc.context.lookup(p.node.get(L.PDFName.of(GERI_ID)));
    return (v instanceof L.PDFString || v instanceof L.PDFHexString) && v.decodeText() === islemId;
  });
}

// Where the page goes back in this version; null: the neighbour isn't found (→ the end)
async function geriYeri(L: Lib, doc: PDFDocument, r: GeriKoyIstek): Promise<number | null> {
  const n = doc.getPageCount();
  if (!r.komsuIz) return r.indeks >= 0 && r.indeks <= n ? r.indeks : null;
  const beklenen = r.komsuYon === 'sonra' ? r.indeks - 1 : r.indeks;   // the neighbour's place after the removal
  try {
    const k = await izleBul(L, doc, beklenen, r.komsuIz);
    return r.komsuYon === 'sonra' ? k + 1 : k;
  } catch (e) {
    if (e instanceof SayfaYeriDegisti) return null;
    throw e;
  }
}

export async function sayfaGeriKoy(pdfBytes: Uint8Array, r: GeriKoyIstek): Promise<GeriKondu> {
  const { L, doc } = await yazilabilirAc(pdfBytes, MESAJLAR);
  const n = doc.getPageCount();
  const var_ = geriIsaretli(L, doc, r.islemId);
  if (var_ >= 0) return { zatenVar: true, indeks: var_, sayfa: n };
  const tek = await (await pdfLib()).PDFDocument.load(r.sayfaBytes, { ignoreEncryption: true, updateMetadata: false });
  const [p] = await doc.copyPages(tek, [0]);
  const yer = await geriYeri(L, doc, r);
  const indeks = yer ?? n;
  doc.insertPage(indeks, p);
  p.node.set(L.PDFName.of(GERI_ID), L.PDFString.of(r.islemId));
  return { bytes: await doc.save(SAVE_OPTIONS), indeks, eskiSayfa: n, yeniSayfa: n + 1, sonaEklendi: yer === null };
}

