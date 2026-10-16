import { describe, expect, it } from 'vitest';
import {
  decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream,
  PDFString, StandardFonts, type PDFPage
} from 'pdf-lib';
import type { PageStrokes, Stroke } from './cizgi';
import { PdfYazilamaz, readDefterStrokes, readStrokesForPen, writeDefterStrokes } from './pdfNotlari';

// Task 4.3: Defter strokes as Ink annotations. The PDFs are made here with pdf-lib (no course PDFs).

const N = (s: string) => PDFName.of(s);

// 3 A4 pages with text; page 2 (index 1) already has notes from other apps: Text, Highlight, Ink.
async function samplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) doc.addPage([595.28, 841.89]).drawText(`Sayfa ${i + 1}`, { x: 72, y: 760, size: 24, font });
  const ctx = doc.context, page = doc.getPage(1);
  const foreign = [
    ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [50, 700, 70, 720], Contents: PDFString.of('Merhaba'), T: PDFString.of('Ali') }),
    ctx.obj({ Type: 'Annot', Subtype: 'Highlight', Rect: [70, 750, 200, 790], QuadPoints: [70, 790, 200, 790, 70, 750, 200, 750], C: [1, 1, 0] }),
    ctx.obj({ Type: 'Annot', Subtype: 'Ink', Rect: [10, 10, 60, 60], InkList: [[20, 20, 50, 50]], C: [0, 0, 1], T: PDFString.of('GoodNotes') })
  ].map(d => ctx.register(d));
  page.node.set(N('Annots'), ctx.obj(foreign));
  return doc.save();
}

const stroke = (id: string, over: Partial<Stroke> = {}): Stroke => ({
  id, arac: 'kalem', renk: '#1a2b3c', kalinlik: 2.5, opaklik: 1, noktalar: [100, 100, 150.123, 180.456, 210, 120], ...over
});

const hl = (id: string) => stroke(id, { arac: 'fosforlu', renk: '#ffeb3b', kalinlik: 12, opaklik: 0.4, noktalar: [80, 400, 300, 402] });

function annotDicts(doc: PDFDocument, page: PDFPage): PDFDict[] {
  return (page.node.Annots()?.asArray() ?? []).map(r => doc.context.lookup(r) as PDFDict);
}
const isOurs = (d: PDFDict) => d.get(N('DefterId')) !== undefined;

const apText = (ap: PDFRawStream) => new TextDecoder().decode(decodePDFRawStream(ap).decode());
// every x y pair of the path operators (m, l, c) in an appearance stream
const pathPoints = (draw: string) => draw.split('\n').filter(l => / [mlc]$/.test(l)).flatMap(l => {
  const n = l.split(' ').slice(0, -1).map(Number);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]);
  return out;
});

function contentBytes(doc: PDFDocument, page: PDFPage): number[][] {
  const c = page.node.Contents();
  const streams = c instanceof PDFArray ? c.asArray().map(r => doc.context.lookup(r)) : [c];
  return streams.map(s => [...(s as PDFRawStream).getContents()]);
}

// a page and its notes as text (refs included), to see that nothing changed
function pageText(doc: PDFDocument, i: number): string {
  const page = doc.getPage(i);
  return [page.node.toString(), ...annotDicts(doc, page).map(d => d.toString())].join('\n');
}

function expectSame(a: PageStrokes, b: PageStrokes) {
  expect([...b.keys()]).toEqual([...a.keys()]);
  for (const [i, list] of a) {
    const got = b.get(i)!;
    expect(got.length).toBe(list.length);
    list.forEach((s, k) => {
      const g = got[k];
      expect({ id: g.id, arac: g.arac, renk: g.renk }).toEqual({ id: s.id, arac: s.arac, renk: s.renk });
      expect(g.kalinlik).toBeCloseTo(s.kalinlik, 2);
      expect(g.opaklik).toBeCloseTo(s.opaklik, 3);
      expect(g.noktalar.length).toBe(s.noktalar.length);
      g.noktalar.forEach((v, j) => expect(v).toBeCloseTo(s.noktalar[j], 1));
      expect(g.basinc).toEqual(s.basinc);
    });
  }
}

