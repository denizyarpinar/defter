import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFName, PDFString, type PDFPage } from 'pdf-lib';
import { DriveError, FOLDER_MIME } from '../drive/drive';
import type { DriveLocation } from '../drive/driveLibrary';
import { YerDisi, yerBelleginiSifirla, type KlasorBilgisi } from '../drive/pdfOlustur';
import { PdfReadOnly, PdfSampleNoWrite, yedekBelleginiSifirla, type PdfDrive, type Revision } from '../drive/pdfYazici';
import type { PendingRecord } from '../kalem/bekleyenFark';
import type { Stroke } from '../kalem/cizgi';
import { DriveUploader, uploadRecord } from '../kalem/pdfKayit';
import { PdfYazilamaz, readDefterStrokes, writeDefterStrokes } from '../kalem/pdfNotlari';
import {
  DosyaBulunamadi, EK_ID, EkPdfYazilamaz, isaretliPdfEkle, ozeteSayfaEkle, PdfDosyasiDegil, SayfaEklemeAgHatasi, SayfaEklemeCakisma,
  SayfaYazmaYok, type EklenenSayfalar, type SayfaEklemeOrtami, type SayfaEklemeSecenek
} from './ozeteEkle';
import type { Jpeg } from './sayfaEkle';

// Task 5.6: pages at the end of a PDF that is in Drive. A fake Drive in memory; no request goes anywhere.
// The PDF is made here (3 pages, a Defter stroke and another program's note); the photos with sharp.

const N = (s: string) => PDFName.of(s);
const stroke = (id: string): Stroke => ({ id, arac: 'kalem', renk: '#222222', kalinlik: 2.2, opaklik: 1, noktalar: [100, 100, 200, 150] });

let dik: Jpeg, yatay: Jpeg, baslangic: Uint8Array;
// task 6.S-3: an extra PDF (2 pages): another program's note on page 1, a Defter stroke 'e' on page 2
let ekPdf: Uint8Array, sifreliEk: Uint8Array, imzaliEk: Uint8Array;
beforeAll(async () => {
  const ek = await PDFDocument.create();
  ek.addPage([842, 595]).drawText('Ek 1', { x: 50, y: 500 });
  ek.addPage([595.28, 841.89]).drawText('Ek 2', { x: 50, y: 780 });
  ek.getPage(0).node.set(N('Annots'), ek.context.obj([ek.context.register(ek.context.obj({
    Type: 'Annot', Subtype: 'Text', Rect: [50, 400, 70, 420], Contents: PDFString.of('Ek notu'), T: PDFString.of('Ayse')
  }))]));
  ekPdf = await writeDefterStrokes(await ek.save(), new Map([[1, [stroke('e')]]]));
  const enc = await PDFDocument.load(ekPdf);
  enc.context.trailerInfo.Encrypt = enc.context.register(enc.context.obj({ Filter: 'Standard', V: 2, R: 3, Length: 128, P: -4 }));
  sifreliEk = await enc.save({ useObjectStreams: false });
  const sig = await PDFDocument.load(ekPdf);
  sig.catalog.set(N('AcroForm'), sig.context.register(sig.context.obj({ Fields: [sig.context.register(sig.context.obj({ FT: 'Sig', T: PDFString.of('Imza') }))] })));
  imzaliEk = await sig.save();

  const jpeg = async (w: number, h: number) =>
    ({ bytes: new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: '#d8c9a3' } }).jpeg({ quality: 85 }).toBuffer()) });
  [dik, yatay] = await Promise.all([jpeg(600, 800), jpeg(800, 600)]);
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i++) doc.addPage([595.28, 841.89]).drawText(`Sayfa ${i + 1}`, { x: 50, y: 780 });
  const ctx = doc.context;
  doc.getPage(1).node.set(N('Annots'), ctx.obj([ctx.register(ctx.obj({
    Type: 'Annot', Subtype: 'Text', Rect: [50, 700, 70, 720], Contents: PDFString.of('Merhaba'), T: PDFString.of('Ali')
  }))]));
  baslangic = await writeDefterStrokes(await doc.save(), new Map([[0, [stroke('o')]]]));
});

