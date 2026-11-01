import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KAPSAM_DAR, KAPSAM_TAM } from './kapsam';

const NOW = 1_800_000_000_000;
const KEY = 'defter-oturum';
const saved = (scope = KAPSAM_DAR) => ({ value: 'fake-unit-session', expiresAt: NOW + 3_600_000, aktif: scope === KAPSAM_TAM ? 'tam' : 'dar', scopes: [scope] });
let data: Map<string, string>;
let getItem: ReturnType<typeof vi.fn>;
let setItem: ReturnType<typeof vi.fn>;
let removeItem: ReturnType<typeof vi.fn>;
let localWrite: ReturnType<typeof vi.fn>;
let config: google.accounts.oauth2.TokenClientConfig;
let request: ReturnType<typeof vi.fn>;
let rejectGis: 'denied' | 'error' | null;
let tokenScope: string;

async function auth(search = '') {
  vi.stubGlobal('location', { search });
  vi.resetModules();
  return import('./auth');
}
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'fake-unit-client');
  data = new Map();
  getItem = vi.fn((k: string) => data.get(k) ?? null);
  setItem = vi.fn((k: string, v: string) => { data.set(k, v); });
  removeItem = vi.fn((k: string) => { data.delete(k); });
  vi.stubGlobal('sessionStorage', { getItem, setItem, removeItem });
  localWrite = vi.fn();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: localWrite, removeItem: vi.fn() });
  rejectGis = null;
  tokenScope = KAPSAM_DAR;
  request = vi.fn(() => {
    if (rejectGis === 'error') config.error_callback?.({ type: 'popup_closed', message: 'fake-unit-error' });
    else config.callback({ access_token: rejectGis === 'denied' ? '' : 'fake-unit-session', expires_in: 3600, scope: tokenScope, ...(rejectGis ? { error: 'access_denied' } : {}) });
  });
  const googleMock = { accounts: { oauth2: {
    initTokenClient: (c: google.accounts.oauth2.TokenClientConfig) => { config = c; return { requestAccessToken: request }; },
    hasGrantedAllScopes: (r: google.accounts.oauth2.TokenResponse, s: string) => r.scope.split(' ').includes(s),
    revoke: vi.fn(),
  } } };
  vi.stubGlobal('google', googleMock);
  vi.stubGlobal('window', { google: googleMock, dispatchEvent: vi.fn() });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('auth session storage integration', () => {
  it('does not restore at import; restores only on explicit startup, without GIS or localStorage writes', async () => {
    data.set(KEY, JSON.stringify(saved(KAPSAM_TAM)));
    const a = await auth();
    expect(getItem).not.toHaveBeenCalled();
    expect(a.currentToken()).toBeNull();
    expect(a.oturumGeriYukle()).toBe(true);
    expect(a.currentToken()).toBe('fake-unit-session');
    expect(a.isSignedIn()).toBe(true);
    expect(a.aktifKapsam()).toBe('tam');
    expect(a.kapsamDurumu().scopes).toEqual([KAPSAM_TAM]);
    expect(request).not.toHaveBeenCalled();
    expect(localWrite).not.toHaveBeenCalled();
  });
  it('successful signIn saves the token and its actual permissions; a module reload restores them', async () => {
    let a = await auth();
    await a.signIn();
    expect(JSON.parse(data.get(KEY)!)).toEqual(saved());
    a = await auth();
    expect(a.oturumGeriYukle()).toBe(true);
    expect(a.aktifKapsam()).toBe('dar');
    expect(localWrite).not.toHaveBeenCalled();
  });
  it.each(['signOut', 'dropToken'] as const)('%s clears memory and storage', async method => {
    const a = await auth();
    await a.signIn();
    a[method]();
    expect(data.has(KEY)).toBe(false);
    expect(a.currentToken()).toBeNull();
    expect(a.isSignedIn()).toBe(false);
  });
  it.each(['denied', 'error'] as const)('?yenile=0: GIS %s removes the stored session', async failure => {
    const a = await auth('?yenile=0');
    await a.signIn();
    rejectGis = failure;
    await expect(a.signIn()).rejects.toHaveProperty('code', failure === 'denied' ? 'denied' : 'popup-closed');
    expect(data.has(KEY)).toBe(false);
  });
  it.each(['{broken', JSON.stringify({ ...saved(), expiresAt: NOW + 60_000 })])('invalid/expiring restoration removes its record', async raw => {
    data.set(KEY, raw);
    const a = await auth();
    expect(a.oturumGeriYukle()).toBe(false);
    expect(data.has(KEY)).toBe(false);
    expect(a.currentToken()).toBeNull();
  });
  it('currentToken removes an expiring session instead of returning a token with less than a minute left', async () => {
    const a = await auth();
    await a.signIn();
    vi.mocked(Date.now).mockReturnValue(NOW + 3_540_000);
    expect(a.currentToken()).toBeNull();
    expect(data.has(KEY)).toBe(false);
  });
  it('query rollback neither reads nor writes session storage, including on signOut/dropToken', async () => {
    data.set(KEY, JSON.stringify(saved()));
    const a = await auth('?tokenSakla=0');
    expect(a.oturumGeriYukle()).toBe(false);
    await a.signIn();
    vi.mocked(Date.now).mockReturnValue(NOW + 3_540_000);
    expect(a.currentToken()).toBeNull();
    expect(a.isSignedIn()).toBe(true); // Existing in-memory expiry behavior is unchanged when storage is disabled.
    a.dropToken(); a.signOut();
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(localWrite).not.toHaveBeenCalled();
  });
  it('blocked storage preserves an ordinary in-memory signIn/signOut', async () => {
    vi.stubGlobal('sessionStorage', undefined);
    const a = await auth();
    expect(a.oturumGeriYukle()).toBe(false);
    await a.signIn();
    expect(a.currentToken()).toBe('fake-unit-session');
    expect(() => a.signOut()).not.toThrow();
  });
  it('restored narrow forcing still excludes previously granted permissions during renewal', async () => {
    data.set(KEY, JSON.stringify(saved()));
    const a = await auth('?kapsam=dar');
    a.oturumGeriYukle();
    a.dropToken();
    await a.signIn({ neden: 'freshToken' });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ scope: KAPSAM_DAR, include_granted_scopes: false }));
  });
  it('?yenile=0: a restored 401 follows the legacy retry and invokes expiry on failure', async () => {
    data.set(KEY, JSON.stringify(saved()));
    const a = await auth('?yenile=0');
    a.oturumGeriYukle();
    rejectGis = 'denied';
    const expired = vi.fn();
    const d = await import('./drive');
    d.setSessionExpiredHandler(expired);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(d.getUser()).rejects.toBeInstanceOf(d.SessionExpired);
    expect(data.has(KEY)).toBe(false);
    expect(expired).toHaveBeenCalledOnce();
  });
  it('diagnostic token events survive reload without storing the fake token in the log', async () => {
    const a = await auth('?olcum=1');
    await a.signIn();
    a.oturumGeriYukle();
    a.dropToken();
    const log = JSON.parse(data.get('defter-auth-gunluk')!);
    expect(log.map((e: { olay: string }) => e.olay)).toEqual(expect.arrayContaining(['token.store', 'token.restore', 'token.clear']));
    expect(JSON.stringify(log)).not.toContain('fake-unit-session');
  });
});