describe('writeDefterStrokes / readDefterStrokes', () => {
  it('writes strokes on 2 pages and reads them back', async () => {
    const strokes: PageStrokes = new Map([[0, [stroke('a1'), hl('a2')]], [2, [stroke('b1', { renk: '#ff0000', noktalar: [300, 300] })]]]);
    const out = await writeDefterStrokes(await samplePdf(), strokes);
    expectSame(strokes, await readDefterStrokes(out));
  });

  it('a PDF without Defter notes reads as empty', async () => {
    expect((await readDefterStrokes(await samplePdf())).size).toBe(0);
  });

  it('keeps notes from other apps (Text, Highlight, Ink without /DefterId), in order', async () => {
    const src = await samplePdf();
    const a = await PDFDocument.load(src);
    const before = annotDicts(a, a.getPage(1)).map(d => d.toString());
    const out = await writeDefterStrokes(src, new Map([[1, [stroke('x')]]]));
    const doc = await PDFDocument.load(out);
    const after = annotDicts(doc, doc.getPage(1));
    expect(after.filter(d => !isOurs(d)).map(d => d.toString())).toEqual(before);
    expect(after.filter(isOurs).length).toBe(1);
    // the GoodNotes Ink note is not read as ours
    expect((await readDefterStrokes(out)).get(1)!.map(s => s.id)).toEqual(['x']);
  });

  it('a second write replaces the old Defter notes; an empty list removes them', async () => {
    const once = await writeDefterStrokes(await samplePdf(), new Map([[1, [stroke('a'), stroke('b')]]]));
    const twice = await writeDefterStrokes(once, new Map([[1, [stroke('c')]]]));
    let doc = await PDFDocument.load(twice);
    expect(annotDicts(doc, doc.getPage(1)).filter(isOurs).length).toBe(1);
    expect((await readDefterStrokes(twice)).get(1)!.map(s => s.id)).toEqual(['c']);

    const cleared = await writeDefterStrokes(twice, new Map([[1, []]]));
    doc = await PDFDocument.load(cleared);
    expect(annotDicts(doc, doc.getPage(1)).length).toBe(3);   // only the foreign ones
    expect((await readDefterStrokes(cleared)).size).toBe(0);
  });

  it('removed notes leave no objects behind (the file does not grow with every write)', async () => {
    let bytes = await writeDefterStrokes(await samplePdf(), new Map([[0, [stroke('a')]]]));
    const objects = (await PDFDocument.load(bytes)).context.enumerateIndirectObjects().length;
    for (let k = 0; k < 3; k++) bytes = await writeDefterStrokes(bytes, new Map([[0, [stroke('a')]]]));
    expect((await PDFDocument.load(bytes)).context.enumerateIndirectObjects().length).toBe(objects);
  });

  it('keeps content stream bytes and page count', async () => {
    const src = await samplePdf();
    const a = await PDFDocument.load(src);
    const out = await writeDefterStrokes(src, new Map([[0, [stroke('a')]], [1, [hl('b')]], [2, []]]));
    const b = await PDFDocument.load(out);
    expect(b.getPageCount()).toBe(3);
    for (let i = 0; i < 3; i++) expect(contentBytes(b, b.getPage(i))).toEqual(contentBytes(a, a.getPage(i)));
  });

  it('a page not in the map does not change at all', async () => {
    const src = await samplePdf();
    const a = await PDFDocument.load(src);
    const b = await PDFDocument.load(await writeDefterStrokes(src, new Map([[0, [stroke('a')]]])));
    expect(pageText(b, 1)).toBe(pageText(a, 1));
    expect(pageText(b, 2)).toBe(pageText(a, 2));
  });

  it('every note has /AP /N with BBox = Rect, and the fields Drive and other apps need', async () => {
    const out = await writeDefterStrokes(await samplePdf(), new Map([[0, [stroke('k'), hl('f')]]]), { simdi: new Date(Date.UTC(2026, 9, 15, 8, 5, 3)) });
    const doc = await PDFDocument.load(out);
    const ctx = doc.context;
    const [pen, marker] = annotDicts(doc, doc.getPage(0));
    const apOf = (d: PDFDict) => ctx.lookup((d.get(N('AP')) as PDFDict).get(N('N'))) as PDFRawStream;
    for (const d of [pen, marker]) {
      expect(d.get(N('Subtype'))).toBe(N('Ink'));
      expect((d.get(N('F')) as PDFNumber).asNumber()).toBe(4);
      expect((d.get(N('T')) as PDFString).decodeText()).toBe('Defter');
      expect((d.get(N('NM')) as PDFHexString).decodeText()).toMatch(/^defter-/);
      expect((d.get(N('M')) as PDFString).decodeText()).toBe('D:20261015080503Z');
      expect(d.get(N('P'))).toBe(doc.getPage(0).ref);

      const rect = (d.get(N('Rect')) as PDFArray).asArray().map(n => (n as PDFNumber).asNumber());
      const ap = ctx.lookup((ctx.lookup(d.get(N('AP'))) as PDFDict).get(N('N'))) as PDFRawStream;
      expect(ap).toBeInstanceOf(PDFRawStream);
      expect(ap.dict.get(N('Subtype'))).toBe(N('Form'));
      expect((ap.dict.get(N('BBox')) as PDFArray).asArray().map(n => (n as PDFNumber).asNumber())).toEqual(rect);

      // Rect covers every point plus half the line width
      const w = ((d.get(N('BS')) as PDFDict).get(N('W')) as PDFNumber).asNumber();
      const pts = ((d.get(N('InkList')) as PDFArray).get(0) as PDFArray).asArray().map(n => (n as PDFNumber).asNumber());
      for (let i = 0; i < pts.length; i += 2) {
        expect(pts[i] - w / 2).toBeGreaterThanOrEqual(rect[0]);
        expect(pts[i + 1] - w / 2).toBeGreaterThanOrEqual(rect[1]);
        expect(pts[i] + w / 2).toBeLessThanOrEqual(rect[2]);
        expect(pts[i + 1] + w / 2).toBeLessThanOrEqual(rect[3]);
      }

      // task 4.7c: curves (c), no straight segments; every point of the drawing (controls too) inside Rect
      const draw = apText(ap);
      expect(draw).toMatch(/ c\n/);
      expect(draw).not.toMatch(/ l\n/);
      for (const [x, y] of pathPoints(draw)) {
        expect(x).toBeGreaterThanOrEqual(rect[0]);
        expect(y).toBeGreaterThanOrEqual(rect[1]);
        expect(x).toBeLessThanOrEqual(rect[2]);
        expect(y).toBeLessThanOrEqual(rect[3]);
      }
    }
    // pen: the outline filled (closed, f, fill colour rg); highlighter: the smoothed line stroked with round caps
    const penDraw = apText(apOf(pen)), markerDraw = apText(apOf(marker));
    expect(penDraw).toMatch(/^q \/GS0 gs 0\.102 0\.169 0\.235 rg\n[\d. -]+ m\n/);
    expect(penDraw).toMatch(/\nh\nf Q\n$/);
    expect(penDraw).not.toMatch(/\bS\b|RG|\bw\b/);
    expect(markerDraw).toMatch(/1 J 1 j 12 w 1 0\.922 0\.231 RG\n/);
    expect(markerDraw).toMatch(/ c\nS Q\n$/);
    expect(markerDraw).not.toMatch(/\bf\b|\bh\b/);

    const gs = (d: PDFDict) => ((apOf(d).dict.get(N('Resources')) as PDFDict).get(N('ExtGState')) as PDFDict).get(N('GS0')) as PDFDict;
    expect((marker.get(N('CA')) as PDFNumber).asNumber()).toBeLessThan(1);
    expect(gs(marker).get(N('BM'))).toBe(N('Multiply'));
    expect((gs(marker).get(N('CA')) as PDFNumber).asNumber()).toBe(0.4);
    expect(marker.get(N('DefterArac'))).toBe(N('fosforlu'));
    expect(gs(pen).get(N('BM'))).toBeUndefined();
  });

  it('task 4.7c: pressure goes to /DefterBasinc and comes back; no pressure → no key', async () => {
    const pressed = stroke('p', { basinc: [0.1, 0.55, 1] });
    const out = await writeDefterStrokes(await samplePdf(), new Map([[0, [pressed, stroke('q'), hl('r')]]]));
    const read = (await readDefterStrokes(out)).get(0)!;
    expect(read.map(s => s.basinc)).toEqual([[0.1, 0.55, 1], undefined, undefined]);
    const doc = await PDFDocument.load(out);
    const [a, b, c] = annotDicts(doc, doc.getPage(0));
    const nums = (v: unknown) => (v as PDFArray).asArray().map(n => (n as PDFNumber).asNumber());
    expect(nums(a.get(N('DefterBasinc')))).toEqual([0.1, 0.55, 1]);
    expect(b.get(N('DefterBasinc'))).toBeUndefined();
    expect(c.get(N('DefterBasinc'))).toBeUndefined();
    // /InkList stays the plain centre line (other programs)
    expect(nums((a.get(N('InkList')) as PDFArray).get(0))).toEqual([100, 100, 150.12, 180.46, 210, 120]);
    // the pressure changes the drawing
    const ap = (d: PDFDict) => apText(doc.context.lookup((d.get(N('AP')) as PDFDict).get(N('N'))) as PDFRawStream);
    expect(ap(a)).not.toBe(ap(b));
  });

  it('task 4.7c: pressure that does not fit the points (another program changed the line) is left out', async () => {
    const out = await writeDefterStrokes(await samplePdf(), new Map([[0, [stroke('p', { basinc: [0.1, 0.5, 1] })]]]));
    const doc = await PDFDocument.load(out);
    const [a] = annotDicts(doc, doc.getPage(0));
    a.set(N('DefterBasinc'), doc.context.obj([0.5, 0.5]));
    const read = (await readDefterStrokes(await doc.save())).get(0)!;
    expect(read[0].basinc).toBeUndefined();
    expect(read[0].noktalar).toHaveLength(6);
  });

  it('task 4.7c: invalid pressure is not written', async () => {
    const src = await samplePdf();
    await expect(writeDefterStrokes(src, new Map([[0, [stroke('a', { basinc: [0.5, 0.5] })]]]))).rejects.toThrow(/basınç sayısı/);
    await expect(writeDefterStrokes(src, new Map([[0, [stroke('a', { basinc: [0.5, 1.2, 0.5] })]]]))).rejects.toThrow(/0–1/);
    await expect(writeDefterStrokes(src, new Map([[0, [stroke('a', { arac: 'fosforlu', opaklik: 0.4, basinc: [0.5, 0.5, 0.5] })]]]))).rejects.toThrow(/fosforluda/);
  });

  it('notes stay on their page when a page is inserted before it (Faz 5)', async () => {
    const out = await writeDefterStrokes(await samplePdf(), new Map([[0, [stroke('a')]], [1, [stroke('b')]]]));
    const doc = await PDFDocument.load(out);
    doc.insertPage(1, [595.28, 841.89]);
    const read = await readDefterStrokes(await doc.save());
    expect([...read.keys()]).toEqual([0, 2]);
    expect(read.get(2)!.map(s => s.id)).toEqual(['b']);
  });

  it('rejects a page outside the PDF and invalid strokes, without writing', async () => {
    const src = await samplePdf();
    await expect(writeDefterStrokes(src, new Map([[3, [stroke('a')]]]))).rejects.toThrow(RangeError);
    await expect(writeDefterStrokes(src, new Map([[0, [stroke('a', { renk: 'red' })]]]))).rejects.toThrow(/renk/);
    await expect(writeDefterStrokes(src, new Map([[0, [stroke('a')]], [1, [stroke('a')]]]))).rejects.toThrow(/iki kez/);
  });
});

