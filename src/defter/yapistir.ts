import type { PDFDict, PDFDocument, PDFObject, PDFPage, PDFRef } from 'pdf-lib';
import { KAGIT_CIZGI_KOYULUK, KAGIT_CIZGI_PT } from '../elYazisi/kagitCizgi';
import { isDefterInk, SAVE_OPTIONS, yazilabilirAc } from '../kalem/pdfNotlari';
import { sayfaIzi } from '../ocr/kayit/parmakIzi';
import { desenCizgileri, izleBul, n3, temizId, type Desen } from './sayfaOrtak';
import { MESAJLAR } from './sayfaEkle';

// Task 6.S-4c: "Deftere yapıştır" — a landscape (or square) page gets room above and below it, so the pen can
// write next to a slide (CLAUDE.md → 6.S-4c). Pure: no Drive, no DOM.
// - Only the page's boxes grow: MediaBox and, when the page has them, CropBox / TrimBox / BleedBox / ArtBox, by the
//   same d up and down (seen as the page is shown: /Rotate 90/270 grows along x) until the visible box is A4's
//   shape (height = width × √2). The content stream, the notes and their coordinates stay as they are; the page count
//   too (no ribbon or reading record moves).
// - The two new bands get a white ground and the pattern (sayfaOrtak.ts's lines, kagitCizgi.ts's tone) from a content
//   stream put BEFORE the page's own, clipped to the bands: nothing is drawn over the slide. That stream carries
//   /DefterYapistir true and is left out of the page's fingerprint (parmakIzi.ts): a reading stays on its page.
// - Mark: /DefterYapistir << /Eski <<old box values, as they were (references too)>> /Kalitim [boxes the page
//   inherited] /EskiContents <old /Contents> /Akis <the stream> /Desen /IslemId >>. Undo puts all of it back.

export const YAPISTIR = 'DefterYapistir';
const KUTULAR = ['MediaBox', 'CropBox', 'TrimBox', 'BleedBox', 'ArtBox'] as const;
const KALITILABILIR = new Set(['MediaBox', 'CropBox']);

type Lib = typeof import('pdf-lib');

export class BantNotuVar extends Error {
  constructor() { super('Slaytın dışında yeni kalem yazısı var; geri alma yapılmadı. "Deftere yapıştırmayı geri al"a yeniden dokun.'); }
}

export class YapistirilamazDikey extends Error {
  constructor() { super('Bu sayfa zaten dikey; deftere yapıştırmaya gerek yok.'); }
}

// ---- geometry (pure numbers) ----

export interface Dikdortgen { x0: number; y0: number; x1: number; y1: number }
export type Aci = 0 | 90 | 180 | 270;

export const aciOf = (a: number): Aci => (((Math.round(a / 90) * 90) % 360 + 360) % 360) as Aci;
const dik = (a: Aci) => a === 90 || a === 270;

// Seen as the page is shown
export function gorunurOlcu(k: Dikdortgen, a: Aci): { en: number; boy: number } {
  const w = k.x1 - k.x0, h = k.y1 - k.y0;
  return dik(a) ? { en: h, boy: w } : { en: w, boy: h };
}

export const yatayMi = (k: Dikdortgen, a: Aci): boolean => { const o = gorunurOlcu(k, a); return o.en >= o.boy; };

// How much each side grows (seen top and bottom): the visible height becomes width × √2
export function buyume(gorunur: Dikdortgen, a: Aci): number {
  const { en, boy } = gorunurOlcu(gorunur, a);
  return Math.max(0, (en * Math.SQRT2 - boy) / 2);
}

// One box grown by d along the visible vertical (user y; x when the page is turned 90/270)
export const buyut = (k: Dikdortgen, d: number, a: Aci): Dikdortgen =>
  dik(a) ? { x0: k.x0 - d, y0: k.y0, x1: k.x1 + d, y1: k.y1 } : { x0: k.x0, y0: k.y0 - d, x1: k.x1, y1: k.y1 + d };

