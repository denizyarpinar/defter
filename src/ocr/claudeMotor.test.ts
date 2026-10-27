import { describe, expect, it } from 'vitest';
import { hataMetni, OKU_MODEL, okuApi, OkumaHatasi } from './claudeMotor';
import { dilAyarla } from '../dil';

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
    await expect(okuApi(jpeg, { token: 'T', fetch: cevap(404, { hata: 'Bulunamadı.' }) as never })).rejects.toThrow('vercel dev');
    const e = await okuApi(jpeg, { token: 'T', fetch: cevap(429, {}) as never }).catch(x => x);
    expect(e).toBeInstanceOf(OkumaHatasi);
    expect(e.durum).toBe(429);
    await expect(okuApi(jpeg, { token: 'T', fetch: cevap(200, { satir: [] }) as never })).rejects.toThrow('beklenen biçimde');
    await expect(okuApi(jpeg, { token: 'T', fetch: (async () => { throw new TypeError('ağ'); }) as never })).rejects.toThrow('ulaşılamadı');
  });

  it('6.5-4a: a known kod → the page own text (with its values); unknown kod → the server text', async () => {
    await expect(okuApi(jpeg, { token: 'T', fetch: cevap(429, { hata: 'eski metin', kod: 'hiz_siniri', sinir: 7 }) as never })).rejects.toThrow('Dakikada en fazla 7 okuma');
    await expect(okuApi(jpeg, { token: 'T', fetch: cevap(413, { hata: 'x', kod: 'kenar_buyuk', kenar: 2000 }) as never })).rejects.toThrow('en fazla 2000 px');
    await expect(okuApi(jpeg, { token: 'T', fetch: cevap(502, { hata: 'Sunucunun metni.', kod: 'yeni_bir_kod' }) as never })).rejects.toThrow('Sunucunun metni.');
    expect(hataMetni(500, { kod: 'ayar_eksik', eksik: ['A', 'B'] })).toContain('A, B');
    expect(hataMetni(418, null)).toBe('Okuma başarısız (durum 418). Tekrar dene.');
    dilAyarla('en');
    try {
      expect(hataMetni(429, { hata: 'Dakikada en fazla 10 istek. Bir dakika bekle.', kod: 'hiz_siniri', sinir: 10 })).toBe('At most 10 readings a minute. Wait a minute.');
      expect(hataMetni(403, { hata: 'Türkçe sunucu metni', kod: 'sahip_degil' })).toBe("Reading handwriting only works with the owner's account.");
      expect(hataMetni(403, { hata: 'Türkçe sunucu metni' })).toBe('Türkçe sunucu metni');   // an older server: its text
    } finally { dilAyarla('tr'); }
  });

  it('cancelled: the abort passes through', async () => {
    const c = new AbortController();
    c.abort();
    const hata = new DOMException('iptal', 'AbortError');
    await expect(okuApi(jpeg, { token: 'T', signal: c.signal, fetch: (async () => { throw hata; }) as never })).rejects.toBe(hata);
  });
});
