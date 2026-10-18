import { describe, expect, it } from 'vitest';
import type { Kose4, Nokta } from './kirpHesap';
import {
  acikEnBuyuk, agirlikliDogru, dogruIki, dortgenIncelt, enBuyukBolge, erozyon, genislet, kenarDestekleri,
  kesisim, profilGecis, ransacDogru, uzaklik
} from './kenarIncelt';
import { koseBRgba } from './koseB';

const say = (m: Uint8Array) => m.reduce((s, x) => s + x, 0);
function kare(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * w + x] = 1;
  return m;
}
const icinde = (k: Kose4, x: number, y: number) => {
  for (let i = 0; i < 4; i++) {
    const a = k[i], b = k[(i + 1) % 4];
    if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
  }
  return true;
};
// paper value image: bright page (200) with grid lines (150) on a dark desk (40)
function sayfa(w: number, h: number, k: Kose4, golge?: (x: number, y: number) => boolean): Float32Array {
  const v = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c = 40;
      if (icinde(k, x + 0.5, y + 0.5)) {
        c = (x % 16 === 0 || y % 16 === 0) ? 150 : 200;
        if (golge?.(x, y)) c -= 70;   // a hand's shadow: still paper, just darker
      }
      v[y * w + x] = c;
    }
  }
  return v;
}
const yakin = (a: Nokta, b: Nokta, tol: number) => {
  expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(tol);
};

describe('erozyon / genislet / enBuyukBolge', () => {
  it('erosion shrinks a square by r on each side, dilation grows it back', () => {
    const m = kare(40, 40, 10, 10, 30, 30);
    const e = erozyon(m, 40, 40, 2);
    expect(say(e)).toBe(16 * 16);
    expect(say(genislet(e, 40, 40, 2))).toBe(20 * 20);
  });

  it('a region touching the frame is not eaten from the frame side', () => {
    const m = kare(20, 20, 0, 0, 10, 20);
    const e = erozyon(m, 20, 20, 1);
    expect(e[5 * 20 + 0]).toBe(1);   // left frame
    expect(e[5 * 20 + 9]).toBe(0);   // inner edge
  });

  it('largest 4-connected region', () => {
    const m = kare(30, 10, 0, 0, 5, 5);
    for (let y = 0; y < 10; y++) for (let x = 10; x < 25; x++) m[y * 30 + x] = 1;
    const r = enBuyukBolge(m, 30, 10);
    expect(r.size).toBe(150);
    expect(r.label[0]).not.toBe(r.best);
  });
});

describe('acikEnBuyuk', () => {
  it('cuts a thin bridge to background clutter and keeps the page edge where it was', () => {
    const w = 100, h = 60;
    const m = kare(w, h, 10, 10, 60, 50);                      // page
    for (let y = 28; y < 31; y++) for (let x = 60; x < 75; x++) m[y * w + x] = 1;   // 3 px bridge
    for (let y = 20; y < 40; y++) for (let x = 75; x < 95; x++) m[y * w + x] = 1;   // bright blob
    const r = acikEnBuyuk(m, w, h, 3)!;
    expect(r).not.toBeNull();
    expect(say(r)).toBe(50 * 40);
    expect(r[10 * w + 10]).toBe(1);   // page corner kept exactly
    expect(r[30 * w + 80]).toBe(0);   // blob gone
  });

  it('null when erosion leaves nothing', () => {
    expect(acikEnBuyuk(kare(20, 20, 5, 5, 8, 8), 20, 20, 3)).toBeNull();
  });
});

describe('lines', () => {
  it('intersection of two lines', () => {
    const p = kesisim(dogruIki({ x: 0, y: 0 }, { x: 10, y: 10 })!, dogruIki({ x: 0, y: 10 }, { x: 10, y: 0 })!)!;
    yakin(p, { x: 5, y: 5 }, 1e-9);
    expect(kesisim(dogruIki({ x: 0, y: 0 }, { x: 1, y: 0 })!, dogruIki({ x: 0, y: 1 }, { x: 1, y: 1 })!)).toBeNull();
  });

  it('weighted fit through points on a line', () => {
    const p = [0, 1, 2, 3, 4].map(x => ({ x, y: 2 * x + 1 }));
    const d = agirlikliDogru(p, p.map(() => 1))!;
    for (const q of p) expect(Math.abs(uzaklik(d, q))).toBeLessThan(1e-9);
  });

  it('RANSAC ignores outliers (grid line hits, spiral holes)', () => {
    const p: Nokta[] = [], wt: number[] = [];
    for (let i = 0; i < 30; i++) { p.push({ x: i * 10, y: 100 + i * 0.5 + ((i * 7) % 3 - 1) * 0.3 }); wt.push(50); }
    for (let i = 0; i < 12; i++) { p.push({ x: i * 25, y: 60 + (i * 13) % 30 }); wt.push(50); }
    const r = ransacDogru(p, wt, 2)!;
    expect(r.ic.slice(0, 30).every(Boolean)).toBe(true);
    expect(r.ic.slice(30).filter(Boolean).length).toBeLessThanOrEqual(1);
    expect(Math.abs(uzaklik(r.dogru, { x: 150, y: 107.5 }))).toBeLessThan(1);
  });
});

