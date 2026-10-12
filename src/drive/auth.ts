// Google sign-in with the GIS token client. The access token lives only in memory (never localStorage).

const SCOPE = 'https://www.googleapis.com/auth/drive';
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
    scope: SCOPE,
    callback: r => {
      const p = pending; pending = null;
      if (r.error || !r.access_token) { p?.reject(new AuthError('denied')); return; }
      token = { value: r.access_token, expiresAt: Date.now() + r.expires_in * 1000 };
      p?.resolve(r.access_token);
    },
    error_callback: e => {
      const p = pending; pending = null;
      p?.reject(new AuthError(e.type === 'popup_failed_to_open' ? 'popup-blocked' : e.type === 'popup_closed' ? 'popup-closed' : 'unknown'));
    }
  });
}

// Opens the Google popup (first time: account + permission; later usually closes by itself).
export async function signIn(): Promise<string> {
  await prepareAuth();
  pending?.reject(new AuthError('unknown'));
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    client!.requestAccessToken({ prompt: '' });
  });
}

// Token if it is still valid for at least a minute, else null.
export function currentToken(): string | null {
  return token && Date.now() < token.expiresAt - 60_000 ? token.value : null;
}

export const isSignedIn = () => token !== null;

export function signOut(): void {
  const t = token?.value;
  token = null;
  if (t && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(t);
}

// The token was rejected by Drive (expired early): forget it.
export function dropToken(): void {
  token = null;
}
