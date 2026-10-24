import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { degrees, PDFDocument, StandardFonts } from 'pdf-lib';
import { fotograflardanPdf } from '../defter/sayfaEkle';
import { jpegParmakIzi } from './fotoOkuma';
import * as parmakIzi from './kayit/parmakIzi';
import { PdfSayfaGorselleri } from './sayfaGorseli';

// Task 6.4c-2: which bytes a page is read from (pdf.js drawing faked: ciz)

const jpeg = async (renk: string, w = 300, h = 400) =>
  new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: renk } }).jpeg({ quality: 85 }).toBuffer());
const CIZIM = new Uint8Array([0xff, 0xd8, 0xff, 9]);
let a: Uint8Array, b: Uint8Array, buyuk: Uint8Array;
beforeAll(async () => { [a, b, buyuk] = await Promise.all([jpeg('#d8c9a3'), jpeg('#a3c9d8'), jpeg('#c9d8a3', 2400, 1800)]); });
afterEach(() => { vi.restoreAllMocks(); });

describe('PdfSayfaGorselleri', () => {
  it('a photo page: the embedded JPEG itself, its fingerprint = the file\'s', async () => {
    const g = await PdfSayfaGorselleri.ac(await fotograflardanPdf([{ bytes: a }, { bytes: b }]));
    const ciz = vi.fn(async () => CIZIM);
    const s2 = await g.gorsel(2, ciz);
    expect(s2.kaynak).toBe('gomulu');
    expect([...s2.jpeg]).toEqual([...b]);
    expect(s2.parmakIzi).toBe(await jpegParmakIzi(b));
    expect(s2.parmakIzi).toBe(g.izler[1]);
    expect(ciz).not.toHaveBeenCalled();
  });

  it('a text page, a photo over 2000 px, a turned page: drawn, fingerprint from the file', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([300, 400]).drawText('Printed text page', { x: 20, y: 200, size: 12, font });
    const img = await doc.embedJpg(buyuk);
    doc.addPage([600, 450]).drawImage(img, { x: 0, y: 0, width: 600, height: 450 });
    const img2 = await doc.embedJpg(a);
    const p3 = doc.addPage([300, 400]); p3.drawImage(img2, { x: 0, y: 0, width: 300, height: 400 }); p3.setRotation(degrees(90));
    const g = await PdfSayfaGorselleri.ac(await doc.save());
    for (const n of [1, 2, 3]) {
      const s = await g.gorsel(n, async () => CIZIM);
      expect(s.kaynak).toBe('cizim');
      expect(s.jpeg).toBe(CIZIM);
      expect(s.parmakIzi).toBe(g.izler[n - 1]);
    }
    expect(g.izler[0]).toMatch(/^i:/);
  });

  it('fingerprints do not match: a warning and the drawn page, never a silent match', async () => {
    vi.spyOn(parmakIzi, 'sayfaParmakIzleri').mockResolvedValue(['g:' + '0'.repeat(64)]);
    const uyari = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const g = await PdfSayfaGorselleri.ac(await fotograflardanPdf([{ bytes: a }]));
    const s = await g.gorsel(1, async () => CIZIM);
    expect(s).toEqual({ jpeg: CIZIM, parmakIzi: 'g:' + '0'.repeat(64), kaynak: 'cizim' });
    expect(uyari).toHaveBeenCalledWith(expect.stringContaining('aynı değil'));
  });

  it('a page that is not there', async () => {
    const g = await PdfSayfaGorselleri.ac(await fotograflardanPdf([{ bytes: a }]));
    await expect(g.gorsel(2, async () => CIZIM)).rejects.toThrow('1 sayfa');
  });
});