// The two new bands of the grown visible box (user space)
export function bantlar(eski: Dikdortgen, yeni: Dikdortgen, a: Aci): Dikdortgen[] {
  return dik(a)
    ? [{ x0: yeni.x0, y0: yeni.y0, x1: eski.x0, y1: yeni.y1 }, { x0: eski.x1, y0: yeni.y0, x1: yeni.x1, y1: yeni.y1 }]
    : [{ x0: yeni.x0, y0: yeni.y0, x1: yeni.x1, y1: eski.y0 }, { x0: yeni.x0, y0: eski.y1, x1: yeni.x1, y1: yeni.y1 }];
}

// [a b c d e f]: the visible page (origin bottom left as shown, x right, y up) → user space of box k
export function gorunurMatris(k: Dikdortgen, a: Aci): [number, number, number, number, number, number] {
  const H = gorunurOlcu(k, a).boy;
  switch (a) {
    case 0: return [1, 0, 0, 1, k.x0, k.y0];
    case 90: return [0, 1, -1, 0, k.x0 + H, k.y0];
    case 180: return [-1, 0, 0, -1, k.x1, k.y1];
    case 270: return [0, -1, 1, 0, k.x0, k.y1];
  }
}

const re = (r: Dikdortgen) => `${n3(r.x0)} ${n3(r.y0)} ${n3(r.x1 - r.x0)} ${n3(r.y1 - r.y0)} re`;

// The bands' stream: white ground + pattern, clipped to the bands, the graphics state restored at the end
export function bantAkisi(eski: Dikdortgen, yeni: Dikdortgen, a: Aci, desen: Desen, islemId: string): string {
  const b = bantlar(eski, yeni, a);
  const gri = n3((255 - KAGIT_CIZGI_KOYULUK) / 255);
  const s = [`% ${YAPISTIR} ${temizId(islemId)}`, 'q', ...b.map(re), 'W n', '1 1 1 rg', ...b.map(re), 'f'];
  const { en, boy } = gorunurOlcu(yeni, a);
  const c = desenCizgileri(en, boy, desen);
  if (c.length) {
    s.push('q', `${gorunurMatris(yeni, a).map(n3).join(' ')} cm`, `${gri} ${gri} ${gri} RG`, `${n3(KAGIT_CIZGI_PT)} w`, '0 J');
    for (const l of c) s.push(`${n3(l.x1)} ${n3(l.y1)} m ${n3(l.x2)} ${n3(l.y2)} l`);
    s.push('S', 'Q');
  }
  s.push('Q');
  return s.join('\n') + '\n';
}

// ---- reading the page ----

function kutuOku(L: Lib, doc: PDFDocument, v: PDFObject | undefined): Dikdortgen | null {
  const arr = doc.context.lookup(v);
  if (!(arr instanceof L.PDFArray) || arr.size() !== 4) return null;
  const n = arr.asArray().map(x => doc.context.lookup(x)).map(x => x instanceof L.PDFNumber ? x.asNumber() : NaN);
  if (n.some(x => !Number.isFinite(x))) return null;
  return { x0: Math.min(n[0], n[2]), y0: Math.min(n[1], n[3]), x1: Math.max(n[0], n[2]), y1: Math.max(n[1], n[3]) };
}

const kutuDegeri = (L: Lib, page: PDFPage, ad: string): PDFObject | undefined =>
  KALITILABILIR.has(ad) ? page.node.getInheritableAttribute(L.PDFName.of(ad)) : page.node.get(L.PDFName.of(ad));

// The visible box (CropBox, else MediaBox; pdf.js shows their overlap) and its turn
function gorunur(L: Lib, doc: PDFDocument, page: PDFPage): { kutu: Dikdortgen; aci: Aci } | null {
  const m = kutuOku(L, doc, kutuDegeri(L, page, 'MediaBox'));
  if (!m) return null;
  const c = kutuOku(L, doc, kutuDegeri(L, page, 'CropBox'));
  const k = c ? { x0: Math.max(m.x0, c.x0), y0: Math.max(m.y0, c.y0), x1: Math.min(m.x1, c.x1), y1: Math.min(m.y1, c.y1) } : m;
  if (k.x1 <= k.x0 || k.y1 <= k.y0) return null;
  return { kutu: k, aci: aciOf(page.getRotation().angle) };
}

