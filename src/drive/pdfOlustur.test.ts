import { beforeEach, describe, expect, it, vi } from 'vitest';
import { driveFetch, FOLDER_MIME } from './drive';
import type { DriveLocation } from './driveLibrary';
import {
  AyniIsimVar, createPdf, DosyaOlusturAgHatasi, DosyaOlusturKilitli, DosyaYazmaYok, drivePdfOlusturApi,
  IdAlinamadi, PdfDegil, YerDisi, YetkiYok, type CreatePdfSecenek
} from './pdfOlustur';
import { PdfUploadSession, RESUMABLE_LIMIT } from './pdfYazici';

vi.mock('./drive', async importOriginal => ({
  ...await importOriginal<typeof import('./drive')>(),
  driveFetch: vi.fn()
}));

const fetchMock = vi.mocked(driveFetch);

// A small fake Drive behind driveFetch: the real drivePdfOlusturApi talks to it.
//   R "Kitaplık" → K "kitaplar" → B "mat-1" (book) → U "Unite-01" → C "Konu-01"
//   R → X "baska";  R2 "Kitaplık" (another tree) → K2 "kitaplar" → B2 "mat-1";  B → T (trashed folder)
interface Item { name: string; parent: string; mimeType: string; trashed?: boolean; canAdd?: boolean; size?: number; appProperties?: Record<string, string> }
type Davranis = 'ok' | 'ag' | 'agAmaOlustu' | '500' | '403' | 'agAmaYanlisBoyut';

function fakeDrive(opts: { davranis?: Davranis[]; idHata?: boolean; sayfa?: number; location?: string | null } = {}) {
  const items = new Map<string, Item>([
    ['K', { name: 'kitaplar', parent: 'R', mimeType: FOLDER_MIME }],
    ['B', { name: 'mat-1', parent: 'K', mimeType: FOLDER_MIME }],
    ['U', { name: 'Unite-01', parent: 'B', mimeType: FOLDER_MIME }],
    ['C', { name: 'Konu-01', parent: 'U', mimeType: FOLDER_MIME }],
    ['X', { name: 'baska', parent: 'R', mimeType: FOLDER_MIME }],
    ['R2', { name: 'Kitaplık', parent: '', mimeType: FOLDER_MIME }],
    ['K2', { name: 'kitaplar', parent: 'R2', mimeType: FOLDER_MIME }],
    ['B2', { name: 'mat-1', parent: 'K2', mimeType: FOLDER_MIME }],
    ['T', { name: 'eski', parent: 'B', mimeType: FOLDER_MIME, trashed: true }],
    ['P', { name: 'orijinal.pdf', parent: 'C', mimeType: 'application/pdf', size: 100 }]
  ]);
  const davranis = [...(opts.davranis ?? [])];
  const sayfa = opts.sayfa ?? 1000;
  let sessionMeta: { id: string; name: string; parents: string[]; appProperties?: Record<string, string> } | null = null;
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  const create = (m: NonNullable<typeof sessionMeta>, size: number) =>
    items.set(m.id, { name: m.name, parent: m.parents[0], mimeType: 'application/pdf', size, appProperties: m.appProperties });
  const saved = (id: string) => json({ id, modifiedTime: 't-' + id, headRevisionId: 'r-' + id });

  // one upload answer, after the "already exists" check
  function upload(m: NonNullable<typeof sessionMeta>, size: number): Response {
    if (items.has(m.id)) return json({ error: { code: 409, message: 'A file already exists with the provided ID.' } }, 409);
    const d = davranis.shift() ?? 'ok';
    if (d === 'ag') throw new TypeError('Failed to fetch');
    if (d === 'agAmaOlustu') { create(m, size); throw new TypeError('Failed to fetch'); }
    if (d === 'agAmaYanlisBoyut') { create(m, size - 1); throw new TypeError('Failed to fetch'); }
    if (d === '500') return json({}, 500);
    if (d === '403') return json({}, 403);
    create(m, size);
    return saved(m.id);
  }

  fetchMock.mockImplementation(async (url, init) => {
    const u = String(url);
    const m = init?.method ?? 'GET';
    if (m === 'GET' && u.startsWith('files/generateIds')) return opts.idHata ? json({}, 500) : json({ ids: ['yeni1'] });
    if (m === 'GET' && u.startsWith('files?')) {
      const p = new URLSearchParams(u.slice(6));
      const parent = /'([^']+)' in parents/.exec(p.get('q') ?? '')![1];
      const all = [...items].filter(([, it]) => it.parent === parent && !it.trashed).map(([id, it]) => ({ id, name: it.name }));
      const start = Number(p.get('pageToken') ?? 0);
      const next = start + sayfa < all.length ? String(start + sayfa) : undefined;
      return json({ files: all.slice(start, start + sayfa), nextPageToken: next });
    }
    if (m === 'GET' && u.startsWith('files/')) {
      const id = decodeURIComponent(u.slice(6, u.indexOf('?')));
      const it = items.get(id);
      if (!it) return json({}, 404);
      if (u.includes('size')) return json({ id, modifiedTime: 't-' + id, headRevisionId: 'r-' + id, size: String(it.size) });
      return json({ id, name: it.name, mimeType: it.mimeType, trashed: it.trashed === true, parents: it.parent ? [it.parent] : [], capabilities: { canAddChildren: it.canAdd !== false } });
    }
    if (m === 'POST' && u.includes('uploadType=multipart')) {
      const text = await (init!.body as Blob).text();
      const meta = JSON.parse(/\r\n\r\n(\{.*\})\r\n/.exec(text)![1]);
      // the PDF part (test bytes are ASCII, so text length = byte length): between its header and the closing boundary
      const pdf = text.slice(text.indexOf('%PDF-'), text.lastIndexOf('\r\n--'));
      return upload(meta, pdf.length);
    }
    if (m === 'POST' && u.includes('uploadType=resumable')) {
      sessionMeta = JSON.parse(String(init!.body));
      if (items.has(sessionMeta!.id)) return json({ error: { message: 'File already exists' } }, 400);
      return json({}, 200, opts.location === null ? {} : { Location: opts.location ?? 'https://www.googleapis.com/upload/drive/v3/files?upload_id=s1' });
    }
    if (m === 'PUT') return upload(sessionMeta!, (await (init!.body as Blob).arrayBuffer()).byteLength);
    throw new Error(`unexpected request ${m} ${u}`);
  });
  return { items };
}

