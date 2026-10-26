import { t } from '../dil';
import { isSampleId } from '../okuma/ornekKaynak';
import { driveFetch, driveXhr, ok } from './drive';

// Writes a PDF back to Drive (Faz 4, task 4.2). Nothing calls this yet.
// - Always the same file id (PATCH upload). There is no way to create a file here: PdfDrive has no create.
// - Backup: before the first write, the head revision gets keepForever=true (ensureOriginalKept).
//   Binary revisions are normally deleted after ~30 days; kept ones stay (Drive allows 200 per file).
// - Order: sample id → canEdit → modifiedTime (= expected?) → headRevisionId → keep original
//   → headRevisionId again (same?) → upload. keepForever may change modifiedTime, so after it
//   the head revision tells whether the content changed.
// - Conflict: PdfConflict; re-applying the strokes on the newer file is the caller's job.
// Task 6.2e-2: canEdit + modifiedTime + headRevisionId in one request (durum). The backup step (listRevisions,
//   keepForever, head again) only until the file is known to have a kept revision (this session).
//   Uploads go over XMLHttpRequest with progress; an interrupted resumable upload asks Drive
//   how far it got and sends the rest (devamliGonder). Always on since task 6.2e-3.

export const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/';
export const RESUMABLE_LIMIT = 5 * 1024 * 1024;   // bigger → resumable upload, else media

export interface Revision { id: string; keepForever?: boolean }
export interface RevisionPage { revisions: Revision[]; nextPageToken?: string }
export interface UploadResult { id: string; modifiedTime: string; headRevisionId: string }
export interface DosyaDurumu { canEdit: boolean; modifiedTime: string; headRevisionId: string; trashed?: boolean }   // trashed: task 6.K6b

// What the caller hears about an upload (only the photo adding listens, task 6.2e-2)
export interface YuklemeDinleyici {
  basladi?(): void;                                     // the bytes start to go (after the checks)
  ilerleme?(gonderilen: number, toplam: number): void;
}

export interface YuklemeSecenek extends YuklemeDinleyici {
  // before sending the rest of an interrupted upload: throws when the file changed meanwhile
  devamOncesi?(): Promise<void>;
}

export interface PdfDrive {
  durum(fileId: string): Promise<DosyaDurumu>;
  listRevisions(fileId: string, pageToken?: string): Promise<RevisionPage>;
  headRevisionId(fileId: string): Promise<string>;
  keepRevision(fileId: string, revisionId: string): Promise<void>;
  modifiedTime(fileId: string): Promise<string>;
  uploadMedia(fileId: string, bytes: Uint8Array, s?: YuklemeSecenek): Promise<UploadResult>;
  uploadResumable(fileId: string, bytes: Uint8Array, s?: YuklemeSecenek): Promise<UploadResult>;
}

export class PdfSampleNoWrite extends Error {
  constructor() { super(t('pdfYaz.ornek')); }
}

export class PdfReadOnly extends Error {
  constructor() { super(t('pdfYaz.izinYok')); }
}

export class PdfConflict extends Error {
  constructor() { super(t('pdfYaz.cakisma')); }
}

// Task 6.K6b: the file is in Drive's trash (or in a folder there): nothing is written, a pen record stays on the device
export class PdfCopte extends Error {
  constructor() { super(t('pdfYaz.copte')); }
}

export class PdfUploadSession extends Error {
  constructor() { super(t('pdfYaz.oturum')); }
}

// The resumable session is gone (404/410): like a network error, the caller starts again from the checks
export class YuklemeOturumuDustu extends TypeError {
  constructor() { super(t('pdfYaz.oturumDustu')); }
}

const what = () => t('pdfYaz.kaydedilirken');
const fileUrl = (fileId: string) => `files/${encodeURIComponent(fileId)}`;
const uploadUrl = (fileId: string, type: 'media' | 'resumable') =>
  `${UPLOAD}files/${encodeURIComponent(fileId)}?uploadType=${type}&fields=id,modifiedTime,headRevisionId`;
const pdfBody = (bytes: Uint8Array) => new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });

export async function readResult(res: Response): Promise<UploadResult> {
  const j = await res.json() as Partial<UploadResult>;
  return { id: j.id ?? '', modifiedTime: j.modifiedTime ?? '', headRevisionId: j.headRevisionId ?? '' };
}

// multipart/related body: JSON metadata + the PDF bytes (task 5.5, new files).
export function multipartPdfBody(meta: object, bytes: Uint8Array): { body: Blob; contentType: string } {
  const boundary = 'defter' + Math.random().toString(36).slice(2);
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    bytes as Uint8Array<ArrayBuffer>,
    `\r\n--${boundary}--`
  ]);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

