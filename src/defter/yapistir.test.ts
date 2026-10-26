import { beforeAll, describe, expect, it } from 'vitest';
import { degrees, PDFArray, PDFDocument, PDFName, PDFRawStream, PDFString, decodePDFRawStream } from 'pdf-lib';
import type { Stroke } from '../kalem/cizgi';
import { PdfYazilamaz, readDefterStrokes, writeDefterStrokes } from '../kalem/pdfNotlari';
import { sayfaParmakIzleri } from '../ocr/kayit/parmakIzi';
import {
  bantlar, bantNotlari, BantNotuVar, buyume, buyut, gorunurMatris, gorunurOlcu, sayfaDurumlari, yapistir, yapistirGeriAl,
  yapistirilmisMi, YapistirilamazDikey, YAPISTIR, type Aci, type Dikdortgen, type Yapistirildi
} from './yapistir';

// Task 6.S-4c: "Deftere yapıştır". The PDFs are made here: a 16:9 slide, an A4 page, an A4 landscape page whose
// MediaBox is not at (0,0) with a CropBox and a TrimBox, a page stored upright but turned 90 (seen landscape).

const A4: [number, number] = [595.28, 841.89];
const stroke = (id: string, noktalar: number[]): Stroke => ({ id, arac: 'kalem', renk: '#222222', kalinlik: 2, opaklik: 1, noktalar });

let pdf: Uint8Array;
beforeAll(async () => {
  const doc = await PDFDocument.create();
  doc.addPage([960, 540]).drawText('Slayt 1', { x: 50, y: 480 });                     // 0: 16:9
  doc.addPage(A4).drawText('Dikey', { x: 50, y: 780 });                               // 1: upright
  const p2 = doc.addPage([A4[1], A4[0]]);                                              // 2: offset boxes
  p2.drawText('Kaymis', { x: 120, y: 300 });
  p2.setMediaBox(50, 30, A4[1], A4[0]);
  p2.setCropBox(60, 40, 740, 460);   // x, y, width, height → 60..800 × 40..500
  p2.setTrimBox(70, 50, 710, 430);   // 70..780 × 50..480
  const p3 = doc.addPage(A4);                                                          // 3: turned, seen landscape
  p3.drawText('Dondurulmus', { x: 50, y: 400 });
  p3.setRotation(degrees(90));
  const ctx = doc.context;
  doc.getPage(0).node.set(PDFName.of('Annots'), ctx.obj([ctx.register(ctx.obj({
    Type: 'Annot', Subtype: 'Text', Rect: [50, 700, 70, 720], Contents: PDFString.of('Merhaba'), T: PDFString.of('Ali')
  }))]));
  pdf = await writeDefterStrokes(await doc.save(), new Map([[0, [stroke('slaytta', [100, 100, 200, 150])]]]));
});

const bytesOf = (r: Yapistirildi) => { if ('zatenVar' in r) throw new Error('zatenVar'); return r.bytes; };
const kutu = (b: { x: number; y: number; width: number; height: number }): Dikdortgen => ({ x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height });
const icerikler = async (b: Uint8Array) => {
  const doc = await PDFDocument.load(b);
  return doc.getPages().map(p => {
    const c = p.node.Contents();
    const parca = c instanceof PDFArray ? c.asArray().map(x => doc.context.lookup(x)) : [c];
    return parca.filter((s): s is PDFRawStream => s instanceof PDFRawStream && !s.dict.has(PDFName.of(YAPISTIR)))
      .map(s => new TextDecoder('latin1').decode(decodePDFRawStream(s).decode())).join('|');
  });
};
const kutuSozlugu = async (b: Uint8Array) => {
  const doc = await PDFDocument.load(b);
  return doc.getPages().map(p => ['MediaBox', 'CropBox', 'TrimBox', 'BleedBox', 'ArtBox', 'Contents', 'Rotate']
    .map(k => `${k}=${p.node.get(PDFName.of(k))?.toString() ?? '-'}`).join(' '));
};

