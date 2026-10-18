import { currentToken, dropToken, signIn } from './auth';

// Drive REST API v3 with fetch. Every request goes through driveFetch.

const API = 'https://www.googleapis.com/drive/v3/';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Thrown when a new token could not be obtained: the app shows the sign-in card again.
export class SessionExpired extends Error {
  constructor() { super('Oturumun süresi doldu. Devam etmek için tekrar Google ile giriş yap.'); }
}

let onExpired: () => void = () => {};
export function setSessionExpiredHandler(fn: () => void): void {
  onExpired = fn;
}

let hint: string | undefined;
export function setAccountHint(email: string | undefined): void {
  hint = email;
}

async function freshToken(): Promise<string> {
  try {
    return await signIn({ hint });
  } catch {
    dropToken();
    onExpired();
    throw new SessionExpired();
  }
}

// path: relative to the Drive API, or a full URL (uploads).
export async function driveFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return authorized(path, init, (url, i) => fetch(url, i));
}

// Task 6.2e-2: the same as driveFetch, over XMLHttpRequest: its upload reports progress (fetch in Safari doesn't).
// ilerleme: bytes of the body sent so far. A network error rejects with a TypeError, like fetch.
export async function driveXhr(path: string, init: RequestInit = {}, ilerleme?: (gonderilen: number) => void): Promise<Response> {
  return authorized(path, init, (url, i) => xhrFetch(url, i, ilerleme));
}

async function authorized(path: string, init: RequestInit, send: (url: string, init: RequestInit) => Promise<Response>): Promise<Response> {
  const url = path.startsWith('https://') ? path : API + path;
  const call = (t: string) => send(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${t}` } });
  // token older than ~1 hour → ask Google for a new one before the request
  let res = await call(currentToken() ?? await freshToken());
  if (res.status === 401) {
    dropToken();
    res = await call(await freshToken());
    if (res.status === 401) { onExpired(); throw new SessionExpired(); }
  }
  return res;
}

const NULL_BODY = new Set([101, 204, 205, 304]);

function xhrFetch(url: string, init: RequestInit, ilerleme?: (gonderilen: number) => void): Promise<Response> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(init.method ?? 'GET', url);
    new Headers(init.headers).forEach((v, k) => x.setRequestHeader(k, v));
    x.responseType = 'blob';
    if (ilerleme) x.upload.onprogress = e => ilerleme(e.loaded);
    x.onload = () => {
      const headers = new Headers();
      for (const line of x.getAllResponseHeaders().trim().split(/[\r\n]+/)) {
        const i = line.indexOf(':');
        if (i > 0) headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim());
      }
      if (x.status < 200 || x.status > 599) { reject(new TypeError(`Beklenmeyen cevap (${x.status}).`)); return; }
      resolve(new Response(NULL_BODY.has(x.status) ? null : x.response as Blob, { status: x.status, headers }));
    };
    x.onerror = x.ontimeout = x.onabort = () => reject(new TypeError('Bağlantı kesildi.'));
    x.send((init.body ?? null) as XMLHttpRequestBodyInit | null);
  });
}

// Name and e-mail of the signed-in user (no extra permission needed).
export async function getUser(): Promise<{ name: string; email: string }> {
  const res = await driveFetch('about?fields=user(displayName,emailAddress)');
  if (res.status === 403) throw new Error('Drive erişimi reddedildi. Google Drive API projede açık olmayabilir: Google Cloud → APIs & Services → Library → Google Drive API → Enable.');
  if (!res.ok) throw new Error(`Drive'dan bilgi alınamadı (hata ${res.status}). Biraz sonra tekrar dene.`);
  const j = await res.json() as { user?: { displayName?: string; emailAddress?: string } };
  const email = j.user?.emailAddress ?? '';
  return { name: j.user?.displayName || email || 'Google hesabı', email };
}

// ---- files ----

// Drive answered with an error: Turkish message that says what to do.
export class DriveError extends Error {
  readonly status: number;
  constructor(status: number, what: string) {
    super(
      status === 403 ? `${what}: Drive izin vermedi. Dosyanın sahibi sen misin, Drive API açık mı? Kontrol edip tekrar dene.`
      : status === 404 ? `${what}: dosya Drive'da bulunamadı. Silinmiş ya da taşınmış olabilir; sayfayı yenile.`
      : status === 429 || status >= 500 ? `${what}: Drive şu an meşgul. Biraz bekleyip tekrar dene.`
      : `${what}: Drive hatası (${status}). Tekrar dene.`
    );
    this.status = status;
  }
}

export async function ok(res: Response, what: string): Promise<Response> {
  if (!res.ok) throw new DriveError(res.status, what);
  return res;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;   // ISO date; changes when the file content changes
}

// Value inside a Drive query string: escape \ and ' (file names like "Deniz'in notları.pdf").
export const qv = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function list(q: string, what: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ q, fields: 'nextPageToken,files(id,name,mimeType,modifiedTime)', pageSize: '1000', orderBy: 'name' });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await ok(await driveFetch('files?' + params), what);
    const j = await res.json() as { files?: DriveFile[]; nextPageToken?: string };
    out.push(...(j.files ?? []));
    pageToken = j.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