// How the bytes go: driveXhr with progress (tests: a mock)
export type Gonderici = (url: string, init: RequestInit, ilerleme?: (gonderilen: number) => void) => Promise<Response>;

export interface DevamliGonderim extends YuklemeSecenek {
  gonder: Gonderici;
  bekle?(ms: number): Promise<void>;   // tests
}

export const DEVAM_BEKLEME = [2000, 4000, 8000];   // an interrupted upload: at most 3 resumes, after these waits

// The first byte Drive doesn't have yet, from its 308 answer ("Range: bytes=0-1234"); no Range: 0
export function devamBaslangici(range: string | null): number {
  const m = /^bytes=0-(\d+)$/.exec(range?.trim() ?? '');
  return m ? Number(m[1]) + 1 : 0;
}

const bekleMs = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Sends bytes to an open resumable session. Interrupted (network error): first ask Drive how far it got
// (Content-Range: bytes */N). 200/201: the upload had finished, only its answer was lost → done
// (devamOncesi is not asked: our own upload changed modifiedTime). 308: devamOncesi (the file unchanged?),
// then the rest from where Drive stopped. 404/410: YuklemeOturumuDustu. Other answers: check's error.
export async function devamliGonder(
  session: string, bytes: Uint8Array, check: (res: Response) => Promise<Response>, d: DevamliGonderim
): Promise<UploadResult> {
  const toplam = bytes.byteLength;
  const bekle = d.bekle ?? bekleMs;
  let bas = 0, devam = 0;
  for (;;) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/pdf' };
      if (devam) headers['Content-Range'] = bas < toplam ? `bytes ${bas}-${toplam - 1}/${toplam}` : `bytes */${toplam}`;
      const from = bas;
      const res = await d.gonder(session, { method: 'PUT', headers, body: pdfBody(bytes.subarray(bas)) },
        d.ilerleme && (n => d.ilerleme!(Math.min(toplam, from + n), toplam)));
      return readResult(await check(res));
    } catch (e) {
      if (!(e instanceof TypeError) || e instanceof YuklemeOturumuDustu) throw e;
      // ask how far it got; a failing question uses up a resume too
      for (;;) {
        if (devam >= DEVAM_BEKLEME.length) throw e;
        await bekle(DEVAM_BEKLEME[devam++]);
        let s: Response;
        try {
          s = await d.gonder(session, { method: 'PUT', headers: { 'Content-Range': `bytes */${toplam}` } });
        } catch (e2) {
          if (e2 instanceof TypeError) continue;
          throw e2;
        }
        if (s.status === 200 || s.status === 201) return readResult(s);   // done, its answer had been lost
        if (s.status === 404 || s.status === 410) throw new YuklemeOturumuDustu();
        if (s.status !== 308) await check(s);   // throws (DriveError)
        await d.devamOncesi?.();
        bas = devamBaslangici(s.headers.get('Range'));
        break;
      }
    }
  }
}

// Resumable upload: 1) open a session (PATCH on an existing file, POST for a new one), 2) send the bytes to it.
// check: how an answer is judged (default: any error → DriveError).
// devam (task 6.2e-2): progress and resuming (devamliGonder); without it one PUT with fetch (new files, pdfOlustur).
export async function resumableUpload(
  startUrl: string, method: 'PATCH' | 'POST', meta: string, bytes: Uint8Array,
  check: (res: Response) => Promise<Response> = res => ok(res, what()), devam?: DevamliGonderim
): Promise<UploadResult> {
  const start = await check(await driveFetch(startUrl, {
    method,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/pdf',
      'X-Upload-Content-Length': String(bytes.byteLength)
    },
    body: meta
  }));
  const session = start.headers.get('Location');
  if (!session || !session.startsWith('https://')) throw new PdfUploadSession();   // never fall back to media silently
  if (devam) return devamliGonder(session, bytes, check, devam);
  const res = await check(await driveFetch(session, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: pdfBody(bytes)
  }));
  return readResult(res);
}

