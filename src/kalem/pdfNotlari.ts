import type { PDFArray, PDFContext, PDFDict, PDFDocument, PDFObject, PDFRef } from 'pdf-lib';
import { hexToRgb, rgbToHex, strokeBounds, validateStroke, type PageStrokes, type Stroke, type StrokeTool } from './cizgi';

// Pen strokes as PDF Ink annotations (Faz 4, task 4.3). Nothing calls this yet.
// - Only Ink annotations marked with /DefterId are ours: read, replaced and removed here.
//   Page content streams, other annotations, form fields, metadata and page order stay as they are.
// - Every note gets an appearance stream (/AP /N), so Drive preview, iPad and Windows show it.
//   Highlighter: opacity < 1 and blend mode Multiply in the appearance's ExtGState.
// - Notes hang on the page object (/Annots, /P), not on a page number: a page inserted later
//   (Faz 5) doesn't move them to another page.
// - pdf-lib is loaded only when this runs (dynamic import), so it stays out of the first bundle.

type Lib = typeof import('pdf-lib');

let lib: Promise<Lib> | null = null;
function pdfLib(): Promise<Lib> {
  lib ??= import('pdf-lib');
  lib.catch(() => { lib = null; });   // e.g. offline: try again next time
  return lib;
}

export class PdfYazilamaz extends Error {}

const ENCRYPTED = 'Bu PDF şifreli olduğu için çizimler kaydedilemiyor. Şifresiz bir kopyasını Drive\'a yükleyip onu kullan.';
const UNREADABLE = 'Bu PDF okunamadı, o yüzden çizimler kaydedilemiyor. Dosya bozuk olabilir; Drive\'da açılıp açılmadığına bak.';
const SIGNED = 'Bu PDF dijital imzalı; çizim kaydedilirse imza bozulur.';

const TITLE = 'Defter';
const NM_PREFIX = 'defter-';

// Up to 2 decimals: 0.01 pt is far below what a pen can draw
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

async function load(bytes: Uint8Array): Promise<{ L: Lib; doc: PDFDocument }> {
  const L = await pdfLib();
  let doc: PDFDocument;
  try {
    // updateMetadata: false, otherwise pdf-lib rewrites Producer / ModDate in the file's metadata
    doc = await L.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    throw new PdfYazilamaz(UNREADABLE);
  }
  if (doc.isEncrypted) throw new PdfYazilamaz(ENCRYPTED);
  return { L, doc };
}

// The value at key, if it is of that type (a reference is followed); otherwise undefined.
function get<T extends PDFObject>(ctx: PDFContext, dict: PDFDict, key: string, type: Function & { prototype: T }, L: Lib): T | undefined {
  const v = ctx.lookup(dict.get(L.PDFName.of(key)));
  return v instanceof type ? v as T : undefined;
}

function text(L: Lib, v: PDFObject | undefined): string | undefined {
  return v instanceof L.PDFString || v instanceof L.PDFHexString ? v.decodeText() : undefined;
}

function numbers(L: Lib, ctx: PDFContext, arr: PDFArray | undefined): number[] {
  if (!arr) return [];
  const out: number[] = [];
  for (const el of arr.asArray()) {
    const n = ctx.lookup(el);
    if (n instanceof L.PDFNumber) out.push(n.asNumber());
  }
  return out;
}

// Ours: /Subtype /Ink with a /DefterId.
function isDefterInk(L: Lib, dict: PDFDict): boolean {
  return dict.get(L.PDFName.of('Subtype')) === L.PDFName.of('Ink') && text(L, dict.get(L.PDFName.of('DefterId'))) !== undefined;
}

function toStroke(L: Lib, ctx: PDFContext, dict: PDFDict): Stroke | null {
  const id = text(L, dict.get(L.PDFName.of('DefterId')))!;
  const ink = get(ctx, dict, 'InkList', L.PDFArray, L);
  const first = ink && ink.size() > 0 ? ctx.lookup(ink.get(0)) : undefined;
  const noktalar = numbers(L, ctx, first instanceof L.PDFArray ? first : undefined);
  if (noktalar.length < 2) return null;
  if (noktalar.length % 2) noktalar.pop();

  const tool = get(ctx, dict, 'DefterArac', L.PDFName, L)?.decodeText();
  const c = numbers(L, ctx, get(ctx, dict, 'C', L.PDFArray, L));
  const bs = get(ctx, dict, 'BS', L.PDFDict, L);
  const w = bs && get(ctx, bs, 'W', L.PDFNumber, L)?.asNumber();
  const border = numbers(L, ctx, get(ctx, dict, 'Border', L.PDFArray, L))[2];
  const ca = get(ctx, dict, 'CA', L.PDFNumber, L)?.asNumber();
  return {
    id,
    arac: tool === 'fosforlu' ? 'fosforlu' : 'kalem',
    renk: c.length >= 3 ? rgbToHex(c) : c.length === 1 ? rgbToHex([c[0], c[0], c[0]]) : '#000000',
    kalinlik: w ?? border ?? 1,
    opaklik: ca ?? 1,
    noktalar
  };
}

// Page index → the Defter strokes on it. Pages without any are not in the map.
export async function readDefterStrokes(bytes: Uint8Array): Promise<PageStrokes> {
  const { L, doc } = await load(bytes);
  const ctx = doc.context;
  const out: PageStrokes = new Map();
  doc.getPages().forEach((page, i) => {
    const annots = page.node.Annots();
    if (!annots) return;
    const strokes: Stroke[] = [];
    for (const el of annots.asArray()) {
      const dict = ctx.lookup(el);
      if (!(dict instanceof L.PDFDict) || !isDefterInk(L, dict)) continue;
      const s = toStroke(L, ctx, dict);
      if (s) strokes.push(s);
    }
    if (strokes.length) out.set(i, strokes);
  });
  return out;
}

