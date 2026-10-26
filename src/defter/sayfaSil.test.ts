import { beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import type { Stroke } from '../kalem/cizgi';
import { PdfYazilamaz, readDefterStrokes, writeDefterStrokes } from '../kalem/pdfNotlari';
import { sayfaParmakIzleri } from '../ocr/kayit/parmakIzi';
import { BOS_ID, bosSayfaBilgisi, bosSayfaEkle, gorunurKutu } from './bosSayfa';
import { EK_ID, isaretliPdfEkle } from './ozeteEkle';
import { SayfaYeriDegisti } from './sayfaOrtak';
import { FormAlaniVar, GERI_ID, sayfaGeriKoy, sayfaSil, SonSayfaSilinemez, type GeriKondu, type Silindi } from './sayfaSil';
import { yapistir } from './yapistir';

// Task 6.S-4d: any page out (kept as a one-page PDF) and back in. The PDFs are made here: 5 A4 pages with text,
// a Defter stroke on page 3 (index 2), another program's note on page 2 (index 1).

const A4: [number, number] = [595.28, 841.89];
const stroke = (id: string): Stroke => ({ id, arac: 'kalem', renk: '#222222', kalinlik: 2, opaklik: 1, noktalar: [100, 100, 200, 150, 220, 180] });
// a 2×2 PNG (one image on the page: a photo's "g:" fingerprint)
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));

let pdf: Uint8Array;
beforeAll(async () => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 5; i++) doc.addPage(A4).drawText(`Sayfa ${i + 1}`, { x: 50, y: 780 });
  const ctx = doc.context;
  doc.getPage(1).node.set(PDFName.of('Annots'), ctx.obj([ctx.register(ctx.obj({
    Type: 'Annot', Subtype: 'Text', Rect: [50, 700, 70, 720], Contents: PDFString.of('Merhaba'), T: PDFString.of('Ali')
  }))]));
  pdf = await writeDefterStrokes(await doc.save(), new Map([[2, [stroke('orta')]]]));
});

const sil = (r: Silindi) => { if ('zatenYok' in r) throw new Error('zatenYok'); return r; };
const kondu = (r: GeriKondu) => { if ('zatenVar' in r) throw new Error('zatenVar'); return r; };
const metinler = async (b: Uint8Array) => (await PDFDocument.load(b)).getPageCount();

// out and back in: the same fingerprints in the same order, the strokes on the same pages
async function gidipGelir(b: Uint8Array, i: number): Promise<Uint8Array> {
  const izler = await sayfaParmakIzleri(b);
  const s = sil(await sayfaSil(b, { islemId: 'g', indeks: i, iz: izler[i] }));
  expect(s).toMatchObject({ indeks: i, eskiSayfa: izler.length, yeniSayfa: izler.length - 1 });
  expect(await sayfaParmakIzleri(s.bytes)).toEqual(izler.filter((_, k) => k !== i));
  expect(await sayfaParmakIzleri(s.silinenSayfaBytes)).toEqual([izler[i]]);
  const g = kondu(await sayfaGeriKoy(s.bytes, { islemId: 'g', sayfaBytes: s.silinenSayfaBytes, indeks: i, komsuIz: s.komsuIz, komsuYon: s.komsuYon }));
  expect(g).toMatchObject({ indeks: i, sonaEklendi: false, yeniSayfa: izler.length });
  expect(await sayfaParmakIzleri(g.bytes)).toEqual(izler);
  return g.bytes;
}