const loc: DriveLocation = { rootId: 'R', libraryFileId: null, bookFolderIds: new Map([['mat-1', 'B']]), bookFileIds: new Map() };
const ACIK: CreatePdfSecenek = { kilitAcik: () => true, bekleMs: 0 };
const pdf = (n = 20) => { const b = new Uint8Array(n).fill(32); b.set([37, 80, 68, 70, 45]); return b; };   // "%PDF-" + spaces
const calls = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url}`);
const posts = () => calls().filter(c => c.startsWith('POST'));
const neverChanges = () => expect(calls().some(c => /^(DELETE|PATCH)/.test(c) || /emptyTrash|\/trash/.test(c))).toBe(false);
const pdfFiles = (items: Map<string, Item>) => [...items.values()].filter(i => i.mimeType === 'application/pdf' && i.name !== 'orijinal.pdf');

beforeEach(() => { fetchMock.mockReset(); });

describe('createPdf: refused before any request', () => {
  it('lock closed (no ?dosyaOlustur=1)', async () => {
    fakeDrive();
    await expect(createPdf(drivePdfOlusturApi, loc, 'C', 'ozet.pdf', pdf())).rejects.toBeInstanceOf(DosyaOlusturKilitli);
    await expect(createPdf(drivePdfOlusturApi, loc, 'C', 'ozet.pdf', pdf(), { kilitAcik: () => false })).rejects.toBeInstanceOf(DosyaOlusturKilitli);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('writer() locked / demo (no Drive library): yer null', async () => {
    fakeDrive();
    await expect(createPdf(drivePdfOlusturApi, null, 'C', 'ozet.pdf', pdf(), ACIK)).rejects.toBeInstanceOf(DosyaYazmaYok);
    await expect(createPdf(drivePdfOlusturApi, loc, 'ornek:demo', 'ozet.pdf', pdf(), ACIK)).rejects.toBeInstanceOf(DosyaYazmaYok);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['ozet.txt', pdf()], ['', pdf()], ['.pdf', pdf()], [' ozet.pdf', pdf()], ['a/ozet.pdf', pdf()],
    ['ozet.pdf', new TextEncoder().encode('hello world')], ['ozet.pdf', new Uint8Array(0)]
  ])('not a PDF: %j', async (ad, bytes) => {
    fakeDrive();
    await expect(createPdf(drivePdfOlusturApi, loc, 'C', ad, bytes, ACIK)).rejects.toBeInstanceOf(PdfDegil);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('createPdf: place', () => {
  it.each([
    ['X', 'a folder outside kitaplar'], ['K', 'kitaplar itself'], ['R', 'the Kitaplık root'],
    ['B2', 'a book in another Kitaplık tree'], ['T', 'a trashed folder'], ['P', 'a file, not a folder'], ['YOK', 'a missing folder']
  ])('%s (%s) → refused, nothing uploaded', async parent => {
    fakeDrive();
    await expect(createPdf(drivePdfOlusturApi, loc, parent, 'ozet.pdf', pdf(), ACIK)).rejects.toThrow();
    expect(posts()).toEqual([]);
  });

  it('outside places are YerDisi', async () => {
    fakeDrive();
    for (const p of ['X', 'K', 'R', 'B2', 'T', 'P']) {
      await expect(createPdf(drivePdfOlusturApi, loc, p, 'ozet.pdf', pdf(), ACIK)).rejects.toBeInstanceOf(YerDisi);
    }
  });

  it('the book folder and its subfolders are allowed', async () => {
    const { items } = fakeDrive();
    for (const [p, ad] of [['B', 'a.pdf'], ['U', 'b.pdf'], ['C', 'c.pdf']]) {
      await createPdf(drivePdfOlusturApi, loc, p, ad, pdf(), ACIK);
      items.delete('yeni1');   // the fake gives the same id every time
    }
    expect(posts().length).toBe(3);
  });

  it('no permission to add files → YetkiYok, nothing uploaded', async () => {
    const { items } = fakeDrive();
    items.get('C')!.canAdd = false;
    await expect(createPdf(drivePdfOlusturApi, loc, 'C', 'ozet.pdf', pdf(), ACIK)).rejects.toBeInstanceOf(YetkiYok);
    expect(posts()).toEqual([]);
  });
});

describe('createPdf: same name', () => {
  it('same name (other case too) → AyniIsimVar with the existing id, no upload', async () => {
    fakeDrive();
    for (const ad of ['orijinal.pdf', 'Orijinal.PDF']) {
      const e = await createPdf(drivePdfOlusturApi, loc, 'C', ad, pdf(), ACIK).catch(x => x);
      expect(e).toBeInstanceOf(AyniIsimVar);
      expect((e as AyniIsimVar).mevcutId).toBe('P');
    }
    expect(posts()).toEqual([]);
    expect(calls().some(c => c.includes('generateIds'))).toBe(false);
  });

  it('follows every page of the folder list: a name on page 2 is found', async () => {
    const { items } = fakeDrive({ sayfa: 2 });
    for (let i = 0; i < 3; i++) items.set('d' + i, { name: `ders-${i}.pdf`, parent: 'B', mimeType: 'application/pdf' });
    items.set('z', { name: 'ozet.pdf', parent: 'B', mimeType: 'application/pdf' });
    const e = await createPdf(drivePdfOlusturApi, loc, 'B', 'ozet.pdf', pdf(), ACIK).catch(x => x);
    expect(e).toBeInstanceOf(AyniIsimVar);
    expect(calls().filter(c => c.includes('pageToken')).length).toBeGreaterThan(0);
    expect(posts()).toEqual([]);
  });
});

describe('createPdf: upload', () => {
  it('up to 5 MB: one multipart POST with id, parents, PDF type, defter mark', async () => {
    const { items } = fakeDrive();
    const r = await createPdf(drivePdfOlusturApi, loc, 'C', 'ozet.pdf', pdf(), ACIK);
    expect(r).toEqual({ id: 'yeni1', modifiedTime: 't-yeni1', headRevisionId: 'r-yeni1' });
    expect(posts()).toEqual(['POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime,headRevisionId']);
    const post = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST')!;
    const text = await (post[1]!.body as Blob).text();
    const meta = JSON.parse(/\r\n\r\n(\{.*\})\r\n/.exec(text)![1]);
    expect(meta).toEqual({ id: 'yeni1', name: 'ozet.pdf', parents: ['C'], mimeType: 'application/pdf', appProperties: { defter: '1' } });
    expect(text).toContain('Content-Type: application/pdf\r\n\r\n%PDF-');
    expect(new Headers(post[1]!.headers).get('Content-Type')).toMatch(/^multipart\/related; boundary=/);
    expect(pdfFiles(items)).toHaveLength(1);
    neverChanges();
  });

  it('over 5 MB: resumable session (POST) and PUT to it', async () => {
    fakeDrive();
    const r = await createPdf(drivePdfOlusturApi, loc, 'C', 'ozet.pdf', pdf(RESUMABLE_LIMIT + 1), ACIK);
    expect(r.id).toBe('yeni1');
    expect(calls().slice(-2)).toEqual([
      'POST https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,modifiedTime,headRevisionId',
      'PUT https://www.googleapis.com/upload/drive/v3/files?upload_id=s1'
    ]);
    const start = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST')!;
    expect(JSON.parse(String(start[1]!.body))).toMatchObject({ id: 'yeni1', appProperties: { defter: '1' } });
    neverChanges();
  });

  it('resumable without a Location header: PdfUploadSession, no PUT', async () => {
    fakeDrive({ location: null });
    await expect(createPdf(drivePdfOlusturApi, loc, 'C', 'ozet.pdf', pdf(RESUMABLE_LIMIT + 1), ACIK)).rejects.toBeInstanceOf(PdfUploadSession);
    expect(calls().some(c => c.startsWith('PUT'))).toBe(false);
  });

  it('generateIds fails → IdAlinamadi, no POST', async () => {
    fakeDrive({ idHata: true });
    await expect(createPdf(drivePdfOlusturApi, loc, 'C', 'ozet.pdf', pdf(), ACIK)).rejects.toBeInstanceOf(IdAlinamadi);
    expect(posts()).toEqual([]);
  });
});

describe('createPdf: retry never makes two files', () => {
  it('network error but the file arrived: retry with the same id → 409 → accepted (size matches)', async () => {
    const { items } = fakeDrive({ davranis: ['agAmaOlustu'] });
    // the folder list is "late": hide the new file from the backup check
    const cocuklar = drivePdfOlusturApi.cocuklar;
    let n = 0;
    const api = { ...drivePdfOlusturApi, cocuklar: async (id: string) => (n++ === 0 ? cocuklar(id) : (await cocuklar(id)).filter(f => f.id !== 'yeni1')) };
    const r = await createPdf(api, loc, 'C', 'ozet.pdf', pdf(), ACIK);
    expect(r.id).toBe('yeni1');
    expect(posts().length).toBe(2);   // same id both times
    const ids = await Promise.all(fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST')
      .map(async ([, i]) => JSON.parse(/\r\n\r\n(\{.*\})\r\n/.exec(await (i!.body as Blob).text())![1]).id));
    expect(ids).toEqual(['yeni1', 'yeni1']);
    expect(pdfFiles(items)).toHaveLength(1);
    neverChanges();
  });

  it('409 but the size differs → DosyaOlusturAgHatasi', async () => {
    const { items } = fakeDrive({ davranis: ['agAmaYanlisBoyut'] });
    const api = { ...drivePdfOlusturApi, cocuklar: async () => [] };   // backup check sees nothing
    await expect(createPdf(api, loc, 'C', 'ozet.pdf', pdf(), ACIK)).rejects.toBeInstanceOf(DosyaOlusturAgHatasi);
    expect(pdfFiles(items)).toHaveLength(1);
  });

  it('backup check: the list already shows our file → accepted without a second upload', async () => {
    const { items } = fakeDrive({ davranis: ['agAmaOlustu'] });
    const r = await createPdf(drivePdfOlusturApi, loc, 'C', 'ozet.pdf', pdf(), ACIK);
    expect(r.id).toBe('yeni1');
    expect(posts().length).toBe(1);
    expect(pdfFiles(items)).toHaveLength(1);
  });

  it('backup check: meanwhile another file with that name appeared → AyniIsimVar, no second upload', async () => {
    const { items } = fakeDrive({ davranis: ['ag'] });
    const cocuklar = drivePdfOlusturApi.cocuklar;
    let n = 0;
    const api = {
      ...drivePdfOlusturApi,
      cocuklar: async (id: string) => {
        if (n++ === 1) items.set('baskasi', { name: 'ozet.pdf', parent: 'C', mimeType: 'application/pdf' });
        return cocuklar(id);
      }
    };
    await expect(createPdf(api, loc, 'C', 'ozet.pdf', pdf(), ACIK)).rejects.toBeInstanceOf(AyniIsimVar);
    expect(posts().length).toBe(1);
  });

  it('network error, nothing arrived: second upload with the same id, one file', async () => {
    const { items } = fakeDrive({ davranis: ['ag', '500'] });
    const r = await createPdf(drivePdfOlusturApi, loc, 'C', 'ozet.pdf', pdf(), ACIK);
    expect(r.id).toBe('yeni1');
    expect(posts().length).toBe(3);
    expect(pdfFiles(items)).toHaveLength(1);
  });

  it('3 network errors → DosyaOlusturAgHatasi, nothing created', async () => {
    const { items } = fakeDrive({ davranis: ['ag', 'ag', 'ag'] });
    await expect(createPdf(drivePdfOlusturApi, loc, 'C', 'ozet.pdf', pdf(), ACIK)).rejects.toBeInstanceOf(DosyaOlusturAgHatasi);
    expect(posts().length).toBe(3);
    expect(pdfFiles(items)).toHaveLength(0);
  });

  it('403 is not retried', async () => {
    fakeDrive({ davranis: ['403'] });
    await expect(createPdf(drivePdfOlusturApi, loc, 'C', 'ozet.pdf', pdf(), ACIK)).rejects.toThrow(/izin vermedi/);
    expect(posts().length).toBe(1);
  });

  it('no connection at all: Turkish network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(createPdf(drivePdfOlusturApi, loc, 'C', 'ozet.pdf', pdf(), ACIK)).rejects.toBeInstanceOf(DosyaOlusturAgHatasi);
  });
});