describe('PDFs that must not be written', () => {
  it('an unreadable file → PdfYazilamaz', async () => {
    const junk = new TextEncoder().encode('bu bir PDF değil');
    await expect(writeDefterStrokes(junk, new Map())).rejects.toThrow(PdfYazilamaz);
    await expect(readDefterStrokes(junk)).rejects.toThrow(PdfYazilamaz);
  });

  it('an encrypted file → PdfYazilamaz', async () => {
    const doc = await PDFDocument.load(await samplePdf());
    doc.context.trailerInfo.Encrypt = doc.context.register(doc.context.obj({ Filter: 'Standard', V: 2, R: 3, Length: 128, P: -4 }));
    const enc = await doc.save({ useObjectStreams: false });
    await expect(writeDefterStrokes(enc, new Map([[0, [stroke('a')]]]))).rejects.toThrow(/şifreli/);
    await expect(writeDefterStrokes(enc, new Map())).rejects.toThrow(PdfYazilamaz);
    await expect(readStrokesForPen(enc)).rejects.toThrow(/şifreli/);
  });

  async function signed(how: 'flags' | 'field'): Promise<Uint8Array> {
    const doc = await PDFDocument.load(await writeDefterStrokes(await samplePdf(), new Map([[0, [stroke('a')]]])));
    const ctx = doc.context;
    const form = how === 'flags'
      ? ctx.obj({ Fields: [], SigFlags: 3 })
      : ctx.obj({ Fields: [ctx.register(ctx.obj({ T: PDFString.of('Ust'), Kids: [ctx.register(ctx.obj({ FT: 'Sig', T: PDFString.of('Imza') }))] }))] });
    doc.catalog.set(N('AcroForm'), ctx.register(form));
    return doc.save();
  }

  it('a signed file (SigFlags or a /FT /Sig field) is not written, but can be read', async () => {
    for (const how of ['flags', 'field'] as const) {
      const pdf = await signed(how);
      await expect(writeDefterStrokes(pdf, new Map([[0, [stroke('b')]]]))).rejects.toThrow('Bu PDF dijital imzalı; çizim kaydedilirse imza bozulur.');
      expect((await readDefterStrokes(pdf)).get(0)!.map(s => s.id)).toEqual(['a']);
      // task 4.6: the pen doesn't start on it
      await expect(readStrokesForPen(pdf)).rejects.toThrow('Bu PDF dijital imzalı; çizim kaydedilirse imza bozulur.');
    }
  });

  it('a form without signatures is still written', async () => {
    const doc = await PDFDocument.load(await samplePdf());
    doc.catalog.set(N('AcroForm'), doc.context.register(doc.context.obj({ Fields: [], SigFlags: 0 })));
    const out = await writeDefterStrokes(await doc.save(), new Map([[0, [stroke('a')]]]));
    expect((await readDefterStrokes(out)).get(0)!.length).toBe(1);
    expect((await readStrokesForPen(out)).get(0)!.length).toBe(1);
  });
});

