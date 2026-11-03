import { beforeEach, describe, expect, it, vi } from 'vitest';
import { olayIstegi, sinirSifirla } from '../api/olay';
import { panelIstegi } from '../api/panel';
import { redisConfig, type CounterDeps } from '../api/_sayac';
import { EVENT_TYPES } from './sayacModel';

const env = { KV_REST_API_URL: 'https://redis.example', KV_REST_API_TOKEN: 'test-only', VITE_GOOGLE_CLIENT_ID: 'client', VITE_SAHIP_EPOSTA: 'owner@example.com' };
const now = Date.parse('2026-11-03T23:59:00Z');
function setup() {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([{ result: 1 }, { result: 1 }])));
  const deps: CounterDeps = { env: { ...env }, fetch: fetchMock, simdi: () => now };
  return { deps, fetchMock };
}
const eventRequest = (body: unknown = { tur: 'cihaz' }, origin: string | null = 'https://mydefter.app', extra: Record<string, string> = {}) => new Request('https://mydefter.app/api/olay', {
  method: 'POST', headers: { ...(origin ? { Origin: origin } : {}), 'x-forwarded-for': '192.0.2.1', ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body),
});
const panelRequest = (query = '?gun=30', token = true) => new Request('https://mydefter.app/api/panel' + query, { headers: token ? { authorization: 'Bearer test-only' } : {} });
const tokenResponse = (email = 'owner@example.com', extra = {}) => new Response(JSON.stringify({ aud: 'client', email, email_verified: true, expires_in: 3000, ...extra }));
beforeEach(sinirSifirla);

