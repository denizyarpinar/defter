import { beforeAll, describe, expect, it } from 'vitest';
import { degrees, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import type { Stroke } from '../kalem/cizgi';
import { PdfYazilamaz, readDefterStrokes, writeDefterStrokes } from '../kalem/pdfNotlari';
import { sayfaParmakIzleri } from '../ocr/kayit/parmakIzi';
import {
  BOS_DESEN, BOS_ID, bosSayfaBilgisi, dikeyBoyut, sayfaIziAl, bosSayfaEkle, desenCizgileri, SayfaYeriDegisti, type BosEklendi
} from './bosSayfa';

// Task 6.S-4: blank note pages inside a PDF. The PDFs are made here (3 A4 pages with text, a Defter stroke on
// page 1, a clean-view stroke on page 3, another program's note on page 2).

const A4: [number, number] = [595.28, 841.89];
const stroke = (id: string, gorunum?: 'temiz'): Stroke => ({ id, arac: 'kalem', renk: '#222222', kalinlik: 2, opaklik: 1, noktalar: [100, 100, 200, 150], ...(gorunum ? { gorunum } : {}) });

let pdf: Uint8Array;
beforeAll(async () => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i++) doc.addPage(A4).drawText(`Sayfa ${i + 1}`, { x: 50, y: 780 });
  const ctx = doc.context;
  doc.getPage(1).node.set(PDFName.of('Annots'), ctx.obj([ctx.register(ctx.obj({
    Type: 'Annot', Subtype: 'Text', Rect: [50, 700, 70, 720], Contents: PDFString.of('Merhaba'), T: PDFString.of('Ali')
  }))]));
  pdf = await writeDefterStrokes(await doc.save(), new Map([[0, [stroke('a')]], [2, [stroke('t', 'temiz')]]]));
});

const bytesOf = (r: BosEklendi) => { if ('zatenVar' in r) throw new Error('zatenVar'); return r.bytes; };
const metinler = async (b: Uint8Array) => (await PDFDocument.load(b)).getPages().map(p => p.node.get(PDFName.of(BOS_ID))?.toString() ?? 'kullanici');

describe('desenCizgileri', () => {
  it('A4 kareli ≈ 42 dikey × 59 yatay, çizgili ≈ 37, düz yok; kenarda çizgi yok', () => {
    const k = desenCizgileri(...A4, 'kareli');
    const dikey = k.filter(l => l.x1 === l.x2), yatay = k.filter(l => l.y1 === l.y2);
    expect(dikey.length).toBeGreaterThanOrEqual(41); expect(dikey.length).toBeLessThanOrEqual(42);
    expect(yatay.length).toBeGreaterThanOrEqual(58); expect(yatay.length).toBeLessThanOrEqual(59);
    const c = desenCizgileri(...A4, 'cizgili');
    expect(c.length).toBeGreaterThanOrEqual(36); expect(c.length).toBeLessThanOrEqual(37);
    expect(c.every(l => l.y1 === l.y2 && l.x1 === 0 && l.x2 === A4[0])).toBe(true);
    expect(desenCizgileri(...A4, 'duz')).toEqual([]);
    for (const l of dikey) { expect(l.x1).toBeGreaterThan(0.4); expect(l.x1).toBeLessThan(A4[0] - 0.4); }
    for (const l of yatay) { expect(l.y1).toBeGreaterThan(0.4); expect(l.y1).toBeLessThan(A4[1] - 0.4); }
  });

  it('ilk çizgi üst kenardan bir adım aşağıda (5 mm / 8 mm)', () => {
    const y = desenCizgileri(...A4, 'cizgili')[0].y1;
    expect(A4[1] - y).toBeCloseTo(8 * 72 / 25.4, 3);
    expect(A4[1] - desenCizgileri(...A4, 'kareli')[0].y1).toBeCloseTo(5 * 72 / 25.4, 3);
  });
});

