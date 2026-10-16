import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { FOLDER_MIME, type DriveFile } from '../drive/drive';
import type { DriveLocation } from '../drive/driveLibrary';
import { AyniIsimVar, DosyaOlusturAgHatasi, DosyaYazmaYok, IdZatenVar, PdfDegil, type KlasorBilgisi, type PdfOlusturDrive, type YeniPdfMeta } from '../drive/pdfOlustur';
import { PdfSampleNoWrite, RESUMABLE_LIMIT } from '../drive/pdfYazici';
import {
  AdCozumGibi, AdGecersiz, dosyaAdiHazirla, EklemeSuruyor, HedefBulunamadi, KlasorYok, konuyaDosyaEkle, OzetZatenVar, PdfHazirlanamadi,
  type DosyaEklemeOrtami, type DosyaHedefi
} from './konuyaDosyaEkle';

// Task 5.10c: a ready PDF into one topic. A fake Drive in memory:
//   R "Kitaplık" → K "kitaplar" → B (book) → C (topic) → UE "Uebungen", OE "Oedevler";  C2: a topic without subfolders

let pdf: Uint8Array, sifreli: Uint8Array, imzali: Uint8Array;
beforeAll(async () => {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]); doc.addPage([400, 300]);
  pdf = await doc.save();
  const enc = await PDFDocument.load(pdf);
  enc.context.trailerInfo.Encrypt = enc.context.register(enc.context.obj({ Filter: 'Standard', V: 2, R: 3, Length: 128, P: -4 }));
  sifreli = await enc.save({ useObjectStreams: false });
  const sig = await PDFDocument.load(pdf);
  sig.catalog.set(PDFName.of('AcroForm'), sig.context.register(sig.context.obj({ Fields: [sig.context.register(sig.context.obj({ FT: 'Sig', T: PDFString.of('Imza') }))] })));
  imzali = await sig.save();
});

const onEk = (bytes: Uint8Array) => {
  const on = new TextEncoder().encode('Content-Type: application/pdf\r\n\r\n');
  const out = new Uint8Array(on.length + bytes.length);
  out.set(on); out.set(bytes, on.length);
  return out;
};
const bas = (b: Uint8Array) => String.fromCharCode(...b.subarray(0, 5));

interface Item { name: string; parent: string; mimeType: string; bytes?: Uint8Array; appProperties?: Record<string, string> }

const YER: DriveLocation = { rootId: 'R', libraryFileId: null, bookFolderIds: new Map([['mat-1', 'B']]), bookFileIds: new Map() };
const HIZLI = { bekleMs: 0 };

function fakeDrive(konu: Record<string, string> = {}) {
  const items = new Map<string, Item>([
    ['K', { name: 'kitaplar', parent: 'R', mimeType: FOLDER_MIME }],
    ['B', { name: 'mat-1', parent: 'K', mimeType: FOLDER_MIME }],
    ['C', { name: 'Konu-01', parent: 'B', mimeType: FOLDER_MIME }],
    ['UE', { name: 'Uebungen', parent: 'C', mimeType: FOLDER_MIME }],
    ['OE', { name: 'oedevler', parent: 'C', mimeType: FOLDER_MIME }],
    ['C2', { name: 'Konu-02', parent: 'B', mimeType: FOLDER_MIME }],
  ]);
  // konu: "parent/name" → id (files already there)
  for (const [yol, id] of Object.entries(konu)) {
    const [parent, name] = yol.split('/');
    items.set(id, { name, parent, mimeType: 'application/pdf', bytes: pdf });
  }
  const log: string[] = [];
  const ayar = { kayip: 0, agYok: false, bekle: null as Promise<void> | null };   // bekle: uploads wait for it
  const net = () => { if (ayar.agYok) throw new TypeError('Failed to fetch'); };
  const get = (id: string) => { const it = items.get(id); if (!it) throw new Error('404 ' + id); return it; };
  const children = (parent: string) => [...items].filter(([, it]) => it.parent === parent);
  let nextId = 0;

  const yukle = async (tur: string, meta: YeniPdfMeta, bytes: Uint8Array) => {
    net();
    log.push(`${tur}:${meta.parents[0]}/${meta.name}`);
    if (ayar.bekle) await ayar.bekle;
    if (items.has(meta.id)) throw new IdZatenVar();
    items.set(meta.id, { name: meta.name, parent: meta.parents[0], mimeType: meta.mimeType, bytes, appProperties: meta.appProperties });
    if (ayar.kayip > 0) { ayar.kayip--; ayar.agYok = true; throw new TypeError('Failed to fetch'); }
    return { id: meta.id, modifiedTime: `${meta.id}@1`, headRevisionId: 'r1' };
  };
  const olustur: PdfOlusturDrive = {
    async klasorBilgisi(id): Promise<KlasorBilgisi> {
      net();
      const it = get(id);
      return { id, name: it.name, mimeType: it.mimeType, trashed: false, parents: [it.parent], canAddChildren: true };
    },
    async cocuklar(parent) { net(); return children(parent).map(([id, it]) => ({ id, name: it.name })); },
    async yeniId() { net(); return `yeni${++nextId}`; },
    yukleMultipart: (meta, bytes) => yukle('multipart', meta, bytes),
    yukleResumable: (meta, bytes) => yukle('resumable', meta, bytes),
    async dosyaBilgisi(id) {
      net();
      const it = get(id);
      return { id, modifiedTime: `${id}@1`, headRevisionId: 'r1', size: String(it.bytes!.byteLength), appProperties: it.appProperties };
    },
  };
  const olaylar: string[] = [];
  const ortam: DosyaEklemeOrtami = {
    yer: YER,
    olusturDrive: olustur,
    liste: async parent => {
      net();
      log.push(`liste:${parent}`);
      return children(parent).map(([id, it]) => ({ id, name: it.name, mimeType: it.mimeType, modifiedTime: 't' }));
    },
    yeniDosya: x => { olaylar.push(`yeniDosya:${x.id}`); },
    konuDegisti: () => { olaylar.push('konuDegisti'); },
  };
  const yazmalar = () => log.filter(l => l.startsWith('multipart') || l.startsWith('resumable'));
  const file = (id: string): DriveFile => ({ id, name: get(id).name, mimeType: 'application/pdf', modifiedTime: 't' });
  return { items, log, ayar, ortam, olaylar, yazmalar, file };
}

