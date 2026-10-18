import sharp from 'sharp';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { driveFetch, FOLDER_MIME } from '../drive/drive';
import type { DriveLocation } from '../drive/driveLibrary';
import { drivePdfOlusturApi, yerBelleginiSifirla } from '../drive/pdfOlustur';
import { yedekBelleginiSifirla, type PdfDrive } from '../drive/pdfYazici';
import type { BekleyenFoto } from './bekleyenFotoKayit';
import { FotoEkleyici } from './fotoEkleme';
import type { KonuEklemeOrtami } from './konuyaEkle';
import { fotograflardanPdf, type Jpeg } from './sayfaEkle';
import { olcumAl, olcumBitir } from './sureOlcum';

// Task 6.2e-2: two addings to the same topic the way the reader does it (FotoEkleyici → konuyaFotografEkle →
// ozeteSayfaEkle), with the real drivePdfOlusturApi (Drive answers faked at driveFetch) and ?olcum=1 on.
// The second adding must not walk the place chain again.

vi.mock('../drive/drive', async importOriginal => ({
  ...await importOriginal<typeof import('../drive/drive')>(),
  driveFetch: vi.fn()
}));

const fetchMock = vi.mocked(driveFetch);
let jpeg: Jpeg & { width: number; height: number };

beforeAll(async () => {
  jpeg = { width: 60, height: 80, bytes: new Uint8Array(await sharp({ create: { width: 60, height: 80, channels: 3, background: '#d8c9a3' } }).jpeg().toBuffer()) };
});
beforeEach(() => { fetchMock.mockReset(); yedekBelleginiSifirla(); yerBelleginiSifirla(); vi.stubGlobal('location', { search: '?olcum=1' }); });
afterEach(() => { vi.unstubAllGlobals(); });

// Drive: R "Kitaplık" → K "kitaplar" → B (book) → U (unit) → C (topic) → P ozet.pdf
async function kur() {
  const items = new Map<string, { name: string; parent: string; mimeType: string; bytes?: Uint8Array; n: number }>([
    ['K', { name: 'kitaplar', parent: 'R', mimeType: FOLDER_MIME, n: 1 }],
    ['B', { name: 'mat-1', parent: 'K', mimeType: FOLDER_MIME, n: 1 }],
    ['U', { name: 'Unite-01', parent: 'B', mimeType: FOLDER_MIME, n: 1 }],
    ['C', { name: 'Konu-01', parent: 'U', mimeType: FOLDER_MIME, n: 1 }],
    ['P', { name: 'ozet.pdf', parent: 'C', mimeType: 'application/pdf', n: 1, bytes: await fotograflardanPdf([jpeg]) }],
  ]);
  const get = (id: string) => items.get(id)!;
  // the one request drivePdfOlusturApi.klasorBilgisi makes, answered like Drive
  fetchMock.mockImplementation(async url => {
    const u = String(url);
    const id = decodeURIComponent(u.slice('files/'.length, u.indexOf('?')));
    const it = items.get(id);
    if (!u.startsWith('files/') || !u.includes('canAddChildren') || !it) throw new Error(`unexpected request ${u}`);
    return new Response(JSON.stringify({ id, name: it.name, mimeType: it.mimeType, trashed: false, parents: [it.parent], capabilities: { canAddChildren: true } }));
  });
  const drive: PdfDrive = {
    async durum(id) { return { canEdit: true, modifiedTime: `m${get(id).n}`, headRevisionId: `r${get(id).n}` }; },
    async listRevisions() { return { revisions: [{ id: 'r1', keepForever: true }] }; },
    async headRevisionId(id) { return `r${get(id).n}`; },
    async keepRevision() {},
    async modifiedTime(id) { return `m${get(id).n}`; },
    async uploadMedia(id, b) { const it = get(id); it.bytes = b; it.n++; return { id, modifiedTime: `m${it.n}`, headRevisionId: `r${it.n}` }; },
    async uploadResumable(id, b) { return this.uploadMedia(id, b); },
  };
  const yer: DriveLocation = { rootId: 'R', libraryFileId: null, bookFolderIds: new Map([['mat-1', 'B']]), bookFileIds: new Map() };
  // as Okuyucu's photoAdder: a new ortam (and a new DriveLocation object) for every adding
  const ortam = (): KonuEklemeOrtami => ({
    yer: { ...yer, bookFolderIds: new Map(yer.bookFolderIds) },
    deps: { drive, bytes: async id => get(id).bytes! },
    dosyaDrive: drivePdfOlusturApi, olusturDrive: drivePdfOlusturApi,
    liste: async p => [...items].filter(([, it]) => it.parent === p).map(([id, it]) => ({ id, name: it.name, mimeType: it.mimeType, modifiedTime: `m${it.n}` })),
    sirada: (_id, job) => job(),
  });
  const kayitlar = new Map<string, BekleyenFoto>();
  const hatalar: string[] = [];
  const ekleyici = new FotoEkleyici({
    depo: {
      async kaydet(k) { kayitlar.set(k.islemId, k); },
      async durumGuncelle(id, g) { const k = kayitlar.get(id); if (!k) return null; const y = g(k); kayitlar.set(id, y); return y; },
      async sil(id) { kayitlar.delete(id); },
    },
    ortam,
    ui: { durum() {}, basari() {}, hata(_k, m) { hatalar.push(m); } },
  });
  return { items, ekleyici, hatalar };
}

const girdi = { kitapAdi: 'mat-1', konuKlasorId: 'C', konuBaslik: 'Konu-01', hedefFileId: 'P', hedefAd: 'ozet.pdf' };

// one adding as the reader does it; its measured steps and the klasorBilgisi requests
async function ekle(e: FotoEkleyici) {
  fetchMock.mockClear();
  const k = await e.baslat({ ...girdi, jpegler: [jpeg] });
  await e.bekle();
  const o = olcumAl(k.islemId)!;
  olcumBitir(k.islemId, { log() {}, table() {} });
  return {
    istek: fetchMock.mock.calls.map(([u]) => /files\/([^?]+)/.exec(String(u))![1]),
    olculen: o.adimlar.filter(a => a.ad === 'drive klasorBilgisi').length,
    bilgi: o.bilgi,
  };
}

describe('the same topic twice in one session (reader path, ?olcum=1)', () => {
  it('the first walks the place chain; the second only reads the file', async () => {
    const { ekleyici, items, hatalar } = await kur();
    const a = await ekle(ekleyici);
    expect(a.istek).toEqual(['P', 'C', 'U', 'B', 'K']);
    expect(a.olculen).toBe(5);
    expect(a.bilgi.yerBellegi).toBe('bos (0 klasör)');
    const b = await ekle(ekleyici);
    expect(b.istek).toEqual(['P']);
    expect(b.olculen).toBe(1);
    expect(b.bilgi.yerBellegi).toBe('var (3 klasör)');
    expect(hatalar).toEqual([]);
    expect(items.get('P')!.n).toBe(3);   // both addings uploaded
  });

  it('after a reload (empty memory) the chain is walked again; ?olcum=1 says why', async () => {
    const { ekleyici, hatalar } = await kur();
    await ekle(ekleyici);
    yerBelleginiSifirla();   // a reload: the memory is empty again
    const b = await ekle(ekleyici);
    expect(b.istek).toEqual(['P', 'C', 'U', 'B', 'K']);
    expect(b.bilgi.yerBellegi).toBe('bos (0 klasör)');
    expect(hatalar).toEqual([]);
  });
});
