import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let counter: typeof import('./sayac');
let storage: Map<string, string>;
const beacon = vi.fn(() => true);
const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('PROD', true);
  vi.stubGlobal('location', new URL('https://mydefter.app/'));
  vi.stubGlobal('navigator', { sendBeacon: beacon });
  vi.stubGlobal('fetch', send);
  storage = new Map();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) });
  beacon.mockReset().mockReturnValue(true); send.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-03T23:59:59Z'));
  counter = await import('./sayac');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('anonymous counter client', () => {
  it('sends only the event type as a JSON beacon', async () => {
    counter.olay('kitap');
    expect(beacon).toHaveBeenCalledOnce();
    const [url, blob] = beacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe('/api/olay'); expect(blob.type).toBe('text/plain;charset=utf-8');
    expect(JSON.parse(await blob.text())).toEqual({ tur: 'kitap' }); expect(send).not.toHaveBeenCalled();
  });
  it.each(['http://localhost:5173/', 'https://preview.vercel.app/', 'https://mydefter.app.example.com/', 'https://mydefter.app/?sayac=0', 'https://mydefter.app/?analiz=0'])('disabled at %s', url => {
    vi.stubGlobal('location', new URL(url)); counter.olay('cihaz');
    expect(beacon).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled(); expect(storage.size).toBe(0);
  });
  it('disabled in development', () => {
    vi.stubEnv('PROD', false); counter.olay('kitap'); expect(beacon).not.toHaveBeenCalled();
  });
  it('counts app and demo once per UTC day independently, across reloads', async () => {
    counter.olay('cihaz'); counter.olay('cihaz'); counter.olay('demo'); counter.olay('demo');
    expect(beacon).toHaveBeenCalledTimes(2);
    expect(storage.get('defter-sayac-gun')).toBe('2026-11-03');
    vi.resetModules(); counter = await import('./sayac');
    counter.olay('cihaz'); counter.olay('demo'); expect(beacon).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date('2026-11-04T00:00:00Z'));
    counter.olay('cihaz'); counter.olay('demo'); expect(beacon).toHaveBeenCalledTimes(4);
  });
  it('keeps counting at most once per load when localStorage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(() => { counter.olay('cihaz'); counter.olay('cihaz'); }).not.toThrow(); expect(beacon).toHaveBeenCalledOnce();
  });
  it.each([false, undefined])('uses a keepalive fallback when beacon is %s', available => {
    if (available === undefined) vi.stubGlobal('navigator', {}); else beacon.mockReturnValue(false);
    counter.olay('giris'); expect(send).toHaveBeenCalledWith('/api/olay', expect.objectContaining({ method: 'POST', keepalive: true, credentials: 'omit' }));
  });
  it('uses the fetch fallback when sendBeacon throws', async () => {
    beacon.mockImplementation(() => { throw new Error('blocked'); });
    expect(() => counter.olay('kitap')).not.toThrow();
    expect(send).toHaveBeenCalledExactlyOnceWith('/api/olay', expect.objectContaining({ method: 'POST', keepalive: true, credentials: 'omit' }));
    const body = send.mock.calls[0][1]!.body as Blob;
    expect(body.type).toBe('text/plain;charset=utf-8');
    expect(JSON.parse(await body.text())).toEqual({ tur: 'kitap' });
  });
  it('swallows synchronous and asynchronous fetch errors', async () => {
    beacon.mockReturnValue(false); send.mockImplementation(() => { throw new Error('blocked'); });
    expect(() => counter.olay('kitap')).not.toThrow();
    beacon.mockReturnValue(false); send.mockRejectedValue(new Error('offline'));
    expect(() => counter.olay('ozet')).not.toThrow(); await Promise.resolve(); await Promise.resolve();
  });
});
