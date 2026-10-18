import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, type PDFString } from 'pdf-lib';
import { DriveError, FOLDER_MIME, type DriveFile } from '../drive/drive';
import type { DriveLocation } from '../drive/driveLibrary';
import { DosyaOlusturAgHatasi, IdZatenVar, yerBelleginiSifirla, type KlasorBilgisi, type PdfOlusturDrive, type YeniPdfMeta } from '../drive/pdfOlustur';
import { PdfSampleNoWrite, yedekBelleginiSifirla, type PdfDrive } from '../drive/pdfYazici';
import { HedefOzetDegil, konuyaFotografEkle, ozetKarari, OzetSecilmeli, type KonuEklemeOrtami, type KonuEklemeSecenek } from './konuyaEkle';
import { EK_ID, SayfaYazmaYok } from './ozeteEkle';
import { fotograflardanPdf, type Jpeg } from './sayfaEkle';

// Task 5.7: photos for a topic: added to its summary, or a new ozet.pdf. A fake Drive in memory.

let dik: Jpeg, yatay: Jpeg;
beforeAll(async () => {
  const jpeg = async (w: number, h: number) =>
    ({ bytes: new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: '#d8c9a3' } }).jpeg({ quality: 85 }).toBuffer()) });
  [dik, yatay] = await Promise.all([jpeg(600, 800), jpeg(800, 600)]);
});
beforeEach(() => { yedekBelleginiSifirla(); yerBelleginiSifirla(); });

const f = (name: string, extra: Partial<DriveFile & { trashed: boolean }> = {}) =>
  ({ id: name, name, mimeType: 'application/pdf', modifiedTime: 't', ...extra });

describe('ozetKarari', () => {
  const karar = (files: Parameters<typeof ozetKarari>[0]) => { const d = ozetKarari(files); return [d.durum, d.dosyalar.map(x => x.name)]; };

  it('ozet.pdf, brifing.pdf, sorular.pdf: any case → var', () => {
    expect(karar([f('orijinal.pdf'), f('ozet.pdf')])).toEqual(['var', ['ozet.pdf']]);
    expect(karar([f('brifing.pdf')])).toEqual(['var', ['brifing.pdf']]);
    expect(karar([f('sorular.pdf')])).toEqual(['var', ['sorular.pdf']]);
    expect(karar([f('sorular.pdf'), f('Brifing.PDF')])).toEqual(['var', ['Brifing.PDF', 'sorular.pdf']]);
    expect(karar([f('OZET.PDF')])).toEqual(['var', ['OZET.PDF']]);
    // ozet.pdf there: it alone is the summary (as in the reader)
    expect(karar([f('brifing.pdf'), f('ozet.pdf')])).toEqual(['var', ['ozet.pdf']]);
  });

  it('in the trash, a folder, a solution, other files → yok', () => {
    expect(karar([])).toEqual(['yok', []]);
    expect(karar([f('ozet.pdf', { trashed: true })])).toEqual(['yok', []]);
    expect(karar([f('ozet.pdf', { mimeType: FOLDER_MIME })])).toEqual(['yok', []]);
    expect(karar([f('orijinal.pdf'), f('ozet_cozum.pdf'), f('ozet.docx'), f('notlar.pdf')])).toEqual(['yok', []]);
  });
});

// ---- a fake Drive: R "Kitaplık" → K "kitaplar" → B (book) → C (topic). C2: another topic. ----

interface Item { name: string; parent: string; mimeType: string; bytes?: Uint8Array; n: number; kept?: boolean }

const YER: DriveLocation = { rootId: 'R', libraryFileId: null, bookFolderIds: new Map([['mat-1', 'B']]), bookFileIds: new Map() };
const HIZLI: KonuEklemeSecenek = { bekleMs: 0 };