// Folders with this name directly in My Drive (not in the trash).
export function findRootFolders(name: string): Promise<DriveFile[]> {
  return list(`'root' in parents and name = '${qv(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`, 'Kitaplık klasörü aranırken');
}

// Children of a folder (not in the trash); optionally only folders or only one name.
export function listChildren(parentId: string, opts: { foldersOnly?: boolean; name?: string } = {}): Promise<DriveFile[]> {
  let q = `'${qv(parentId)}' in parents and trashed = false`;
  if (opts.foldersOnly) q += ` and mimeType = '${FOLDER_MIME}'`;
  if (opts.name) q += ` and name = '${qv(opts.name)}'`;
  return list(q, 'Klasör listelenirken');
}

// File content as JSON. Broken JSON → {} (the parser then uses default values).
export async function readJson(fileId: string, what: string): Promise<unknown> {
  const res = await ok(await driveFetch(`files/${encodeURIComponent(fileId)}?alt=media`), what);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return {}; }
}

// File content as JSON for writing back: broken JSON is an error (never write over a file we couldn't read).
export async function readJsonStrict(fileId: string, what: string): Promise<unknown> {
  const res = await ok(await driveFetch(`files/${encodeURIComponent(fileId)}?alt=media`), what);
  try { return JSON.parse(await res.text()); } catch { throw new BrokenJson(what); }
}

export class BrokenJson extends Error {
  constructor(what: string) { super(`${what}: dosyanın içi bozuk (geçerli JSON değil). Drive'da dosyayı düzelt; o zamana kadar okuma yerin kaydedilmiyor.`); }
}

// The file's version time (changes when its content changes; another device may have written it).
export async function getModifiedTime(fileId: string, what: string): Promise<string> {
  const res = await ok(await driveFetch(`files/${encodeURIComponent(fileId)}?fields=modifiedTime`), what);
  return (await res.json() as { modifiedTime?: string }).modifiedTime ?? '';
}

// Replace the content of an existing file (same id: never a second "kitap (1).json").
// keepalive: the request may finish after the page is closed (pagehide).
export async function updateJson(fileId: string, obj: unknown, what: string, keepalive = false): Promise<void> {
  await ok(await driveFetch(`${UPLOAD}files/${encodeURIComponent(fileId)}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(obj, null, 2),
    keepalive
  }), what);
}

// Create a new JSON file in a folder (only used when kitaplik.json is missing; kitap.json is never created).
export async function createJson(parentId: string, name: string, obj: unknown, what: string): Promise<string> {
  const boundary = 'defter' + Math.random().toString(36).slice(2);
  const meta = { name, parents: [parentId], mimeType: 'application/json' };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`
    + `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(obj, null, 2)}\r\n--${boundary}--`;
  const res = await ok(await driveFetch(`${UPLOAD}files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  }), what);
  return (await res.json() as { id: string }).id;
}
