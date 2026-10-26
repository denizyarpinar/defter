import { t } from '../dil';
import type { PDFDocument } from 'pdf-lib';
import { pdfLib, SAVE_OPTIONS, yazilabilirAc, type YazilamazMesajlari } from '../kalem/pdfNotlari';
import { SAYFA_DUZENI } from './ayarlar';
import type { HazirGorsel } from './gorsel';

// Task 5.4: notebook photos (gorsel.ts's JPEGs) as PDF pages. Pure: no Drive, no DOM.
// - sonaSayfaEkle: one new page per photo at the END of a PDF. The existing pages are not touched:
//   not their content, Rotate, boxes or annotations (Defter notes hang on the page object, so they
//   don't move). Encrypted / signed / unreadable files → PdfYazilamaz (the pen's check, pdfNotlari.ts).
// - fotograflardanPdf: a new PDF from the photos alone.
// The JPEGs come from a canvas, so the EXIF orientation is already applied: no rotation here.
// pdf-lib is loaded only when this runs (pdfLib(), dynamic import).

export type Jpeg = Pick<HazirGorsel, 'bytes'>;

export type SayfaDuzeni = { readonly genislik: number; readonly yukseklik: number; readonly kenar: number };

export interface Yerlesim {
  sayfa: [number, number];   // page width, height (pt)
  x: number; y: number; w: number; h: number;   // the photo on it (PDF coordinates, origin bottom left)
}

// Landscape photo (wider than tall) → landscape page, otherwise portrait. Fitted inside the margin
// with its aspect kept (small photos are enlarged too), centred.
export function sayfaYerlesimi(gw: number, gh: number, duzen: SayfaDuzeni = SAYFA_DUZENI): Yerlesim {
  if (!(gw > 0 && gh > 0 && Number.isFinite(gw) && Number.isFinite(gh))) throw new RangeError(`Geçersiz görsel boyutu: ${gw}×${gh}`);   // dil-kontrol: yoksay
  const kisa = Math.min(duzen.genislik, duzen.yukseklik), uzun = Math.max(duzen.genislik, duzen.yukseklik);
  const [W, H] = gw > gh ? [uzun, kisa] : [kisa, uzun];
  const k = Math.min((W - 2 * duzen.kenar) / gw, (H - 2 * duzen.kenar) / gh);
  const w = gw * k, h = gh * k;
  return { sayfa: [W, H], x: (W - w) / 2, y: (H - h) / 2, w, h };
}

// 6.5-3: in the chosen language (getters; blank pages, deleting and photos all use them)
export const MESAJLAR: YazilamazMesajlari = {
  get sifreli() { return t('sayfaIsi.sifreli'); },
  get okunamadi() { return t('sayfaIsi.okunamadi'); },
  get imzali() { return t('sayfaIsi.imzali'); }
};

// Empty list or a broken photo. The PDF itself → PdfYazilamaz.
export class SayfaEklemeHatasi extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SayfaEklemeHatasi';
  }
}

const BOS = 'Eklenecek fotoğraf yok. En az bir fotoğraf seç.';
const bozuk = (i: number) => `${i + 1}. fotoğraf okunamadı. O fotoğrafı tekrar seç.`;

// A whole JPEG: starts with SOI (FF D8) and ends with EOI (FF D9). pdf-lib only reads the header,
// so a cut-off file would otherwise end up as a half-grey page.
function jpegMi(b: Uint8Array): boolean {
  const n = b.length;
  return n > 4 && b[0] === 0xff && b[1] === 0xd8 && b[n - 2] === 0xff && b[n - 1] === 0xd9;
}

// All photos are checked before anything is added, so a broken one leaves no half-done file.
export async function sayfalariEkle(doc: PDFDocument, jpegler: readonly Jpeg[]): Promise<void> {
  if (jpegler.length === 0) throw new SayfaEklemeHatasi(BOS);
  jpegler.forEach((j, i) => { if (!jpegMi(j.bytes)) throw new SayfaEklemeHatasi(bozuk(i)); });
  const gomulu = [];
  for (const [i, j] of jpegler.entries()) {
    try {
      gomulu.push(await doc.embedJpg(j.bytes));
    } catch (e) {
      throw new SayfaEklemeHatasi(bozuk(i), { cause: e });
    }
  }
  for (const img of gomulu) {
    const y = sayfaYerlesimi(img.width, img.height);
    doc.addPage(y.sayfa).drawImage(img, { x: y.x, y: y.y, width: y.w, height: y.h });
  }
}

export async function sonaSayfaEkle(pdfBytes: Uint8Array, jpegler: readonly Jpeg[]): Promise<Uint8Array> {
  const { doc } = await yazilabilirAc(pdfBytes, MESAJLAR);
  await sayfalariEkle(doc, jpegler);
  return doc.save(SAVE_OPTIONS);
}

export async function fotograflardanPdf(jpegler: readonly Jpeg[]): Promise<Uint8Array> {
  const L = await pdfLib();
  const doc = await L.PDFDocument.create();
  await sayfalariEkle(doc, jpegler);
  return doc.save(SAVE_OPTIONS);
}