async function fakeDrive(konu: Record<string, number> = {}) {
  const items = new Map<string, Item>([
    ['K', { name: 'kitaplar', parent: 'R', mimeType: FOLDER_MIME, n: 1 }],
    ['B', { name: 'mat-1', parent: 'K', mimeType: FOLDER_MIME, n: 1 }],
    ['C', { name: 'Konu-01', parent: 'B', mimeType: FOLDER_MIME, n: 1 }],
    ['C2', { name: 'Konu-02', parent: 'B', mimeType: FOLDER_MIME, n: 1 }],
  ]);
  // konu: file name → its page count (in topic C)
  for (const [name, sayfa] of Object.entries(konu)) {
    items.set(name, { name, parent: 'C', mimeType: 'application/pdf', n: 1, bytes: await fotograflardanPdf(Array(sayfa).fill(dik)) });
  }
  items.set('baska', { name: 'ozet.pdf', parent: 'C2', mimeType: 'application/pdf', n: 1, bytes: await fotograflardanPdf([dik]) });
  const log: string[] = [];
  const ayar = {
    kayip: 0,                        // uploads that arrive but whose answer is lost
    agYok: false,                    // every request fails (no connection)
  };
  const net = () => { if (ayar.agYok) throw new TypeError('Failed to fetch'); };
  const get = (id: string) => { const it = items.get(id); if (!it) throw new DriveError(404, 'test'); return it; };
  const children = (parent: string) => [...items].filter(([, it]) => it.parent === parent);
  let nextId = 0;

  const olustur: PdfOlusturDrive = {
    async klasorBilgisi(id): Promise<KlasorBilgisi> {
      net();
      const it = get(id);
      return { id, name: it.name, mimeType: it.mimeType, trashed: false, parents: [it.parent], canAddChildren: true };
    },
    async cocuklar(parent) { net(); log.push(`liste:${parent}`); return children(parent).map(([id, it]) => ({ id, name: it.name })); },
    async yeniId() { net(); return `yeni${++nextId}`; },
    async yukleMultipart(meta: YeniPdfMeta, bytes) {
      net();
      log.push(`POST:${meta.name}`);
      if (items.has(meta.id)) throw new IdZatenVar();
      items.set(meta.id, { name: meta.name, parent: meta.parents[0], mimeType: meta.mimeType, bytes, n: 1 });
      if (ayar.kayip > 0) { ayar.kayip--; ayar.agYok = true; throw new TypeError('Failed to fetch'); }
      return { id: meta.id, modifiedTime: `${meta.id}@1`, headRevisionId: 'r1' };
    },
    async yukleResumable(meta, bytes) { return this.yukleMultipart(meta, bytes); },
    async dosyaBilgisi(id) { net(); const it = get(id); return { id, modifiedTime: `${id}@${it.n}`, headRevisionId: `r${it.n}`, size: String(it.bytes!.byteLength) }; },
  };
  const drive: PdfDrive = {
    async durum(id) { net(); const it = get(id); return { canEdit: true, modifiedTime: `${id}@${it.n}`, headRevisionId: `r${it.n}` }; },
    async listRevisions(id) { return { revisions: [{ id: `r1`, keepForever: get(id).kept === true }] }; },
    async headRevisionId(id) { return `r${get(id).n}`; },
    async keepRevision(id) { get(id).kept = true; },
    async modifiedTime(id) { net(); return `${id}@${get(id).n}`; },
    async uploadMedia(id, bytes) {
      net();
      log.push(`PATCH:${id}`);
      const it = get(id);
      it.bytes = bytes; it.n++;
      return { id, modifiedTime: `${id}@${it.n}`, headRevisionId: `r${it.n}` };
    },
    async uploadResumable(id, bytes) { return this.uploadMedia(id, bytes); },
  };
  const olaylar: string[] = [];
  const ortam: KonuEklemeOrtami = {
    yer: YER,
    deps: { drive, bytes: async id => get(id).bytes! },
    dosyaDrive: olustur,
    olusturDrive: olustur,
    liste: async parent => { net(); log.push(`durum:${parent}`); return children(parent).map(([id, it]) => ({ id, name: it.name, mimeType: it.mimeType, modifiedTime: `${id}@${it.n}` })); },
    sirada: (_id, job) => job(),
    degisti: s => { olaylar.push(`degisti:${s.fileId}`); },
    yeniDosya: x => { olaylar.push(`yeniDosya:${x.id}`); },
    konuDegisti: () => { olaylar.push('konuDegisti'); },
  };
  const yazmalar = () => log.filter(l => l.startsWith('POST') || l.startsWith('PATCH'));
  const ozetler = (parent = 'C') => [...items].filter(([, it]) => it.parent === parent && it.name === 'ozet.pdf').map(([id]) => id);
  return { items, log, ayar, ortam, olaylar, yazmalar, ozetler };
}

async function pdfBilgi(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map(p => (doc.context.lookup(p.node.get(PDFName.of(EK_ID))) as PDFString | undefined)?.decodeText() ?? null);
}