describe('sayfaSil', () => {
  it('ortadaki sayfa gider; çizgisi tek sayfalık yedekte, diğer sayfalar ve notları aynen', async () => {
    const izler = await sayfaParmakIzleri(pdf);
    const s = sil(await sayfaSil(pdf, { islemId: 's', indeks: 2, iz: izler[2] }));
    expect(s).toMatchObject({ indeks: 2, eskiSayfa: 5, yeniSayfa: 4, ayniIzVar: false, komsuIz: izler[1], komsuYon: 'sonra' });
    expect([...(await readDefterStrokes(s.bytes)).values()].flat()).toEqual([]);
    const yedek = await readDefterStrokes(s.silinenSayfaBytes);
    expect(yedek.get(0)?.map(x => x.id)).toEqual(['orta']);
    const doc = await PDFDocument.load(s.bytes);
    expect(doc.getPage(1).node.Annots()?.size()).toBe(1);   // the other program's note
  });

  it('ilk sayfa: çapa sonraki sayfa (önüne)', async () => {
    const izler = await sayfaParmakIzleri(pdf);
    expect(sil(await sayfaSil(pdf, { islemId: 's', indeks: 0, iz: izler[0] }))).toMatchObject({ komsuIz: izler[1], komsuYon: 'once' });
  });

  it('kayan sayfa parmak iziyle bulunur; iz bulunamazsa SayfaYeriDegisti', async () => {
    const izler = await sayfaParmakIzleri(pdf);
    expect(sil(await sayfaSil(pdf, { islemId: 's', indeks: 0, iz: izler[3] })).indeks).toBe(3);
    await expect(sayfaSil(pdf, { islemId: 's', indeks: 2, iz: 'i:yok' })).rejects.toBeInstanceOf(SayfaYeriDegisti);
  });

  it('son sayfa silinemez', async () => {
    const tek = await PDFDocument.create();
    tek.addPage(A4);
    await expect(sayfaSil(await tek.save(), { islemId: 's', indeks: 0 })).rejects.toBeInstanceOf(SonSayfaSilinemez);
  });

  it('form alanlı sayfa silinemez; imzalı PDF: PdfYazilamaz', async () => {
    const d = await PDFDocument.load(pdf);
    const w = d.context.register(d.context.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Tx', T: PDFString.of('ad'), Rect: [0, 0, 10, 10] }));
    d.getPage(3).node.set(PDFName.of('Annots'), d.context.obj([w]));
    const formlu = await d.save();
    await expect(sayfaSil(formlu, { islemId: 's', indeks: 3 })).rejects.toBeInstanceOf(FormAlaniVar);
    const sig = await PDFDocument.load(pdf);
    sig.catalog.set(PDFName.of('AcroForm'), sig.context.register(sig.context.obj({ Fields: [sig.context.register(sig.context.obj({ FT: 'Sig', T: PDFString.of('Imza') }))] })));
    await expect(sayfaSil(await sig.save(), { islemId: 's', indeks: 1 })).rejects.toBeInstanceOf(PdfYazilamaz);
  });

  it('önceki deneme yüklendiyse (yedek var, bir sayfa eksik): zatenYok, tekrar silinmez', async () => {
    const s = sil(await sayfaSil(pdf, { islemId: 's', indeks: 2 }));
    expect(await sayfaSil(s.bytes, { islemId: 's', indeks: 2, yedekVar: true, oncekiSayfa: 5 })).toEqual({ zatenYok: true, sayfa: 4 });
  });

  it('aynı fotoğraf iki kez: ayniIzVar', async () => {
    const d = await PDFDocument.load(pdf);
    const img = await d.embedPng(PNG);
    for (const i of [0, 4]) d.getPage(i).drawImage(img, { x: 0, y: 0, width: 100, height: 100 });
    const b = await d.save();
    const izler = await sayfaParmakIzleri(b);
    expect(izler[0]).toMatch(/^g:/);
    expect(izler[0]).toBe(izler[4]);
    expect(sil(await sayfaSil(b, { islemId: 's', indeks: 4, iz: izler[4] }))).toMatchObject({ indeks: 4, ayniIzVar: true });
  });
});

describe('sayfaGeriKoy', () => {
  it('çizgili sayfa notlarıyla geri gelir (aynı id, aynı noktalar), işaretli; tekrar: zatenVar', async () => {
    const b = await gidipGelir(pdf, 2);
    const once = await readDefterStrokes(pdf), sonra = await readDefterStrokes(b);
    expect(sonra.get(2)).toEqual(once.get(2));
    const doc = await PDFDocument.load(b);
    expect(doc.getPage(2).node.get(PDFName.of(GERI_ID))?.toString()).toBe('(g)');
    expect(doc.getPage(1).node.Annots()?.size()).toBe(1);
    expect(await sayfaGeriKoy(b, { islemId: 'g', sayfaBytes: new Uint8Array(), indeks: 2, komsuYon: 'sonra' })).toEqual({ zatenVar: true, indeks: 2, sayfa: 5 });
  });

  it('ilk ve son sayfa yerine döner', async () => {
    await gidipGelir(pdf, 0);
    await gidipGelir(pdf, 4);
  });

  it('dosya arada değişti (başa sayfa eklendi): çapa ile doğru yere; çapa yoksa sona', async () => {
    const izler = await sayfaParmakIzleri(pdf);
    const s = sil(await sayfaSil(pdf, { islemId: 'x', indeks: 2, iz: izler[2] }));
    const r = await bosSayfaEkle(s.bytes, { komsu: 0, yon: 'once', desen: 'duz', islemId: 'araya' });
    if ('zatenVar' in r) throw new Error();
    const g = kondu(await sayfaGeriKoy(r.bytes, { islemId: 'x', sayfaBytes: s.silinenSayfaBytes, indeks: 2, komsuIz: s.komsuIz, komsuYon: s.komsuYon }));
    expect(g).toMatchObject({ indeks: 3, sonaEklendi: false });
    expect((await sayfaParmakIzleri(g.bytes))[3]).toBe(izler[2]);
    const yok = kondu(await sayfaGeriKoy(s.bytes, { islemId: 'y', sayfaBytes: s.silinenSayfaBytes, indeks: 2, komsuIz: 'i:yok', komsuYon: 'sonra' }));
    expect(yok).toMatchObject({ indeks: 4, sonaEklendi: true, yeniSayfa: 5 });
  });

  it('boş sayfa: işaretleri ve deseniyle geri gelir', async () => {
    const r = await bosSayfaEkle(pdf, { komsu: 1, yon: 'sonra', desen: 'kareli', islemId: 'bos' });
    if ('zatenVar' in r) throw new Error();
    const b = await gidipGelir(r.bytes, 2);
    const bilgi = await bosSayfaBilgisi(b);
    expect(bilgi.yazilabilir && [...bilgi.bos.keys()]).toEqual([2]);
    expect((await PDFDocument.load(b)).getPage(2).node.get(PDFName.of(BOS_ID))?.toString()).toBe('(bos)');
  });

  it('yapıştırılmış sayfa: kutuları ve işaretiyle geri gelir', async () => {
    const d = await PDFDocument.load(pdf);
    d.insertPage(2, [960, 540]).drawText('Slayt', { x: 50, y: 480 });
    const y = await yapistir(await d.save(), { indeksler: [2], desen: 'kareli', islemId: 'yp' });
    if ('zatenVar' in y) throw new Error();
    const b = await gidipGelir(y.bytes, 2);
    const bilgi = await bosSayfaBilgisi(b);
    expect(bilgi.yazilabilir && [...bilgi.yapistirilmis.keys()]).toEqual([2]);
    const k = gorunurKutu((await PDFDocument.load(b)).getPage(2));
    expect(k.w).toBeCloseTo(960, 1);
    expect(k.h).toBeCloseTo(960 * Math.SQRT2, 1);
  });

  it('fotoğraf sayfası ve ek dosya sayfası (/DefterEkId) silinir ve geri gelir', async () => {
    const d = await PDFDocument.load(pdf);
    const img = await d.embedPng(PNG);
    d.getPage(3).drawImage(img, { x: 0, y: 0, width: 300, height: 300 });
    await gidipGelir(await d.save(), 3);
    const ek = await PDFDocument.create();
    ek.addPage(A4).drawText('Ek', { x: 50, y: 700 });
    const e = await isaretliPdfEkle(pdf, await ek.save(), 'ek1');
    if ('zatenVar' in e) throw new Error();
    const b = await gidipGelir(e.bytes, 5);
    expect((await PDFDocument.load(b)).getPage(5).node.get(PDFName.of(EK_ID))?.toString()).toBe('(ek1)');
    expect(await metinler(b)).toBe(6);
  });
});
