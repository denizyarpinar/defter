// Google sign-in with the GIS token client. The access token lives only in memory (never localStorage).
// Task 6.K1: the permission (drive.file or full drive) is chosen per request (kapsam.ts); the token's own
// scope list decides the active mode, kept here in one place.

import { KAPSAM_DAR, KAPSAM_TAM, kapsamOku, type AktifKapsam } from './kapsam';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

export type AuthErrorCode = 'no-client-id' | 'load-failed' | 'popup-blocked' | 'popup-closed' | 'denied' | 'unknown';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode) {
    super(authErrorMessage(code));
    this.code = code;
  }
}

// Turkish message that tells the user what to do.
export function authErrorMessage(code: AuthErrorCode): string {
  switch (code) {
    case 'no-client-id':
      return 'Google Client ID eksik. .env.local dosyasına VITE_GOOGLE_CLIENT_ID ekle, sonra npm run dev\'i yeniden başlat.';
    case 'load-failed':
      return 'Google giriş servisi yüklenemedi. İnternet bağlantını kontrol et ve sayfayı yenile.';
    case 'popup-blocked':
      return 'Tarayıcı Google penceresini engelledi. Adres çubuğundan bu siteye açılır pencere izni ver ve tekrar dene.';
    case 'popup-closed':
    case 'denied':
      return 'Giriş tamamlanmadı, izin verilmedi. Google "erişim engellendi" dediyse hesabın test kullanıcısı değildir: '
        + 'Google Cloud → OAuth izin ekranı → Test users bölümüne hesabını ekle.';
    default:
      return 'Google ile giriş sırasında bir sorun oldu. Biraz sonra tekrar dene.';
  }
}

let client: google.accounts.oauth2.TokenClient | null = null;
let token: { value: string; expiresAt: number } | null = null;
let pending: { resolve: (t: string) => void; reject: (e: AuthError) => void } | null = null;
let gisLoading: Promise<void> | null = null;

// what the current token allows; what was asked last; whether earlier grants are included (?kapsam=dar: no)
let aktif: AktifKapsam | null = null;
let scopes: string[] = [];
let istenen: AktifKapsam = 'dar';
let dahilEt = true;
let sahip: boolean | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisLoading = null; reject(new AuthError('load-failed')); };
    document.head.appendChild(s);
  });
  return gisLoading;
}

// Load the GIS script early so the sign-in popup opens right on the click (popup blockers).
export async function prepareAuth(): Promise<void> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) throw new AuthError('no-client-id');
  await loadGis();
  client ??= google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: KAPSAM_DAR,   // each request overrides it
    callback: r => {
      const p = pending; pending = null;
      const k = r.access_token ? (google.accounts.oauth2.hasGrantedAllScopes(r, KAPSAM_TAM) ? 'tam' : kapsamOku(r.scope)) : null;
      if (r.error || !r.access_token || !k) { p?.reject(new AuthError('denied')); return; }
      token = { value: r.access_token, expiresAt: Date.now() + r.expires_in * 1000 };
      aktif = k;
      scopes = (r.scope ?? '').split(/\s+/).filter(Boolean);
      p?.resolve(r.access_token);
    },
    error_callback: e => {
      const p = pending; pending = null;
      p?.reject(new AuthError(e.type === 'popup_failed_to_open' ? 'popup-blocked' : e.type === 'popup_closed' ? 'popup-closed' : 'unknown'));
    }
  });
}

// Opens the Google popup (first time: account + permission; later usually closes by itself).
// hint: e-mail of the remembered account; chooseAccount: show Google's account list.
// kapsam: the permission to ask for; without it the active one (a new token never silently drops to drive.file).
// includeGranted: false only with ?kapsam=dar; kept for the later requests (token renewal) too.
export async function signIn(opts: { hint?: string; chooseAccount?: boolean; kapsam?: AktifKapsam; includeGranted?: boolean } = {}): Promise<string> {
  await prepareAuth();
  pending?.reject(new AuthError('unknown'));
  istenen = opts.kapsam ?? aktif ?? istenen;
  if (opts.includeGranted !== undefined) dahilEt = opts.includeGranted;
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    client!.requestAccessToken({
      prompt: opts.chooseAccount ? 'select_account' : '',
      ...(opts.hint ? { login_hint: opts.hint } : {}),
      scope: istenen === 'tam' ? KAPSAM_TAM : KAPSAM_DAR,
      include_granted_scopes: dahilEt
    });
  });
}

export const aktifKapsam = (): AktifKapsam | null => aktif;

// set after about.get: the signed-in account is the owner (VITE_SAHIP_EPOSTA, ?sahip=0 → false)
export function setSahip(s: boolean | null): void {
  sahip = s;
}

// For the ?olcum=1 box
export const kapsamDurumu = (): { aktif: AktifKapsam | null; scopes: string[]; sahip: boolean | null; dahilEt: boolean } =>
  ({ aktif, scopes: [...scopes], sahip, dahilEt });

// "Signed in before" (name + e-mail only, never the token) so a reload can offer one-tap "continue".
export interface RememberedUser { name: string; email: string }
const REMEMBER_KEY = 'defter.giris';

export function rememberUser(u: RememberedUser | null): void {
  try {
    if (u) localStorage.setItem(REMEMBER_KEY, JSON.stringify(u));
    else localStorage.removeItem(REMEMBER_KEY);
  } catch { /* storage blocked: just no one-tap */ }
}

export function rememberedUser(): RememberedUser | null {
  try {
    const u = JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? 'null') as Partial<RememberedUser> | null;
    return u && typeof u.name === 'string' && typeof u.email === 'string' ? { name: u.name, email: u.email } : null;
  } catch { return null; }
}

// Token if it is still valid for at least a minute, else null.
export function currentToken(): string | null {
  return token && Date.now() < token.expiresAt - 60_000 ? token.value : null;
}

export const isSignedIn = () => token !== null;

export function signOut(): void {
  const t = token?.value;
  token = null;
  aktif = null; scopes = []; istenen = 'dar'; sahip = null;
  if (t && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(t);
}

// The token was rejected by Drive (expired early): forget it.
export function dropToken(): void {
  token = null;
}