// What must not change on an old page: size, content, every annotation
async function eskiSayfalar(bytes: Uint8Array, n: number): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().slice(0, n).map((p: PDFPage) => {
    const annots = (p.node.Annots()?.asArray() ?? []).map(r => (doc.context.lookup(r) as PDFDict).toString());
    const contents = doc.context.lookup(p.node.get(N('Contents')));
    return JSON.stringify([p.getSize(), contents && 'getContents' in contents ? [...(contents as { getContents(): Uint8Array }).getContents()] : null, annots]);
  });
}

const sayfaSayisi = async (b: Uint8Array) => (await PDFDocument.load(b)).getPageCount();
const ekIdleri = async (b: Uint8Array) => {
  const doc = await PDFDocument.load(b);
  return doc.getPages().map(p => (doc.context.lookup(p.node.get(N(EK_ID))) as PDFString | undefined)?.decodeText() ?? null);
};

// Kitaplık R → K "kitaplar" → B (book "mat-1") → C (topic) → P (the PDF). X: a PDF outside the books.
const YER: DriveLocation = { rootId: 'R', libraryFileId: null, bookFolderIds: new Map([['mat-1', 'B']]), bookFileIds: new Map() };
const AGAC: Record<string, Omit<KlasorBilgisi, 'id' | 'canAddChildren'>> = {
  K: { name: 'kitaplar', mimeType: FOLDER_MIME, trashed: false, parents: ['R'] },
  B: { name: 'mat-1', mimeType: FOLDER_MIME, trashed: false, parents: ['K'] },
  C: { name: 'Konu-01', mimeType: FOLDER_MIME, trashed: false, parents: ['B'] },
  P: { name: 'ozet.pdf', mimeType: 'application/pdf', trashed: false, parents: ['C'] },
  X: { name: 'baska.pdf', mimeType: 'application/pdf', trashed: false, parents: ['R'] },
  W: { name: 'not.docx', mimeType: 'application/msword', trashed: false, parents: ['C'] },
};

// One PDF (id P) on a fake Drive. Every write makes a new revision; revisions can be kept (keepForever).
function fakeDrive(start: Uint8Array) {
  const file = { bytes: start, n: 1, canEdit: true, kayip: 0, cakisma: 0, offline: 0, yok: false };
  const revisions: Revision[] = [{ id: 'r1' }];
  const log: string[] = [];
  const mt = () => `t${file.n}`;
  const net = () => { if (file.offline > 0) { file.offline--; throw new TypeError('Failed to fetch'); } };
  const yeniSurum = (bytes: Uint8Array) => { file.bytes = bytes; file.n++; revisions.push({ id: `r${file.n}` }); };
  let okundu = false;   // the first durum after a modifiedTime read is uploadPdf's check of the round
  const drive: PdfDrive = {
    async durum() {
      net();
      if (file.yok) throw new DriveError(404, 'test');
      log.push('durum');
      // another device writes right before uploadPdf's check
      if (okundu && file.cakisma > 0) {
        file.cakisma--;
        const eski = (await readDefterStrokes(file.bytes)).get(2) ?? [];
        yeniSurum(await writeDefterStrokes(file.bytes, new Map([[2, [...eski, stroke(`baska${file.n}`)]]])));
      }
      okundu = false;
      return { canEdit: file.canEdit, modifiedTime: mt(), headRevisionId: `r${file.n}` };
    },
    async listRevisions() { return { revisions: revisions.map(r => ({ ...r })) }; },
    async headRevisionId() { return `r${file.n}`; },
    async keepRevision(_id, rev) { log.push(`keep:${rev}`); revisions.find(r => r.id === rev)!.keepForever = true; },
    async modifiedTime() {
      net();
      if (file.yok) throw new DriveError(404, 'test');
      log.push('modifiedTime');
      okundu = true;
      return mt();
    },
    async uploadMedia(id, bytes) {
      log.push('upload');
      yeniSurum(bytes);
      if (file.kayip > 0) { file.kayip--; throw new TypeError('Failed to fetch'); }   // arrived, answer lost
      return { id, modifiedTime: mt(), headRevisionId: `r${file.n}` };
    },
    async uploadResumable(id, bytes) { return this.uploadMedia(id, bytes); }
  };
  const deps = { drive, bytes: async (_id: string, v: string) => { log.push(`bytes:${v}`); if (v !== mt()) throw new Error('eski sürüm'); return file.bytes; } };
  const klasorBilgisi = async (id: string): Promise<KlasorBilgisi> => {
    log.push(`bilgi:${id}`);
    if (id === 'P' && file.yok) throw new DriveError(404, 'test');
    const k = AGAC[id];
    if (!k) throw new DriveError(404, 'test');
    return { id, canAddChildren: true, ...k };
  };
  // a plain queue (one job at a time), or the pen's DriveUploader in the queue tests
  let zincir = Promise.resolve();
  const sirada = <T>(_id: string, job: () => Promise<T>): Promise<T> => {
    const p = zincir.then(job);
    zincir = p.then(() => {}, () => {});
    return p;
  };
  const degisenler: EklenenSayfalar[] = [];
  const ortam: SayfaEklemeOrtami = { yer: YER, deps, dosyaDrive: { klasorBilgisi }, sirada, degisti: s => { degisenler.push(s); } };
  return { file, revisions, log, drive, deps, ortam, degisenler };
}

