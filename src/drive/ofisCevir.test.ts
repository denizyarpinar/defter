import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dosyaTuru } from '../defter/dosyaTuru';
import { driveFetch, FOLDER_MIME } from './drive';
import type { DriveLocation } from './driveLibrary';
import {
  cevirTuru, copeAtGecici, GOOGLE_DOC, GOOGLE_SLIDES, OfisCevrilemedi, OfisCokBuyuk, OfisDesteklenmiyor, OfisGeciciDegil,
  OfisIptal, OfisKilitli, OfisYuklenemedi, ofisuPdfeCevir, supurGecici, SUPURME_YASI_MS, type OfisGirdi, type OfisSecenek
} from './ofisCevir';
import { DosyaYazmaYok, YerDisi } from './pdfOlustur';
import { RESUMABLE_LIMIT } from './pdfYazici';

vi.mock('./drive', async importOriginal => ({
  ...await importOriginal<typeof import('./drive')>(),
  driveFetch: vi.fn()
}));

const fetchMock = vi.mocked(driveFetch);

// A small fake Drive behind driveFetch: the real ofisCevir code talks to it.
//   R "Kitaplık" → K "kitaplar" → B "mat-1" (book) → C "Konu-01";  R → X "baska"
interface Item { name: string; parent: string; mimeType: string; trashed?: boolean; createdTime?: string; appProperties?: Record<string, string> }
type Yukleme = 'ok' | '400' | '500' | 'ag' | 'kapsam' | 'oturumYok';
type Export = 'ok' | 'buyuk' | '400' | '500' | 'pdfDegil';

const SIMDI = Date.parse('2026-10-17T12:00:00Z');
const once = (ms: number) => new Date(SIMDI - ms).toISOString();
const PDF = new TextEncoder().encode('%PDF-1.7 sahte pdf');