const ekle = (d: ReturnType<typeof fakeDrive>, hedef: DosyaHedefi, ad = 'Blatt 1.pdf', extra: { konu?: string; bytes?: Uint8Array; islemId?: string } = {}) =>
  konuyaDosyaEkle({ konu: extra.konu ?? 'C', hedef, ad, bytes: extra.bytes ?? pdf, islemId: extra.islemId ?? 'is-1' }, d.ortam, HIZLI);

describe('dosyaAdiHazirla', () => {
  it('adds .pdf when missing (any case), trims, removes / \\ and control characters', () => {
    expect(dosyaAdiHazirla('Blatt 1')).toBe('Blatt 1.pdf');
    expect(dosyaAdiHazirla('Blatt 1.PDF')).toBe('Blatt 1.PDF');
    expect(dosyaAdiHazirla('  notlar.pdf  ')).toBe('notlar.pdf');
    expect(dosyaAdiHazirla('a/b\\c.pdf')).toBe('abc.pdf');
    expect(dosyaAdiHazirla('sat\u0000ır\n1\t.pdf')).toBe('satır1.pdf');
    expect(dosyaAdiHazirla('Übung.docx')).toBe('Übung.docx.pdf');
  });

  it('nothing left → AdGecersiz', () => {
    for (const ad of ['', '   ', '.pdf', ' .PDF ', '//', '\u0001\u0002']) expect(() => dosyaAdiHazirla(ad)).toThrow(AdGecersiz);
  });
});

