import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString, type PDFPage } from 'pdf-lib';
import { PdfYazilamaz, readDefterStrokes } from '../kalem/pdfNotlari';
import { SAYFA_DUZENI } from './ayarlar';
import { fotograflardanPdf, SayfaEklemeHatasi, sayfaYerlesimi, sonaSayfaEkle, type Jpeg } from './sayfaEkle';

// Task 5.4: photos as pages at the end of a PDF / as a new PDF. The JPEGs are made here with sharp,
// the PDFs are the generated demo files (npm run demo-pdf): no course PDFs.

const N = (s: string) => PDFName.of(s);
// as in the other tests: the file as a data: URL (?inline), turned back into bytes
const demoUrls = import.meta.glob<string>('/public/demo/*.pdf', { eager: true, query: '?inline', import: 'default' });
const demo = (name: string) => Uint8Array.from(atob(demoUrls[`/public/demo/${name}`].split(',')[1]), c => c.charCodeAt(0));

const jpeg = async (w: number, h: number): Promise<Jpeg> =>
  ({ bytes: new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: '#d8c9a3' } }).jpeg({ quality: 85 }).toBuffer()) });

let dik: Jpeg, yatay: Jpeg, kare: Jpeg;
beforeAll(async () => { [dik, yatay, kare] = await Promise.all([jpeg(600, 800), jpeg(800, 600), jpeg(500, 500)]); });

const A4 = [SAYFA_DUZENI.genislik, SAYFA_DUZENI.yukseklik];
const A4_YATAY = [SAYFA_DUZENI.yukseklik, SAYFA_DUZENI.genislik];
const size = (p: PDFPage) => { const { width, height } = p.getSize(); return [width, height]; };

// A page's content streams (/Contents is one stream or an array of them)
function streams(p: PDFPage): PDFRawStream[] {
  const ctx = p.doc.context;
  const c = ctx.lookup(p.node.get(N('Contents')));
  return (c instanceof PDFArray ? c.asArray().map(r => ctx.lookup(r)) : [c]) as PDFRawStream[];
}

// What must not change on an existing page: boxes, rotation, content, annotations
function pageInfo(doc: PDFDocument, p: PDFPage) {
  const ctx = doc.context;
  const annots = (p.node.Annots()?.asArray() ?? []).map(r => {
    const d = ctx.lookup(r) as PDFDict;
    return ['Subtype', 'T', 'DefterId', 'Rect', 'Contents', 'NM'].map(k => ctx.lookup(d.get(N(k)))?.toString() ?? '-').join(' ');
  });
  return {
    media: p.getMediaBox(), crop: p.getCropBox(), rotate: p.getRotation().angle,
    content: streams(p).map(s => [...s.getContents()]),
    annots
  };
}