function fakeDrive(opts: { yukleme?: Yukleme; export?: Export; copHata?: boolean; araHata?: boolean; eski?: Record<string, Item>; ab?: AbortController; abortNe?: 'yukleme' | 'export' } = {}) {
  const items = new Map<string, Item>([
    ['K', { name: 'kitaplar', parent: 'R', mimeType: FOLDER_MIME }],
    ['B', { name: 'mat-1', parent: 'K', mimeType: FOLDER_MIME }],
    ['C', { name: 'Konu-01', parent: 'B', mimeType: FOLDER_MIME }],
    ['X', { name: 'baska', parent: 'R', mimeType: FOLDER_MIME }],
    ...Object.entries(opts.eski ?? {})
  ]);
  const yuklenen: { meta: Item & { parents: string[] }; contentType: string; boyut: number }[] = [];
  let sessionMeta: (Item & { parents: string[] }) | null = null;
  let n = 0;
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  const hata = (status: number, reason: string) => json({ error: { code: status, errors: [{ reason }], message: reason } }, status);

  function upload(meta: Item & { parents: string[] }, contentType: string, boyut: number): Response {
    const d = opts.yukleme ?? 'ok';
    if (d === 'ag') throw new TypeError('Failed to fetch');
    if (d === '400') return hata(400, 'badContent');
    if (d === '500') return json({}, 500);
    if (d === 'kapsam') return hata(403, 'ACCESS_TOKEN_SCOPE_INSUFFICIENT');
    const id = 'g' + ++n;
    items.set(id, { name: meta.name, parent: meta.parents[0], mimeType: meta.mimeType, appProperties: meta.appProperties, createdTime: new Date(SIMDI).toISOString() });
    yuklenen.push({ meta, contentType, boyut });
    if (opts.abortNe === 'yukleme') opts.ab!.abort();
    return json({ id });
  }

  fetchMock.mockImplementation(async (url, init) => {
    const u = String(url);
    const m = init?.method ?? 'GET';
    if (m === 'GET' && u.startsWith('files?')) {
      if (opts.araHata) return json({}, 500);
      // a real Drive answers by the query; here every marked, untrashed Google file is returned
      // (also newer ones) so the client-side age check is tested too
      const files = [...items].filter(([, it]) => it.appProperties?.defterGecici === '1' && !it.trashed && (it.mimeType === GOOGLE_DOC || it.mimeType === GOOGLE_SLIDES))
        .map(([id, it]) => ({ id, name: it.name, mimeType: it.mimeType, createdTime: it.createdTime }));
      return json({ files });
    }
    if (m === 'GET' && u.includes('/export?')) {
      if (opts.abortNe === 'export') { opts.ab!.abort(); throw new DOMException('aborted', 'AbortError'); }
      const d = opts.export ?? 'ok';
      if (d === 'buyuk') return hata(403, 'exportSizeLimitExceeded');
      if (d === '400') return hata(400, 'badRequest');
      if (d === '500') return json({}, 500);
      return new Response(d === 'pdfDegil' ? new TextEncoder().encode('<html>') : PDF, { status: 200 });
    }
    if (m === 'GET' && u.startsWith('files/')) {
      const id = decodeURIComponent(u.slice(6, u.indexOf('?')));
      const it = items.get(id);
      if (!it) return json({}, 404);
      return json({ id, name: it.name, mimeType: it.mimeType, trashed: it.trashed === true, parents: it.parent ? [it.parent] : [], appProperties: it.appProperties, capabilities: { canAddChildren: true } });
    }
    if (m === 'PATCH' && u.startsWith('files/')) {
      if (opts.copHata) return json({}, 500);
      const id = decodeURIComponent(u.slice(6, u.indexOf('?')));
      const body = JSON.parse(String(init!.body));
      if (body.trashed === true) items.get(id)!.trashed = true;
      return json({ id });
    }
    if (m === 'POST' && u.includes('uploadType=multipart')) {
      const text = await (init!.body as Blob).text();
      const meta = JSON.parse(/\r\n\r\n(\{.*\})\r\n/.exec(text)![1]);
      const ct = /--\S+\r\nContent-Type: ([^\r]+)\r\n\r\n(?!\{)/.exec(text)![1];
      return upload(meta, ct, text.length);
    }
    if (m === 'POST' && u.includes('uploadType=resumable')) {
      sessionMeta = JSON.parse(String(init!.body));
      const d = opts.yukleme ?? 'ok';
      if (d === '400') return hata(400, 'badContent');
      return json({}, 200, d === 'oturumYok' ? {} : { Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=s1' });
    }
    if (m === 'PUT') {
      const h = init!.headers as Record<string, string>;
      return upload(sessionMeta!, h['Content-Type'], (init!.body as Blob).size);
    }
    throw new Error(`unexpected request ${m} ${u}`);
  });
  return { items, yuklenen };
}

const loc: DriveLocation = { rootId: 'R', libraryFileId: null, bookFolderIds: new Map([['mat-1', 'B']]), bookFileIds: new Map() };
const ACIK: OfisSecenek = { kilitAcik: () => true, simdi: () => SIMDI };
const girdi = (ad = 'odev.docx', o: Partial<OfisGirdi> = {}): OfisGirdi =>
  ({ dosya: new Blob([new Uint8Array(100)]), ad, klasorId: 'C', islemId: 'islem-1', ...o });
const calls = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url}`);
const yazmalar = () => calls().filter(c => !c.startsWith('GET'));
const neverDeletes = () => expect(calls().some(c => c.startsWith('DELETE') || /emptyTrash/.test(c))).toBe(false);
const geciciler = (items: Map<string, Item>) => [...items].filter(([, it]) => it.appProperties?.defterGecici === '1');

beforeEach(() => { fetchMock.mockReset(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { neverDeletes(); vi.restoreAllMocks(); });

describe('cevirTuru', () => {
  it.each([
    ['a.docx', 'document'], ['a.doc', 'document'], ['a.odt', 'document'], ['A.RTF', 'document'],
    ['a.pptx', 'presentation'], ['a.ppt', 'presentation'], ['a.odp', 'presentation'],
    ['a.key', null], ['a.pages', null], ['a.pdf', null], ['a.zip', null], ['a', null]
  ])('%s → %s', (ad, tur) => {
    expect(cevirTuru(ad, '')).toBe(tur);
  });

  it('by MIME when the extension says nothing', () => {
    expect(cevirTuru('dosya', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('document');
    expect(cevirTuru('dosya', 'text/rtf')).toBe('document');
    expect(cevirTuru('dosya', 'application/vnd.ms-powerpoint')).toBe('presentation');
    expect(cevirTuru('dosya', 'application/x-iwork-keynote-sffkey')).toBe(null);
  });

  it('agrees with dosyaTuru(...).cevrilebilir', () => {
    const ZIP = new Uint8Array(64).fill(0x20); ZIP.set([0x50, 0x4b, 0x03, 0x04]);
    const adlar = ['a.docx', 'a.doc', 'a.odt', 'a.rtf', 'a.pptx', 'a.ppt', 'a.odp', 'a.key', 'a.pages'];
    const mimeler = ['application/msword', 'application/vnd.oasis.opendocument.presentation', 'application/vnd.apple.pages', 'application/rtf'];
    for (const [ad, mime] of [...adlar.map(a => [a, '']), ...mimeler.map(m => ['dosya', m])]) {
      const s = dosyaTuru(ad, mime, ZIP);
      expect(s.tur).toBe('ofis');
      expect(s.cevrilebilir).toBe(cevirTuru(ad, mime) !== null);
    }
  });
});

describe('ofisuPdfeCevir: refused before any request', () => {
  it('locked (no ?ofisCevir=1): no Drive call at all', async () => {
    fakeDrive();
    await expect(ofisuPdfeCevir(girdi(), loc, { kilitAcik: () => false })).rejects.toBeInstanceOf(OfisKilitli);
    await expect(ofisuPdfeCevir(girdi(), loc)).rejects.toBeInstanceOf(OfisKilitli);   // default: URL without the key
    await expect(copeAtGecici('g1', { kilitAcik: () => false })).rejects.toBeInstanceOf(OfisKilitli);
    await expect(supurGecici(SIMDI, { kilitAcik: () => false })).rejects.toBeInstanceOf(OfisKilitli);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sample library / no Drive (yer null), sample folder', async () => {
    fakeDrive();
    await expect(ofisuPdfeCevir(girdi(), null, ACIK)).rejects.toBeInstanceOf(DosyaYazmaYok);
    await expect(ofisuPdfeCevir(girdi('a.docx', { klasorId: 'ornek:demo' }), loc, ACIK)).rejects.toBeInstanceOf(DosyaYazmaYok);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['sunum.key', 'not.pages', 'ders.pdf', 'resim.png'])('%s → OfisDesteklenmiyor', async ad => {
    fakeDrive();
    await expect(ofisuPdfeCevir(girdi(ad), loc, ACIK)).rejects.toBeInstanceOf(OfisDesteklenmiyor);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborted before the start → OfisIptal, no request', async () => {
    fakeDrive();
    const ab = new AbortController(); ab.abort();
    await expect(ofisuPdfeCevir(girdi('a.docx', { signal: ab.signal }), loc, ACIK)).rejects.toBeInstanceOf(OfisIptal);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['X', 'K', 'R', 'B2'])('folder %s outside kitaplar/<kitap>/ → YerDisi, only reads', async k => {
    fakeDrive();
    await expect(ofisuPdfeCevir(girdi('a.docx', { klasorId: k }), loc, ACIK)).rejects.toThrow(k === 'B2' ? Error : YerDisi);
    expect(yazmalar()).toEqual([]);
  });
});

describe('ofisuPdfeCevir: upload, export, trash', () => {
  it('small file → multipart: metadata, content type, export, temporary file trashed', async () => {
    const { items, yuklenen } = fakeDrive();
    const r = await ofisuPdfeCevir(girdi('Ödev 3.docx'), loc, ACIK);
    expect(r.bytes).toEqual(PDF);
    expect(r.copeAtildi).toBe(true);
    expect(r.geciciId).toBe('g1');
    expect(r.sureMs).toBeGreaterThanOrEqual(0);
    expect(yuklenen).toHaveLength(1);
    expect(yuklenen[0].meta).toEqual({
      name: '~çeviri – Ödev 3.docx', parents: ['C'], mimeType: GOOGLE_DOC,
      appProperties: { defter: '1', defterGecici: '1', defterIslem: 'islem-1' }
    });
    expect(yuklenen[0].contentType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(calls().some(c => c.startsWith('POST') && c.includes('uploadType=multipart'))).toBe(true);
    expect(calls()).toContain('GET files/g1/export?mimeType=application%2Fpdf');
    expect(calls()).toContain('PATCH files/g1?fields=id');
    expect(items.get('g1')!.trashed).toBe(true);
    // order: sweep → upload → export → read before trashing → trash
    const i = (s: string) => calls().findIndex(c => c.includes(s));
    expect(i('GET files?')).toBeLessThan(i('uploadType'));
    expect(i('uploadType')).toBeLessThan(i('/export'));
    expect(i('/export')).toBeLessThan(i('PATCH'));
  });

  it('presentation types; .odp / .ppt / .rtf without a browser type get their own type', async () => {
    const { yuklenen } = fakeDrive();
    await ofisuPdfeCevir(girdi('sunum.odp'), loc, ACIK);
    await ofisuPdfeCevir(girdi('eski.ppt'), loc, ACIK);
    await ofisuPdfeCevir(girdi('not.rtf'), loc, ACIK);
    expect(yuklenen.map(y => [y.meta.mimeType, y.contentType])).toEqual([
      [GOOGLE_SLIDES, 'application/vnd.oasis.opendocument.presentation'],
      [GOOGLE_SLIDES, 'application/vnd.ms-powerpoint'],
      [GOOGLE_DOC, 'application/rtf']
    ]);
  });

  it('> 5 MB → resumable (session + PUT), same metadata', async () => {
    const { yuklenen, items } = fakeDrive();
    const dosya = new Blob([new Uint8Array(RESUMABLE_LIMIT + 1)]);
    const r = await ofisuPdfeCevir(girdi('buyuk.pptx', { dosya }), loc, ACIK);
    expect(calls().some(c => c.includes('uploadType=resumable'))).toBe(true);
    expect(calls().some(c => c.includes('uploadType=multipart'))).toBe(false);
    expect(calls().some(c => c.startsWith('PUT https://'))).toBe(true);
    expect(yuklenen[0].meta.mimeType).toBe(GOOGLE_SLIDES);
    expect(yuklenen[0].meta.name).toBe('~çeviri – buyuk.pptx');
    expect(yuklenen[0].contentType).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    expect(yuklenen[0].boyut).toBe(RESUMABLE_LIMIT + 1);
    expect(r.copeAtildi).toBe(true);
    expect(items.get('g1')!.trashed).toBe(true);
  });

  it('exactly 5 MB is still multipart', async () => {
    fakeDrive();
    await ofisuPdfeCevir(girdi('a.docx', { dosya: new Blob([new Uint8Array(RESUMABLE_LIMIT)]) }), loc, ACIK);
    expect(calls().some(c => c.includes('uploadType=multipart'))).toBe(true);
  });

  it('trashing fails → the PDF still comes back, copeAtildi false', async () => {
    fakeDrive({ copHata: true });
    const r = await ofisuPdfeCevir(girdi(), loc, ACIK);
    expect(r.bytes).toEqual(PDF);
    expect(r.copeAtildi).toBe(false);
  });

  it('export 403 exportSizeLimitExceeded → OfisCokBuyuk, temporary file trashed', async () => {
    const { items } = fakeDrive({ export: 'buyuk' });
    await expect(ofisuPdfeCevir(girdi('cok.pptx'), loc, ACIK)).rejects.toBeInstanceOf(OfisCokBuyuk);
    expect(items.get('g1')!.trashed).toBe(true);
  });

  it('export 400 → OfisCevrilemedi + trashed; export 500 → OfisYuklenemedi + trashed; not a PDF → OfisCevrilemedi', async () => {
    let d = fakeDrive({ export: '400' });
    await expect(ofisuPdfeCevir(girdi(), loc, ACIK)).rejects.toBeInstanceOf(OfisCevrilemedi);
    expect(d.items.get('g1')!.trashed).toBe(true);
    d = fakeDrive({ export: '500' });
    await expect(ofisuPdfeCevir(girdi(), loc, ACIK)).rejects.toBeInstanceOf(OfisYuklenemedi);
    expect(d.items.get('g1')!.trashed).toBe(true);
    d = fakeDrive({ export: 'pdfDegil' });
    await expect(ofisuPdfeCevir(girdi(), loc, ACIK)).rejects.toBeInstanceOf(OfisCevrilemedi);
    expect(d.items.get('g1')!.trashed).toBe(true);
  });

  it('upload 400 (Drive cannot convert) → OfisCevrilemedi, nothing to trash', async () => {
    const { items } = fakeDrive({ yukleme: '400' });
    await expect(ofisuPdfeCevir(girdi('bozuk.docx'), loc, ACIK)).rejects.toBeInstanceOf(OfisCevrilemedi);
    expect(geciciler(items)).toEqual([]);
    expect(calls().some(c => c.startsWith('PATCH'))).toBe(false);
  });

  it('upload 400 on the resumable session → OfisCevrilemedi', async () => {
    fakeDrive({ yukleme: '400' });
    await expect(ofisuPdfeCevir(girdi('a.pptx', { dosya: new Blob([new Uint8Array(RESUMABLE_LIMIT + 1)]) }), loc, ACIK)).rejects.toBeInstanceOf(OfisCevrilemedi);
  });

  it.each([['500'], ['ag'], ['kapsam']] as const)('upload %s → OfisYuklenemedi', async y => {
    fakeDrive({ yukleme: y });
    const e = await ofisuPdfeCevir(girdi(), loc, ACIK).catch(x => x);
    expect(e).toBeInstanceOf(OfisYuklenemedi);
    if (y === 'kapsam') expect(e.message).toMatch(/izni/);
  });

  it('resumable session without Location → OfisYuklenemedi, no PUT', async () => {
    fakeDrive({ yukleme: 'oturumYok' });
    await expect(ofisuPdfeCevir(girdi('a.pptx', { dosya: new Blob([new Uint8Array(RESUMABLE_LIMIT + 1)]) }), loc, ACIK)).rejects.toBeInstanceOf(OfisYuklenemedi);
    expect(calls().some(c => c.startsWith('PUT'))).toBe(false);
  });

  it('aborted after the upload → OfisIptal, temporary file trashed, no export', async () => {
    const ab = new AbortController();
    const { items } = fakeDrive({ ab, abortNe: 'yukleme' });
    await expect(ofisuPdfeCevir(girdi('a.docx', { signal: ab.signal }), loc, ACIK)).rejects.toBeInstanceOf(OfisIptal);
    expect(calls().some(c => c.includes('/export'))).toBe(false);
    expect(items.get('g1')!.trashed).toBe(true);
  });

  it('aborted during the export → OfisIptal, temporary file trashed', async () => {
    const ab = new AbortController();
    const { items } = fakeDrive({ ab, abortNe: 'export' });
    await expect(ofisuPdfeCevir(girdi('a.docx', { signal: ab.signal }), loc, ACIK)).rejects.toBeInstanceOf(OfisIptal);
    expect(items.get('g1')!.trashed).toBe(true);
  });
});

describe('copeAtGecici: only our own temporary Google file', () => {
  const eski = (o: Partial<Item>): Item => ({ name: 'x', parent: 'C', mimeType: GOOGLE_DOC, createdTime: once(2 * SUPURME_YASI_MS), appProperties: { defter: '1', defterGecici: '1' }, ...o });

  it('marked Google Doc → PATCH trashed:true (never DELETE)', async () => {
    const { items } = fakeDrive({ eski: { E: eski({}) } });
    await copeAtGecici('E', ACIK);
    expect(items.get('E')!.trashed).toBe(true);
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!;
    expect(JSON.parse(String(patch[1]!.body))).toEqual({ trashed: true });
  });

  it.each([
    ['no defterGecici mark', { appProperties: { defter: '1' } }],
    ['no appProperties', { appProperties: undefined }],
    ['a PDF', { mimeType: 'application/pdf' }],
    ['a Word file (not a Google type)', { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
    ['a folder', { mimeType: FOLDER_MIME }],
    ['already in the trash', { trashed: true }]
  ])('%s → OfisGeciciDegil, no PATCH', async (_, o) => {
    fakeDrive({ eski: { E: eski(o as Partial<Item>) } });
    await expect(copeAtGecici('E', ACIK)).rejects.toBeInstanceOf(OfisGeciciDegil);
    expect(calls().some(c => c.startsWith('PATCH'))).toBe(false);
  });
});

describe('supurGecici', () => {
  const gecici = (yas: number, o: Partial<Item> = {}): Item =>
    ({ name: 'eski', parent: 'C', mimeType: GOOGLE_SLIDES, createdTime: once(yas), appProperties: { defter: '1', defterGecici: '1' }, ...o });

  it('the query: marked, both Google types, not trashed, older than 1 hour, at most 20', async () => {
    fakeDrive();
    await supurGecici(SIMDI, ACIK);
    const u = String(fetchMock.mock.calls[0][0]);
    const p = new URLSearchParams(u.slice(6));
    expect(p.get('q')).toBe(
      `appProperties has { key='defterGecici' and value='1' } and (mimeType='${GOOGLE_DOC}' or mimeType='${GOOGLE_SLIDES}')`
      + ` and trashed=false and createdTime < '${once(SUPURME_YASI_MS)}'`
    );
    expect(p.get('pageSize')).toBe('20');
  });

  it('older than 1 hour → trashed; newer stays; unmarked and PDFs are never returned/touched', async () => {
    const { items } = fakeDrive({
      eski: {
        E1: gecici(2 * SUPURME_YASI_MS),
        E2: gecici(SUPURME_YASI_MS + 1000, { mimeType: GOOGLE_DOC }),
        Y: gecici(SUPURME_YASI_MS - 1000),
        S: gecici(SUPURME_YASI_MS),   // exactly 1 hour: not yet
        P: gecici(3 * SUPURME_YASI_MS, { mimeType: 'application/pdf' }),
        I: gecici(3 * SUPURME_YASI_MS, { appProperties: { defter: '1' } })
      }
    });
    expect(await supurGecici(SIMDI, ACIK)).toBe(2);
    expect(items.get('E1')!.trashed).toBe(true);
    expect(items.get('E2')!.trashed).toBe(true);
    for (const id of ['Y', 'S', 'P', 'I']) expect(items.get(id)!.trashed).toBeFalsy();
  });

  it('one file failing does not stop the sweep', async () => {
    const { items } = fakeDrive({ eski: { E1: gecici(2 * SUPURME_YASI_MS), E2: gecici(2 * SUPURME_YASI_MS) } });
    const asil = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, init) => String(url).startsWith('files/E1') ? new Response('{}', { status: 500 }) : asil(url, init));
    expect(await supurGecici(SIMDI, ACIK)).toBe(1);
    expect(items.get('E2')!.trashed).toBe(true);
  });

  it('runs before every conversion: an old leftover is trashed, the new one too', async () => {
    const { items } = fakeDrive({ eski: { E: gecici(2 * SUPURME_YASI_MS) } });
    await ofisuPdfeCevir(girdi(), loc, ACIK);
    expect(items.get('E')!.trashed).toBe(true);
    expect(items.get('g1')!.trashed).toBe(true);
  });

  it('a failing sweep does not stop the conversion', async () => {
    fakeDrive({ araHata: true });
    const r = await ofisuPdfeCevir(girdi(), loc, ACIK);
    expect(r.bytes).toEqual(PDF);
    expect(console.warn).toHaveBeenCalled();
  });
});