const HIZLI: SayfaEklemeSecenek = { bekleMs: 0 };

beforeEach(() => { yedekBelleginiSifirla(); yerBelleginiSifirla(); });

describe('ozeteSayfaEkle', () => {
  it('pages +N at the end; old pages, Defter strokes and the other note stay the same', async () => {
    const d = fakeDrive(baslangic);
    const s = await ozeteSayfaEkle('P', [dik, yatay], d.ortam, { ...HIZLI, islemId: 'is-1' });
    expect([s.eskiSayfa, s.yeniSayfa, s.zatenVardi]).toEqual([3, 5, false]);
    expect(await sayfaSayisi(d.file.bytes)).toBe(5);
    expect(await eskiSayfalar(d.file.bytes, 3)).toEqual(await eskiSayfalar(baslangic, 3));
    expect([...(await readDefterStrokes(d.file.bytes))].map(([p, l]) => [p, l.map(x => x.id)])).toEqual([[0, ['o']]]);
    expect(await ekIdleri(d.file.bytes)).toEqual([null, null, null, 'is-1', 'is-1']);
    expect(s.modifiedTime).toBe('t2');
    expect(d.degisenler).toEqual([s]);   // the caches follow the new version
    expect(d.log.filter(l => l === 'upload')).toHaveLength(1);
  });

  it('answer lost after the upload arrived: the next try sees the pages, no double pages', async () => {
    const d = fakeDrive(baslangic);
    d.file.kayip = 1;
    const s = await ozeteSayfaEkle('P', [dik, yatay], d.ortam, HIZLI);
    expect(s.zatenVardi).toBe(true);
    expect([s.eskiSayfa, s.yeniSayfa]).toEqual([3, 5]);
    expect(await sayfaSayisi(d.file.bytes)).toBe(5);
    expect(d.log.filter(l => l === 'upload')).toHaveLength(1);
  });

  it('called again later with the same islemId: nothing uploaded, page count the same', async () => {
    const d = fakeDrive(baslangic);
    await ozeteSayfaEkle('P', [dik], d.ortam, { ...HIZLI, islemId: 'ayni' });
    const s = await ozeteSayfaEkle('P', [dik], d.ortam, { ...HIZLI, islemId: 'ayni' });
    expect(s.zatenVardi).toBe(true);
    expect(await sayfaSayisi(d.file.bytes)).toBe(4);
    expect(d.log.filter(l => l === 'upload')).toHaveLength(1);
    // another adding (new id) does add
    await ozeteSayfaEkle('P', [dik], d.ortam, HIZLI);
    expect(await sayfaSayisi(d.file.bytes)).toBe(5);
  });

  it('conflict: the newest file is downloaded again and the pages go on top of it', async () => {
    const d = fakeDrive(baslangic);
    d.file.cakisma = 2;
    const s = await ozeteSayfaEkle('P', [dik, yatay], d.ortam, HIZLI);
    expect(d.log.filter(l => l.startsWith('bytes'))).toEqual(['bytes:t1', 'bytes:t2', 'bytes:t3']);
    expect(s.yeniSayfa).toBe(5);
    // the other device's strokes are in the result too
    const ids = [...(await readDefterStrokes(d.file.bytes))].map(([p, l]) => [p, l.map(x => x.id)]);
    expect(ids).toEqual([[0, ['o']], [2, ['baska1', 'baska2']]]);
  });

  it('conflict 3 times: clear error, nothing uploaded', async () => {
    const d = fakeDrive(baslangic);
    d.file.cakisma = 3;
    await expect(ozeteSayfaEkle('P', [dik], d.ortam, HIZLI)).rejects.toThrow(SayfaEklemeCakisma);
    expect(d.log).not.toContain('upload');
    expect(new SayfaEklemeCakisma().message).toMatch(/Biraz sonra tekrar dene/);
  });

  it('offline: tried again; always offline → SayfaEklemeAgHatasi, nothing uploaded', async () => {
    const a = fakeDrive(baslangic);
    a.file.offline = 1;
    expect((await ozeteSayfaEkle('P', [dik], a.ortam, HIZLI)).yeniSayfa).toBe(4);
    const b = fakeDrive(baslangic);
    b.file.offline = 10;
    await expect(ozeteSayfaEkle('P', [dik], b.ortam, HIZLI)).rejects.toThrow(SayfaEklemeAgHatasi);
    expect(b.log).not.toContain('upload');
  });

  it('backup (keepForever) only before the first write', async () => {
    const d = fakeDrive(baslangic);
    await ozeteSayfaEkle('P', [dik], d.ortam, HIZLI);
    await ozeteSayfaEkle('P', [yatay], d.ortam, HIZLI);
    expect(d.log.filter(l => l.startsWith('keep'))).toEqual(['keep:r1']);
    expect(d.revisions.filter(r => r.keepForever).map(r => r.id)).toEqual(['r1']);
    expect(await sayfaSayisi(d.file.bytes)).toBe(5);
  });

  it('task 6.2e-2: the second adding asks Drive less (place remembered, one check before the upload)', async () => {
    const d = fakeDrive(baslangic);
    const istekler = () => d.log.filter(l => !l.startsWith('bytes') && l !== 'upload');
    await ozeteSayfaEkle('P', [dik], d.ortam, HIZLI);
    expect(istekler()).toEqual(['bilgi:P', 'bilgi:C', 'bilgi:B', 'bilgi:K', 'modifiedTime', 'durum', 'keep:r1', 'durum']);
    d.log.length = 0;
    await ozeteSayfaEkle('P', [yatay], d.ortam, HIZLI);
    expect(istekler()).toEqual(['bilgi:P', 'modifiedTime', 'durum']);
    expect(await sayfaSayisi(d.file.bytes)).toBe(5);
  });

  it('task 6.2e-2: the upload\'s listener hears the start (basladi)', async () => {
    const d = fakeDrive(baslangic);
    const olay: string[] = [];
    await ozeteSayfaEkle('P', [dik], d.ortam, { ...HIZLI, yukleme: { basladi: () => olay.push(`basladi:${d.log.at(-1)}`) } });
    expect(olay).toEqual(['basladi:durum']);
  });

  it('Drive library not open / sample file: no request at all', async () => {
    const d = fakeDrive(baslangic);
    await expect(ozeteSayfaEkle('P', [dik], { ...d.ortam, yer: null }, HIZLI)).rejects.toThrow(SayfaYazmaYok);
    await expect(ozeteSayfaEkle('ornek:kitap#x/ozet.pdf', [dik], d.ortam, HIZLI)).rejects.toThrow(PdfSampleNoWrite);
    expect(d.log).toEqual([]);
    expect(d.file.n).toBe(1);
  });

  it('encrypted and signed PDFs: PdfYazilamaz, nothing uploaded', async () => {
    const enc = await PDFDocument.load(baslangic);
    enc.context.trailerInfo.Encrypt = enc.context.register(enc.context.obj({ Filter: 'Standard', V: 2, R: 3, Length: 128, P: -4 }));
    const sig = await PDFDocument.load(baslangic);
    sig.catalog.set(N('AcroForm'), sig.context.register(sig.context.obj({ Fields: [sig.context.register(sig.context.obj({ FT: 'Sig', T: PDFString.of('Imza') }))] })));
    for (const [bytes, metin] of [
      [await enc.save({ useObjectStreams: false }), 'şifreli'],
      [await sig.save(), 'dijital imzalı'],
    ] as const) {
      const d = fakeDrive(bytes);
      const e = await ozeteSayfaEkle('P', [dik], d.ortam, HIZLI).catch(x => x);
      expect(e).toBeInstanceOf(PdfYazilamaz);
      expect(e.message).toContain(metin);
      expect(d.log).not.toContain('upload');
      expect(d.log.filter(l => l.startsWith('keep'))).toEqual([]);
    }
  });

  it('no write permission → PdfReadOnly; missing file → DosyaBulunamadi; not a PDF / outside the books → no write', async () => {
    const a = fakeDrive(baslangic);
    a.file.canEdit = false;
    await expect(ozeteSayfaEkle('P', [dik], a.ortam, HIZLI)).rejects.toThrow(PdfReadOnly);
    const b = fakeDrive(baslangic);
    b.file.yok = true;
    await expect(ozeteSayfaEkle('P', [dik], b.ortam, HIZLI)).rejects.toThrow(DosyaBulunamadi);
    const c = fakeDrive(baslangic);
    await expect(ozeteSayfaEkle('W', [dik], c.ortam, HIZLI)).rejects.toThrow(PdfDosyasiDegil);
    await expect(ozeteSayfaEkle('X', [dik], c.ortam, HIZLI)).rejects.toThrow(YerDisi);
    await expect(ozeteSayfaEkle('yok', [dik], c.ortam, HIZLI)).rejects.toThrow(DosyaBulunamadi);
    for (const d of [a, b, c]) expect(d.log).not.toContain('upload');
  });
});