describe('geometri', () => {
  it('16:9 ve A4 yatay: yeni görünür boy = en × √2, yukarı ve aşağı eşit', () => {
    for (const [w, h] of [[960, 540], [A4[1], A4[0]]]) {
      const k = { x0: 0, y0: 0, x1: w, y1: h }, d = buyume(k, 0), y = buyut(k, d, 0);
      expect(y.y1 - y.y0).toBeCloseTo(w * Math.SQRT2, 6);
      expect(k.y0 - y.y0).toBeCloseTo(y.y1 - k.y1, 9);
      expect([y.x0, y.x1]).toEqual([0, w]);
    }
    // A4 landscape → exactly A4 upright (841.89 × 1190.6)
    const a = buyut({ x0: 0, y0: 0, x1: A4[1], y1: A4[0] }, buyume({ x0: 0, y0: 0, x1: A4[1], y1: A4[0] }, 0), 0);
    expect((a.y1 - a.y0) / (a.x1 - a.x0)).toBeCloseTo(Math.SQRT2, 9);
  });

  it('Rotate 90/270: görünür dikey yön kullanıcı x ekseni; büyüme x\'te', () => {
    const k = { x0: 0, y0: 0, x1: A4[0], y1: A4[1] };   // stored upright, seen landscape
    expect(gorunurOlcu(k, 90)).toEqual({ en: A4[1], boy: A4[0] });
    const y = buyut(k, buyume(k, 90), 90);
    expect([y.y0, y.y1]).toEqual([0, A4[1]]);
    expect(y.x1 - y.x0).toBeCloseTo(A4[1] * Math.SQRT2, 6);
    expect(bantlar(k, y, 90)).toEqual([{ x0: y.x0, y0: 0, x1: 0, y1: A4[1] }, { x0: A4[0], y0: 0, x1: y.x1, y1: A4[1] }]);
  });

  it('görünür matris: görünür köşeler kutunun doğru köşelerine (pdf.js\'in döndürmesiyle)', () => {
    const k = { x0: 10, y0: 20, x1: 110, y1: 220 };
    const uygula = (a: Aci, u: number, v: number) => { const [p, q, r, s, e, f] = gorunurMatris(k, a); return [p * u + r * v + e, q * u + s * v + f]; };
    const W = (a: Aci) => gorunurOlcu(k, a).en, H = (a: Aci) => gorunurOlcu(k, a).boy;
    // seen top left: Rotate 0 → (x0, y1); 90 (clockwise) → (x0, y0); 180 → (x1, y0); 270 → (x1, y1)
    expect(uygula(0, 0, H(0))).toEqual([10, 220]);
    expect(uygula(90, 0, H(90))).toEqual([10, 20]);
    expect(uygula(180, 0, H(180))).toEqual([110, 20]);
    expect(uygula(270, 0, H(270))).toEqual([110, 220]);
    // seen bottom right
    expect(uygula(0, W(0), 0)).toEqual([110, 20]);
    expect(uygula(90, W(90), 0)).toEqual([110, 220]);
    expect(uygula(180, W(180), 0)).toEqual([10, 220]);
    expect(uygula(270, W(270), 0)).toEqual([10, 20]);
  });
});