// A signed PDF must not be rewritten: pdf-lib saves the whole file again, which breaks the signature.
function isSigned(L: Lib, doc: PDFDocument): boolean {
  const ctx = doc.context;
  const form = get(ctx, doc.catalog, 'AcroForm', L.PDFDict, L);
  if (!form) return false;
  const flags = get(ctx, form, 'SigFlags', L.PDFNumber, L)?.asNumber();
  if (flags) return true;
  const seen = new Set<PDFObject>();
  const hasSig = (arr: PDFArray | undefined): boolean => {
    for (const el of arr?.asArray() ?? []) {
      const f = ctx.lookup(el);
      if (!(f instanceof L.PDFDict) || seen.has(f)) continue;
      seen.add(f);
      if (f.get(L.PDFName.of('FT')) === L.PDFName.of('Sig')) return true;
      if (hasSig(get(ctx, f, 'Kids', L.PDFArray, L))) return true;
    }
    return false;
  };
  return hasSig(get(ctx, form, 'Fields', L.PDFArray, L));
}

// PDF date: D:YYYYMMDDHHmmSSZ (UTC)
function pdfDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

// The appearance: the stroke as a path with round caps and joins, in page coordinates.
// BBox = Rect and the matrix is identity, so the form lands exactly where it was drawn.
function appearance(s: Stroke): string {
  const [r, g, b] = hexToRgb(s.renk).map(r3);
  const pts = s.noktalar.map(r2);
  const path = [`${pts[0]} ${pts[1]} m`];
  if (pts.length === 2) path.push(`${pts[0]} ${pts[1]} l`);   // a single point: a round dot
  for (let i = 2; i < pts.length; i += 2) path.push(`${pts[i]} ${pts[i + 1]} l`);
  return `q /GS0 gs 1 J 1 j ${r2(s.kalinlik)} w ${r} ${g} ${b} RG\n${path.join('\n')}\nS Q\n`;
}

function addInk(L: Lib, ctx: PDFContext, pageRef: PDFRef, s: Stroke, date: string): PDFRef {
  const rect = strokeBounds(s).map(r2);
  const gs: Record<string, number | string> = { Type: 'ExtGState', CA: s.opaklik, ca: s.opaklik };
  if (s.arac === 'fosforlu') gs.BM = 'Multiply';
  const ap = ctx.register(ctx.flateStream(appearance(s), {
    Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: rect,
    Resources: { ExtGState: { GS0: gs } }
  }));
  const tool: StrokeTool = s.arac;
  return ctx.register(ctx.obj({
    Type: 'Annot', Subtype: 'Ink', P: pageRef,
    Rect: rect,
    InkList: [s.noktalar.map(r2)],
    C: hexToRgb(s.renk).map(r3),
    BS: { Type: 'Border', W: r2(s.kalinlik), S: 'S' },
    CA: s.opaklik,
    F: 4,   // Print
    NM: L.PDFHexString.fromText(NM_PREFIX + s.id),
    M: L.PDFString.of(date),
    T: L.PDFString.of(TITLE),
    DefterId: L.PDFHexString.fromText(s.id),
    DefterArac: tool,
    AP: { N: ap }
  }));
}

// Writes the strokes and returns the new file. For every page in the map, the old Defter notes
// are removed first, then one Ink note per stroke is added (an empty list only removes).
// Pages not in the map are not touched.
export async function writeDefterStrokes(bytes: Uint8Array, pages: PageStrokes, opts: { simdi?: Date } = {}): Promise<Uint8Array> {
  const { L, doc } = await load(bytes);
  if (isSigned(L, doc)) throw new PdfYazilamaz(SIGNED);

  const all = doc.getPages();
  const ids = new Set<string>();
  for (const [i, strokes] of pages) {
    if (!Number.isInteger(i) || i < 0 || i >= all.length) throw new RangeError(`Sayfa ${i} bu PDF'te yok (${all.length} sayfa).`);
    for (const s of strokes) {
      validateStroke(s);
      if (ids.has(s.id)) throw new Error(`Aynı çizgi id'si iki kez: ${s.id}`);
      ids.add(s.id);
    }
  }

  const ctx = doc.context;
  const date = pdfDate(opts.simdi ?? new Date());
  for (const [i, strokes] of pages) {
    const page = all[i];
    let annots = page.node.Annots();
    if (annots) {
      // remove ours (and their appearance streams), keep the order of the rest
      for (let k = annots.size() - 1; k >= 0; k--) {
        const el = annots.get(k);
        const dict = ctx.lookup(el);
        if (!(dict instanceof L.PDFDict) || !isDefterInk(L, dict)) continue;
        const n = get(ctx, dict, 'AP', L.PDFDict, L)?.get(L.PDFName.of('N'));
        if (n instanceof L.PDFRef) ctx.delete(n);
        if (el instanceof L.PDFRef) ctx.delete(el);
        annots.remove(k);
      }
    } else if (strokes.length) {
      annots = ctx.obj([]);
      page.node.set(L.PDFName.of('Annots'), annots);
    }
    for (const s of strokes) annots!.push(addInk(L, ctx, page.ref, s, date));
  }

  // addDefaultPage / updateFieldAppearances off: the page count and form fields stay as they are
  return doc.save({ addDefaultPage: false, updateFieldAppearances: false });
}
