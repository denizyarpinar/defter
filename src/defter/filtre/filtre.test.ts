import { describe, expect, it } from 'vitest';
import { FILTRELER, arkaPlanDuzelt, beyazDengesi, griBelge, siyahBeyaz } from './filtreler';
import { aydinlatmaHaritasi, haritaOku, kutuBulanik, maxFiltre, yuzdelik, type Goruntu } from './ortak';

// Synthetic page: pixel = reflectance × light. Warm (yellowish) lamp light, and a shadow that gets
// darker from left (×1) to right (×0.55). A black line at rows 60–62, a red line at rows 180–182.
const W = 400, H = 300;
const KAGIT = [0.95, 0.95, 0.95], SIYAH = [0.12, 0.12, 0.12], KIRMIZI = [0.85, 0.15, 0.15];
const ISIK = [255, 238, 180];

function sayfa(golge = true): Goruntu {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const yans = y >= 60 && y < 63 ? SIYAH : y >= 180 && y < 183 ? KIRMIZI : KAGIT;
    for (let x = 0; x < W; x++) {
      const isik = golge ? 1 - 0.45 * (x / (W - 1)) : 1;
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = yans[c] * ISIK[c] * isik;
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

const px = (g: Goruntu, x: number, y: number) => {
  const i = (y * g.width + x) * 4;
  return [g.data[i], g.data[i + 1], g.data[i + 2]];
};

describe('ortak', () => {
  it('yuzdelik', () => {
    const h = new Uint32Array(256);
    h[10] = 50; h[200] = 50;
    expect(yuzdelik(h, 0.5)).toBe(10);
    expect(yuzdelik(h, 0.51)).toBe(200);
    expect(yuzdelik(h, 1)).toBe(200);
    expect(yuzdelik(new Uint32Array(256), 0.5)).toBe(0);
  });

  it('kutuBulanik: same size, averages only existing pixels at the edges', () => {
    const v = new Float32Array([0, 0, 9, 0, 0]);
    expect([...kutuBulanik(v, 5, 1, 1)]).toEqual([0, 3, 3, 3, 0]);
    const sabit = new Float32Array(7 * 5).fill(42);
    expect(kutuBulanik(sabit, 7, 5, 3).every(x => Math.abs(x - 42) < 1e-4)).toBe(true);
  });

  it('maxFiltre removes a thin dark line', () => {
    const v = new Float32Array(9 * 9).fill(200);
    for (let x = 0; x < 9; x++) v[4 * 9 + x] = 20;
    expect(maxFiltre(v, 9, 9, 1).every(x => x === 200)).toBe(true);
  });

  it('aydinlatmaHaritasi follows the paper, not the ink', () => {
    const g = sayfa();
    const m = aydinlatmaHaritasi(g);
    for (const [x, y] of [[20, 61], [380, 61], [200, 181], [200, 120]]) {
      const kagit = px(g, x, y === 61 || y === 181 ? y - 10 : y);
      for (let c = 0; c < 3; c++) expect(Math.abs(haritaOku(m, c, x, y) - kagit[c])).toBeLessThan(14);
    }
  });
});

describe('filters', () => {
  it('keep the size, never change the input, work on 1×1 and odd sizes', () => {
    const g = sayfa();
    const once = g.data.slice();
    for (const f of FILTRELER) {
      const r = f.uygula(g);
      expect([r.width, r.height, r.data.length]).toEqual([W, H, W * H * 4]);
      expect(r.data[3]).toBe(255);
      for (const [w, h] of [[1, 1], [3, 7], [17, 5]]) {
        const k = { data: new Uint8ClampedArray(w * h * 4).fill(128), width: w, height: h };
        expect(f.uygula(k).data.length).toBe(w * h * 4);
      }
    }
    expect(g.data).toEqual(once);
  });

  it('A: yellow paper → white and neutral', () => {
    const r = beyazDengesi(sayfa(false));
    const [cr, cg, cb] = px(r, 200, 120);
    expect(Math.min(cr, cg, cb)).toBeGreaterThanOrEqual(240);
    expect(Math.max(cr, cg, cb) - Math.min(cr, cg, cb)).toBeLessThan(10);
    expect(Math.max(...px(r, 200, 61))).toBeLessThan(60);
  });

  it('B: shadow and yellow tint go, ink stays, red stays red', () => {
    const r = arkaPlanDuzelt(sayfa());
    for (const x of [10, 200, 390]) {
      expect(Math.min(...px(r, x, 120))).toBeGreaterThanOrEqual(235);
      expect(Math.max(...px(r, x, 61))).toBeLessThan(80);
      const [cr, cg, cb] = px(r, x, 181);
      expect(cr).toBeGreaterThan(180);
      expect(cr - Math.max(cg, cb)).toBeGreaterThan(120);
    }
  });

  it('C: grey, white paper, dark ink', () => {
    const r = griBelge(sayfa());
    for (const x of [10, 390]) {
      const [cr, cg, cb] = px(r, x, 120);
      expect(cr).toBe(cg);
      expect(cg).toBe(cb);
      expect(cr).toBeGreaterThanOrEqual(235);
      expect(px(r, x, 61)[0]).toBeLessThan(80);
    }
  });

  it('D: only black and white; shaded paper white, lines black', () => {
    const r = siyahBeyaz(sayfa());
    for (let i = 0; i < r.data.length; i += 4) expect(r.data[i] === 0 || r.data[i] === 255).toBe(true);
    for (const x of [10, 200, 390]) {
      expect(px(r, x, 120)[0]).toBe(255);
      expect(px(r, x, 30)[0]).toBe(255);
      expect(px(r, x, 61)[0]).toBe(0);
      expect(px(r, x, 181)[0]).toBe(0);
    }
  });
});
