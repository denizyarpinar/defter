import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DriveError, driveFetch, driveXhr } from './drive';
import {
  DEVAM_BEKLEME, devamBaslangici, devamliGonder, drivePdfApi, ensureOriginalKept, PdfConflict, PdfReadOnly,
  PdfSampleNoWrite, PdfUploadSession, RESUMABLE_LIMIT, uploadPdf, yedekBelleginiSifirla,
  YuklemeOturumuDustu, type Gonderici, type PdfDrive, type Revision, type YuklemeSecenek
} from './pdfYazici';

vi.mock('./drive', async importOriginal => ({
  ...await importOriginal<typeof import('./drive')>(),
  driveFetch: vi.fn(),
  driveXhr: vi.fn()
}));

// the backup memory is per session: every test starts with an empty one
beforeEach(() => { yedekBelleginiSifirla(); });

// A fake Drive with one PDF; every call is logged.
function fakeDrive(opts: { canEdit?: boolean; pages?: Revision[][] } = {}) {
  const file = { modifiedTime: 't1', head: 'r1' };
  const pages = opts.pages ?? [[{ id: 'r1', keepForever: false }]];
  const log: string[] = [];
  const hooks = { afterKeep: null as null | (() => void) };
  const secenekler: (YuklemeSecenek | undefined)[] = [];
  const drive: PdfDrive = {
    async durum() { log.push('durum'); return { canEdit: opts.canEdit ?? true, modifiedTime: file.modifiedTime, headRevisionId: file.head }; },
    async listRevisions(_id, token) {
      log.push(`listRevisions:${token ?? '-'}`);
      const i = token ? Number(token) : 0;
      return { revisions: pages[i], nextPageToken: i + 1 < pages.length ? String(i + 1) : undefined };
    },
    async headRevisionId() { log.push('headRevisionId'); return file.head; },
    async keepRevision(_id, rev) { log.push(`keep:${rev}`); hooks.afterKeep?.(); },
    async modifiedTime() { log.push('modifiedTime'); return file.modifiedTime; },
    async uploadMedia(id, _b, s) { log.push('uploadMedia'); secenekler.push(s); return { id, modifiedTime: 't9', headRevisionId: 'r9' }; },
    async uploadResumable(id, _b, s) { log.push('uploadResumable'); secenekler.push(s); return { id, modifiedTime: 't9', headRevisionId: 'r9' }; }
  };
  return { drive, file, log, hooks, secenekler };
}

const bytes = (n: number) => new Uint8Array(n);
const uploads = (log: string[]) => log.filter(l => l.startsWith('upload'));

describe('ensureOriginalKept', () => {
  it('marks the head revision when nothing is kept', async () => {
    const { drive, log } = fakeDrive();
    await ensureOriginalKept(drive, 'f');
    expect(log).toEqual(['listRevisions:-', 'headRevisionId', 'keep:r1']);
  });

  it('the head given by the caller: no extra request', async () => {
    const { drive, log } = fakeDrive();
    await ensureOriginalKept(drive, 'f', 'r1');
    expect(log).toEqual(['listRevisions:-', 'keep:r1']);
  });

  it('does nothing when a revision is already kept; a second call asks nothing (session memory)', async () => {
    const { drive, log } = fakeDrive({ pages: [[{ id: 'r0', keepForever: true }, { id: 'r1' }]] });
    await ensureOriginalKept(drive, 'f');
    await ensureOriginalKept(drive, 'f');
    expect(log).toEqual(['listRevisions:-']);
  });

  it('follows nextPageToken through every page', async () => {
    const { drive, log } = fakeDrive({ pages: [[{ id: 'r0' }], [{ id: 'r1' }], [{ id: 'r2', keepForever: true }]] });
    await ensureOriginalKept(drive, 'f');
    expect(log).toEqual(['listRevisions:-', 'listRevisions:1', 'listRevisions:2']);
  });

  it('marks after looking at all pages when none is kept', async () => {
    const { drive, log } = fakeDrive({ pages: [[{ id: 'r0' }], [{ id: 'r1' }]] });
    await ensureOriginalKept(drive, 'f');
    expect(log).toEqual(['listRevisions:-', 'listRevisions:1', 'headRevisionId', 'keep:r1']);
  });

  it('a failing keep is not remembered: the next call looks again', async () => {
    const { drive, log } = fakeDrive();
    drive.keepRevision = async () => { log.push('keep:hata'); throw new TypeError('Failed to fetch'); };
    await expect(ensureOriginalKept(drive, 'f', 'r1')).rejects.toBeInstanceOf(TypeError);
    await expect(ensureOriginalKept(drive, 'f', 'r1')).rejects.toBeInstanceOf(TypeError);
    expect(log.filter(l => l.startsWith('listRevisions'))).toHaveLength(2);
  });
});