describe('yapistir', () => {
  it('16:9 slayt: kutu büyür, içerik ve notlar aynen, sayfa sayısı aynı, işaretli', async () => {
    const r = await yapistir(pdf, { indeksler: [0], desen: 'kareli', islemId: 'y1' });
    const b = bytesOf(r);
    expect(r.sayfalar).toEqual([0]);
    const doc = await PDFDocument.load(b);
    expect(doc.getPageCount()).toBe(4);
    const d = (960 * Math.SQRT2 - 540) / 2;
    const mb = kutu(doc.getPage(0).getMediaBox());
    expect(mb.x0).toBe(0); expect(mb.x1).toBe(960);
    expect(mb.y0).toBeCloseTo(-d, 2); expect(mb.y1).toBeCloseTo(540 + d, 2);
    expect(doc.getPage(0).node.get(PDFName.of('CropBox'))).toBeUndefined();   // not added when there was none
    // the page's own content and every page's notes are unchanged
    expect(await icerikler(b)).toEqual(await icerikler(pdf));
    expect(await readDefterStrokes(b)).toEqual(await readDefterStrokes(pdf));
    expect(doc.getPage(0).node.Annots()?.size()).toBe(2);
    const y = yapistirilmisMi((await import('pdf-lib')), doc, doc.getPage(0))!;
    expect(y).toMatchObject({ islemId: 'y1', desen: 'kareli', eskiKutu: { x0: 0, y0: 0, x1: 960, y1: 540 } });
    // the band stream comes first and only paints inside the bands (clip)
    const c = doc.getPage(0).node.Contents() as PDFArray;
    const ilk = doc.context.lookup(c.get(0)) as PDFRawStream;
    const metin = new TextDecoder('latin1').decode(decodePDFRawStream(ilk).decode());
    expect(metin.startsWith(`% ${YAPISTIR} y1\nq\n`)).toBe(true);
    expect(metin).toContain('W n');
    expect(metin.trimEnd().endsWith('Q')).toBe(true);
  });

  it('parmak izi yapıştırmadan önce, sonra ve geri aldıktan sonra aynı', async () => {
    const once = await sayfaParmakIzleri(pdf);
    const b = bytesOf(await yapistir(pdf, { indeksler: 'yataylar', desen: 'cizgili', islemId: 'iz' }));
    expect(await sayfaParmakIzleri(b)).toEqual(once);
    const g = await yapistirGeriAl(b, { indeks: 2, islemId: 'iz', notlariSil: false });
    if ('zatenYok' in g) throw new Error('zatenYok');
    expect(await sayfaParmakIzleri(g.bytes)).toEqual(once);
  });

  it('MediaBox (50,30)\'da + CropBox + TrimBox: hepsi aynı d ile büyür, görünür kutu √2', async () => {
    const b = bytesOf(await yapistir(pdf, { indeksler: [2], desen: 'duz', islemId: 'm' }));
    const p = (await PDFDocument.load(b)).getPage(2);
    const d = (740 * Math.SQRT2 - 460) / 2;   // CropBox 60..800 × 40..500
    const cb = kutu(p.getCropBox()), mb = kutu(p.getMediaBox()), tb = kutu(p.getTrimBox());
    expect(cb.y0).toBeCloseTo(40 - d, 2); expect(cb.y1).toBeCloseTo(500 + d, 2); expect([cb.x0, cb.x1]).toEqual([60, 800]);
    expect(mb.y0).toBeCloseTo(30 - d, 2); expect(mb.y1).toBeCloseTo(30 + A4[0] + d, 2); expect([mb.x0, mb.x1]).toEqual([50, 50 + A4[1]]);
    expect(tb.y0).toBeCloseTo(50 - d, 2); expect(tb.y1).toBeCloseTo(480 + d, 2);
    expect(p.node.get(PDFName.of('BleedBox'))).toBeUndefined();
    expect((cb.y1 - cb.y0) / (cb.x1 - cb.x0)).toBeCloseTo(Math.SQRT2, 4);
  });

  it('Rotate 90 (dikey saklanmış, yatay görünen): x\'te büyür, döndürme aynen', async () => {
    const b = bytesOf(await yapistir(pdf, { indeksler: [3], desen: 'kareli', islemId: 'r' }));
    const p = (await PDFDocument.load(b)).getPage(3);
    expect(p.getRotation().angle).toBe(90);
    const mb = kutu(p.getMediaBox()), d = (A4[1] * Math.SQRT2 - A4[0]) / 2;
    expect(mb.x0).toBeCloseTo(-d, 2); expect(mb.x1).toBeCloseTo(A4[0] + d, 2); expect([mb.y0, mb.y1]).toEqual([0, A4[1]]);
  });

  it('"tüm yatay sayfalar" dikeyi atlar; aynı islemId ikinci kez zatenVar; dikey sayfa istenirse hata', async () => {
    const r = await yapistir(pdf, { indeksler: 'yataylar', desen: 'kareli', islemId: 'hep' });
    expect(r.sayfalar).toEqual([0, 2, 3]);
    const b = bytesOf(r);
    const doc = await PDFDocument.load(b);
    expect(kutu(doc.getPage(1).getMediaBox())).toEqual({ x0: 0, y0: 0, x1: A4[0], y1: A4[1] });
    expect(await yapistir(b, { indeksler: 'yataylar', desen: 'kareli', islemId: 'hep' })).toEqual({ zatenVar: true, sayfalar: [0, 2, 3], sayfa: 4 });
    expect(await yapistir(b, { indeksler: [0], desen: 'duz', islemId: 'baska' })).toMatchObject({ zatenVar: true });
    await expect(yapistir(pdf, { indeksler: [1], desen: 'duz', islemId: 'd' })).rejects.toBeInstanceOf(YapistirilamazDikey);
    const L = await import('pdf-lib');
    const durum = sayfaDurumlari(L, doc);
    expect([...durum.yatay]).toEqual([]);
    expect([...durum.yapistirilmis.keys()]).toEqual([0, 2, 3]);
    expect([...sayfaDurumlari(L, await PDFDocument.load(pdf)).yatay]).toEqual([0, 2, 3]);
  });

  it('iz ile: sayfa yeni sürümde kaydıysa bulunur; iz yoksa SayfaYeriDegisti', async () => {
    const iz = await sayfaParmakIzleri(pdf);
    const kaymis = await PDFDocument.load(pdf);
    kaymis.insertPage(0, A4);
    const kb = await kaymis.save();
    const r = await yapistir(kb, { indeksler: [2], izler: [iz[2]], desen: 'duz', islemId: 'k' });
    expect(r.sayfalar).toEqual([3]);
    await expect(yapistir(pdf, { indeksler: [0], izler: ['i:yok'], desen: 'duz', islemId: 'k2' })).rejects.toThrow(/başka bir yerde/);
  });

  it('imzalı PDF: PdfYazilamaz', async () => {
    const sig = await PDFDocument.load(pdf);
    sig.catalog.set(PDFName.of('AcroForm'), sig.context.register(sig.context.obj({ Fields: [sig.context.register(sig.context.obj({ FT: 'Sig', T: PDFString.of('Imza') }))] })));
    await expect(yapistir(await sig.save(), { indeksler: [0], desen: 'duz', islemId: 's' })).rejects.toBeInstanceOf(PdfYazilamaz);
  });
});

