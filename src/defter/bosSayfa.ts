import type { PDFDocument, PDFPage } from 'pdf-lib';
import { KAGIT_CIZGI_KOYULUK, KAGIT_CIZGI_PT } from '../elYazisi/kagitCizgi';
import { SAVE_OPTIONS, yazilabilirAc, PdfYazilamaz } from '../kalem/pdfNotlari';
import { sayfaIzi } from '../ocr/kayit/parmakIzi';
import { MESAJLAR } from './sayfaEkle';

// Task 6.S-4: a blank note page INSIDE a PDF, before or after a page (CLAUDE.md → 6.S-4). Pure: no Drive, no DOM.
// - The only page Defter puts between pages, and the only page it ever removes: marked /DefterBosSayfa (islemId)
//   and /DefterBosDesen. A page without the mark is never removed (BosSayfaDegil).
// - Size: the neighbour's visible box (CropBox, else MediaBox), its /Rotate applied: the new page is not rotated
//   but has the same visible width and height; MediaBox [0 0 w h].
// - Pattern: vector lines from the top-left corner, no margin (kareli 5 mm, cizgili 8 mm), the clean handwriting's
//   light grey (kagitCizgi.ts). duz: no lines (white).
// - The content stream starts with a comment carrying islemId: every blank page gets its own fingerprint
//   (parmakIzi.ts hashes the content streams), so a reading record never mixes two blank pages up.
// - Other pages, their content, boxes and notes stay as they are (notes hang on the page object).

export const BOS_ID = 'DefterBosSayfa';
export const BOS_DESEN = 'DefterBosDesen';

export const DESENLER = ['duz', 'kareli', 'cizgili'] as const;
export type Desen = typeof DESENLER[number];
export type Yon = 'once' | 'sonra';

const MM = 72 / 25.4;
export const KARE_MM = 5;
export const CIZGI_MM = 8;
const KENAR_TOLERANS = 0.5;   // pt: no line right on the page edge

type Lib = typeof import('pdf-lib');

export class BosSayfaDegil extends Error {
  constructor() { super('Bu sayfa Defter\'in boş sayfası değil; kaldırılmaz. Sadece "Sayfa ekle" ile eklenen boş sayfalar kaldırılabilir.'); }
}

export class SayfaYeriDegisti extends Error {
  constructor() { super('PDF bu arada başka bir yerde değişti; sayfanın yeri bulunamadı, hiçbir şey yazılmadı. Konuyu kapatıp yeniden aç, sonra tekrar dene.'); }
}

// ---- geometry ----

export interface Kutu { w: number; h: number }

// The visible size of a page: CropBox (pdf-lib falls back to MediaBox), turned by /Rotate
export function gorunurKutu(page: PDFPage): Kutu {
  const b = page.getCropBox();
  const a = ((page.getRotation().angle % 360) + 360) % 360;
  return a === 90 || a === 270 ? { w: b.height, h: b.width } : { w: b.width, h: b.height };
}

export interface Cizgi { x1: number; y1: number; x2: number; y2: number }

// The pattern's lines on a w × h page (PDF coordinates, origin bottom left), measured from the top left corner
export function desenCizgileri(w: number, h: number, desen: Desen): Cizgi[] {
  if (desen === 'duz') return [];
  const adim = (desen === 'kareli' ? KARE_MM : CIZGI_MM) * MM;
  const out: Cizgi[] = [];
  for (let k = 1; k * adim < h - KENAR_TOLERANS; k++) { const y = h - k * adim; out.push({ x1: 0, y1: y, x2: w, y2: y }); }
  if (desen === 'kareli') for (let k = 1; k * adim < w - KENAR_TOLERANS; k++) { const x = k * adim; out.push({ x1: x, y1: 0, x2: x, y2: h }); }
  return out;
}

const n3 = (x: number) => String(Math.round(x * 1000) / 1000);
const temizId = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '');

export function desenAkisi(w: number, h: number, desen: Desen, islemId: string): string {
  const gri = n3((255 - KAGIT_CIZGI_KOYULUK) / 255);
  const satirlar = [`% ${BOS_ID} ${temizId(islemId)}`];
  const c = desenCizgileri(w, h, desen);
  if (c.length) {
    satirlar.push('q', `${gri} ${gri} ${gri} RG`, `${n3(KAGIT_CIZGI_PT)} w`, '0 J');
    for (const l of c) satirlar.push(`${n3(l.x1)} ${n3(l.y1)} m ${n3(l.x2)} ${n3(l.y2)} l`);
    satirlar.push('S', 'Q');
  }
  return satirlar.join('\n') + '\n';
}

// ---- marks ----

function isareti(L: Lib, doc: PDFDocument, page: PDFPage): string | null {
  const v = doc.context.lookup(page.node.get(L.PDFName.of(BOS_ID)));
  return v instanceof L.PDFString || v instanceof L.PDFHexString ? v.decodeText() : null;
}

// The blank pages: page index (0-based) → islemId
export function isaretliSayfalar(L: Lib, doc: PDFDocument): Map<number, string> {
  const m = new Map<number, string>();
  doc.getPages().forEach((p, i) => { const id = isareti(L, doc, p); if (id) m.set(i, id); });
  return m;
}

