import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KoseSonuc } from './kirp/kirpHesap';

// Task 6.2c: filter E ("Renk düzelt") only on the photo panel's path, and only when asked.
// Node has no canvas: a fake canvas, createImageBitmap and document; the filter, the corner finder
// and the perspective step are spies.

const mock = vi.hoisted(() => ({
  renk: vi.fn((g: { data: Uint8ClampedArray; width: number; height: number }) => ({ ...g, data: new Uint8ClampedArray(g.data.length).fill(7) })),
  kose: { sonuc: null as KoseSonuc },
  duzeltCikti: [] as unknown[],
}));

vi.mock('./filtre/filtreler', () => ({ renkDuzelt: mock.renk }));
vi.mock('./kirp/koseB', () => ({ koseB: () => mock.kose.sonuc }));
vi.mock('./kirp/perspektif', () => ({
  duzelt: () => { const c = tuval(); c.width = 50; c.height = 70; mock.duzeltCikti.push(c); return c; },
}));

const { hazirlaGorsel, hazirlaKirpli } = await import('./gorsel');

interface SahteTuval { width: number; height: number; konan: Uint8ClampedArray[]; getContext(): unknown; toBlob(cb: (b: Blob) => void): void }

function tuval(): SahteTuval {
  const c: SahteTuval = {
    width: 0, height: 0, konan: [],
    getContext: () => ({
      fillRect() {}, drawImage() {},
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: (img: { data: Uint8ClampedArray }) => { c.konan.push(img.data); },
    }),
    toBlob: cb => cb(new Blob([new Uint8Array([0xff, 0xd8, 1, 2])])),
  };
  return c;
}

const tuvaller: SahteTuval[] = [];
const dosya = () => new File([new Uint8Array(100)], 'defter.jpg', { type: 'image/jpeg' });
const KOSELER = [{ x: 10, y: 10 }, { x: 190, y: 10 }, { x: 190, y: 290 }, { x: 10, y: 290 }];

beforeEach(() => {
  mock.renk.mockClear();
  mock.kose.sonuc = null;
  mock.duzeltCikti.length = 0;
  tuvaller.length = 0;
  vi.stubGlobal('document', { createElement: () => { const c = tuval(); tuvaller.push(c); return c; } });
  vi.stubGlobal('createImageBitmap', async () => ({ width: 200, height: 300, close() {} }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Renk düzelt (filtre E) yolu', () => {
  it('hazirlaGorsel ("Dosya ekle" görselleri): filtre hiç çağrılmaz', async () => {
    const g = await hazirlaGorsel(dosya());
    expect(g.bytes.length).toBeGreaterThan(0);
    expect(mock.renk).not.toHaveBeenCalled();
    expect('renkDuzelt' in g).toBe(false);
  });

  it('hazirlaKirpli seçeneksiz: filtre yok, renkDuzelt false', async () => {
    const h = await hazirlaKirpli(dosya(), 'kirp');
    expect(mock.renk).not.toHaveBeenCalled();
    expect(h.renkDuzelt).toBe(false);
  });

  it('renkDuzelt: false → filtre yok', async () => {
    const h = await hazirlaKirpli(dosya(), 'tumu', undefined, { renkDuzelt: false });
    expect(mock.renk).not.toHaveBeenCalled();
    expect(h.renkDuzelt).toBe(false);
  });

  it('renkDuzelt + tüm fotoğraf: bir kez, sonuç tuvale yazılır', async () => {
    const h = await hazirlaKirpli(dosya(), 'tumu', undefined, { renkDuzelt: true });
    expect(h.kip).toBe('tumu');
    expect(mock.renk).toHaveBeenCalledTimes(1);
    expect(h.renkDuzelt).toBe(true);
    const yazilan = tuvaller.flatMap(t => t.konan);
    expect(yazilan).toHaveLength(1);
    expect(yazilan[0].every(v => v === 7)).toBe(true);
    expect(tuvaller.every(t => t.width === 0 && t.height === 0)).toBe(true);   // canvases freed
  });

  it('renkDuzelt + kırp: bir kez, perspektif çıktısına', async () => {
    mock.kose.sonuc = { koseler: KOSELER as never, guven: 0.9 };
    const h = await hazirlaKirpli(dosya(), 'kirp', undefined, { renkDuzelt: true });
    expect(h.kip).toBe('kirp');
    expect(mock.renk).toHaveBeenCalledTimes(1);
    expect(mock.renk.mock.calls[0][0]).toMatchObject({ width: 50, height: 70 });
    expect((mock.duzeltCikti[0] as SahteTuval).konan).toHaveLength(1);
    expect(h.renkDuzelt).toBe(true);
  });

  it('önceki kararla (düğme): köşeler korunur, filtre isteğe göre', async () => {
    const onceki = { kip: 'kirp' as const, koseler: KOSELER as never, guven: 0.9, kirpilamadi: false };
    const kapali = await hazirlaKirpli(dosya(), 'kirp', onceki, { renkDuzelt: false });
    expect(mock.renk).not.toHaveBeenCalled();
    const acik = await hazirlaKirpli(dosya(), 'kirp', onceki, { renkDuzelt: true });
    expect(mock.renk).toHaveBeenCalledTimes(1);
    expect([kapali.koseler, acik.koseler]).toEqual([KOSELER, KOSELER]);
  });

  it('filtre hata verirse: fotoğraf filtresiz hazırlanır, renkDuzelt false', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mock.renk.mockImplementationOnce(() => { throw new Error('bellek'); });
    const h = await hazirlaKirpli(dosya(), 'tumu', undefined, { renkDuzelt: true });
    expect(h.gorsel.bytes.length).toBeGreaterThan(0);
    expect(h.renkDuzelt).toBe(false);
    expect(tuvaller.flatMap(t => t.konan)).toHaveLength(0);
    warn.mockRestore();
  });
});