describe('konuyaDosyaEkle: where it goes', () => {
  it('orijinal / ozet: fixed names in the topic folder, the chosen name is not used', async () => {
    const d = fakeDrive();
    const a = await ekle(d, 'orijinal', 'Vorlesung 3.pdf');
    const b = await ekle(d, 'ozet', 'Zusammenfassung.pdf');
    expect([a.kind, a.ad, b.kind, b.ad]).toEqual(['yeni', 'orijinal.pdf', 'yeni', 'ozet.pdf']);
    expect(d.yazmalar()).toEqual(['multipart:C/orijinal.pdf', 'multipart:C/ozet.pdf']);
    expect(d.items.get(a.fileId)!.appProperties).toEqual({ defter: '1', defterIslem: 'is-1' });
    expect(d.olaylar).toEqual([`yeniDosya:${a.fileId}`, 'konuDegisti', `yeniDosya:${b.fileId}`, 'konuDegisti']);
  });

  it('uebungen / oedevler: into those folders (any case), the name prepared', async () => {
    const d = fakeDrive();
    const a = await ekle(d, 'uebungen', ' Blatt 1 ');
    const b = await ekle(d, 'oedevler', 'Hausaufgabe.PDF');
    expect([a.ad, b.ad]).toEqual(['Blatt 1.pdf', 'Hausaufgabe.PDF']);
    expect(d.yazmalar()).toEqual(['multipart:UE/Blatt 1.pdf', 'multipart:OE/Hausaufgabe.PDF']);
  });

  it('a solution: <X>_cozum.pdf next to X (topic folder or Uebungen)', async () => {
    const d = fakeDrive({ 'C/orijinal.pdf': 'o', 'UE/Blatt-01.PDF': 'b1', 'C2/baska.pdf': 'x' });
    const a = await ekle(d, { cozumOf: d.file('o') }, 'ne olursa.pdf');
    const b = await ekle(d, { cozumOf: d.file('b1') });
    expect([a.ad, b.ad]).toEqual(['orijinal_cozum.pdf', 'Blatt-01_cozum.pdf']);
    expect(d.yazmalar()).toEqual(['multipart:C/orijinal_cozum.pdf', 'multipart:UE/Blatt-01_cozum.pdf']);
    // X of another topic, or X a solution itself: nothing written
    await expect(ekle(d, { cozumOf: d.file('x') })).rejects.toThrow(HedefBulunamadi);
    await expect(ekle(d, { cozumOf: d.file(b.fileId) })).rejects.toThrow(HedefBulunamadi);
    expect(d.yazmalar()).toHaveLength(2);
  });

  it('the same name (any case) → AyniIsimVar, nothing written over', async () => {
    const d = fakeDrive({ 'C/ORIJINAL.PDF': 'o', 'UE/Blatt1.PDF': 'b1', 'C/Orijinal_Cozum.pdf': 'oc' });
    for (const [hedef, ad] of [['orijinal', ''], ['uebungen', 'blatt1.pdf']] as const) {
      const e = await ekle(d, hedef, ad).catch(x => x);
      expect(e).toBeInstanceOf(AyniIsimVar);
    }
    await expect(ekle(d, { cozumOf: d.file('o') })).rejects.toThrow(AyniIsimVar);
    expect(d.yazmalar()).toEqual([]);
    expect(d.items.get('o')!.bytes).toBe(pdf);
  });

  it('no Uebungen / Oedevler folder → KlasorYok, no folder created, nothing written', async () => {
    const d = fakeDrive();
    for (const hedef of ['uebungen', 'oedevler'] as const) {
      const e = await ekle(d, hedef, 'a.pdf', { konu: 'C2' }).catch(x => x);
      expect(e).toBeInstanceOf(KlasorYok);
      expect(e.message).toBe(`Bu konuda ${hedef === 'uebungen' ? 'Uebungen' : 'Oedevler'} klasörü yok, dosya eklenmedi. Klasörü Drive'da konunun içinde oluşturup tekrar dene.`);
    }
    expect(d.yazmalar()).toEqual([]);
    expect(d.items.size).toBe(6);
  });

  it('ozet with any summary there: brifing / sorular → OzetZatenVar; ozet.pdf → AyniIsimVar', async () => {
    const durumlar: Record<string, string>[] = [{ 'C/brifing.pdf': 'b', 'C/sorular.pdf': 's' }, { 'C/Brifing.PDF': 'b' }, { 'C/sorular.pdf': 's' }];
    for (const files of durumlar) {
      const d = fakeDrive(files);
      await expect(ekle(d, 'ozet')).rejects.toThrow(OzetZatenVar);
      expect(d.yazmalar()).toEqual([]);
    }
    const d = fakeDrive({ 'C/brifing.pdf': 'b', 'C/sorular.pdf': 's' });
    expect((await ekle(d, 'ozet').catch(x => x)).message)
      .toBe('Bu konunun zaten bir özeti var (brifing.pdf, sorular.pdf); yeni ozet.pdf eklenmedi. Özete sayfa eklemek için fotoğraf eklemeyi kullan.');
    await expect(ekle(fakeDrive({ 'C/OZET.pdf': 'z', 'C/brifing.pdf': 'b' }), 'ozet')).rejects.toThrow(AyniIsimVar);
  });

  it('a name ending with _cozum in Übungen / Ödevler → AdCozumGibi, no request', async () => {
    const d = fakeDrive();
    await expect(ekle(d, 'uebungen', 'Blatt1_cozum')).rejects.toThrow(AdCozumGibi);
    await expect(ekle(d, 'oedevler', 'x_COZUM.PDF')).rejects.toThrow(AdCozumGibi);
    await expect(ekle(d, 'uebungen', '  ')).rejects.toThrow(AdGecersiz);
    expect(d.log).toEqual([]);
  });
});

