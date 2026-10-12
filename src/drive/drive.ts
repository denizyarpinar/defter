import { currentToken, dropToken, signIn } from './auth';

// Drive REST API v3 with fetch. Every request goes through driveFetch.

const API = 'https://www.googleapis.com/drive/v3/';

// Thrown when a new token could not be obtained: the app shows the sign-in card again.
export class SessionExpired extends Error {
  constructor() { super('Oturumun süresi doldu. Devam etmek için tekrar Google ile giriş yap.'); }
}

let onExpired: () => void = () => {};
export function setSessionExpiredHandler(fn: () => void): void {
  onExpired = fn;
}

async function freshToken(): Promise<string> {
  try {
    return await signIn();
  } catch {
    dropToken();
    onExpired();
    throw new SessionExpired();
  }
}

export async function driveFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const call = (t: string) => fetch(API + path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${t}` } });
  // token older than ~1 hour → ask Google for a new one before the request
  let res = await call(currentToken() ?? await freshToken());
  if (res.status === 401) {
    dropToken();
    res = await call(await freshToken());
    if (res.status === 401) { onExpired(); throw new SessionExpired(); }
  }
  return res;
}

// Name of the signed-in user (no extra permission needed).
export async function getUserName(): Promise<string> {
  const res = await driveFetch('about?fields=user(displayName,emailAddress)');
  if (res.status === 403) throw new Error('Drive erişimi reddedildi. Google Drive API projede açık olmayabilir: Google Cloud → APIs & Services → Library → Google Drive API → Enable.');
  if (!res.ok) throw new Error(`Drive'dan bilgi alınamadı (hata ${res.status}). Biraz sonra tekrar dene.`);
  const j = await res.json() as { user?: { displayName?: string; emailAddress?: string } };
  return j.user?.displayName || j.user?.emailAddress || 'Google hesabı';
}
