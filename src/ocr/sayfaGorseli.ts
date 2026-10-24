import { jpegParmakIzi } from './fotoOkuma';
import { sayfaParmakIzleri } from './kayit/parmakIzi';

// Task 6.4c-2: the image a PDF page is read from, and its fingerprint.
// - A photo page (one image, JPEG, upright, ≤ 2000 px, ≤ 2.9 MB): the embedded JPEG bytes themselves.
//   Sharpest, nothing drawn, and 'g:' + SHA-256 of these bytes is the page's fingerprint.
// - Anything else: drawn with pdf.js (ciz, the reader's canvas), the fingerprint from the file ('i:' or 'g:').
// If the embedded JPEG's fingerprint does not match the file's, no silent mismatch: a warning and drawing.

export const MAX_KENAR = 2000;
export const MAX_BAYT = 2.9 * 1024 * 1024;   // api/oku takes at most 3 MB

type PdfLib = typeof import('pdf-lib');
type PdfDoc = import('pdf-lib').PDFDocument;

export interface SayfaGorseli { jpeg: Uint8Array; parmakIzi: string; kaynak: 'gomulu' | 'cizim' }

const kisa = (iz: string) => iz.slice(0, 14);

// The embedded JPEG of a photo page, or null
function gomuluJpeg(lib: PdfLib, doc: PdfDoc, i: number): Uint8Array | null {
  const { PDFName, PDFDict, PDFStream, PDFRawStream, PDFArray, PDFNumber } = lib;
  const page = doc.getPage(i);
  if (page.getRotation().angle % 360 !== 0) return null;
  const xo = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  const gorseller: import('pdf-lib').PDFStream[] = [];
  for (const [, deger] of xo?.entries() ?? []) {
    const s = doc.context.lookup(deger);
    if (s instanceof PDFStream && s.dict.lookupMaybe(PDFName.of('Subtype'), PDFName) === PDFName.of('Image')) gorseller.push(s);
  }
  if (gorseller.length !== 1 || !(gorseller[0] instanceof PDFRawStream)) return null;
  const d = gorseller[0].dict;
  const f = d.lookup(PDFName.of('Filter'));
  const dct = f === PDFName.of('DCTDecode') || (f instanceof PDFArray && f.size() === 1 && f.lookup(0) === PDFName.of('DCTDecode'));
  if (!dct || d.has(PDFName.of('Decode')) || d.has(PDFName.of('SMask')) || d.has(PDFName.of('Mask'))) return null;
  const cs = d.lookup(PDFName.of('ColorSpace'));
  if (cs !== PDFName.of('DeviceRGB') && cs !== PDFName.of('DeviceGray')) return null;
  const w = d.lookupMaybe(PDFName.of('Width'), PDFNumber)?.asNumber() ?? 0;
  const h = d.lookupMaybe(PDFName.of('Height'), PDFNumber)?.asNumber() ?? 0;
  if (!(w > 0 && h > 0) || Math.max(w, h) > MAX_KENAR) return null;
  const b = gorseller[0].getContents();
  return b.byteLength <= MAX_BAYT ? b : null;
}

// One file, opened once for several pages
export class PdfSayfaGorselleri {
  private constructor(private readonly lib: PdfLib, private readonly doc: PdfDoc, readonly izler: string[]) {}

  static async ac(pdf: Uint8Array): Promise<PdfSayfaGorselleri> {
    const lib = await import('pdf-lib');
    const [doc, izler] = await Promise.all([
      lib.PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false }),
      sayfaParmakIzleri(pdf)
    ]);
    return new PdfSayfaGorselleri(lib, doc, izler);
  }

  // sayfa: 1-based. ciz: the page drawn as a JPEG (long edge ≤ 2000)
  async gorsel(sayfa: number, ciz: () => Promise<Uint8Array>): Promise<SayfaGorseli> {
    const iz = this.izler[sayfa - 1];
    if (!iz) throw new Error(`PDF'te ${this.izler.length} sayfa var; s.${sayfa} yok.`);
    let jpeg: Uint8Array | null = null;
    try { jpeg = gomuluJpeg(this.lib, this.doc, sayfa - 1); }
    catch (e) { console.warn(`Temiz yazı: s.${sayfa} gömülü görseli okunamadı; sayfa çizilerek okunuyor.`, e); }
    if (jpeg) {
      const gIz = await jpegParmakIzi(jpeg);
      if (gIz === iz) return { jpeg, parmakIzi: iz, kaynak: 'gomulu' };
      console.warn(`Temiz yazı: s.${sayfa} gömülü JPEG'in izi (${kisa(gIz)}…) dosyadakiyle (${kisa(iz)}…) aynı değil; sayfa çizilerek okunuyor.`);
    }
    return { jpeg: await ciz(), parmakIzi: iz, kaynak: 'cizim' };
  }
}
