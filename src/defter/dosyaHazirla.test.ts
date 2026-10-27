import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { MAX_DOSYA_MB, SAYFA_DUZENI } from './ayarlar';
import { BOS_DOSYA_METIN, boyutMetni, heicAcilamadiMetni, ofisMetni, BOZUK_PDF_METIN, DESTEKLENMEYEN_METIN } from './dosyaEklemeMetin';
import { dosyaHazirla, DosyaHazirlanamadi, pdfAdi, type HazirlaAraclari } from './dosyaHazirla';
import { GorselHatasi } from './gorselHesap';
import { fotograflardanPdf } from './sayfaEkle';

// Task 5.10d: the chosen file → PDF bytes. The browser parts (canvas, pdf-lib) are fakes here,
// except the one end-to-end test (sharp JPEG + the real fotograflardanPdf).

const b = (...parts: (number | string)[]) =>
  new Uint8Array(parts.flatMap(p => typeof p === 'number' ? [p] : [...p].map(c => c.charCodeAt(0))));
const dosya = (ad: string, tip: string, ...parts: Uint8Array<ArrayBuffer>[]) => new File(parts, ad, { type: tip });

const PDF = b('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const PNG = b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPEG = b(0xff, 0xd8, 0xff, 0xe0, 0, 16, 'JFIF');
const ZIP = b(0x50, 0x4b, 0x03, 0x04, 20, 0, 6, 0);

const SAHTE_JPEG = b(0xff, 0xd8, 0xff, 1, 2, 3);
const SAHTE_PDF = b('%PDF-sahte');

function sahteAraclar(gorsel?: () => Promise<{ bytes: Uint8Array }>) {
  const a = {
    gorselHazirla: vi.fn(gorsel ?? (async () => ({ bytes: SAHTE_JPEG }))),
    pdfYap: vi.fn(async () => SAHTE_PDF),
  };
  return a satisfies HazirlaAraclari;
}

async function hata(p: Promise<unknown>): Promise<DosyaHazirlanamadi> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(DosyaHazirlanamadi);
  return e as DosyaHazirlanamadi;
}

describe('pdfAdi', () => {
  it('drops the last extension, adds .pdf', () => {
    expect(pdfAdi('tahta.png')).toBe('tahta.pdf');
    expect(pdfAdi('IMG_0012.HEIC')).toBe('IMG_0012.pdf');
    expect(pdfAdi('ders.notu.jpeg')).toBe('ders.notu.pdf');
    expect(pdfAdi('  foto.jpg ')).toBe('foto.pdf');
  });

  it('no extension: .pdf added', () => {
    expect(pdfAdi('foto')).toBe('foto.pdf');
  });

  it('nothing left: gorsel.pdf', () => {
    expect(pdfAdi('.png')).toBe('gorsel.pdf');
    expect(pdfAdi('')).toBe('gorsel.pdf');
    expect(pdfAdi('   ')).toBe('gorsel.pdf');
  });
});

