import { beforeEach, describe, expect, it, vi } from 'vitest';
import { driveFetch } from './drive';
import {
  drivePdfApi, ensureOriginalKept, PdfConflict, PdfReadOnly, PdfSampleNoWrite, PdfUploadSession,
  RESUMABLE_LIMIT, uploadPdf, type PdfDrive, type Revision
} from './pdfYazici';

vi.mock('./drive', async importOriginal => ({
  ...await importOriginal<typeof import('./drive')>(),
  driveFetch: vi.fn()
}));

// A fake Drive with one PDF; every call is logged.
function fakeDrive(opts: { canEdit?: boolean; pages?: Revision[][] } = {}) {
  const file = { modifiedTime: 't1', head: 'r1' };
  const pages = opts.pages ?? [[{ id: 'r1', keepForever: false }]];
  const log: string[] = [];
  const hooks = { afterKeep: null as null | (() => void) };
  const drive: PdfDrive = {
    async canEdit() { log.push('canEdit'); return opts.canEdit ?? true; },
    async listRevisions(_id, token) {
      log.push(`listRevisions:${token ?? '-'}`);
      const i = token ? Number(token) : 0;
      return { revisions: pages[i], nextPageToken: i + 1 < pages.length ? String(i + 1) : undefined };
    },
    async headRevisionId() { log.push('headRevisionId'); return file.head; },
    async keepRevision(_id, rev) { log.push(`keep:${rev}`); hooks.afterKeep?.(); },
    async modifiedTime() { log.push('modifiedTime'); return file.modifiedTime; },
    async uploadMedia(id) { log.push('uploadMedia'); return { id, modifiedTime: 't9', headRevisionId: 'r9' }; },
    async uploadResumable(id) { log.push('uploadResumable'); return { id, modifiedTime: 't9', headRevisionId: 'r9' }; }
  };
  return { drive, file, log, hooks };
}

const bytes = (n: number) => new Uint8Array(n);
const uploads = (log: string[]) => log.filter(l => l.startsWith('upload'));

describe('ensureOriginalKept', () => {
  it('marks the head revision when nothing is kept', async () => {
    const { drive, log } = fakeDrive();
    await ensureOriginalKept(drive, 'f');
    expect(log).toEqual(['listRevisions:-', 'headRevisionId', 'keep:r1']);
  });

  it('does nothing when a revision is already kept (can be called again)', async () => {
    const { drive, log } = fakeDrive({ pages: [[{ id: 'r0', keepForever: true }, { id: 'r1' }]] });
    await ensureOriginalKept(drive, 'f');
    await ensureOriginalKept(drive, 'f');
    expect(log.filter(l => l.startsWith('keep'))).toEqual([]);
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
});

describe('uploadPdf', () => {
  it('runs the steps in order and returns the new version', async () => {
    const { drive, log } = fakeDrive();
    const r = await uploadPdf(drive, 'f', bytes(10), 't1');
    expect(log).toEqual(['canEdit', 'modifiedTime', 'headRevisionId', 'listRevisions:-', 'headRevisionId', 'keep:r1', 'headRevisionId', 'uploadMedia']);
    expect(r).toEqual({ id: 'f', modifiedTime: 't9', headRevisionId: 'r9' });
  });

  it('canEdit false: no backup, no write', async () => {
    const { drive, log } = fakeDrive({ canEdit: false });
    await expect(uploadPdf(drive, 'f', bytes(10), 't1')).rejects.toBeInstanceOf(PdfReadOnly);
    expect(log).toEqual(['canEdit']);
  });

  it('modifiedTime differs: PdfConflict, no backup, no PATCH', async () => {
    const { drive, log } = fakeDrive();
    await expect(uploadPdf(drive, 'f', bytes(10), 't0')).rejects.toBeInstanceOf(PdfConflict);
    expect(log).toEqual(['canEdit', 'modifiedTime']);
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
    await uploadPdf(b.drive, 'f', bytes(RESUMABLE_LIMIT + 1), 't1');
    expect(uploads(b.log)).toEqual(['uploadResumable']);
  });

  it('sample library: error before any request', async () => {
    const { drive, log } = fakeDrive();
    await expect(uploadPdf(drive, 'ornek:pg#demo/demo-slayt.pdf', bytes(10), 'ornek')).rejects.toBeInstanceOf(PdfSampleNoWrite);
    expect(log).toEqual([]);
  });
});

// The real drivePdfApi with a fake driveFetch: which requests would go to Drive.
describe('drivePdfApi requests', () => {
  const fetchMock = vi.mocked(driveFetch);
  const calls = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url}`);
  const json = (body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', ...headers } });

  // answers like Drive, for one file "f" (head r1, nothing kept)
  function answer(opts: { location?: string | null } = {}) {
    fetchMock.mockImplementation(async (url, init) => {
      const u = String(url);
      const m = init?.method ?? 'GET';
      if (m === 'GET' && u.includes('capabilities')) return json({ capabilities: { canEdit: true } });
      if (m === 'GET' && u.includes('/revisions?')) return json({ revisions: [{ id: 'r1', keepForever: false }] });
      if (m === 'GET' && u.includes('headRevisionId')) return json({ headRevisionId: 'r1' });
      if (m === 'GET' && u.includes('modifiedTime')) return json({ modifiedTime: 't1' });
      if (m === 'PATCH' && u.includes('/revisions/')) return json({ id: 'r1' });
      if (m === 'PATCH' && u.includes('uploadType=resumable')) {
        return json({}, opts.location === null ? {} : { Location: opts.location ?? 'https://www.googleapis.com/upload/drive/v3/files/f?upload_id=abc' });
      }
      if ((m === 'PATCH' && u.includes('uploadType=media')) || m === 'PUT') return json({ id: 'f', modifiedTime: 't9', headRevisionId: 'r9' });
      throw new Error(`unexpected request ${m} ${u}`);
    });
  }

  beforeEach(() => { fetchMock.mockReset(); });   // braces: a returned function would run as teardown

  it('small file: only GET and PATCH on the same id, never POST', async () => {
    answer();
    const r = await uploadPdf(drivePdfApi, 'f', bytes(10), 't1');
    expect(r).toEqual({ id: 'f', modifiedTime: 't9', headRevisionId: 'r9' });
    expect(calls()).toEqual([
      'GET files/f?fields=capabilities/canEdit',
      'GET files/f?fields=modifiedTime',
      'GET files/f?fields=headRevisionId',
      'GET files/f/revisions?fields=nextPageToken%2Crevisions%28id%2CkeepForever%29',
      'GET files/f?fields=headRevisionId',
      'PATCH files/f/revisions/r1?fields=id',
      'GET files/f?fields=headRevisionId',
      'PATCH https://www.googleapis.com/upload/drive/v3/files/f?uploadType=media&fields=id,modifiedTime,headRevisionId'
    ]);
    expect(fetchMock.mock.calls[5][1]?.body).toBe('{"keepForever":true}');
    expect(new Headers(fetchMock.mock.calls[7][1]?.headers).get('Content-Type')).toBe('application/pdf');
  });

  it('big file: resumable session on the same id, bytes sent with PUT, never POST', async () => {
    answer();
    await uploadPdf(drivePdfApi, 'f', bytes(RESUMABLE_LIMIT + 1), 't1');
    expect(calls().slice(-2)).toEqual([
      'PATCH https://www.googleapis.com/upload/drive/v3/files/f?uploadType=resumable&fields=id,modifiedTime,headRevisionId',
      'PUT https://www.googleapis.com/upload/drive/v3/files/f?upload_id=abc'
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
});