describe('yapistirGeriAl', () => {
  it('kutular, Contents ve işaret bayt düzeyinde eski hal; bant notu yoksa notlar aynen', async () => {
    const b = bytesOf(await yapistir(pdf, { indeksler: 'yataylar', desen: 'kareli', islemId: 'g' }));
    let x = b;
    for (const i of [0, 2, 3]) {
      const g = await yapistirGeriAl(x, { indeks: i, islemId: 'g', notlariSil: false });
      if ('zatenYok' in g) throw new Error('zatenYok');
      expect(g).toMatchObject({ indeks: i, silinenNot: 0 });
      x = g.bytes;
    }
    expect(await kutuSozlugu(x)).toEqual(await kutuSozlugu(pdf));
    const doc = await PDFDocument.load(x);
    expect(doc.getPages().every(p => !p.node.has(PDFName.of(YAPISTIR)))).toBe(true);
    expect(await readDefterStrokes(x)).toEqual(await readDefterStrokes(pdf));
    expect(await yapistirGeriAl(x, { indeks: 0, islemId: 'g', notlariSil: false })).toEqual({ zatenYok: true, sayfa: 4 });
  });

  it('bantta kalem yazısı: notlariSil yoksa BantNotuVar (değişiklik yok), varsa sadece bant notları gider', async () => {
    const b = bytesOf(await yapistir(pdf, { indeksler: [0], desen: 'kareli', islemId: 'n' }));
    // one stroke above the slide (in the band), one on the slide
    const s = await readDefterStrokes(b);
    const b2 = await writeDefterStrokes(b, new Map([[0, [...s.get(0)!, stroke('bantta', [100, 600, 300, 620]), stroke('ustte', [300, 300, 400, 320])]]]));
    expect(await bantNotlari(b2, 0)).toEqual(['bantta']);
    expect(await bantNotlari(pdf, 0)).toEqual([]);
    await expect(yapistirGeriAl(b2, { indeks: 0, islemId: 'n', notlariSil: false })).rejects.toBeInstanceOf(BantNotuVar);
    const g = await yapistirGeriAl(b2, { indeks: 0, islemId: 'n', notlariSil: true });
    if ('zatenYok' in g) throw new Error('zatenYok');
    expect(g.silinenNot).toBe(1);
    expect((await readDefterStrokes(g.bytes)).get(0)!.map(x => x.id).sort()).toEqual(['slaytta', 'ustte']);
    expect((await PDFDocument.load(g.bytes)).getPage(0).node.Annots()?.size()).toBe(3);   // Ali's note stays
    expect(await kutuSozlugu(g.bytes)).toEqual(await kutuSozlugu(pdf));
  });

  it('kalıtılmış MediaBox: geri alda sayfadan silinir', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([960, 540]);
    const p = doc.getPage(0);
    const mb = p.node.get(PDFName.of('MediaBox'))!;
    p.node.delete(PDFName.of('MediaBox'));
    doc.catalog.Pages().set(PDFName.of('MediaBox'), mb);
    const once = await doc.save();
    const b = bytesOf(await yapistir(once, { indeksler: [0], desen: 'duz', islemId: 'k' }));
    const l = await PDFDocument.load(b);
    expect(l.getPage(0).node.get(PDFName.of('MediaBox'))).toBeDefined();
    expect(yapistirilmisMi(await import('pdf-lib'), l, l.getPage(0))!.eskiKutu).toEqual({ x0: 0, y0: 0, x1: 960, y1: 540 });
    const g = await yapistirGeriAl(b, { indeks: 0, islemId: 'k', notlariSil: false });
    if ('zatenYok' in g) throw new Error('zatenYok');
    expect((await PDFDocument.load(g.bytes)).getPage(0).node.get(PDFName.of('MediaBox'))).toBeUndefined();
  });
});
