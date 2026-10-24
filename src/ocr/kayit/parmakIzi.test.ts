import { describe, expect, it, beforeAll } from 'vitest';
import sharp from 'sharp';
import { PDFDocument, PDFString, StandardFonts } from 'pdf-lib';
import { fotograflardanPdf, sonaSayfaEkle, type Jpeg } from '../../defter/sayfaEkle';
import type { Stroke } from '../../kalem/cizgi';
import { writeDefterStrokes } from '../../kalem/pdfNotlari';
import { sayfaParmakIzleri } from './parmakIzi';

// Task 6.4c-1: the photo PDFs are made by the app's own code (fotograflardanPdf), the pen notes by the
// pen's writer (writeDefterStrokes). No course PDFs.

const jpeg = async (renk: string): Promise<Jpeg> =>
  ({ bytes: new Uint8Array(await sharp({ create: { width: 300, height: 400, channels: 3, background: renk } }).jpeg({ quality: 85 }).toBuffer()) });
const stroke = (id: string): Stroke => ({ id, arac: 'kalem', renk: '#1a2b3c', kalinlik: 2.5, opaklik: 1, noktalar: [100, 100, 150, 180, 210, 120] });

let a: Jpeg, b: Jpeg, c: Jpeg, foto: Uint8Array;
beforeAll(async () => {
  [a, b, c] = await Promise.all([jpeg('#d8c9a3'), jpeg('#a3c9d8'), jpeg('#c9d8a3')]);
  foto = await fotograflardanPdf([a, b, c]);
});

async function metinPdf(yazi: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([595, 842]).drawText(yazi, { x: 72, y: 760, size: 24, font });
  return doc.save();
}

describe('sayfaParmakIzleri', () => {
  it('fotoğraf sayfası: g: + 64 hex; farklı fotoğraf → farklı iz', async () => {
    const iz = await sayfaParmakIzleri(foto);
    expect(iz).toHaveLength(3);
    for (const x of iz) expect(x).toMatch(/^g:[0-9a-f]{64}$/);
    expect(new Set(iz).size).toBe(3);
  });

  it('pdf-lib load → save (değişiklik yok) sonrası aynı; nesne akışsız yeniden yazımda da', async () => {
    const tekrar = await (await PDFDocument.load(foto)).save();
    expect(await sayfaParmakIzleri(tekrar)).toEqual(await sayfaParmakIzleri(foto));
    const farkli = await (await PDFDocument.load(foto)).save({ useObjectStreams: false });
    expect(farkli).not.toEqual(foto);
    expect(await sayfaParmakIzleri(farkli)).toEqual(await sayfaParmakIzleri(foto));
  });

  it('kalem notu (Ink annotation, kalemin yazıcısıyla) eklenince aynı', async () => {
    const cizili = await writeDefterStrokes(foto, new Map([[0, [stroke('k1')]], [2, [stroke('k2'), stroke('k3')]]]));
    expect(await sayfaParmakIzleri(cizili)).toEqual(await sayfaParmakIzleri(foto));
  });

  it('başka programın notu (elle /Annots) eklenince aynı', async () => {
    const doc = await PDFDocument.load(foto);
    const ctx = doc.context;
    const not = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [50, 50, 70, 70], Contents: PDFString.of('Not') }));
    doc.getPage(1).node.addAnnot(not);
    expect(await sayfaParmakIzleri(await doc.save())).toEqual(await sayfaParmakIzleri(foto));
  });

  it('sona sayfa eklenince eski sayfaların izi değişmez; aynı fotoğraf aynı izi verir', async () => {
    const uzun = await sonaSayfaEkle(foto, [c, a]);
    const once = await sayfaParmakIzleri(foto);
    const sonra = await sayfaParmakIzleri(uzun);
    expect(sonra.slice(0, 3)).toEqual(once);
    expect(sonra[3]).toBe(once[2]);
    expect(sonra[4]).toBe(once[0]);
  });

  it('görselsiz sayfa: i: ön ekli, kararlı; farklı içerik → farklı', async () => {
    const p = await metinPdf('Sayfa 1');
    const [iz] = await sayfaParmakIzleri(p);
    expect(iz).toMatch(/^i:[0-9a-f]{64}$/);
    expect(await sayfaParmakIzleri(await (await PDFDocument.load(p)).save())).toEqual([iz]);
    expect((await sayfaParmakIzleri(await metinPdf('Sayfa 2')))[0]).not.toBe(iz);
    expect(await sayfaParmakIzleri(await writeDefterStrokes(p, new Map([[0, [stroke('m1')]]])))).toEqual([iz]);
  });
});