export interface BosSayfaKaydi { islemId: string; iz: string }   // iz: its fingerprint (parmakIzi.ts)
export type BosSayfaBilgisi = { yazilabilir: true; sayfa: number; bos: Map<number, BosSayfaKaydi> } | { yazilabilir: false; mesaj: string };

// For the reader's popover: can pages go in at all (the pen's check), and which pages are blank ones
export async function bosSayfaBilgisi(bytes: Uint8Array): Promise<BosSayfaBilgisi> {
  try {
    const { L, doc } = await yazilabilirAc(bytes, MESAJLAR);
    const bos = new Map<number, BosSayfaKaydi>();
    for (const [i, islemId] of isaretliSayfalar(L, doc)) bos.set(i, { islemId, iz: await sayfaIzi(L, doc, doc.getPage(i)) });
    return { yazilabilir: true, sayfa: doc.getPageCount(), bos };
  } catch (e) {
    if (e instanceof PdfYazilamaz) return { yazilabilir: false, mesaj: e.message };
    throw e;
  }
}

// One page's fingerprint in these bytes (the neighbour's anchor, BosSayfaIstek.komsuIzi)
export async function sayfaIziAl(bytes: Uint8Array, i: number): Promise<string> {
  const L = await import('pdf-lib');
  const doc = await L.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  return sayfaIzi(L, doc, doc.getPage(i));
}

// ---- insert / remove ----

export interface BosSayfaIstek {
  komsu: number;          // 0-based: the page the user was on (in the reader's version)
  yon: Yon;
  desen: Desen;
  islemId: string;
  komsuIzi?: string;      // that page's fingerprint in the reader's version: given when Drive has a newer one
}

export type BosEklendi =
  | { bytes: Uint8Array; indeks: number; eskiSayfa: number; yeniSayfa: number }
  | { zatenVar: true; indeks: number; sayfa: number };

// Where the neighbour is in this version: the page with its fingerprint nearest to its old index
async function komsuBul(L: Lib, doc: PDFDocument, r: BosSayfaIstek): Promise<number> {
  const n = doc.getPageCount();
  if (!r.komsuIzi) {
    if (!Number.isInteger(r.komsu) || r.komsu < 0 || r.komsu >= n) throw new SayfaYeriDegisti();
    return r.komsu;
  }
  const sayfalar = doc.getPages();
  let en = -1;
  for (let i = 0; i < n; i++) {
    if (await sayfaIzi(L, doc, sayfalar[i]) !== r.komsuIzi) continue;
    if (en < 0 || Math.abs(i - r.komsu) < Math.abs(en - r.komsu)) en = i;
  }
  if (en < 0) throw new SayfaYeriDegisti();
  return en;
}

export async function bosSayfaEkle(pdfBytes: Uint8Array, r: BosSayfaIstek): Promise<BosEklendi> {
  const { L, doc } = await yazilabilirAc(pdfBytes, MESAJLAR);
  const n = doc.getPageCount();
  for (const [i, id] of isaretliSayfalar(L, doc)) if (id === r.islemId) return { zatenVar: true, indeks: i, sayfa: n };
  const k = await komsuBul(L, doc, r);
  const { w, h } = gorunurKutu(doc.getPage(k));
  const indeks = r.yon === 'once' ? k : k + 1;
  const page = doc.insertPage(indeks, [w, h]);
  page.node.set(L.PDFName.of('Contents'), doc.context.register(doc.context.flateStream(desenAkisi(w, h, r.desen, r.islemId))));
  page.node.set(L.PDFName.of(BOS_ID), L.PDFString.of(r.islemId));
  page.node.set(L.PDFName.of(BOS_DESEN), L.PDFName.of(r.desen));
  return { bytes: await doc.save(SAVE_OPTIONS), indeks, eskiSayfa: n, yeniSayfa: n + 1 };
}

export interface BosKaldirIstek { indeks: number; islemId?: string }

export type BosKaldirildi =
  | { bytes: Uint8Array; indeks: number; islemId: string; eskiSayfa: number; yeniSayfa: number }
  | { zatenYok: true; sayfa: number };

// With islemId: the blank page with that id goes (its notes with it); not found → zatenYok (an earlier try removed
// it, whatever page is at `indeks` now). Without: the page at `indeks`, only if it carries the mark, else
// BosSayfaDegil. A user's page never goes.
export async function bosSayfaKaldir(pdfBytes: Uint8Array, r: BosKaldirIstek): Promise<BosKaldirildi> {
  const { L, doc } = await yazilabilirAc(pdfBytes, MESAJLAR);
  const n = doc.getPageCount();
  const bos = isaretliSayfalar(L, doc);
  let i: number | undefined;
  if (r.islemId !== undefined) {
    i = [...bos].find(([, id]) => id === r.islemId)?.[0];
    if (i === undefined) return { zatenYok: true, sayfa: n };
  } else {
    if (!bos.has(r.indeks)) throw new BosSayfaDegil();
    i = r.indeks;
  }
  if (n < 2) throw new PdfYazilamaz('PDF\'in tek sayfası bu; kaldırılırsa dosyada sayfa kalmaz.');
  doc.removePage(i);
  return { bytes: await doc.save(SAVE_OPTIONS), indeks: i, islemId: bos.get(i)!, eskiSayfa: n, yeniSayfa: n - 1 };
}