describe('task 6.S-3: a PDF\'s pages at the end (isaretliPdfEkle)', () => {
  const notlar = async (b: Uint8Array, i: number) => {
    const doc = await PDFDocument.load(b);
    return (doc.getPage(i).node.Annots()?.asArray() ?? []).map(r => doc.context.lookup(r) as PDFDict);
  };

  it('all pages at the end, marked; old pages the same; other notes and Defter strokes kept (Defter ones with new ids)', async () => {
    const h = await isaretliPdfEkle(baslangic, ekPdf, 'is-1');
    if ('zatenVar' in h) throw new Error('zatenVar');
    expect([h.eskiSayfa, h.yeniSayfa]).toEqual([3, 5]);
    expect(await sayfaSayisi(h.bytes)).toBe(5);
    expect(await ekIdleri(h.bytes)).toEqual([null, null, null, 'is-1', 'is-1']);
    expect(await eskiSayfalar(h.bytes, 3)).toEqual(await eskiSayfalar(baslangic, 3));
    // the page sizes of the extra file (landscape stays landscape)
    const doc = await PDFDocument.load(h.bytes);
    expect([doc.getPage(3).getSize(), doc.getPage(4).getSize()]).toEqual([{ width: 842, height: 595 }, { width: 595.28, height: 841.89 }]);
    // another program's note: as it was
    const diger = (await notlar(h.bytes, 3)).find(a => a.get(N('Subtype')) === N('Text'))!;
    expect((diger.get(N('Contents')) as PDFString).decodeText()).toBe('Ek notu');
    // the Defter stroke: the same line, a new id
    const eski = (await readDefterStrokes(ekPdf)).get(1)![0];
    const yeni = await readDefterStrokes(h.bytes);
    expect([...yeni.keys()]).toEqual([0, 4]);
    expect(yeni.get(0)!.map(x => x.id)).toEqual(['o']);
    expect(yeni.get(4)).toEqual([{ ...eski, id: 'is-1-1' }]);
  });

  it('the same islemId again: zatenVar, nothing changes; another adding of the same file: no id twice', async () => {
    const h = await isaretliPdfEkle(baslangic, ekPdf, 'is-1');
    if ('zatenVar' in h) throw new Error('zatenVar');
    expect(await isaretliPdfEkle(h.bytes, ekPdf, 'is-1')).toEqual({ zatenVar: true, sayfa: 5, eskiSayfa: 3 });
    const h2 = await isaretliPdfEkle(h.bytes, ekPdf, 'is-2');
    if ('zatenVar' in h2) throw new Error('zatenVar');
    const ids = [...(await readDefterStrokes(h2.bytes)).values()].flat().map(x => x.id);
    expect(ids).toEqual(['o', 'is-1-1', 'is-2-1']);
  });

  it('encrypted / broken / empty extra PDF → EkPdfYazilamaz (not the summary\'s PdfYazilamaz)', async () => {
    const e = await isaretliPdfEkle(baslangic, sifreliEk, 'x').catch(x => x);
    expect(e).toBeInstanceOf(EkPdfYazilamaz);
    expect(e).not.toBeInstanceOf(PdfYazilamaz);
    expect(e.message).toContain('Bu PDF şifreli, özete eklenemiyor');
    await expect(isaretliPdfEkle(baslangic, new TextEncoder().encode('%PDF-1.7 bozuk'), 'x')).rejects.toThrow(EkPdfYazilamaz);
    const bos = await (await PDFDocument.create()).save({ addDefaultPage: false });
    await expect(isaretliPdfEkle(baslangic, bos, 'x')).rejects.toThrow(/sayfa yok/);
  });

  it('a signed extra PDF is accepted: it is only read, its pages are added', async () => {
    const h = await isaretliPdfEkle(baslangic, imzaliEk, 'is-s');
    if ('zatenVar' in h) throw new Error('zatenVar');
    expect([h.eskiSayfa, h.yeniSayfa]).toEqual([3, 5]);
    expect(await ekIdleri(h.bytes)).toEqual([null, null, null, 'is-s', 'is-s']);
    const d = fakeDrive(baslangic);
    expect((await ozeteSayfaEkle('P', { pdf: imzaliEk }, d.ortam, HIZLI)).yeniSayfa).toBe(5);
  });

  it('the summary itself encrypted or signed → PdfYazilamaz with the summary wording (as today)', async () => {
    const sig = await PDFDocument.load(baslangic);
    sig.catalog.set(N('AcroForm'), sig.context.register(sig.context.obj({ Fields: [sig.context.register(sig.context.obj({ FT: 'Sig', T: PDFString.of('Imza') }))] })));
    const imzaliOzet = await isaretliPdfEkle(await sig.save(), ekPdf, 'x').catch(x => x);
    expect(imzaliOzet).toBeInstanceOf(PdfYazilamaz);
    expect(imzaliOzet.message).toContain('dijital imzalı');
    const e = await isaretliPdfEkle(sifreliEk, ekPdf, 'x').catch(x => x);
    expect(e).toBeInstanceOf(PdfYazilamaz);
    expect(e.message).toContain('sayfa eklenemiyor');
  });
});