export const drivePdfApi: PdfDrive = {
  async durum(fileId) {
    const res = await ok(await driveFetch(`${fileUrl(fileId)}?fields=capabilities/canEdit,modifiedTime,headRevisionId,trashed`), what());
    const j = await res.json() as { capabilities?: { canEdit?: boolean }; modifiedTime?: string; headRevisionId?: string; trashed?: boolean };
    return { canEdit: j.capabilities?.canEdit === true, modifiedTime: j.modifiedTime ?? '', headRevisionId: j.headRevisionId ?? '', trashed: j.trashed === true };
  },
  async listRevisions(fileId, pageToken) {
    const params = new URLSearchParams({ fields: 'nextPageToken,revisions(id,keepForever)' });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await ok(await driveFetch(`${fileUrl(fileId)}/revisions?${params}`), what());
    const j = await res.json() as { revisions?: Revision[]; nextPageToken?: string };
    return { revisions: j.revisions ?? [], nextPageToken: j.nextPageToken };
  },
  async headRevisionId(fileId) {
    const res = await ok(await driveFetch(`${fileUrl(fileId)}?fields=headRevisionId`), what());
    return (await res.json() as { headRevisionId?: string }).headRevisionId ?? '';
  },
  async keepRevision(fileId, revisionId) {
    await ok(await driveFetch(`${fileUrl(fileId)}/revisions/${encodeURIComponent(revisionId)}?fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ keepForever: true })
    }), what());
  },
  async modifiedTime(fileId) {
    const res = await ok(await driveFetch(`${fileUrl(fileId)}?fields=modifiedTime`), what());
    return (await res.json() as { modifiedTime?: string }).modifiedTime ?? '';
  },
  async uploadMedia(fileId, bytes, s = {}) {
    const init: RequestInit = { method: 'PATCH', headers: { 'Content-Type': 'application/pdf' }, body: pdfBody(bytes) };
    const ilerleme = s.ilerleme;
    const res = await ok(await driveXhr(uploadUrl(fileId, 'media'), init,
      ilerleme && (n => ilerleme(Math.min(n, bytes.byteLength), bytes.byteLength))), what());
    return readResult(res);
  },
  uploadResumable(fileId, bytes, s = {}) {
    // session on the existing file (PATCH, not POST: no new file)
    return resumableUpload(uploadUrl(fileId, 'resumable'), 'PATCH', '{}', bytes, undefined, { ...s, gonder: driveXhr });
  }
};

// Task 6.2e-2: files known to have a kept revision (this session; a reload forgets)
const yedegiOlanlar = new Set<string>();
export function yedekBelleginiSifirla(): void { yedegiOlanlar.clear(); }

// Marks the head revision keepForever, unless some revision is already kept. Safe to call again.
// head: the head revision the caller has just read (no extra request)
export async function ensureOriginalKept(drive: PdfDrive, fileId: string, head?: string): Promise<void> {
  if (yedegiOlanlar.has(fileId)) return;
  let pageToken: string | undefined;
  do {
    const page = await drive.listRevisions(fileId, pageToken);
    if (page.revisions.some(r => r.keepForever === true)) { yedegiOlanlar.add(fileId); return; }
    pageToken = page.nextPageToken;
  } while (pageToken);
  await drive.keepRevision(fileId, head ?? await drive.headRevisionId(fileId));
  yedegiOlanlar.add(fileId);
}

// Replaces the PDF with id fileId by bytes, only if it is still the version we read (expectedModifiedTime).
// The last check before the bytes go is one durum request (canEdit, modifiedTime, headRevisionId).
export async function uploadPdf(
  drive: PdfDrive, fileId: string, bytes: Uint8Array, expectedModifiedTime: string, dinleyici: YuklemeDinleyici = {}
): Promise<UploadResult> {
  if (isSampleId(fileId)) throw new PdfSampleNoWrite();   // sample library: no request at all
  const d = await drive.durum(fileId);
  if (d.trashed) throw new PdfCopte();   // task 6.K6b: never into a file in the trash
  if (!d.canEdit) throw new PdfReadOnly();
  if (d.modifiedTime !== expectedModifiedTime) throw new PdfConflict();
  const head = d.headRevisionId;
  let mt = d.modifiedTime;
  if (!yedegiOlanlar.has(fileId)) {
    await ensureOriginalKept(drive, fileId, head);
    // keepForever may change modifiedTime: the head revision tells whether the content changed
    const sonra = await drive.durum(fileId);
    if (sonra.headRevisionId !== head) throw new PdfConflict();   // content changed meanwhile
    mt = sonra.modifiedTime;
  }
  // an interrupted upload goes on only on the same version
  const devamOncesi = async () => {
    const x = await drive.durum(fileId);
    if (!x.canEdit) throw new PdfReadOnly();
    if (x.modifiedTime !== mt || x.headRevisionId !== head) throw new PdfConflict();
  };
  dinleyici.basladi?.();
  return bytes.byteLength > RESUMABLE_LIMIT
    ? drive.uploadResumable(fileId, bytes, { ilerleme: dinleyici.ilerleme, devamOncesi })
    : drive.uploadMedia(fileId, bytes, { ilerleme: dinleyici.ilerleme });
}