// An inheritable value from the page's parents only (the page's own was replaced by the grown box)
function ebeveyndenDeger(L: Lib, doc: PDFDocument, page: PDFPage, ad: string): PDFObject | undefined {
  let node = doc.context.lookup(page.node.get(L.PDFName.of('Parent')));
  for (let k = 0; node instanceof L.PDFDict && k < 64; k++) {
    if (node.has(L.PDFName.of(ad))) return node.get(L.PDFName.of(ad));
    node = doc.context.lookup(node.get(L.PDFName.of('Parent')));
  }
  return undefined;
}

export interface YapistirKaydi { islemId: string; desen: Desen; eskiKutu: Dikdortgen }

function isaret(L: Lib, doc: PDFDocument, page: PDFPage): PDFDict | undefined {
  const v = doc.context.lookup(page.node.get(L.PDFName.of(YAPISTIR)));
  return v instanceof L.PDFDict ? v : undefined;
}

export function yapistirilmisMi(L: Lib, doc: PDFDocument, page: PDFPage): YapistirKaydi | null {
  const m = isaret(L, doc, page);
  if (!m) return null;
  const id = doc.context.lookup(m.get(L.PDFName.of('IslemId')));
  const desen = doc.context.lookup(m.get(L.PDFName.of('Desen')));
  const eski = doc.context.lookup(m.get(L.PDFName.of('Eski')));
  const islemId = id instanceof L.PDFString || id instanceof L.PDFHexString ? id.decodeText() : '';
  // the old visible box: the old values (inherited ones are still on the parent)
  const deger = (ad: string) => eski instanceof L.PDFDict && eski.has(L.PDFName.of(ad)) ? eski.get(L.PDFName.of(ad))
    : KALITILABILIR.has(ad) ? ebeveyndenDeger(L, doc, page, ad) : undefined;
  const mb = kutuOku(L, doc, deger('MediaBox')), cb = kutuOku(L, doc, deger('CropBox'));
  const k = mb && cb ? { x0: Math.max(mb.x0, cb.x0), y0: Math.max(mb.y0, cb.y0), x1: Math.min(mb.x1, cb.x1), y1: Math.min(mb.y1, cb.y1) } : mb ?? cb;
  return { islemId, desen: (desen instanceof L.PDFName ? desen.decodeText() : 'duz') as Desen, eskiKutu: k ?? { x0: 0, y0: 0, x1: 0, y1: 0 } };
}

// For the reader's popover: the pages seen landscape / square, and the pasted ones
export function sayfaDurumlari(L: Lib, doc: PDFDocument): { yatay: Set<number>; yapistirilmis: Map<number, YapistirKaydi> } {
  const yatay = new Set<number>(), yapistirilmis = new Map<number, YapistirKaydi>();
  doc.getPages().forEach((p, i) => {
    const y = yapistirilmisMi(L, doc, p);
    if (y) { yapistirilmis.set(i, y); return; }
    const g = gorunur(L, doc, p);
    if (g && yatayMi(g.kutu, g.aci)) yatay.add(i);
  });
  return { yatay, yapistirilmis };
}

// ---- paste ----

export interface YapistirIstek {
  indeksler: number[] | 'yataylar';   // 0-based (in the reader's version) | every landscape page not pasted yet
  izler?: string[];                   // those pages' fingerprints in the reader's version (Drive may have a newer one)
  desen: Desen;
  islemId: string;
}

export type Yapistirildi = { bytes: Uint8Array; sayfalar: number[]; sayfa: number } | { zatenVar: true; sayfalar: number[]; sayfa: number };