describe('konuyaDosyaEkle: the bytes', () => {
  it('a normal PDF goes as it is', async () => {
    const d = fakeDrive();
    const r = await ekle(d, 'orijinal');
    expect(r.bytes).toBe(pdf);
    expect(r.uyari).toBeUndefined();
    expect(d.items.get(r.fileId)!.bytes).toBe(pdf);
  });

  it('bytes before %PDF-: saved again with pdf-lib, starts with %PDF-, same pages', async () => {
    const d = fakeDrive();
    const r = await ekle(d, 'uebungen', 'mail.pdf', { bytes: onEk(pdf) });
    const yazilan = d.items.get(r.fileId)!.bytes!;
    expect(bas(yazilan)).toBe('%PDF-');
    expect(yazilan).toBe(r.bytes);
    expect((await PDFDocument.load(yazilan)).getPageCount()).toBe(2);
  });

  it('bytes before %PDF- and encrypted → PdfHazirlanamadi, no request', async () => {
    const d = fakeDrive();
    await expect(ekle(d, 'uebungen', 'a.pdf', { bytes: onEk(sifreli) })).rejects.toThrow(PdfHazirlanamadi);
    expect(d.log).toEqual([]);
  });

  it('encrypted / signed PDF: added unchanged, uyari kalemYazamaz', async () => {
    const d = fakeDrive();
    for (const [ad, bytes] of [['sifreli.pdf', sifreli], ['imzali.pdf', imzali]] as const) {
      const r = await ekle(d, 'uebungen', ad, { bytes });
      expect(r.uyari).toBe('kalemYazamaz');
      expect(d.items.get(r.fileId)!.bytes).toBe(bytes);
    }
    expect(d.yazmalar()).toEqual(['multipart:UE/sifreli.pdf', 'multipart:UE/imzali.pdf']);
  });

  it('not a PDF (an image, text, a .pdf that isn\'t one) → PdfDegil, no request', async () => {
    const d = fakeDrive();
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
    for (const [ad, bytes] of [['foto.jpg', jpeg], ['bozuk.pdf', new TextEncoder().encode('merhaba')]] as const) {
      await expect(ekle(d, 'uebungen', ad, { bytes })).rejects.toThrow(PdfDegil);
    }
    expect(d.log).toEqual([]);
  });

  it('bigger than 5 MB → the resumable upload', async () => {
    const doc = await PDFDocument.create();
    doc.addPage().drawText('x'.repeat(10));
    let x = 12345;   // noise that doesn't compress
    const dolgu = new Uint8Array(RESUMABLE_LIMIT + 1000).map(() => (x = (Math.imul(x, 1103515245) + 12345) >>> 0) >>> 24);
    doc.attach(dolgu, 'dolgu.bin', { mimeType: 'application/octet-stream' });
    const buyuk = await doc.save();
    expect(buyuk.byteLength).toBeGreaterThan(RESUMABLE_LIMIT);
    const d = fakeDrive();
    await ekle(d, 'uebungen', 'buyuk.pdf', { bytes: buyuk });
    expect(d.yazmalar()).toEqual(['resumable:UE/buyuk.pdf']);
  });
});

describe('konuyaDosyaEkle: safety', () => {
  it('Drive library not open (writer() null) / sample: no request at all', async () => {
    const d = fakeDrive();
    await expect(konuyaDosyaEkle({ konu: 'C', hedef: 'orijinal', ad: '', bytes: pdf, islemId: 'a' }, { ...d.ortam, yer: null }, HIZLI)).rejects.toThrow(DosyaYazmaYok);
    await expect(ekle(d, 'orijinal', '', { konu: 'ornek:kitap#Konu-01' })).rejects.toThrow(PdfSampleNoWrite);
    expect(d.log).toEqual([]);
    expect(d.olaylar).toEqual([]);
  });

  it('created but the answer lost, tried again with the same islemId: zatenVardi, one file', async () => {
    const d = fakeDrive();
    d.ayar.kayip = 1;   // the file arrives, then the connection is gone (every retry fails too)
    await expect(ekle(d, 'uebungen', 'Blatt 2.pdf', { islemId: 'ayni' })).rejects.toThrow(DosyaOlusturAgHatasi);
    d.ayar.agYok = false;
    const r = await ekle(d, 'uebungen', 'Blatt 2.pdf', { islemId: 'ayni' });
    expect(r).toMatchObject({ kind: 'zatenVardi', fileId: 'yeni1', ad: 'Blatt 2.pdf' });
    expect(d.yazmalar()).toEqual(['multipart:UE/Blatt 2.pdf']);
    // another islemId (another adding): the usual same-name error
    await expect(ekle(d, 'uebungen', 'Blatt 2.pdf', { islemId: 'baska' })).rejects.toThrow(AyniIsimVar);
    expect(children(d, 'UE')).toEqual(['Blatt 2.pdf']);
  });
});