describe('task 6.S-3: ozeteSayfaEkle with a PDF', () => {
  it('the pages at the end; one upload; the caches follow', async () => {
    const d = fakeDrive(baslangic);
    const s = await ozeteSayfaEkle('P', { pdf: ekPdf }, d.ortam, { ...HIZLI, islemId: 'is-1' });
    expect([s.eskiSayfa, s.yeniSayfa, s.zatenVardi]).toEqual([3, 5, false]);
    expect(await ekIdleri(d.file.bytes)).toEqual([null, null, null, 'is-1', 'is-1']);
    expect(d.degisenler).toEqual([s]);
    expect(d.log.filter(l => l === 'upload')).toHaveLength(1);
  });

  it('conflict: on top of the newest file; answer lost: no double pages (Tekrar dene with the same islemId)', async () => {
    const a = fakeDrive(baslangic);
    a.file.cakisma = 2;
    expect((await ozeteSayfaEkle('P', { pdf: ekPdf }, a.ortam, HIZLI)).yeniSayfa).toBe(5);
    expect([...(await readDefterStrokes(a.file.bytes)).keys()]).toEqual([0, 2, 4]);
    const b = fakeDrive(baslangic);
    b.file.kayip = 1;
    const s = await ozeteSayfaEkle('P', { pdf: ekPdf }, b.ortam, { ...HIZLI, islemId: 'ayni' });
    expect(s.zatenVardi).toBe(true);
    const tekrar = await ozeteSayfaEkle('P', { pdf: ekPdf }, b.ortam, { ...HIZLI, islemId: 'ayni' });
    expect(tekrar.zatenVardi).toBe(true);
    expect(await sayfaSayisi(b.file.bytes)).toBe(5);
    expect(b.log.filter(l => l === 'upload')).toHaveLength(1);
  });

  it('offline: tried again; always offline → SayfaEklemeAgHatasi, nothing uploaded; the upload is heard', async () => {
    const a = fakeDrive(baslangic);
    a.file.offline = 1;
    const olay: string[] = [];
    expect((await ozeteSayfaEkle('P', { pdf: ekPdf }, a.ortam, { ...HIZLI, yukleme: { basladi: () => olay.push('basladi') } })).yeniSayfa).toBe(5);
    expect(olay).toEqual(['basladi']);
    const b = fakeDrive(baslangic);
    b.file.offline = 10;
    await expect(ozeteSayfaEkle('P', { pdf: ekPdf }, b.ortam, HIZLI)).rejects.toThrow(SayfaEklemeAgHatasi);
    expect(b.log).not.toContain('upload');
  });

  it('an encrypted extra PDF: refused before any request', async () => {
    const d = fakeDrive(baslangic);
    await expect(ozeteSayfaEkle('P', { pdf: sifreliEk }, d.ortam, HIZLI)).rejects.toThrow(EkPdfYazilamaz);
    expect(d.log).toEqual([]);
  });
});