function sayfayiYapistir(L: Lib, doc: PDFDocument, page: PDFPage, desen: Desen, islemId: string): void {
  const ctx = doc.context, N = (s: string) => L.PDFName.of(s);
  const g = gorunur(L, doc, page)!;
  const d = buyume(g.kutu, g.aci);
  const eski = ctx.obj({}) as PDFDict, kalitim: string[] = [];
  for (const ad of KUTULAR) {
    const direkt = page.node.get(N(ad));
    const deger = direkt ?? kutuDegeri(L, page, ad);
    const k = kutuOku(L, doc, deger);
    if (!k) continue;
    if (direkt) eski.set(N(ad), direkt); else kalitim.push(ad);
    const y = buyut(k, d, g.aci);
    page.node.set(N(ad), ctx.obj([y.x0, y.y0, y.x1, y.y1].map(v => Math.round(v * 1000) / 1000)));
  }
  const akis = ctx.flateStream(bantAkisi(g.kutu, buyut(g.kutu, d, g.aci), g.aci, desen, islemId), { [YAPISTIR]: true });
  const akisRef = ctx.register(akis);
  const eskiContents = page.node.get(N('Contents'));
  const parcalar: PDFObject[] = [akisRef];
  const c = ctx.lookup(eskiContents);
  if (c instanceof L.PDFArray) parcalar.push(...c.asArray()); else if (eskiContents) parcalar.push(eskiContents);
  page.node.set(N('Contents'), ctx.obj(parcalar));
  const isaretDict = ctx.obj({}) as PDFDict;
  isaretDict.set(N('Eski'), eski);
  isaretDict.set(N('Kalitim'), ctx.obj(kalitim.map(N)));
  if (eskiContents) isaretDict.set(N('EskiContents'), eskiContents);
  isaretDict.set(N('Akis'), akisRef);
  isaretDict.set(N('Desen'), N(desen));
  isaretDict.set(N('IslemId'), L.PDFString.of(islemId));
  page.node.set(N(YAPISTIR), isaretDict);
}

// The pages pasted (0-based). Pages already pasted by this islemId are skipped; none left → zatenVar.
// Upright pages and pages pasted by another job are skipped ('yataylar'); asked for by index → YapistirilamazDikey.
export async function yapistir(pdfBytes: Uint8Array, r: YapistirIstek): Promise<Yapistirildi> {
  const { L, doc } = await yazilabilirAc(pdfBytes, MESAJLAR);
  const sayfalar = doc.getPages(), n = sayfalar.length;
  const bunun = sayfalar.flatMap((p, i) => yapistirilmisMi(L, doc, p)?.islemId === r.islemId ? [i] : []);
  let hedef: number[];
  if (r.indeksler === 'yataylar') {
    if (bunun.length) return { zatenVar: true, sayfalar: bunun, sayfa: n };
    hedef = [...sayfaDurumlari(L, doc).yatay];
  } else {
    hedef = [];
    for (let k = 0; k < r.indeksler.length; k++) hedef.push(await izleBul(L, doc, r.indeksler[k], r.izler?.[k]));
    // pasted already (this try earlier, or another job): nothing to do for it
    hedef = [...new Set(hedef)].filter(i => !yapistirilmisMi(L, doc, sayfalar[i]));
    if (!hedef.length) return { zatenVar: true, sayfalar: bunun, sayfa: n };
    for (const i of hedef) {
      const g = gorunur(L, doc, sayfalar[i]);
      if (!g || !yatayMi(g.kutu, g.aci)) throw new YapistirilamazDikey();
    }
  }
  if (!hedef.length) throw new YapistirilamazDikey();
  for (const i of hedef) sayfayiYapistir(L, doc, sayfalar[i], r.desen, r.islemId);
  return { bytes: await doc.save(SAVE_OPTIONS), sayfalar: hedef, sayfa: n };
}

// ---- undo ----

const disinda = (r: Dikdortgen, k: Dikdortgen) => r.x0 < k.x0 || r.y0 < k.y0 || r.x1 > k.x1 || r.y1 > k.y1;

// The Defter Ink notes whose /Rect reaches outside the old visible box (written in the bands): their annotation entries
function bantNotuIndeksleri(L: Lib, doc: PDFDocument, page: PDFPage, eskiKutu: Dikdortgen): number[] {
  const annots = page.node.Annots();
  const out: number[] = [];
  annots?.asArray().forEach((el, k) => {
    const a = doc.context.lookup(el);
    if (!(a instanceof L.PDFDict) || !isDefterInk(L, a)) return;
    const r = kutuOku(L, doc, a.get(L.PDFName.of('Rect')));
    if (r && disinda(r, eskiKutu)) out.push(k);
  });
  return out;
}