describe('uploadPdf', () => {
  it('first write: one durum, the backup, durum again, then the upload', async () => {
    const { drive, log } = fakeDrive();
    const r = await uploadPdf(drive, 'f', bytes(10), 't1');
    expect(log).toEqual(['durum', 'listRevisions:-', 'keep:r1', 'durum', 'uploadMedia']);
    expect(r).toEqual({ id: 'f', modifiedTime: 't9', headRevisionId: 'r9' });
  });

  it('task 6.2e-2: the second write of the file: only one durum before the upload', async () => {
    const { drive, file, log } = fakeDrive();
    await uploadPdf(drive, 'f', bytes(10), 't1');
    file.modifiedTime = 't9'; file.head = 'r9';
    log.length = 0;
    await uploadPdf(drive, 'f', bytes(10), 't9');
    expect(log).toEqual(['durum', 'uploadMedia']);
  });

  it('the one durum still catches a conflict (second write, another device wrote meanwhile)', async () => {
    const { drive, file, log } = fakeDrive();
    await uploadPdf(drive, 'f', bytes(10), 't1');
    file.modifiedTime = 't10'; file.head = 'r10';   // another device, after our upload
    log.length = 0;
    await expect(uploadPdf(drive, 'f', bytes(10), 't9')).rejects.toBeInstanceOf(PdfConflict);
    expect(log).toEqual(['durum']);
  });

  it('canEdit false: no backup, no write', async () => {
    const { drive, log } = fakeDrive({ canEdit: false });
    await expect(uploadPdf(drive, 'f', bytes(10), 't1')).rejects.toBeInstanceOf(PdfReadOnly);
    expect(log).toEqual(['durum']);
  });

  it('modifiedTime differs: PdfConflict, no backup, no PATCH', async () => {
    const { drive, log } = fakeDrive();
    await expect(uploadPdf(drive, 'f', bytes(10), 't0')).rejects.toBeInstanceOf(PdfConflict);
    expect(log).toEqual(['durum']);
  });

  it('keepForever changes modifiedTime: the write still goes on', async () => {
    const { drive, file, log, hooks } = fakeDrive();
    hooks.afterKeep = () => { file.modifiedTime = 't2'; };
    await uploadPdf(drive, 'f', bytes(10), 't1');
    expect(uploads(log)).toEqual(['uploadMedia']);
  });

  it('headRevisionId changes during the backup: PdfConflict, no write', async () => {
    const { drive, file, log, hooks } = fakeDrive();
    hooks.afterKeep = () => { file.head = 'r2'; };
    await expect(uploadPdf(drive, 'f', bytes(10), 't1')).rejects.toBeInstanceOf(PdfConflict);
    expect(uploads(log)).toEqual([]);
  });

  it('already kept: no new keep, still writes', async () => {
    const { drive, log } = fakeDrive({ pages: [[{ id: 'r0', keepForever: true }, { id: 'r1' }]] });
    await uploadPdf(drive, 'f', bytes(10), 't1');
    expect(log.filter(l => l.startsWith('keep'))).toEqual([]);
    expect(uploads(log)).toEqual(['uploadMedia']);
  });

  it('up to 5 MB: media; bigger: resumable', async () => {
    const a = fakeDrive();
    await uploadPdf(a.drive, 'f', bytes(RESUMABLE_LIMIT), 't1');
    expect(uploads(a.log)).toEqual(['uploadMedia']);
    const b = fakeDrive();
    await uploadPdf(b.drive, 'g', bytes(RESUMABLE_LIMIT + 1), 't1');
    expect(uploads(b.log)).toEqual(['uploadResumable']);
  });

  it('sample library: error before any request', async () => {
    const { drive, log } = fakeDrive();
    await expect(uploadPdf(drive, 'ornek:pg#demo/demo-slayt.pdf', bytes(10), 'ornek')).rejects.toBeInstanceOf(PdfSampleNoWrite);
    expect(log).toEqual([]);
  });

  it('basladi: once, right before the bytes go; not on a conflict', async () => {
    const { drive, log } = fakeDrive();
    const basladi = vi.fn(() => log.push('basladi'));
    await expect(uploadPdf(drive, 'f', bytes(10), 't0', { basladi })).rejects.toBeInstanceOf(PdfConflict);
    expect(basladi).not.toHaveBeenCalled();
    log.length = 0;
    await uploadPdf(drive, 'f', bytes(10), 't1', { basladi });
    expect(log.slice(-2)).toEqual(['basladi', 'uploadMedia']);
  });

  it('the progress listener reaches the upload', async () => {
    const { drive, secenekler } = fakeDrive();
    const ilerleme = vi.fn();
    await uploadPdf(drive, 'f', bytes(RESUMABLE_LIMIT + 1), 't1', { ilerleme });
    expect(secenekler[0]?.ilerleme).toBe(ilerleme);
  });

  it('devamOncesi (before resuming): unchanged → goes on; changed head or modifiedTime → PdfConflict', async () => {
    const { drive, file, secenekler } = fakeDrive();
    await uploadPdf(drive, 'f', bytes(RESUMABLE_LIMIT + 1), 't1');
    const devam = secenekler[0]!.devamOncesi!;
    await expect(devam()).resolves.toBeUndefined();
    file.head = 'r2';
    await expect(devam()).rejects.toBeInstanceOf(PdfConflict);
    file.head = 'r1'; file.modifiedTime = 't5';
    await expect(devam()).rejects.toBeInstanceOf(PdfConflict);
  });

  it('devamOncesi after a keepForever that changed modifiedTime: compares with the time after the backup', async () => {
    const { drive, file, hooks, secenekler } = fakeDrive();
    hooks.afterKeep = () => { file.modifiedTime = 't2'; };
    await uploadPdf(drive, 'f', bytes(RESUMABLE_LIMIT + 1), 't1');
    await expect(secenekler[0]!.devamOncesi!()).resolves.toBeUndefined();
  });
});

