import { describe, expect, it, vi } from 'vitest';
import { OkumaIzni, okumaDurumu, okumaGorunur } from './okumaIzni';

// Task 6.4c-4: the status query decides whether the reading buttons are shown
const yanit = (govde: unknown, status = 200) => new Response(typeof govde === 'string' ? govde : JSON.stringify(govde), { status });
const sahteFetch = (...yanitlar: Array<Response | Error>) => vi.fn(async () => {
  const y = yanitlar.shift();
  if (!y) throw new Error('beklenmeyen fetch');
  if (y instanceof Error) throw y;
  return y;
});

describe('okumaDurumu', () => {
  it('acik: true / false; token Authorization başlığında', async () => {
    const f = sahteFetch(yanit({ acik: true }), yanit({ acik: false }));
    expect(await okumaDurumu({ token: 't1', fetch: f as unknown as typeof fetch })).toBe(true);
    expect(await okumaDurumu({ token: 't1', fetch: f as unknown as typeof fetch })).toBe(false);
    expect(f.mock.calls[0]).toEqual(['/api/oku', { headers: { Authorization: 'Bearer t1' } }]);
  });

  it('token yok: false, istek yok', async () => {
    const f = sahteFetch();
    expect(await okumaDurumu({ token: null, fetch: f as unknown as typeof fetch })).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it('HTML (vite dev) ya da 404: false; ağ hatası ya da 502: bilinmiyor (null)', async () => {
    const f = sahteFetch(yanit('<!doctype html>'), yanit({ hata: 'yok' }, 404), new TypeError('ağ'), yanit({ hata: 'x' }, 502));
    const o = { token: 't', fetch: f as unknown as typeof fetch };
    expect(await okumaDurumu(o)).toBe(false);
    expect(await okumaDurumu(o)).toBe(false);
    expect(await okumaDurumu(o)).toBeNull();
    expect(await okumaDurumu(o)).toBeNull();
  });
});

describe('OkumaIzni', () => {
  it('cevap token başına bellekte; yeni token → yeniden sorulur', async () => {
    let token: string | null = 'a';
    const f = sahteFetch(yanit({ acik: true }), yanit({ acik: false }));
    const iz = new OkumaIzni({ token: () => token, fetch: f as unknown as typeof fetch });
    expect(iz.simdi()).toBe(false);
    expect(await iz.acik()).toBe(true);
    expect(await iz.acik()).toBe(true);
    expect(iz.simdi()).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    token = 'b';
    expect(iz.simdi()).toBe(false);
    expect(await iz.acik()).toBe(false);
    expect(f).toHaveBeenCalledTimes(2);
    token = null;
    expect(await iz.acik()).toBe(false);
  });

  it('aynı anda iki soru tek istek', async () => {
    const f = sahteFetch(yanit({ acik: true }));
    const iz = new OkumaIzni({ token: () => 't', fetch: f as unknown as typeof fetch });
    expect(await Promise.all([iz.acik(), iz.acik()])).toEqual([true, true]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('hata önbelleğe girmez: sonraki soru yeniden dener', async () => {
    const f = sahteFetch(new TypeError('ağ'), yanit({ acik: true }));
    const iz = new OkumaIzni({ token: () => 't', fetch: f as unknown as typeof fetch });
    expect(await iz.acik()).toBe(false);
    expect(iz.simdi()).toBe(false);
    expect(await iz.acik()).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('okumaGorunur', () => {
  const tam = { ornek: false, acik: true, pdfVar: true, kalemAcik: false };
  it('sadece acik: true, örnek değil, PDF açık, kalem kapalı', () => {
    expect(okumaGorunur(tam)).toBe(true);
    expect(okumaGorunur({ ...tam, acik: false })).toBe(false);
    expect(okumaGorunur({ ...tam, ornek: true })).toBe(false);
    expect(okumaGorunur({ ...tam, pdfVar: false })).toBe(false);
    expect(okumaGorunur({ ...tam, kalemAcik: true })).toBe(false);
  });
});