describe('pages at the end and the pen', () => {
  const rec = (d: Partial<PendingRecord>): PendingRecord =>
    ({ fileId: 'P', kaynakModifiedTime: 't1', dosyaAdi: 'ozet.pdf', eklenen: [], silinenIdler: [], guncelleme: 'x', ...d });

  it('a pending pen record made before the adding still lands on its page', async () => {
    const d = fakeDrive(baslangic);
    await ozeteSayfaEkle('P', [dik, yatay], d.ortam, HIZLI);
    // drawn on page 2 (index 1) against version t1, uploaded after the pages were added (t2)
    const u = await uploadRecord(d.deps, rec({ eklenen: [{ sayfa: 1, stroke: stroke('yeni') }], silinenIdler: [{ sayfa: 0, id: 'o' }] }));
    expect(u.modifiedTime).toBe('t3');
    expect([...(await readDefterStrokes(d.file.bytes))].map(([p, l]) => [p, l.map(x => x.id)])).toEqual([[1, ['yeni']]]);
    expect(await sayfaSayisi(d.file.bytes)).toBe(5);
    const ek = await ekIdleri(d.file.bytes);
    expect(ek.slice(0, 3)).toEqual([null, null, null]);
    expect(ek[3]).toBeTruthy();
    expect(ek[4]).toBe(ek[3]);
  });

  it('same queue as the pen: the strokes are uploaded first, then the pages, never at the same time', async () => {
    const d = fakeDrive(baslangic);
    let record: PendingRecord | null = rec({ eklenen: [{ sayfa: 0, stroke: stroke('k') }] });
    const olaylar: string[] = [];
    const up = new DriveUploader(d.deps, {
      record: async () => record,
      done: () => { olaylar.push('kalem bitti'); record = null; },
      status: () => {},
    });
    const orig = d.drive.uploadMedia.bind(d.drive);
    let ayniAnda = 0;
    d.drive.uploadMedia = async (id, b) => {
      if (++ayniAnda > 1) throw new Error('iki yükleme aynı anda');
      olaylar.push('yükleme');
      await new Promise(r => setTimeout(r, 5));
      ayniAnda--;
      return orig(id, b);
    };
    const kalem = up.request(['P']);
    const sayfa = ozeteSayfaEkle('P', [dik], { ...d.ortam, sirada: (id, job) => up.sirada(id, job) }, HIZLI)
      .then(s => { olaylar.push('sayfa bitti'); return s; });
    await Promise.all([kalem, sayfa]);
    expect(olaylar).toEqual(['yükleme', 'kalem bitti', 'yükleme', 'sayfa bitti']);
    expect(await sayfaSayisi(d.file.bytes)).toBe(4);
    expect([...(await readDefterStrokes(d.file.bytes))].map(([p, l]) => [p, l.map(x => x.id)])).toEqual([[0, ['o', 'k']]]);
    up.dispose();
  });
});