// ---- task 6.2e-2: an interrupted resumable upload ----

const SESSION = 'https://www.googleapis.com/upload/drive/v3/files/f?upload_id=abc';
const sonucJson = (status = 200) => new Response(JSON.stringify({ id: 'f', modifiedTime: 't9', headRevisionId: 'r9' }), { status });
const cevap308 = (range?: string) => new Response(null, { status: 308, headers: range ? { Range: range } : {} });
const kontrol = async (res: Response) => { if (!res.ok) throw new DriveError(res.status, 'test'); return res; };

// A fake session: answers come from a list; every call is logged (method, Content-Range, body size)
function oturum(cevaplar: (Response | Error)[]) {
  const log: string[] = [];
  const bekleme: number[] = [];
  const gonder: Gonderici = async (_url, init, ilerleme) => {
    const h = new Headers(init.headers);
    const boyut = init.body instanceof Blob ? init.body.size : 0;
    log.push(`${init.method} ${h.get('Content-Range') ?? '-'} ${boyut}`);
    const c = cevaplar.shift();
    if (!c) throw new Error('beklenmeyen istek');
    if (c instanceof Error) { ilerleme?.(Math.floor(boyut / 2)); throw c; }
    ilerleme?.(boyut);
    return c;
  };
  return { gonder, log, bekleme, bekle: async (ms: number) => { bekleme.push(ms); } };
}