describe('profilGecis', () => {
  const adim = [...Array(20).fill(200), ...Array(20).fill(40)];

  it('finds a paper → background step', () => {
    expect(profilGecis(adim, 30, 100)?.i).toBe(19);
  });

  it('a grid line (dark 2 px, then paper again) is not an edge', () => {
    const p = [...Array(10).fill(200), 120, 120, ...Array(8).fill(200), ...Array(20).fill(40)];
    expect(profilGecis(p, 30, 100)?.i).toBe(19);   // the real edge further out, not the line at 10
    expect(profilGecis([...Array(10).fill(200), 120, 120, ...Array(28).fill(200)], 30, 100)).toBeNull();
  });

  it('the spiral: dark gap, then a bright wire further out still counts', () => {
    const p = [...Array(20).fill(200), ...Array(10).fill(30), ...Array(4).fill(190), ...Array(6).fill(NaN)];
    expect(profilGecis(p, 30, 100)?.i).toBe(19);
  });

  it('a soft shadow ramp is not a step', () => {
    const p = Array.from({ length: 40 }, (_, i) => 200 - Math.max(0, Math.min(100, (i - 10) * 4)));
    expect(profilGecis(p, 60, 100)).toBeNull();
  });

  it('outside the image counts as staying dark', () => {
    const p = [...Array(20).fill(200), ...Array(4).fill(40), ...Array(16).fill(NaN)];
    expect(profilGecis(p, 30, 100)?.i).toBe(19);
  });
});

describe('dortgenIncelt', () => {
  const w = 400, h = 300;
  const K: Kose4 = [{ x: 60, y: 40 }, { x: 340, y: 50 }, { x: 350, y: 260 }, { x: 50, y: 250 }];

  it('moves rough edges onto the real paper edges', () => {
    const v = sayfa(w, h, K);
    // rough: left edge 18 px inside (the hull stopped at the spiral holes), top edge 6 px outside
    const kaba: Kose4 = [{ x: 78, y: 34 }, { x: 340, y: 44 }, { x: 350, y: 260 }, { x: 68, y: 250 }];
    const r = dortgenIncelt(v, w, h, kaba, 50, 100);
    r.forEach((p, i) => yakin(p, K[i], 2.5));
  });

  it('keeps the rough corners when there is no paper edge near them', () => {
    const v = new Float32Array(w * h).fill(200);   // all paper: no step anywhere
    const kaba: Kose4 = [{ x: 78, y: 34 }, { x: 340, y: 44 }, { x: 350, y: 260 }, { x: 68, y: 250 }];
    expect(dortgenIncelt(v, w, h, kaba, 50, 100)).toEqual(kaba);
  });
});

describe('kenarDestekleri', () => {
  const w = 400, h = 300;
  const K: Kose4 = [{ x: 60, y: 40 }, { x: 340, y: 50 }, { x: 350, y: 260 }, { x: 50, y: 250 }];

  it('a whole page: every edge is supported', () => {
    for (const d of kenarDestekleri(sayfa(w, h, K), w, h, K, 50, 100)) expect(d).toBeGreaterThan(0.9);
  });

  it('half the page in shadow: the edge on the shadow border has no support', () => {
    const v = sayfa(w, h, K, x => x > 200);
    const yarim: Kose4 = [K[0], { x: 200, y: 45 }, { x: 200, y: 255 }, K[3]];
    const d = kenarDestekleri(v, w, h, yarim, 100, 100);   // drop 70 < 100: a shadow, not an edge
    expect(d[1]).toBeLessThan(0.1);
    expect(d[3]).toBeGreaterThan(0.9);
  });

  it('an edge along the image frame is not punished', () => {
    const k: Kose4 = [{ x: 0, y: 40 }, { x: 340, y: 50 }, { x: 350, y: 260 }, { x: 0, y: 250 }];
    expect(kenarDestekleri(sayfa(w, h, k), w, h, k, 50, 100)[3]).toBe(1);
  });
});

describe('koseBRgba with the 6.2d-2 stages', () => {
  it('a thin bright bridge to clutter no longer pulls the corner away', () => {
    const w = 400, h = 300;
    const K: Kose4 = [{ x: 80, y: 60 }, { x: 300, y: 60 }, { x: 300, y: 260 }, { x: 80, y: 260 }];
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let c = 50;
        if (x >= 80 && x < 300 && y >= 60 && y < 260) c = 220;                     // page
        if (x >= 186 && x < 190 && y >= 10 && y < 60) c = 220;                      // 4 px bright bridge (screen text)
        if (x >= 120 && x < 300 && y >= 0 && y < 10) c = 220;                       // bright clutter at the top
        d.set([c, c, c, 255], (y * w + x) * 4);
      }
    }
    const r = koseBRgba(d, w, h)!;
    expect(r).not.toBeNull();
    r.koseler.forEach((p, i) => yakin(p, K[i], 3));
  });
});
