// Task 6.4c-1: a fingerprint per PDF page, so a reading stays tied to its page even when pages move.
// - Exactly one image on the page (a notebook photo): SHA-256 of that image stream's bytes as stored in
//   the file → "g:<hex>".
// - Otherwise: SHA-256 over the page's content streams and every XObject (by resource name) → "i:<hex>".
// Annotations (/Annots, the pen's Ink notes) are never read, so drawing does not change it. Only the file's
// bytes count: the same on every device. pdf-lib is loaded lazily (like the pen).
// Task 6.S-4c: the bands' stream of "Deftere yapıştır" (/DefterYapistir true in its dictionary) is left out, so
// pasting and undoing it keep the page's fingerprint; the boxes never counted.

type PdfLib = typeof import('pdf-lib');
type PdfDoc = import('pdf-lib').PDFDocument;
type PdfPage = import('pdf-lib').PDFPage;

async function sha256(b: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}

function akislar(lib: PdfLib, doc: PdfDoc, page: PdfPage) {
  const { PDFName, PDFDict, PDFStream, PDFArray } = lib;
  const ctx = doc.context;
  const icerik: Uint8Array[] = [];
  const c = page.node.Contents();
  const parcalar = c instanceof PDFArray ? c.asArray().map(x => ctx.lookup(x)) : [c];
  for (const s of parcalar) if (s instanceof PDFStream && !s.dict.has(PDFName.of('DefterYapistir'))) icerik.push(s.getContents());

  const xobjeler: { ad: string; gorsel: boolean; bayt: Uint8Array }[] = [];
  const xo = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  for (const [ad, deger] of xo?.entries() ?? []) {
    const s = ctx.lookup(deger);
    if (!(s instanceof PDFStream)) continue;
    const gorsel = s.dict.lookupMaybe(PDFName.of('Subtype'), PDFName) === PDFName.of('Image');
    xobjeler.push({ ad: ad.asString(), gorsel, bayt: s.getContents() });
  }
  xobjeler.sort((a, b) => (a.ad < b.ad ? -1 : a.ad > b.ad ? 1 : 0));
  return { icerik, xobjeler };
}

// One page of an open document (task 6.S-4: the blank page's anchor in a newer version)
export async function sayfaIzi(lib: PdfLib, doc: PdfDoc, page: PdfPage): Promise<string> {
  const { icerik, xobjeler } = akislar(lib, doc, page);
  const gorseller = xobjeler.filter(x => x.gorsel);
  if (gorseller.length === 1) return 'g:' + await sha256(gorseller[0].bayt);
  const satirlar: string[] = [];
  for (const b of icerik) satirlar.push('c:' + await sha256(b));
  for (const x of xobjeler) satirlar.push(`x:${x.ad}:${await sha256(x.bayt)}`);
  return 'i:' + await sha256(new TextEncoder().encode(satirlar.join('\n')));
}

// Every page's fingerprint, in page order
export async function sayfaParmakIzleri(pdf: Uint8Array): Promise<string[]> {
  const lib = await import('pdf-lib');
  const doc = await lib.PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false });
  const out: string[] = [];
  for (const p of doc.getPages()) out.push(await sayfaIzi(lib, doc, p));
  return out;
}