describe('konuyaFotografEkle', () => {
  it('no summary: one POST, ozet.pdf in the topic folder, every page marked; the reader lists again', async () => {
    const d = await fakeDrive({ 'orijinal.pdf': 2 });
    const r = await konuyaFotografEkle('C', [dik, yatay], d.ortam, { ...HIZLI, islemId: 'is-1' });
    expect(r).toMatchObject({ tur: 'yeni', ad: 'ozet.pdf', eskiSayfa: 0, yeniSayfa: 2, zatenVardi: false });
    expect(d.yazmalar()).toEqual(['POST:ozet.pdf']);
    expect(d.ozetler()).toEqual([r.fileId]);
    expect(await pdfBilgi(d.items.get(r.fileId)!.bytes!)).toEqual(['is-1', 'is-1']);
    expect(d.olaylar).toEqual([`yeniDosya:${r.fileId}`, 'konuDegisti']);
  });

  it('a summary: added at its end (5.6), no POST', async () => {
    const d = await fakeDrive({ 'orijinal.pdf': 2, 'OZET.pdf': 3 });
    const r = await konuyaFotografEkle('C', [dik, yatay], d.ortam, { ...HIZLI, islemId: 'is-2' });
    expect(r).toMatchObject({ tur: 'eklendi', fileId: 'OZET.pdf', eskiSayfa: 3, yeniSayfa: 5, zatenVardi: false });
    expect(d.yazmalar()).toEqual(['PATCH:OZET.pdf']);
    expect(await pdfBilgi(d.items.get('OZET.pdf')!.bytes!)).toEqual([null, null, null, 'is-2', 'is-2']);
    expect(d.olaylar).toEqual(['degisti:OZET.pdf']);
  });

  it('brifing + sorular and no target: OzetSecilmeli, nothing written; with a target: added to it', async () => {
    const d = await fakeDrive({ 'brifing.pdf': 1, 'sorular.pdf': 1 });
    const e = await konuyaFotografEkle('C', [dik], d.ortam, HIZLI).catch(x => x);
    expect(e).toBeInstanceOf(OzetSecilmeli);
    expect(e.message).toBe('Bu konuda birden çok özet dosyası var (brifing.pdf, sorular.pdf). Hangisine ekleneceğini seç.');
    expect(d.yazmalar()).toEqual([]);
    const r = await konuyaFotografEkle('C', [dik], d.ortam, { ...HIZLI, hedefFileId: 'sorular.pdf' });
    expect(r).toMatchObject({ tur: 'eklendi', fileId: 'sorular.pdf', yeniSayfa: 2 });
    // a target that is not this topic's summary (another topic's file, the original): nothing written
    for (const hedefFileId of ['baska', 'orijinal.pdf']) {
      await expect(konuyaFotografEkle('C', [dik], d.ortam, { ...HIZLI, hedefFileId })).rejects.toThrow(HedefOzetDegil);
    }
    expect(d.yazmalar()).toEqual(['PATCH:sorular.pdf']);
  });

  it('ozet.pdf appears meanwhile (another device): AyniIsimVar → its end, one ozet.pdf', async () => {
    const d = await fakeDrive();
    d.items.set('geldi', { name: 'ozet.pdf', parent: 'C', mimeType: 'application/pdf', n: 1, bytes: await fotograflardanPdf([yatay]) });
    // the topic listing doesn't show it yet, createPdf's same-name check does
    const ilk = d.ortam.liste!;
    d.ortam.liste = async p => (await ilk(p)).filter(x => x.id !== 'geldi');
    const r = await konuyaFotografEkle('C', [dik, yatay], d.ortam, { ...HIZLI, islemId: 'is-3' });
    expect(r).toMatchObject({ tur: 'eklendi', fileId: 'geldi', eskiSayfa: 1, yeniSayfa: 3, zatenVardi: false });
    expect(d.yazmalar()).toEqual(['PATCH:geldi']);
    expect(d.ozetler()).toEqual(['geldi']);
    expect(await pdfBilgi(d.items.get('geldi')!.bytes!)).toEqual([null, 'is-3', 'is-3']);
  });

  it('created but the answer lost, then tried again with the same islemId: one file, no double pages', async () => {
    const d = await fakeDrive();
    d.ayar.kayip = 1;   // the file arrives, then the connection is gone (every retry fails too)
    await expect(konuyaFotografEkle('C', [dik, yatay], d.ortam, { ...HIZLI, islemId: 'ayni' })).rejects.toThrow(DosyaOlusturAgHatasi);
    expect(d.ozetler()).toHaveLength(1);
    d.ayar.agYok = false;
    // a) the listing shows it: the summary path, pages already there
    const a = await konuyaFotografEkle('C', [dik, yatay], d.ortam, { ...HIZLI, islemId: 'ayni' });
    expect(a).toMatchObject({ tur: 'eklendi', yeniSayfa: 2, zatenVardi: true });
    // b) the topic listing is late: createPdf → AyniIsimVar → the summary path, pages already there
    const id = d.ozetler()[0];
    const ilk = d.ortam.liste!;
    d.ortam.liste = async p => (await ilk(p)).filter(x => x.id !== id);
    const b = await konuyaFotografEkle('C', [dik, yatay], d.ortam, { ...HIZLI, islemId: 'ayni' });
    expect(b).toMatchObject({ tur: 'eklendi', fileId: id, yeniSayfa: 2, zatenVardi: true });
    expect(d.ozetler()).toEqual([id]);
    expect(await pdfBilgi(d.items.get(id)!.bytes!)).toEqual(['ayni', 'ayni']);
    expect(d.yazmalar()).toEqual(['POST:ozet.pdf']);   // nothing written after the first try
  });

  it('Drive library not open / sample: no request at all (not even a listing)', async () => {
    const d = await fakeDrive();
    await expect(konuyaFotografEkle('C', [dik], { ...d.ortam, yer: null }, HIZLI)).rejects.toThrow(SayfaYazmaYok);
    await expect(konuyaFotografEkle('ornek:kitap#Konu-01', [dik], d.ortam, HIZLI)).rejects.toThrow(PdfSampleNoWrite);
    expect(d.log).toEqual([]);
    expect(d.olaylar).toEqual([]);
  });
});
