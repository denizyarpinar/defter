import { describe, expect, it } from 'vitest';
import type { AtlasD } from './atlasCoz';
import type { ElYazisiAtlas } from './atlasSema';
import { GlifBellegi, lanczosBuyut, pilKatsayilar, pyRound, satirBas, tukenmezGlif, yumusakGlif, yuzdelik } from './basici';

// a small "o": a ring of ink on paper (0)
function halka(n = 12): AtlasD {
  const D = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5);
    D[y * n + x] = r > 2.5 && r < 4.5 ? 1.2 : 0;
  }
  return { w: n, h: n, D };
}

const stiller = (esik: [number, number] = [0.15, 0.45]) => ({
  varsayilan: 'tukenmez', kagit: [247, 246, 241],
  tukenmez: { buyut: 3, doku: [0.8, 0.2, 90], esik: { mavi: esik }, tonlar: { mavi: [22, 32, 98] } },
  yumusak: { gurultu: 1.4 }
});
const atlas = (o: Partial<ElYazisiAtlas> = {}): ElYazisiAtlas => ({
  tur: 'defter-el-yazisi', surum: 1, xh: 40, kodlama: 'dogrusal', olcek: 40, sayfa: { w: 12, h: 12 },
  aralik: { harf: 0.1, kelime: 1.5 }, stiller: stiller(), renkler: { mavi: { p: [0.75, 0.56, 0.34], yogunluk: 1.2 } },
  karakterler: { o: [{ x: 0, y: 0, w: 12, h: 12, taban: 11 }] }, eksikler: [], ...o
});

describe('PIL Lanczos', () => {
  it('katsayılar normalize, 3× büyütmede sabit görüntü sabit kalır', () => {
    for (const k of pilKatsayilar(10, 30)) expect(k.k.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    const U = lanczosBuyut({ w: 5, h: 4, D: new Float32Array(20).fill(0.7) }, 15, 12);
    expect(U.w * U.h).toBe(180);
    for (const v of U.D) expect(v).toBeCloseTo(0.7, 5);
  });
  it('negatif çıkmaz (Lanczos halkası 0\'a kırpılır)', () => {
    for (const v of lanczosBuyut(halka(), 36, 36).D) expect(v).toBeGreaterThanOrEqual(0);
  });
});

describe('yardımcılar', () => {
  it('Python round: yarıda çifte', () => {
    expect([0.5, 1.5, 2.5, -0.5, -1.5, 4.72, 59.68].map(pyRound)).toEqual([0, 2, 2, -0, -2, 5, 60]);
  });
  it('yüzdelik numpy "linear" gibi, mürekkepsiz → 1', () => {
    expect(yuzdelik(Float32Array.from([0, 1, 2, 3, 4, 5]), 90)).toBeCloseTo(4.6);
    expect(yuzdelik(new Float32Array(4), 90)).toBe(1);
  });
});

describe('glifler', () => {
  it('tükenmez: kâğıtta alfa 0, mürekkepte ton rengi', () => {
    const g = tukenmezGlif(halka(), 11, 'mavi', atlas());
    expect(g.rgba[3]).toBe(0);                                    // corner: paper
    const orta = (6 * 12 + 6) * 4;                                // the hole of the "o"
    expect(g.rgba[orta + 3]).toBe(0);
    const murekkep = (6 * 12 + 2) * 4;
    expect(g.rgba[murekkep + 3]).toBeGreaterThan(100);
    expect([...g.rgba.slice(murekkep, murekkep + 3)]).toEqual([22, 32, 98]);
  });
  it('tükenmez: parametre atlas.json\'dan (eşik yükselince daha az mürekkep)', () => {
    const top = (e: [number, number]) => tukenmezGlif(halka(), 11, 'mavi', atlas({ stiller: stiller(e) })).rgba.filter((_, i) => i % 4 === 3).reduce((a, b) => a + b, 0);
    expect(top([0.6, 1.1])).toBeLessThan(top([0.15, 0.45]));
  });
  it('tükenmez: rengin eşiği yoksa anlaşılır hata', () => {
    expect(() => tukenmezGlif(halka(), 11, 'kirmizi', atlas())).toThrow(/kirmizi/);
  });
  it('yumuşak: kâğıtta geçirgenlik 255, mürekkepte exp(−D·yoğunluk·p)', () => {
    const g = yumusakGlif(halka(), 11, 'mavi', atlas());
    expect([...g.rgba.slice(0, 4)]).toEqual([255, 255, 255, 255]);
    const i = (6 * 12 + 2) * 4;
    expect(g.rgba[i]).toBe(Math.round(Math.exp(-1.2 * 1.2 * 0.75) * 255));
  });
  it('bellek: aynı anahtar bir kez hazırlanır', () => {
    let n = 0;
    const a = atlas();
    const b = new GlifBellegi(a, () => { n++; return halka(); });
    b.glif('tukenmez', 'mavi', 'o', 0); b.glif('tukenmez', 'mavi', 'o', 0); b.glif('yumusak', 'mavi', 'o', 0);
    expect([n, b.boyut]).toEqual([2, 2]);
  });
  it('satirBas: Python düzeni (kenar, aralık, eksik boşluk)', () => {
    const a = atlas();
    const s = satirBas('oo ?', 'mavi', 'tukenmez', a, new GlifBellegi(a, () => halka()));
    expect([s.w, s.h]).toEqual([20 + 12 + 4 + 12 + 60 + 20 + 20, 120]);
    expect(s.eksik).toEqual(['?']);
    expect([...s.rgb.slice(0, 3)]).toEqual([247, 246, 241]);
  });
});