describe('bosSayfaEkle', () => {
  it('arkasına: sayfa 2\'nin arkasına, A4, işaretli; eski sayfalar ve notları yerinde', async () => {
    const r = await bosSayfaEkle(pdf, { komsu: 1, yon: 'sonra', desen: 'kareli', islemId: 'is-1' });
    expect('zatenVar' in r).toBe(false);
    const b = bytesOf(r);
    if ('zatenVar' in r) return;
    expect(r).toMatchObject({ indeks: 2, eskiSayfa: 3, yeniSayfa: 4 });
    const doc = await PDFDocument.load(b);
    expect(doc.getPageCount()).toBe(4);
    const p = doc.getPage(2);
    expect(p.getSize()).toEqual({ width: A4[0], height: A4[1] });
    expect(p.node.get(PDFName.of(BOS_ID))?.toString()).toBe('(is-1)');
    expect(p.node.get(PDFName.of(BOS_DESEN))?.toString()).toBe('/kareli');
    // the Defter strokes moved with their pages: a on 0, t (clean view) now on 3
    const s = await readDefterStrokes(b);
    expect(s.get(0)?.map(x => x.id)).toEqual(['a']);
    expect(s.get(3)?.map(x => [x.id, x.gorunum])).toEqual([['t', 'temiz']]);
    expect(s.get(2)).toBeUndefined();
    expect(doc.getPage(1).node.Annots()?.size()).toBe(1);
  });

  it('ilk sayfanın önü ve son sayfanın arkası', async () => {
    const on = await bosSayfaEkle(pdf, { komsu: 0, yon: 'once', desen: 'duz', islemId: 'on' });
    expect(await metinler(bytesOf(on))).toEqual(['(on)', 'kullanici', 'kullanici', 'kullanici']);
    const son = await bosSayfaEkle(pdf, { komsu: 2, yon: 'sonra', desen: 'cizgili', islemId: 'son' });
    expect(await metinler(bytesOf(son))).toEqual(['kullanici', 'kullanici', 'kullanici', '(son)']);
  });

  it('aynı islemId ikinci kez: zatenVar, değişiklik yok', async () => {
    const b = bytesOf(await bosSayfaEkle(pdf, { komsu: 0, yon: 'sonra', desen: 'kareli', islemId: 'iki' }));
    const r = await bosSayfaEkle(b, { komsu: 0, yon: 'sonra', desen: 'kareli', islemId: 'iki' });
    expect(r).toEqual({ zatenVar: true, indeks: 1, sayfa: 4 });
  });

  it('eski sayfaların parmak izleri değişmez; her boş sayfanın izi ayrı', async () => {
    const once = await sayfaParmakIzleri(pdf);
    const b1 = bytesOf(await bosSayfaEkle(pdf, { komsu: 1, yon: 'once', desen: 'kareli', islemId: 'x1' }));
    const b2 = bytesOf(await bosSayfaEkle(b1, { komsu: 1, yon: 'once', desen: 'kareli', islemId: 'x2' }));
    const iz = await sayfaParmakIzleri(b2);
    expect([iz[0], iz[3], iz[4]]).toEqual(once);
    expect(iz[1]).not.toBe(iz[2]);
  });

  it('döndürülmüş (/Rotate 90) komşu: yeni sayfa döndürülmemiş; dikey görünürse aynı en-boy, yatay görünürse A4 dikey', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([A4[1], A4[0]]).setRotation(degrees(90));   // stored landscape, seen upright
    doc.addPage(A4).setRotation(degrees(90));               // stored upright, seen landscape
    const b = await doc.save();
    const dik = (await PDFDocument.load(bytesOf(await bosSayfaEkle(b, { komsu: 0, yon: 'sonra', desen: 'duz', islemId: 'r' })))).getPage(1);
    expect(dik.getRotation().angle).toBe(0);
    expect(dik.getSize()).toEqual({ width: A4[0], height: A4[1] });
    const yat = (await PDFDocument.load(bytesOf(await bosSayfaEkle(b, { komsu: 1, yon: 'sonra', desen: 'duz', islemId: 'r2' })))).getPage(2);
    expect(yat.getRotation().angle).toBe(0);
    expect(yat.getSize()).toEqual({ width: A4[0], height: A4[1] });
  });

  it('6.S-4c dikeyBoyut: yatay ve kare → A4 dikey, dikey → aynen; 16:9 slaytın yanına A4 dikey', async () => {
    expect(dikeyBoyut({ w: A4[1], h: A4[0] })).toEqual({ w: A4[0], h: A4[1] });
    expect(dikeyBoyut({ w: 500, h: 500 })).toEqual({ w: A4[0], h: A4[1] });
    expect(dikeyBoyut({ w: 419.53, h: 595.28 })).toEqual({ w: 419.53, h: 595.28 });
    const doc = await PDFDocument.create();
    doc.addPage([960, 540]);
    const p = (await PDFDocument.load(bytesOf(await bosSayfaEkle(await doc.save(), { komsu: 0, yon: 'once', desen: 'kareli', islemId: 's' })))).getPage(0);
    expect(p.getSize()).toEqual({ width: A4[0], height: A4[1] });
  });

  it('MediaBox (0,0)\'da değil + CropBox: görünür kutu (CropBox) kadar, MediaBox [0 0 w h]', async () => {
    const doc = await PDFDocument.create();
    const p = doc.addPage();
    p.setMediaBox(100, 200, 500, 700);
    p.setCropBox(120, 220, 300, 400);
    const r = bytesOf(await bosSayfaEkle(await doc.save(), { komsu: 0, yon: 'once', desen: 'kareli', islemId: 'm' }));
    const yeni = (await PDFDocument.load(r)).getPage(0);
    expect(yeni.getMediaBox()).toEqual({ x: 0, y: 0, width: 300, height: 400 });
    const d2 = await PDFDocument.create();
    d2.addPage().setMediaBox(50, 60, 400, 500);
    const y2 = (await PDFDocument.load(bytesOf(await bosSayfaEkle(await d2.save(), { komsu: 0, yon: 'sonra', desen: 'duz', islemId: 'm2' })))).getPage(1);
    expect(y2.getMediaBox()).toEqual({ x: 0, y: 0, width: 400, height: 500 });
  });

  it('komsuIzi: yeni sürümde sayfa kaydıysa çapa ona; iz yoksa SayfaYeriDegisti', async () => {
    const iz = await sayfaParmakIzleri(pdf);
    // another device put a page before everything meanwhile
    const kaymis = bytesOf(await bosSayfaEkle(pdf, { komsu: 0, yon: 'once', desen: 'duz', islemId: 'baska' }));
    const r = await bosSayfaEkle(kaymis, { komsu: 1, yon: 'sonra', desen: 'cizgili', islemId: 'bu', komsuIzi: iz[1] });
    expect(await metinler(bytesOf(r))).toEqual(['(baska)', 'kullanici', 'kullanici', '(bu)', 'kullanici']);
    await expect(bosSayfaEkle(pdf, { komsu: 1, yon: 'sonra', desen: 'duz', islemId: 'y', komsuIzi: 'i:yok' })).rejects.toBeInstanceOf(SayfaYeriDegisti);
    await expect(bosSayfaEkle(pdf, { komsu: 7, yon: 'sonra', desen: 'duz', islemId: 'y' })).rejects.toBeInstanceOf(SayfaYeriDegisti);
  });

  it('imzalı PDF: PdfYazilamaz', async () => {
    const sig = await PDFDocument.load(pdf);
    sig.catalog.set(PDFName.of('AcroForm'), sig.context.register(sig.context.obj({ Fields: [sig.context.register(sig.context.obj({ FT: 'Sig', T: PDFString.of('Imza') }))] })));
    const imzali = await sig.save();
    await expect(bosSayfaEkle(imzali, { komsu: 0, yon: 'sonra', desen: 'duz', islemId: 's' })).rejects.toBeInstanceOf(PdfYazilamaz);
    expect(await bosSayfaBilgisi(imzali)).toMatchObject({ yazilabilir: false });
  });
});

describe('bosSayfaBilgisi', () => {
  it('boş sayfalar islemId ve parmak iziyle', async () => {
    const b = bytesOf(await bosSayfaEkle(pdf, { komsu: 0, yon: 'sonra', desen: 'kareli', islemId: 'k' }));
    const b2 = await writeDefterStrokes(b, new Map([[1, [stroke('bos')]]]));
    const bilgi = await bosSayfaBilgisi(b2);
    expect(bilgi.yazilabilir && [bilgi.sayfa, [...bilgi.bos].map(([i, x]) => [i, x.islemId])]).toEqual([4, [[1, 'k']]]);
    expect(bilgi.yazilabilir && bilgi.bos.get(1)!.iz).toBe((await sayfaParmakIzleri(b2))[1]);
    expect(await sayfaIziAl(b2, 1)).toBe((await sayfaParmakIzleri(b2))[1]);
  });
});