// x y of the photo's placement on a new page: "w 0 0 h x y cm" in its content stream
function placement(p: PDFPage) {
  const text = streams(p).map(s => new TextDecoder('latin1').decode(decodePDFRawStream(s).decode())).join('\n');
  // pdf-lib writes translate, rotate, scale, skew as separate cm's: multiply them (later ones first)
  const before = text.slice(0, text.indexOf(' Do'));
  expect(before, text).toContain('cm');
  let [a, b, c, d, e, f] = [1, 0, 0, 1, 0, 0];
  for (const m of before.matchAll(/([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) cm/g)) {
    const [a2, b2, c2, d2, e2, f2] = m.slice(1).map(Number);
    [a, b, c, d, e, f] = [a2 * a + b2 * c, a2 * b + b2 * d, c2 * a + d2 * c, c2 * b + d2 * d, e2 * a + f2 * c + e, e2 * b + f2 * d + f];
  }
  expect([b, c]).toEqual([0, 0]);   // not rotated or skewed
  return { x: e, y: f, w: a, h: d };   // the image's unit square, on the page
}

describe('sayfaYerlesimi', () => {
  const { kenar } = SAYFA_DUZENI;
  const cases: [number, number][] = [[600, 800], [800, 600], [500, 500], [100, 3000], [3000, 100], [20, 30], [2000, 1500], [1500, 2000]];

  it('landscape → landscape A4, portrait and square → portrait A4', () => {
    expect(sayfaYerlesimi(800, 600).sayfa).toEqual(A4_YATAY);
    expect(sayfaYerlesimi(600, 800).sayfa).toEqual(A4);
    expect(sayfaYerlesimi(500, 500).sayfa).toEqual(A4);
  });

  it('inside the margin, centred, aspect kept, touching the margin on one side', () => {
    for (const [gw, gh] of cases) {
      const { sayfa: [W, H], x, y, w, h } = sayfaYerlesimi(gw, gh);
      expect(x).toBeGreaterThanOrEqual(kenar - 1e-9);
      expect(y).toBeGreaterThanOrEqual(kenar - 1e-9);
      expect(x + w).toBeLessThanOrEqual(W - kenar + 1e-9);
      expect(y + h).toBeLessThanOrEqual(H - kenar + 1e-9);
      expect(x).toBeCloseTo(W - x - w, 9);
      expect(y).toBeCloseTo(H - y - h, 9);
      expect(w / h).toBeCloseTo(gw / gh, 9);
      expect(Math.min(x, y)).toBeCloseTo(kenar, 9);   // as big as fits (small photos are enlarged)
    }
  });

  it('another layout can be passed; bad sizes are refused', () => {
    expect(sayfaYerlesimi(10, 10, { genislik: 100, yukseklik: 200, kenar: 10 })).toEqual({ sayfa: [100, 200], x: 10, y: 60, w: 80, h: 80 });
    expect(() => sayfaYerlesimi(0, 10)).toThrow(RangeError);
    expect(() => sayfaYerlesimi(10, NaN)).toThrow(RangeError);
  });
});

describe('sonaSayfaEkle', () => {
  for (const name of ['demo-ozet-notlu.pdf', 'kalem-testi.pdf']) {
    it(`${name}: pages added at the end, the old ones unchanged (boxes, Rotate, content, all notes)`, async () => {
      const before = demo(name);
      const copy = before.slice();
      const out = await sonaSayfaEkle(before, [dik, yatay]);
      expect(before).toEqual(copy);   // the input is not changed

      const a = await PDFDocument.load(before), b = await PDFDocument.load(out);
      const n = a.getPageCount();
      expect(b.getPageCount()).toBe(n + 2);
      expect(b.getPages().slice(0, n).map(p => pageInfo(b, p))).toEqual(a.getPages().map(p => pageInfo(a, p)));
      expect(await readDefterStrokes(out)).toEqual(await readDefterStrokes(before));
      expect((await readDefterStrokes(before)).size).toBeGreaterThan(0);

      const [p1, p2] = b.getPages().slice(n);
      expect(size(p1)).toEqual(A4);
      expect(size(p2)).toEqual(A4_YATAY);
      for (const p of [p1, p2]) {
        expect(p.getRotation().angle).toBe(0);
        expect(p.node.Annots()?.size() ?? 0).toBe(0);   // pdf-lib gives a new page an empty /Annots
      }
    });
  }

  it('kalem-testi.pdf really has what is checked: notes from other apps, rotated and cropped pages', async () => {
    const doc = await PDFDocument.load(demo('kalem-testi.pdf'));
    const info = doc.getPages().map(p => pageInfo(doc, p));
    expect(info.some(i => i.rotate !== 0)).toBe(true);
    expect(info.some(i => JSON.stringify(i.crop) !== JSON.stringify(i.media))).toBe(true);
    expect(info.flatMap(i => i.annots).some(a => a.split(' ')[2] === '-')).toBe(true);   // no /DefterId
  });

  it('the photo sits on the page as sayfaYerlesimi says (nothing outside the margin)', async () => {
    const b = await PDFDocument.load(await sonaSayfaEkle(demo('demo-ozet-notlu.pdf'), [dik, yatay, kare]));
    const pages = b.getPages().slice(-3);
    [[600, 800], [800, 600], [500, 500]].forEach(([w, h], i) => {
      const want = sayfaYerlesimi(w, h);
      expect(size(pages[i])).toEqual(want.sayfa);
      const got = placement(pages[i]);
      for (const k of ['x', 'y', 'w', 'h'] as const) expect(got[k]).toBeCloseTo(want[k], 2);
    });
  });

  it('an encrypted file → PdfYazilamaz', async () => {
    const doc = await PDFDocument.load(demo('demo-ozet-notlu.pdf'));
    doc.context.trailerInfo.Encrypt = doc.context.register(doc.context.obj({ Filter: 'Standard', V: 2, R: 3, Length: 128, P: -4 }));
    const enc = await doc.save({ useObjectStreams: false });
    await expect(sonaSayfaEkle(enc, [dik])).rejects.toThrow(PdfYazilamaz);
    await expect(sonaSayfaEkle(enc, [dik])).rejects.toThrow('Bu PDF şifreli olduğu için sayfa eklenemiyor.');
  });

  it('a signed file → PdfYazilamaz', async () => {
    const doc = await PDFDocument.load(demo('demo-ozet-notlu.pdf'));
    const ctx = doc.context;
    doc.catalog.set(N('AcroForm'), ctx.register(ctx.obj({ Fields: [ctx.register(ctx.obj({ FT: 'Sig', T: PDFString.of('Imza') }))] })));
    await expect(sonaSayfaEkle(await doc.save(), [dik])).rejects.toThrow('Bu PDF dijital imzalı; sayfa eklenirse imza bozulur.');
  });

  it('not a PDF → PdfYazilamaz', async () => {
    await expect(sonaSayfaEkle(new TextEncoder().encode('bu bir PDF değil'), [dik])).rejects.toThrow(PdfYazilamaz);
  });

  it('empty list and broken photos → SayfaEklemeHatasi (which photo)', async () => {
    const pdf = demo('demo-ozet-notlu.pdf');
    await expect(sonaSayfaEkle(pdf, [])).rejects.toThrow(new SayfaEklemeHatasi('Eklenecek fotoğraf yok. En az bir fotoğraf seç.'));
    const kesik = { bytes: dik.bytes.slice(0, dik.bytes.length >> 1) };
    const png = { bytes: new Uint8Array(await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).png().toBuffer()) };
    // only the markers right, no frame header inside: pdf-lib refuses it
    const bos = { bytes: new Uint8Array([0xff, 0xd8, 0, 0, 0, 0, 0xff, 0xd9]) };
    for (const j of [kesik, png, bos]) {
      await expect(sonaSayfaEkle(pdf, [dik, j])).rejects.toThrow('2. fotoğraf okunamadı. O fotoğrafı tekrar seç.');
      await expect(fotograflardanPdf([dik, j])).rejects.toThrow(SayfaEklemeHatasi);
    }
  });
});

describe('fotograflardanPdf', () => {
  it('one page per photo, in order, portrait / landscape', async () => {
    const out = await fotograflardanPdf([dik, yatay, kare]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPages().map(size)).toEqual([A4, A4_YATAY, A4]);
    expect(placement(doc.getPage(1)).w).toBeCloseTo(sayfaYerlesimi(800, 600).w, 2);
  });

  it('empty list → SayfaEklemeHatasi', async () => {
    await expect(fotograflardanPdf([])).rejects.toThrow(SayfaEklemeHatasi);
  });
});