describe('event API', () => {
  it.each(EVENT_TYPES)('stores only UTC day and allowed type %s, with 400-day TTL', async tur => {
    const { deps, fetchMock } = setup();
    expect((await olayIstegi(eventRequest({ tur }), deps)).status).toBe(204);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('https://redis.example/multi-exec', expect.objectContaining({
      method: 'POST', body: JSON.stringify([['HINCRBY', 'sayac:2026-11-03', tur, 1], ['EXPIRE', 'sayac:2026-11-03', 34560000]]),
    }));
  });
  it.each([null, 'http://mydefter.app', 'https://evil.example', 'https://mydefter.app.evil.example'])('ignores Origin %s', async origin => {
    const { deps, fetchMock } = setup(); expect((await olayIstegi(eventRequest({ tur: 'cihaz' }, origin), deps)).status).toBe(204); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([{ tur: 'unknown' }, { tur: 'constructor' }, { tur: 'kitap', email: 'private' }, {}, null, [], '{'])('rejects invalid body %j without writing', async body => {
    const { deps, fetchMock } = setup(); expect((await olayIstegi(eventRequest(body), deps)).status).toBe(400); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('limits actual UTF-8 bytes even with a lying length header', async () => {
    const { deps, fetchMock } = setup();
    for (const body of [' '.repeat(201), 'ü'.repeat(101)]) expect((await olayIstegi(eventRequest(body, 'https://mydefter.app', { 'content-length': '1' }), deps)).status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects oversized declared length without writing', async () => {
    const { deps, fetchMock } = setup(); expect((await olayIstegi(eventRequest({ tur: 'cihaz' }, 'https://mydefter.app', { 'content-length': '201' }), deps)).status).toBe(204); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('accepts a body at the 200-byte boundary', async () => {
    const { deps, fetchMock } = setup();
    expect((await olayIstegi(eventRequest(JSON.stringify({ tur: 'demo' }).padEnd(200, ' ')), deps)).status).toBe(204);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('caps each IP at 30 events per 60 seconds and expires the window', async () => {
    const { deps, fetchMock } = setup();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify([{ result: 1 }, { result: 1 }])));
    for (let i = 0; i < 32; i++) await olayIstegi(eventRequest(), deps);
    expect(fetchMock).toHaveBeenCalledTimes(30);
    await olayIstegi(eventRequest({ tur: 'demo' }, 'https://mydefter.app', { 'x-forwarded-for': '192.0.2.2' }), deps);
    expect(fetchMock).toHaveBeenCalledTimes(31);
    deps.simdi = () => now + 60000; await olayIstegi(eventRequest(), deps); expect(fetchMock).toHaveBeenCalledTimes(32);
  });
  it('silently ignores missing env and Redis failures', async () => {
    const { deps, fetchMock } = setup(); deps.env = {};
    expect((await olayIstegi(eventRequest(), deps)).status).toBe(204); expect(fetchMock).not.toHaveBeenCalled();
    deps.env = env; fetchMock.mockRejectedValue(new Error('offline'));
    expect((await olayIstegi(eventRequest(), deps)).status).toBe(204);
  });
  it('uses complete credential pairs, preferring KV then Upstash', () => {
    const upstash = { UPSTASH_REDIS_REST_URL: 'https://upstash.example', UPSTASH_REDIS_REST_TOKEN: 'test-upstash' };
    expect(redisConfig({ ...env, ...upstash })).toEqual({ url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN });
    expect(redisConfig({ KV_REST_API_URL: 'incomplete', ...upstash })).toEqual({ url: upstash.UPSTASH_REDIS_REST_URL, token: upstash.UPSTASH_REDIS_REST_TOKEN });
    expect(redisConfig({ KV_REST_API_URL: 'incomplete' })).toBeNull();
  });
});

describe('owner panel API', () => {
  it('requires sign-in and refuses non-owners before Redis', async () => {
    const { deps, fetchMock } = setup();
    expect((await panelIstegi(panelRequest('', false), deps)).status).toBe(401); expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(tokenResponse('other@example.com'));
    expect((await panelIstegi(panelRequest(), deps)).status).toBe(403); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('returns UTC dates, every type, and zero for missing days without needing an Anthropic key', async () => {
    const { deps, fetchMock } = setup();
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response(JSON.stringify([
      { result: [null, null, null, null, null, null, null] }, { result: ['4', null, '2', null, null, '1', null] },
    ])));
    const response = await panelIstegi(panelRequest('?gun=2'), deps);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    const data = await response.json();
    expect(data.gunler).toEqual([
      { tarih: '2026-11-02', sayilar: { cihaz: 0, demo: 0, giris: 0, kitaplik: 0, kitap: 0, ozet: 0, foto: 0 } },
      { tarih: '2026-11-03', sayilar: { cihaz: 4, demo: 0, giris: 2, kitaplik: 0, kitap: 0, ozet: 1, foto: 0 } },
    ]);
    const call = fetchMock.mock.calls[1]; expect(call[0]).toBe('https://redis.example/pipeline');
    expect(JSON.parse(call[1]!.body as string)).toEqual([['HMGET', 'sayac:2026-11-02', ...EVENT_TYPES], ['HMGET', 'sayac:2026-11-03', ...EVENT_TYPES]]);
  });
  it.each([['?gun=999', 90], ['?gun=-4', 1], ['?gun=oops', 30], ['', 30]])('bounds day count %s to %i', async (query, days) => {
    const { deps, fetchMock } = setup(); fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response(JSON.stringify(Array.from({ length: days }, () => ({ result: EVENT_TYPES.map(() => null) })))));
    const data = await (await panelIstegi(panelRequest(query), deps)).json(); expect(data.gunler).toHaveLength(days);
  });
  it('returns 503 with a stable code when Redis is unconfigured', async () => {
    const { deps, fetchMock } = setup(); deps.env = { VITE_GOOGLE_CLIENT_ID: 'client', VITE_SAHIP_EPOSTA: 'owner@example.com' };
    fetchMock.mockResolvedValueOnce(tokenResponse()); const response = await panelIstegi(panelRequest(), deps);
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ kod: 'sayac_ayarsiz' }); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([{ error: 'private-provider-error' }, [{ error: 'private-provider-error' }], [{ result: [] }]])('hides Redis response errors %j', async data => {
    const { deps, fetchMock } = setup(); fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response(JSON.stringify(data)));
    const response = await panelIstegi(panelRequest('?gun=1'), deps); expect(response.status).toBe(503); expect(await response.json()).toEqual({ kod: 'sayac_ulasilamadi' });
  });
  it('uses the unchanged Drive fallback when tokeninfo omits email', async () => {
    const { deps, fetchMock } = setup();
    fetchMock.mockResolvedValueOnce(tokenResponse(undefined, { email: undefined })).mockResolvedValueOnce(new Response(JSON.stringify({ user: { emailAddress: 'OWNER@example.com' } }))).mockResolvedValueOnce(new Response(JSON.stringify([{ result: EVENT_TYPES.map(() => null) }])));
    expect((await panelIstegi(panelRequest('?gun=1'), deps)).status).toBe(200);
    expect(fetchMock.mock.calls[1][0]).toBe('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)');
  });
});