describe('devamBaslangici', () => {
  it('reads Drive\'s Range header', () => {
    expect(devamBaslangici('bytes=0-99')).toBe(100);
    expect(devamBaslangici(null)).toBe(0);
    expect(devamBaslangici('bozuk')).toBe(0);
  });
});

describe('devamliGonder', () => {
  it('no interruption: one PUT of everything, progress up to the total', async () => {
    const o = oturum([sonucJson()]);
    const ilerleme = vi.fn();
    const r = await devamliGonder(SESSION, bytes(1000), kontrol, { gonder: o.gonder, bekle: o.bekle, ilerleme });
    expect(r.modifiedTime).toBe('t9');
    expect(o.log).toEqual(['PUT - 1000']);
    expect(ilerleme).toHaveBeenLastCalledWith(1000, 1000);
  });

  it('interrupted: asks first (308 + Range), then devamOncesi, then only the rest', async () => {
    const o = oturum([new TypeError('Failed to fetch'), cevap308('bytes=0-399'), sonucJson()]);
    const sira: string[] = [];
    const ilerleme = vi.fn();
    const r = await devamliGonder(SESSION, bytes(1000), kontrol, {
      gonder: async (u, i, p) => { sira.push(`gonder:${new Headers(i.headers).get('Content-Range') ?? 'ilk'}`); return o.gonder(u, i, p); },
      bekle: o.bekle, ilerleme, devamOncesi: async () => { sira.push('devamOncesi'); },
    });
    expect(r.id).toBe('f');
    expect(o.log).toEqual(['PUT - 1000', 'PUT bytes */1000 0', 'PUT bytes 400-999/1000 600']);
    expect(sira).toEqual(['gonder:ilk', 'gonder:bytes */1000', 'devamOncesi', 'gonder:bytes 400-999/1000']);
    expect(o.bekleme).toEqual([DEVAM_BEKLEME[0]]);
    expect(ilerleme).toHaveBeenLastCalledWith(1000, 1000);   // the rest counts from where Drive stopped
  });

  it('upload finished but its answer was lost: the question gets 200 → done, devamOncesi NOT asked, no conflict', async () => {
    const o = oturum([new TypeError('Failed to fetch'), sonucJson(200)]);
    const devamOncesi = vi.fn(async () => { throw new PdfConflict(); });
    const r = await devamliGonder(SESSION, bytes(1000), kontrol, { gonder: o.gonder, bekle: o.bekle, devamOncesi });
    expect(r).toEqual({ id: 'f', modifiedTime: 't9', headRevisionId: 'r9' });
    expect(devamOncesi).not.toHaveBeenCalled();
    expect(o.log).toEqual(['PUT - 1000', 'PUT bytes */1000 0']);
  });

  it('201 counts as finished too', async () => {
    const o = oturum([new TypeError('Failed to fetch'), sonucJson(201)]);
    await expect(devamliGonder(SESSION, bytes(10), kontrol, { gonder: o.gonder, bekle: o.bekle })).resolves.toMatchObject({ id: 'f' });
  });

  it('308 but the file changed meanwhile: PdfConflict, the rest is not sent', async () => {
    const o = oturum([new TypeError('Failed to fetch'), cevap308('bytes=0-399')]);
    await expect(devamliGonder(SESSION, bytes(1000), kontrol, {
      gonder: o.gonder, bekle: o.bekle, devamOncesi: async () => { throw new PdfConflict(); },
    })).rejects.toBeInstanceOf(PdfConflict);
    expect(o.log).toEqual(['PUT - 1000', 'PUT bytes */1000 0']);
  });

  it('session gone (404 / 410): YuklemeOturumuDustu (a network error for the caller: starts again)', async () => {
    for (const status of [404, 410]) {
      const o = oturum([new TypeError('Failed to fetch'), new Response(null, { status })]);
      const e = await devamliGonder(SESSION, bytes(10), kontrol, { gonder: o.gonder, bekle: o.bekle }).catch(x => x);
      expect(e).toBeInstanceOf(YuklemeOturumuDustu);
      expect(e).toBeInstanceOf(TypeError);
      expect(e).not.toBeInstanceOf(DriveError);   // not "file not found"
    }
  });

  it('the question fails too: at most 3 resumes (2, 4, 8 s), then the network error', async () => {
    const ag = new TypeError('Failed to fetch');
    const o = oturum([ag, ag, ag, ag]);
    await expect(devamliGonder(SESSION, bytes(10), kontrol, { gonder: o.gonder, bekle: o.bekle })).rejects.toBe(ag);
    expect(o.bekleme).toEqual(DEVAM_BEKLEME);
    expect(o.log).toHaveLength(4);
  });

  it('interrupted twice: resumes twice from where Drive stopped', async () => {
    const o = oturum([new TypeError('x'), cevap308('bytes=0-99'), new TypeError('y'), cevap308('bytes=0-699'), sonucJson()]);
    await devamliGonder(SESSION, bytes(1000), kontrol, { gonder: o.gonder, bekle: o.bekle });
    expect(o.log).toEqual(['PUT - 1000', 'PUT bytes */1000 0', 'PUT bytes 100-999/1000 900', 'PUT bytes */1000 0', 'PUT bytes 700-999/1000 300']);
  });

  it('a Drive error (not the network) is not resumed', async () => {
    const o = oturum([new Response(null, { status: 403 })]);
    await expect(devamliGonder(SESSION, bytes(10), kontrol, { gonder: o.gonder, bekle: o.bekle })).rejects.toBeInstanceOf(DriveError);
    expect(o.log).toEqual(['PUT - 10']);
  });

  it('308 without Range: everything again, with Content-Range', async () => {
    const o = oturum([new TypeError('x'), cevap308(), sonucJson()]);
    await devamliGonder(SESSION, bytes(10), kontrol, { gonder: o.gonder, bekle: o.bekle });
    expect(o.log.at(-1)).toBe('PUT bytes 0-9/10 10');
  });
});