// pdf.js (what the reader uses) sees the notes. Also: which fields it gives us to recognise
// Defter notes later (for hiding them from the canvas, next step).
describe('pdf.js reads the notes', () => {
  it('Ink, inkLists, titleObj = Defter; reports whether /NM comes through', async () => {
    const out = await writeDefterStrokes(await samplePdf(), new Map([[0, [hl('ph')]], [1, [stroke('pj', { noktalar: [100, 100, 200, 200] })]]]));
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: out }).promise;
    try {
      const annots = await (await doc.getPage(2)).getAnnotations();
      const ours = annots.filter(a => a.titleObj?.str === 'Defter');
      expect(ours.length).toBe(1);
      const a = ours[0];
      expect(a.annotationType).toBe(15);   // AnnotationType.INK
      expect(a.subtype).toBe('Ink');
      expect(a.inkLists[0].length).toBe(4);
      expect(a.hasAppearance).toBe(true);
      // the GoodNotes Ink note is there too, without our title
      expect(annots.filter(x => x.subtype === 'Ink').length).toBe(2);

      // task 4.4: enough to draw the stroke without pdf-lib (points, colour, width, opacity)
      expect([...a.inkLists[0]]).toEqual([100, 100, 200, 200]);
      expect([...a.color]).toEqual([0x1a, 0x2b, 0x3c]);
      expect(a.borderStyle.width).toBeCloseTo(2.5, 2);
      expect(a.opacity).toBe(1);
      const hlNote = (await (await doc.getPage(1)).getAnnotations()).find(x => x.titleObj?.str === 'Defter');
      expect(hlNote?.opacity).toBeCloseTo(0.4, 3);   // highlighter: opacity < 1 (pen is always 1)
      // pdf.js sets borderStyle.width to 1 when it is more than half the Rect's height (a flat
      // highlighter stroke): the written width is in borderStyle.rawWidth
      expect(hlNote?.borderStyle.width).toBe(1);
      expect(hlNote?.borderStyle.rawWidth).toBe(12);
      expect(a.borderStyle.rawWidth).toBeCloseTo(2.5, 2);

      const nm = Object.entries(a).filter(([, v]) => typeof v === 'string' && v.startsWith('defter-')).map(([k]) => k);
      console.log(`[pdf.js] Defter notu alanları: ${Object.keys(a).sort().join(', ')}`);
      console.log(`[pdf.js] /NM (defter-…) gelen alan: ${nm.length ? nm.join(', ') : 'YOK'} · id: ${a.id}`);
    } finally {
      await doc.loadingTask.destroy();
    }
  });
});