describe('dosyaHazirla: order and refusals', () => {
  it('0 bytes → "Dosya boş", its own text (not the photo one)', async () => {
    const a = sahteAraclar();
    const e = await hata(dosyaHazirla(dosya('bos.pdf', 'application/pdf'), a));
    expect(e.neden).toBe('bos');
    expect(e.message).toBe(BOS_DOSYA_METIN());
    expect(a.gorselHazirla).not.toHaveBeenCalled();
  });

  it('too big → boyutMetni, the file is never read', async () => {
    const f = dosya('buyuk.pdf', 'application/pdf', PDF);
    const buyuk = MAX_DOSYA_MB * 1_000_000 + 1;
    Object.defineProperty(f, 'size', { value: buyuk });
    const slice = vi.spyOn(f, 'slice');
    const ab = vi.spyOn(f, 'arrayBuffer');
    const e = await hata(dosyaHazirla(f, sahteAraclar()));
    expect(e.neden).toBe('boyut');
    expect(e.message).toBe(boyutMetni(buyuk));
    expect(slice).not.toHaveBeenCalled();
    expect(ab).not.toHaveBeenCalled();
  });

  it('only the first bytes are read for the type', async () => {
    const f = dosya('ders.docx', '', ZIP, new Uint8Array(5000));
    const slice = vi.spyOn(f, 'slice');
    const ab = vi.spyOn(f, 'arrayBuffer');
    await hata(dosyaHazirla(f, sahteAraclar()));
    expect(slice).toHaveBeenCalledWith(0, 1024);
    expect(ab).not.toHaveBeenCalled();
  });

  it('Word / PowerPoint / Keynote → "save it as PDF", no other work', async () => {
    const a = sahteAraclar();
    const word = await hata(dosyaHazirla(dosya('ders.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ZIP), a));
    expect(word.neden).toBe('tur');
    expect(word.message).toBe(ofisMetni('word'));
    expect((await hata(dosyaHazirla(dosya('sunum.pptx', '', ZIP), a))).message).toBe(ofisMetni('powerpoint'));
    expect((await hata(dosyaHazirla(dosya('sunum.key', '', ZIP), a))).message).toBe(ofisMetni('keynote'));
    expect(a.gorselHazirla).not.toHaveBeenCalled();
    expect(a.pdfYap).not.toHaveBeenCalled();
  });

  it('unknown bytes → unsupported; .pdf without %PDF- → broken PDF', async () => {
    const a = sahteAraclar();
    expect((await hata(dosyaHazirla(dosya('notlar.txt', 'text/plain', b('merhaba dunya')), a))).message).toBe(DESTEKLENMEYEN_METIN());
    expect((await hata(dosyaHazirla(dosya('ders.pdf', 'application/pdf', b('<html>')), a))).message).toBe(BOZUK_PDF_METIN());
    expect(a.gorselHazirla).not.toHaveBeenCalled();
  });
});

describe('dosyaHazirla: PDF', () => {
  it('bytes as they are, name kept', async () => {
    const a = sahteAraclar();
    const r = await dosyaHazirla(dosya('Blatt 3.pdf', 'application/pdf', PDF), a);
    expect(r).toEqual({ ad: 'Blatt 3.pdf', bytes: PDF, kaynak: 'pdf' });
    expect(a.gorselHazirla).not.toHaveBeenCalled();
  });

  it('wrong extension: still a PDF, name not changed', async () => {
    const r = await dosyaHazirla(dosya('indirilen.jpg', 'image/jpeg', PDF), sahteAraclar());
    expect(r.kaynak).toBe('pdf');
    expect(r.ad).toBe('indirilen.jpg');
  });
});

describe('dosyaHazirla: image', () => {
  it('PNG → one prepared JPEG → PDF, name .pdf', async () => {
    const a = sahteAraclar();
    const f = dosya('tahta.png', 'image/png', PNG);
    const r = await dosyaHazirla(f, a);
    expect(r).toEqual({ ad: 'tahta.pdf', bytes: SAHTE_PDF, kaynak: 'gorsel' });
    expect(a.gorselHazirla).toHaveBeenCalledTimes(1);
    expect(a.gorselHazirla).toHaveBeenCalledWith(f);
    expect(a.pdfYap).toHaveBeenCalledWith([{ bytes: SAHTE_JPEG }]);
  });

  it('JPEG with empty MIME (iPad): the bytes decide', async () => {
    const r = await dosyaHazirla(dosya('IMG_0042.jpeg', '', JPEG), sahteAraclar());
    expect(r.kaynak).toBe('gorsel');
    expect(r.ad).toBe('IMG_0042.pdf');
  });

  it('HEIC the browser cannot open → the photo flow\'s text', async () => {
    const a = sahteAraclar(async () => { throw new GorselHatasi('heic'); });
    const e = await hata(dosyaHazirla(dosya('IMG_1.HEIC', 'image/heic', b(0, 0, 0, 24, 'ftypheic')), a));
    expect(e.neden).toBe('gorsel');
    expect(e.message).toBe(heicAcilamadiMetni());
    expect(a.pdfYap).not.toHaveBeenCalled();
  });

  it('other errors pass through unchanged', async () => {
    const boom = new Error('pdf-lib yok');
    const a = { gorselHazirla: async () => ({ bytes: SAHTE_JPEG }), pdfYap: async () => { throw boom; } };
    await expect(dosyaHazirla(dosya('a.png', 'image/png', PNG), a)).rejects.toBe(boom);
  });

  it('end to end: a real JPEG → a one-page PDF, same page size as the photo flow', async () => {
    const jpeg = new Uint8Array(await sharp({ create: { width: 800, height: 600, channels: 3, background: '#d8c9a3' } }).jpeg({ quality: 85 }).toBuffer());
    const r = await dosyaHazirla(dosya('tahta.jpg', 'image/jpeg', jpeg), {
      gorselHazirla: async () => ({ bytes: jpeg }),   // the canvas step needs a browser
      pdfYap: fotograflardanPdf,
    });
    const doc = await PDFDocument.load(r.bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    // landscape photo → landscape A4, as in the photo flow (sayfaYerlesimi)
    expect([width, height]).toEqual([SAYFA_DUZENI.yukseklik, SAYFA_DUZENI.genislik]);
  });
});
