import { describe, expect, it } from 'vitest';
import { OKU_MODEL, okuApi, OkumaHatasi } from './claudeMotor';

// Task 6.4c-2: the client of /api/oku (fake fetch)
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
const cevap = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

describe('okuApi', () => {
  it('POST /api/oku: Haiku, base64 JPEG, Bearer token; the lines come back', async () => {
    let istek: { url: string; init: RequestInit } | null = null;
    const satirlar = [{ girinti: 0, parcalar: [{ metin: 'der Knoten', renk: 'kirmizi' }] }];
    const r = await okuApi(jpeg, { token: 'T', fetch: (async (url: string, init: RequestInit) => {
      istek = { url, init };
      return new Response(JSON.stringify({ satirlar, model: OKU_MODEL, sureMs: 1 }));
    }) as typeof fetch });
    expect(r).toEqual({ satirlar, model: OKU_MODEL });
    expect(istek!.url).toBe('/api/oku');
    expect((istek!.init.headers as Record<string, string>).Authorization).toBe('Bearer T');
    expect(JSON.parse(istek!.init.body as string)).toEqual({ model: 'claude-haiku-5-5', gorsel: btoa(String.fromCharCode(...jpeg)) });
  });

  it('no token: no request', async () => {
    let cagrildi = false;
    await expect(okuApi(jpeg, { token: null, fetch: (async () => { cagrildi = true; return new Response('{}'); }) as typeof fetch })).rejects.toThrow(OkumaHatasi);
    expect(cagrildi).toBe(false);
  });

  it('errors: the server text, 404 explained, 429 keeps its status, bad shape', async () => {
    await expect(okuApi(jpeg, { token: 'T', fetch: cevap(403, { hata: 'Bu deneme sadece sahip hesabıyla kullanılabilir.' }) as never })).rejects.toThrow('sadece sahip');
    await expect(okuApi(jpeg, { token: 'T', fetch: cevap(404, { hata: 'Bulunamadı.' }) as never })).rejects.toThrow('Preview');
    const e = await okuApi(jpeg, { token: 'T', fetch: cevap(429, {}) as never }).catch(x => x);
    expect(e).toBeInstanceOf(OkumaHatasi);
    expect(e.durum).toBe(429);
    await expect(okuApi(jpeg, { token: 'T', fetch: cevap(200, { satir: [] }) as never })).rejects.toThrow('beklenen biçimde');
    await expect(okuApi(jpeg, { token: 'T', fetch: (async () => { throw new TypeError('ağ'); }) as never })).rejects.toThrow('ulaşılamadı');
  });

  it('cancelled: the abort passes through', async () => {
    const c = new AbortController();
    c.abort();
    const hata = new DOMException('iptal', 'AbortError');
    await expect(okuApi(jpeg, { token: 'T', signal: c.signal, fetch: (async () => { throw hata; }) as never })).rejects.toBe(hata);
  });
});
