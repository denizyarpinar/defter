import type { PDFDocument, PDFPage } from 'pdf-lib';
import { KAGIT_CIZGI_KOYULUK, KAGIT_CIZGI_PT } from '../elYazisi/kagitCizgi';
import { SAVE_OPTIONS, yazilabilirAc, PdfYazilamaz } from '../kalem/pdfNotlari';
import { sayfaIzi } from '../ocr/kayit/parmakIzi';
import { MESAJLAR } from './sayfaEkle';
import { desenCizgileri, izleBul, n3, temizId, type Desen } from './sayfaOrtak';
import { sayfaDurumlari, type YapistirKaydi } from './yapistir';

// the shared pattern and errors (sayfaOrtak.ts), under their old names here
export { CIZGI_MM, DESENLER, desenCizgileri, KARE_MM, SayfaYeriDegisti, type Cizgi, type Desen } from './sayfaOrtak';

// Task 6.S-4: a blank note page INSIDE a PDF, before or after a page (CLAUDE.md → 6.S-4). Pure: no Drive, no DOM.
// - The only page Defter puts between pages: marked /DefterBosSayfa (islemId) and /DefterBosDesen. Task 6.S-4d:
//   it goes out like any other page (sayfaSil.ts, with a backup and "Geri al").
// - Size: the neighbour's visible box (CropBox, else MediaBox), its /Rotate applied: the new page is not rotated
//   but has the same visible width and height; MediaBox [0 0 w h]. 6.S-4c: a landscape or square neighbour (a slide)
//   gets an upright A4 page beside it instead (dikeyBoyut).
// - Pattern: vector lines from the top-left corner, no margin (kareli 5 mm, cizgili 8 mm), the clean handwriting's
//   light grey (kagitCizgi.ts). duz: no lines (white).
// - The content stream starts with a comment carrying islemId: every blank page gets its own fingerprint
//   (parmakIzi.ts hashes the content streams), so a reading record never mixes two blank pages up.
// - Other pages, their content, boxes and notes stay as they are (notes hang on the page object).

export const BOS_ID = 'DefterBosSayfa';
export const BOS_DESEN = 'DefterBosDesen';

export type Yon = 'once' | 'sonra';

type Lib = typeof import('pdf-lib');

// ---- geometry ----

export interface Kutu { w: number; h: number }

// The visible size of a page: CropBox (pdf-lib falls back to MediaBox), turned by /Rotate
export function gorunurKutu(page: PDFPage): Kutu {
  const b = page.getCropBox();
  const a = ((page.getRotation().angle % 360) + 360) % 360;
  return a === 90 || a === 270 ? { w: b.height, h: b.width } : { w: b.width, h: b.height };
}

export const A4: Kutu = { w: 595.28, h: 841.89 };

// Task 6.S-4c: the blank page's size from its neighbour's visible size: upright as it is, landscape / square → A4 upright
export const dikeyBoyut = (komsu: Kutu): Kutu => komsu.w >= komsu.h ? { ...A4 } : komsu;

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
export type YapistirilmisSayfa = YapistirKaydi & { iz: string };
// 6.S-4c: yatay = the landscape / square pages not pasted yet; yapistirilmis = the pasted ones ("Deftere yapıştır")
export type BosSayfaBilgisi = { yazilabilir: true; sayfa: number; bos: Map<number, BosSayfaKaydi>; yatay: Set<number>; yapistirilmis: Map<number, YapistirilmisSayfa> }
  | { yazilabilir: false; mesaj: string };

// For the reader's popover: can pages go in at all (the pen's check), and which pages are blank / landscape / pasted
export async function bosSayfaBilgisi(bytes: Uint8Array): Promise<BosSayfaBilgisi> {
  try {
    const { L, doc } = await yazilabilirAc(bytes, MESAJLAR);
    const bos = new Map<number, BosSayfaKaydi>();
    for (const [i, islemId] of isaretliSayfalar(L, doc)) bos.set(i, { islemId, iz: await sayfaIzi(L, doc, doc.getPage(i)) });
    const d = sayfaDurumlari(L, doc), yapistirilmis = new Map<number, YapistirilmisSayfa>();
    for (const [i, y] of d.yapistirilmis) yapistirilmis.set(i, { ...y, iz: await sayfaIzi(L, doc, doc.getPage(i)) });
    return { yazilabilir: true, sayfa: doc.getPageCount(), bos, yatay: d.yatay, yapistirilmis };
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

// ---- insert ----

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

export async function bosSayfaEkle(pdfBytes: Uint8Array, r: BosSayfaIstek): Promise<BosEklendi> {
  const { L, doc } = await yazilabilirAc(pdfBytes, MESAJLAR);
  const n = doc.getPageCount();
  for (const [i, id] of isaretliSayfalar(L, doc)) if (id === r.islemId) return { zatenVar: true, indeks: i, sayfa: n };
  const k = await izleBul(L, doc, r.komsu, r.komsuIzi);   // where the neighbour is in this version
  const { w, h } = dikeyBoyut(gorunurKutu(doc.getPage(k)));
  const indeks = r.yon === 'once' ? k : k + 1;
  const page = doc.insertPage(indeks, [w, h]);
  page.node.set(L.PDFName.of('Contents'), doc.context.register(doc.context.flateStream(desenAkisi(w, h, r.desen, r.islemId))));
  page.node.set(L.PDFName.of(BOS_ID), L.PDFString.of(r.islemId));
  page.node.set(L.PDFName.of(BOS_DESEN), L.PDFName.of(r.desen));
  return { bytes: await doc.save(SAVE_OPTIONS), indeks, eskiSayfa: n, yeniSayfa: n + 1 };
}