// The real drivePdfApi with a fake driveFetch: which requests would go to Drive.
describe('drivePdfApi requests', () => {
  const fetchMock = vi.mocked(driveFetch);
  const xhrMock = vi.mocked(driveXhr);
  // fetch and XMLHttpRequest requests together, in the order they were made
  const istekler = () => [
    ...fetchMock.mock.calls.map((c, i) => ({ c, sira: fetchMock.mock.invocationCallOrder[i] })),
    ...xhrMock.mock.calls.map((c, i) => ({ c, sira: xhrMock.mock.invocationCallOrder[i] }))
  ].sort((a, b) => a.sira - b.sira).map(x => x.c);
  const calls = () => istekler().map(([url, init]) => `${init?.method ?? 'GET'} ${url}`);
  const json = (body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', ...headers } });

  // answers like Drive, for one file "f" (head r1, nothing kept)
  function answer(opts: { location?: string | null } = {}) {
    const impl = async (url: string, init?: RequestInit) => {
      const u = String(url);
      const m = init?.method ?? 'GET';
      if (m === 'GET' && u.includes('capabilities')) return json({ capabilities: { canEdit: true }, modifiedTime: 't1', headRevisionId: 'r1' });
      if (m === 'GET' && u.includes('/revisions?')) return json({ revisions: [{ id: 'r1', keepForever: false }] });
      if (m === 'GET' && u.includes('headRevisionId')) return json({ headRevisionId: 'r1' });
      if (m === 'PATCH' && u.includes('/revisions/')) return json({ id: 'r1' });
      if (m === 'PATCH' && u.includes('uploadType=resumable')) {
        return json({}, opts.location === null ? {} : { Location: opts.location ?? SESSION });
      }
      if ((m === 'PATCH' && u.includes('uploadType=media')) || m === 'PUT') return json({ id: 'f', modifiedTime: 't9', headRevisionId: 'r9' });
      throw new Error(`unexpected request ${m} ${u}`);
    };
    fetchMock.mockImplementation(impl);
    xhrMock.mockImplementation(impl);
  }

  beforeEach(() => { fetchMock.mockReset(); xhrMock.mockReset(); });   // braces: a returned function would run as teardown
  afterEach(() => { vi.unstubAllGlobals(); });

  it('small file: only GET and PATCH on the same id, never POST', async () => {
    answer();
    const r = await uploadPdf(drivePdfApi, 'f', bytes(10), 't1');
    expect(r).toEqual({ id: 'f', modifiedTime: 't9', headRevisionId: 'r9' });
    expect(calls()).toEqual([
      'GET files/f?fields=capabilities/canEdit,modifiedTime,headRevisionId',
      'GET files/f/revisions?fields=nextPageToken%2Crevisions%28id%2CkeepForever%29',
      'PATCH files/f/revisions/r1?fields=id',
      'GET files/f?fields=capabilities/canEdit,modifiedTime,headRevisionId',
      'PATCH https://www.googleapis.com/upload/drive/v3/files/f?uploadType=media&fields=id,modifiedTime,headRevisionId'
    ]);
    expect(fetchMock.mock.calls[2][1]?.body).toBe('{"keepForever":true}');
    expect(new Headers(istekler()[4][1]?.headers).get('Content-Type')).toBe('application/pdf');
  });

  it('second write of the same file: one GET, then the upload', async () => {
    answer();
    await uploadPdf(drivePdfApi, 'f', bytes(10), 't1');
    fetchMock.mockClear();
    xhrMock.mockClear();
    await uploadPdf(drivePdfApi, 'f', bytes(10), 't1');
    expect(calls()).toEqual([
      'GET files/f?fields=capabilities/canEdit,modifiedTime,headRevisionId',
      'PATCH https://www.googleapis.com/upload/drive/v3/files/f?uploadType=media&fields=id,modifiedTime,headRevisionId'
    ]);
  });

  it('big file: resumable session on the same id, bytes sent with PUT, never POST', async () => {
    answer();
    await uploadPdf(drivePdfApi, 'f', bytes(RESUMABLE_LIMIT + 1), 't1');
    expect(calls().slice(-2)).toEqual([
      'PATCH https://www.googleapis.com/upload/drive/v3/files/f?uploadType=resumable&fields=id,modifiedTime,headRevisionId',
      `PUT ${SESSION}`
    ]);
    expect(calls().some(c => c.startsWith('POST'))).toBe(false);
  });

  it('resumable without a Location header: clear error, no fallback to media', async () => {
    answer({ location: null });
    await expect(uploadPdf(drivePdfApi, 'f', bytes(RESUMABLE_LIMIT + 1), 't1')).rejects.toBeInstanceOf(PdfUploadSession);
    expect(calls().some(c => c.includes('uploadType=media') || c.startsWith('PUT'))).toBe(false);
  });

  it('sample library: driveFetch is never called', async () => {
    answer();
    await expect(uploadPdf(drivePdfApi, 'ornek:pg', bytes(10), 'ornek')).rejects.toBeInstanceOf(PdfSampleNoWrite);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the bytes always go over driveXhr with progress (media and resumable)', async () => {
    answer();
    xhrMock.mockImplementation(async (_url, _init, p) => { p?.(4); return json({ id: 'f', modifiedTime: 't9', headRevisionId: 'r9' }); });
    const ilerleme = vi.fn();
    await uploadPdf(drivePdfApi, 'f', bytes(10), 't1', { ilerleme });
    expect(xhrMock.mock.calls.map(([u, i]) => `${i?.method} ${u}`)).toEqual([
      'PATCH https://www.googleapis.com/upload/drive/v3/files/f?uploadType=media&fields=id,modifiedTime,headRevisionId'
    ]);
    expect(ilerleme).toHaveBeenCalledWith(4, 10);
    xhrMock.mockClear();
    await uploadPdf(drivePdfApi, 'f', bytes(RESUMABLE_LIMIT + 1), 't1', { ilerleme });
    expect(xhrMock.mock.calls.map(([u, i]) => `${i?.method} ${u}`)).toEqual([`PUT ${SESSION}`]);
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'PUT')).toBe(false);   // the session itself is opened with fetch
    expect(ilerleme).toHaveBeenLastCalledWith(4, RESUMABLE_LIMIT + 1);
  });
});