// Task 6.S-4: a blank page between pages and its removal, the same way (queue, tries, conflict)
describe('ozeteSayfaEkle: { bosSayfa } / { bosKaldir }', () => {
  const bosIdleri = async (b: Uint8Array) => {
    const doc = await PDFDocument.load(b);
    return doc.getPages().map(p => (doc.context.lookup(p.node.get(N('DefterBosSayfa'))) as PDFString | undefined)?.decodeText() ?? null);
  };

  it('araya girer (indeks döner); cevap kaybolursa ikinci sayfa yok; kaldırma aynı yoldan', async () => {
    const d = fakeDrive(baslangic);
    d.file.kayip = 1;
    const s = await ozeteSayfaEkle('P', { bosSayfa: { komsu: 0, yon: 'sonra', desen: 'kareli' } }, d.ortam, { ...HIZLI, islemId: 'b1' });
    expect([s.indeks, s.zatenVardi]).toEqual([1, true]);
    expect(await bosIdleri(d.file.bytes)).toEqual([null, 'b1', null, null]);
    expect(d.log.filter(l => l === 'upload')).toHaveLength(1);
    // the stroke on page 0 stays there; the other note's page moved to 2
    expect([...(await readDefterStrokes(d.file.bytes)).keys()]).toEqual([0]);
    const k = await ozeteSayfaEkle('P', { bosKaldir: { indeks: 1 } }, d.ortam, { ...HIZLI, islemId: 'b1' });
    expect([k.indeks, k.yeniSayfa]).toEqual([1, 3]);
    expect(await eskiSayfalar(d.file.bytes, 3)).toEqual(await eskiSayfalar(baslangic, 3));
  });

  it('kuyrukOncesi reddederse hiçbir şey okunmaz, yazılmaz', async () => {
    const d = fakeDrive(baslangic);
    const red = ozeteSayfaEkle('P', { bosSayfa: { komsu: 0, yon: 'once', desen: 'duz' } }, d.ortam, { ...HIZLI, kuyrukOncesi: async () => { throw new Error('önce çizimler'); } });
    await expect(red).rejects.toThrow('önce çizimler');
    expect(d.log.filter(l => l === 'upload' || l === 'modifiedTime')).toEqual([]);
  });
});