describe('konuyaDosyaEkle: two addings at the same time (5.10c-ek)', () => {
  // the upload waits until ac() is called
  const tut = (d: ReturnType<typeof fakeDrive>) => {
    let ac!: () => void;
    d.ayar.bekle = new Promise(r => { ac = () => { d.ayar.bekle = null; r(); }; });
    return () => ac();
  };
  const istekler = (d: ReturnType<typeof fakeDrive>) => d.log.length;

  it('the same target while the first uploads → EklemeSuruyor, no request, one upload; afterwards AyniIsimVar', async () => {
    const d = fakeDrive();
    const ac = tut(d);
    const ilk = ekle(d, 'uebungen', 'Robotics-test.pdf', { islemId: 'a' });
    await vi.waitFor(() => expect(d.yazmalar()).toHaveLength(1));
    const once = istekler(d);
    await expect(ekle(d, 'uebungen', 'robotics-TEST', { islemId: 'b' })).rejects.toThrow(EklemeSuruyor);
    expect(istekler(d)).toBe(once);   // the second call sent nothing
    ac();
    expect((await ilk).kind).toBe('yeni');
    await expect(ekle(d, 'uebungen', 'Robotics-test.pdf', { islemId: 'c' })).rejects.toThrow(AyniIsimVar);
    expect(d.yazmalar()).toEqual(['multipart:UE/Robotics-test.pdf']);
    expect(children(d, 'UE')).toEqual(['Robotics-test.pdf']);
  });

  it('orijinal, ozet and a solution are locked too', async () => {
    const d = fakeDrive({ 'UE/Blatt-01.pdf': 'b1' });
    const ac = tut(d);
    const bekleyenler = [ekle(d, 'orijinal'), ekle(d, 'ozet'), ekle(d, { cozumOf: d.file('b1') })];
    await vi.waitFor(() => expect(d.yazmalar()).toHaveLength(3));
    await expect(ekle(d, 'orijinal', 'baska ad.pdf')).rejects.toThrow(EklemeSuruyor);
    await expect(ekle(d, 'ozet')).rejects.toThrow(EklemeSuruyor);
    await expect(ekle(d, { cozumOf: d.file('b1') })).rejects.toThrow(EklemeSuruyor);
    ac();
    await Promise.all(bekleyenler);
    expect(d.yazmalar()).toHaveLength(3);
  });

  it('another name, another folder or another topic: not blocked', async () => {
    const d = fakeDrive();
    const ac = tut(d);
    const hepsi = [
      ekle(d, 'uebungen', 'a.pdf'), ekle(d, 'uebungen', 'b.pdf'), ekle(d, 'oedevler', 'a.pdf'),
      ekle(d, 'orijinal'), ekle(d, 'orijinal', '', { konu: 'C2' }),
    ];
    await vi.waitFor(() => expect(d.yazmalar()).toHaveLength(5));
    ac();
    expect((await Promise.all(hepsi)).map(r => r.kind)).toEqual(['yeni', 'yeni', 'yeni', 'yeni', 'yeni']);
  });

  it('the first call fails: the lock is let go', async () => {
    const d = fakeDrive();
    d.ayar.agYok = true;
    await expect(ekle(d, 'uebungen', 'x.pdf')).rejects.toThrow();
    d.ayar.agYok = false;
    await expect(ekle(d, 'uebungen', 'x.pdf')).resolves.toMatchObject({ kind: 'yeni' });
    // an error before any request (not a PDF) lets it go as well
    await expect(ekle(d, 'uebungen', 'y.pdf', { bytes: new Uint8Array([1, 2, 3]) })).rejects.toThrow(PdfDegil);
    await expect(ekle(d, 'uebungen', 'y.pdf')).resolves.toMatchObject({ kind: 'yeni' });
  });
});

const children = (d: ReturnType<typeof fakeDrive>, parent: string) => [...d.items.values()].filter(it => it.parent === parent).map(it => it.name);
