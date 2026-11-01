import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BannerState } from './yenileme';
import { KAPSAM_DAR } from './kapsam';

let config: google.accounts.oauth2.TokenClientConfig;
let request: ReturnType<typeof vi.fn>;
let mode: 'success' | 'blocked' | 'denied' | 'closed' | 'hang';
let serial: number;
let store: Map<string, string>;
let auth: typeof import('./auth');
let drive: typeof import('./drive');
let expired: ReturnType<typeof vi.fn<() => void>>;
let banner: ReturnType<typeof vi.fn<(state: BannerState) => void>>;
const NOW = 1_800_000_000_000;

async function setup(search = '', restored = false) {
  vi.stubGlobal('location', { search });
  vi.resetModules();
  auth = await import('./auth'); drive = await import('./drive');
  expired = vi.fn(); banner = vi.fn();
  drive.setSessionExpiredHandler(expired); auth.setRenewalBanner(banner);
  if (restored) {
    store.set('defter-oturum', JSON.stringify({ value: 'test-restored', expiresAt: NOW + 3_600_000, aktif: 'dar', scopes: [KAPSAM_DAR] }));
    expect(auth.oturumGeriYukle()).toBe(true);
    await auth.prepareAuth();
  } else await auth.signIn();
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW); vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client');
  mode = 'success'; serial = 0; store = new Map();
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) });
  vi.stubGlobal('localStorage', { getItem: () => null });
  request = vi.fn(() => {
    if (mode === 'hang') return;
    if (mode === 'blocked' || mode === 'closed') config.error_callback?.({ type: mode === 'blocked' ? 'popup_failed_to_open' : 'popup_closed', message: '' });
    else config.callback({ access_token: mode === 'denied' ? '' : `test-token-${++serial}`, scope: KAPSAM_DAR,
      expires_in: 3600, ...(mode === 'denied' ? { error: 'access_denied' } : {}) });
  });
  const googleMock = { accounts: { oauth2: {
    initTokenClient: (value: google.accounts.oauth2.TokenClientConfig) => { config = value; return { requestAccessToken: request }; },
    hasGrantedAllScopes: () => false, revoke: vi.fn(),
  } } };
  vi.stubGlobal('google', googleMock);
  vi.stubGlobal('window', { google: googleMock, dispatchEvent: vi.fn(), addEventListener: vi.fn() });
});
afterEach(() => { auth?.signOut(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('auth / Drive renewal integration', () => {
  it('blocked silent renewal shows banner but preserves a valid restorable session, including denied retry', async () => {
    await setup('?olcum=1');
    const saved = store.get('defter-oturum');
    mode = 'blocked';
    await vi.advanceTimersByTimeAsync(3_300_000);
    expect(banner).toHaveBeenLastCalledWith('continue');
    expect(store.get('defter-oturum')).toBe(saved);
    expect(auth.currentToken()).toBe('test-token-1');
    expect(auth.oturumGeriYukle()).toBe(true);
    const { gunlukOku } = await import('./authGunlugu');
    expect(gunlukOku().filter(entry => entry.olay === 'token.restore').at(-1)?.ayrinti.sonuc).toBe('gecerli');
    mode = 'denied'; auth.oturumBandinaDokun(); await vi.advanceTimersByTimeAsync(0);
    expect(banner).toHaveBeenLastCalledWith('retry');
    expect(store.get('defter-oturum')).toBe(saved);
    expect(expired).not.toHaveBeenCalled();
  });
  it('restored session, first 401, GIS denied: banner stays, request waits, no onExpired', async () => {
    await setup('', true); mode = 'denied';
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 401 })).mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const done = vi.fn(); const waiting = drive.driveFetch('files').then(done);
    await vi.advanceTimersByTimeAsync(0);
    expect(banner).toHaveBeenLastCalledWith('continue'); expect(done).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled(); expect(auth.isSignedIn()).toBe(true);
    mode = 'success'; auth.oturumBandinaDokun();
    expect(request).toHaveBeenCalledTimes(2); // synchronous, before await
    await waiting; expect(done).toHaveBeenCalledOnce(); expect(expired).not.toHaveBeenCalled();
  });
  it('band touch reaches GIS requestAccessToken in the same synchronous click, after blocked renewal', async () => {
    await setup(); mode = 'blocked';
    const waiting = auth.tokenYenile('freshToken'); await vi.advanceTimersByTimeAsync(0);
    const calls = request.mock.calls.length;
    mode = 'success'; auth.oturumBandinaDokun();
    expect(request).toHaveBeenCalledTimes(calls + 1);
    await waiting; expect(banner).toHaveBeenLastCalledWith('hidden');
  });
  it('three waiting Drive writes resume with the same refreshed token', async () => {
    await setup('?tokenSure=120'); mode = 'blocked';
    await vi.advanceTimersByTimeAsync(80_000);
    const send = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}')); vi.stubGlobal('fetch', send);
    const writes = [1, 2, 3].map(n => drive.driveFetch(`files/test-${n}`, { method: 'PATCH', body: '{}' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(send).not.toHaveBeenCalled(); expect(request).toHaveBeenCalledTimes(2);
    mode = 'success'; auth.oturumBandinaDokun(); await Promise.all(writes);
    expect(request).toHaveBeenCalledTimes(3); expect(send).toHaveBeenCalledTimes(3);
    expect(new Set(send.mock.calls.map(([, init]) => JSON.stringify(init.headers))).size).toBe(1);
    expect(expired).not.toHaveBeenCalled();
  });
  it('fresh token receiving a second 401 invokes onExpired once', async () => {
    await setup(); vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(drive.driveFetch('files')).rejects.toBeInstanceOf(drive.SessionExpired);
    expect(expired).toHaveBeenCalledOnce(); expect(auth.currentToken()).toBeNull();
  });
  it('never opened session retains the old expiry handler on failure', async () => {
    await setup('?yenile=0'); auth.signOut(); mode = 'blocked';
    await expect(drive.driveFetch('files')).rejects.toBeInstanceOf(drive.SessionExpired);
    expect(expired).toHaveBeenCalledOnce();
  });
  it('enabled mode with no previous session invokes expiry on failed login', async () => {
    await setup(); auth.signOut(); mode = 'denied';
    await expect(drive.driveFetch('files')).rejects.toBeInstanceOf(drive.SessionExpired);
    expect(expired).toHaveBeenCalledOnce();
  });
  it('signOut rejects waiting Drive requests without onExpired and ignores late GIS callback', async () => {
    await setup('?tokenSure=120'); mode = 'hang'; await vi.advanceTimersByTimeAsync(80_000);
    const oldCallback = config.callback;
    const waiting = drive.driveFetch('files'); const assertion = expect(waiting).rejects.toBeInstanceOf(auth.AuthError);
    auth.signOut(); await assertion;
    oldCallback({ access_token: 'test-late', scope: KAPSAM_DAR, expires_in: 3600 });
    expect(auth.currentToken()).toBeNull(); expect(store.has('defter-oturum')).toBe(false);
    expect(expired).not.toHaveBeenCalled(); expect(banner).toHaveBeenLastCalledWith('hidden');
  });
  it('?tokenSure=120 stores shortened expiry; successful timer updates persistence with no visible banner', async () => {
    await setup('?tokenSure=120');
    expect(JSON.parse(store.get('defter-oturum')!).expiresAt).toBe(NOW + 120_000);
    await vi.advanceTimersByTimeAsync(80_000);
    expect(JSON.parse(store.get('defter-oturum')!).expiresAt).toBe(NOW + 200_000);
    expect(banner.mock.calls.flat().every(value => value === 'hidden')).toBe(true);
  });
  it('restoration schedules renewal without opening GIS immediately', async () => {
    await setup('', true); expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3_300_000); expect(request).toHaveBeenCalledOnce();
  });
  it('hidden restored tab waits; visibilitychange and focus share one attempt', async () => {
    const listeners = new Map<string, () => void>();
    const doc = { visibilityState: 'hidden', addEventListener: (event: string, listener: () => void) => listeners.set(event, listener) };
    vi.stubGlobal('document', doc);
    vi.mocked(window.addEventListener).mockImplementation((event: string, listener: unknown) => { listeners.set(event, listener as () => void); });
    await setup('', true);
    await vi.advanceTimersByTimeAsync(3_500_000); expect(request).not.toHaveBeenCalled();
    doc.visibilityState = 'visible';
    listeners.get('visibilitychange')!(); listeners.get('focus')!();
    await vi.advanceTimersByTimeAsync(0); expect(request).toHaveBeenCalledOnce();
  });
  it('15s GIS timeout keeps waiter; stale callback cannot replace token; touch retries synchronously', async () => {
    await setup(); mode = 'hang';
    const waiting = auth.tokenYenile('401'); const stale = config.callback;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(banner).toHaveBeenLastCalledWith('continue'); expect(expired).not.toHaveBeenCalled();
    stale({ access_token: 'test-stale', scope: KAPSAM_DAR, expires_in: 3600 });
    expect(auth.currentToken()).toBe('test-token-1');
    mode = 'success'; const count = request.mock.calls.length; auth.oturumBandinaDokun();
    expect(request).toHaveBeenCalledTimes(count + 1); await waiting;
    expect(auth.currentToken()).toBe('test-token-2');
  });
  it('a late parallel 401 for the old token reuses the already refreshed token', async () => {
    await setup();
    const previous = auth.currentToken()!;
    const renewed = await auth.tokenYenile('401', previous);
    expect(await auth.tokenYenile('401', previous)).toBe(renewed);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('signOut remains available when a token expired before a reading flush started', async () => {
    await setup('?tokenSure=120');
    vi.setSystemTime(NOW + 61_000);
    expect(auth.yenilemeBekliyor()).toBe(true);
    auth.signOut(); expect(auth.yenilemeBekliyor()).toBe(false);
  });
  it('?yenile=0 installs no timer or banner and preserves first-401 failure behavior', async () => {
    await setup('?yenile=0'); mode = 'denied';
    await vi.advanceTimersByTimeAsync(3_300_000); expect(request).toHaveBeenCalledOnce();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(drive.driveFetch('files')).rejects.toBeInstanceOf(drive.SessionExpired);
    expect(expired).toHaveBeenCalledOnce(); expect(banner.mock.calls.flat()).toEqual(['hidden']);
  });
});