// The notes in the bands of page `indeks` (their /DefterId); [] when the page isn't pasted
export async function bantNotlari(pdfBytes: Uint8Array, indeks: number): Promise<string[]> {
  const L = await import('pdf-lib');
  const doc = await L.PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  if (indeks < 0 || indeks >= doc.getPageCount()) return [];
  const page = doc.getPage(indeks), y = yapistirilmisMi(L, doc, page);
  if (!y) return [];
  const annots = page.node.Annots()!;
  return bantNotuIndeksleri(L, doc, page, y.eskiKutu).map(k => {
    const v = (doc.context.lookup(annots.get(k)) as PDFDict).get(L.PDFName.of('DefterId'));
    return v instanceof L.PDFString || v instanceof L.PDFHexString ? v.decodeText() : '';
  });
}

export interface GeriAlIstek { indeks: number; islemId: string; iz?: string; notlariSil: boolean }
export type GeriAlindi = { bytes: Uint8Array; indeks: number; sayfa: number; silinenNot: number } | { zatenYok: true; sayfa: number };

// The page pasted by islemId (iz: its fingerprint, nearest to indeks) back as it was. Not found → zatenYok (an earlier
// try did it). Notes in the bands: notlariSil → they go (only Defter's), else BantNotuVar and nothing changes.
export async function yapistirGeriAl(pdfBytes: Uint8Array, r: GeriAlIstek): Promise<GeriAlindi> {
  const { L, doc } = await yazilabilirAc(pdfBytes, MESAJLAR);
  const ctx = doc.context, N = (s: string) => L.PDFName.of(s);
  const sayfalar = doc.getPages(), n = sayfalar.length;
  const adaylar = sayfalar.flatMap((p, i) => yapistirilmisMi(L, doc, p)?.islemId === r.islemId ? [i] : []);
  if (!adaylar.length) return { zatenYok: true, sayfa: n };
  let i = adaylar.includes(r.indeks) ? r.indeks : -1;
  if (r.iz && (i < 0 || await sayfaIzi(L, doc, sayfalar[i]) !== r.iz)) {
    i = -1;
    for (const k of adaylar) if (await sayfaIzi(L, doc, sayfalar[k]) === r.iz && (i < 0 || Math.abs(k - r.indeks) < Math.abs(i - r.indeks))) i = k;
  }
  if (i < 0) {
    if (r.iz || adaylar.length > 1) return { zatenYok: true, sayfa: n };
    i = adaylar[0];
  }
  const page = sayfalar[i], m = isaret(L, doc, page)!, y = yapistirilmisMi(L, doc, page)!;

  const notlar = bantNotuIndeksleri(L, doc, page, y.eskiKutu);
  if (notlar.length && !r.notlariSil) throw new BantNotuVar();
  const annots = page.node.Annots();
  for (const k of [...notlar].reverse()) {
    const el = annots!.get(k), dict = ctx.lookup(el) as PDFDict;
    const ap = ctx.lookup(dict.get(N('AP')));
    const nAp = ap instanceof L.PDFDict ? ap.get(N('N')) : undefined;
    if (nAp instanceof L.PDFRef) ctx.delete(nAp);
    if (el instanceof L.PDFRef) ctx.delete(el);
    annots!.remove(k);
  }

  const eski = ctx.lookup(m.get(N('Eski')));
  const kalitim = ctx.lookup(m.get(N('Kalitim')));
  for (const ad of KUTULAR) {
    if (eski instanceof L.PDFDict && eski.has(N(ad))) page.node.set(N(ad), eski.get(N(ad))!);
    else if (kalitim instanceof L.PDFArray && kalitim.asArray().some(x => x === N(ad))) page.node.delete(N(ad));
  }
  const akisRef = m.get(N('Akis'));
  const eskiContents = m.get(N('EskiContents'));
  const simdi = ctx.lookup(page.node.get(N('Contents')));
  if (simdi instanceof L.PDFArray && simdi.get(0) === akisRef && eskiContents) {
    page.node.set(N('Contents'), eskiContents);   // as it was (a reference stays a reference)
  } else if (simdi instanceof L.PDFArray) {
    const k = simdi.indexOf(akisRef as PDFRef);
    if (k !== undefined) simdi.remove(k);
  }
  if (akisRef instanceof L.PDFRef) ctx.delete(akisRef);
  page.node.delete(N(YAPISTIR));
  return { bytes: await doc.save(SAVE_OPTIONS), indeks: i, sayfa: n, silinenNot: notlar.length };
}

