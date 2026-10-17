import { describe, expect, it } from 'vitest';
import { E_SIYAH_MAX, E_VARSAYILAN, FILTRELER, arkaPlanDuzelt, beyazDengesi, griBelge, renkDuzelt, siyahBeyaz } from './filtreler';
import { aydinlatmaHaritasi, haritaOku, kutuBulanik, maxFiltre, yuzdelik, type Goruntu } from './ortak';

// Synthetic page: pixel = reflectance × light. Warm (yellowish) lamp light, and a shadow that gets
// darker from left (×1) to right (×0.55). A black line at rows 60–62, a red line at rows 180–182,
// a blue line at rows 240–242.
const W = 400, H = 300;
const KAGIT = [0.95, 0.95, 0.95], SIYAH = [0.12, 0.12, 0.12], KIRMIZI = [0.85, 0.15, 0.15], MAVI = [0.15, 0.25, 0.8];
const ISIK = [255, 238, 180];

function sayfa(golge = true): Goruntu {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const yans = y >= 60 && y < 63 ? SIYAH : y >= 180 && y < 183 ? KIRMIZI : y >= 240 && y < 243 ? MAVI : KAGIT;
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
const luma = ([r, g, b]: number[]) => 0.299 * r + 0.587 * g + 0.114 * b;
const doygunluk = (p: number[]) => (Math.max(...p) - Math.min(...p)) / Math.max(1, Math.max(...p));

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

  it('aydinlatmaHaritasi with yansit: flat image → flat map, edges included', () => {
    const g = { data: new Uint8ClampedArray(37 * 23 * 4), width: 37, height: 23 };
    for (let i = 0; i < g.data.length; i += 4) { g.data[i] = 200; g.data[i + 1] = 150; g.data[i + 2] = 90; g.data[i + 3] = 255; }
    const m = aydinlatmaHaritasi(g, true);
    for (const [x, y] of [[0, 0], [36, 22], [18, 11], [0, 22]]) {
      expect(haritaOku(m, 0, x, y)).toBeCloseTo(200, 3);
      expect(haritaOku(m, 2, x, y)).toBeCloseTo(90, 3);
    }
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

  it('E: soft shadow fix, paper evened out, red and blue keep their colour', () => {
    const g = sayfa();
    const r = renkDuzelt(g);
    const girdiFark = luma(px(g, 10, 120)) - luma(px(g, 390, 120));
    const fark = luma(px(r, 10, 120)) - luma(px(r, 390, 120));
    expect(fark).toBeLessThan(girdiFark * 0.5);
    expect(Math.min(...px(r, 10, 120))).toBeGreaterThanOrEqual(235);
    for (const x of [10, 200, 390]) {
      expect(Math.max(...px(r, x, 61))).toBeLessThan(70);
      const kirmizi = px(r, x, 181);
      expect(kirmizi[0] - Math.max(kirmizi[1], kirmizi[2])).toBeGreaterThan(100);
      expect(doygunluk(kirmizi)).toBeGreaterThan(doygunluk(px(g, x, 181)) * 0.8);
      const mavi = px(r, x, 241);
      expect(mavi[2] - Math.max(mavi[0], mavi[1])).toBeGreaterThan(80);
      expect(doygunluk(mavi)).toBeGreaterThan(doygunluk(px(g, x, 241)) * 0.8);
    }
  });

  it('E: strength 0 and no contrast = A (black point capped); gain limit holds', () => {
    const g = sayfa();
    const a = beyazDengesi(g, E_SIYAH_MAX).data;
    expect(renkDuzelt(g, { golgeGuc: 0, kazancMax: 1.8, kontrast: 0 }).data).toEqual(a);
    // gain 1 allowed = no shadow fix at all, whatever the strength
    const sinirli = renkDuzelt(g, { golgeGuc: 1, kazancMax: 1, kontrast: 0 });
    expect(sinirli.data).toEqual(a);
    // stronger setting evens the paper more than the default
    const guclu = renkDuzelt(g, { ...E_VARSAYILAN, golgeGuc: 1 });
    const fark = (k: Goruntu) => luma(px(k, 10, 120)) - luma(px(k, 390, 120));
    expect(fark(guclu)).toBeLessThan(fark(renkDuzelt(g)));
  });
});
