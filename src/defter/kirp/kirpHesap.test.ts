import { describe, expect, it } from 'vitest';
import { MAX_KENAR } from '../ayarlar';
import { alan, cikisBoyutu, disbukeyZarf, dortgenPuani, dortKoseyeIndir, homografi, koseleriSirala, olcekle, uygula, type Kose4, type Nokta } from './kirpHesap';
import { koseBRgba, otsu } from './koseB';

const yakin = (a: Nokta, b: Nokta, tol: number) => {
  expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(tol);
};
const yakin4 = (a: Kose4, b: Kose4, tol: number) => a.forEach((p, i) => yakin(p, b[i], tol));

// slightly tilted page in a 1000×800 photo
const SAYFA: Kose4 = [{ x: 180, y: 90 }, { x: 760, y: 120 }, { x: 800, y: 700 }, { x: 140, y: 680 }];

describe('koseleriSirala', () => {
  it('any order → top-left, top-right, bottom-right, bottom-left', () => {
    const [a, b, c, d] = SAYFA;
    for (const p of [[a, b, c, d], [c, a, d, b], [d, c, b, a], [b, d, a, c]]) expect(koseleriSirala(p)).toEqual(SAYFA);
  });

  it('works for a page turned about 30°', () => {
    const r = (x: number, y: number) => ({ x: 500 + x * Math.cos(0.5) - y * Math.sin(0.5), y: 400 + x * Math.sin(0.5) + y * Math.cos(0.5) });
    const k = [r(-200, -280), r(200, -280), r(200, 280), r(-200, 280)];
    expect(koseleriSirala([k[2], k[0], k[3], k[1]])).toEqual(k);
  });

  it('needs exactly 4 points', () => {
    expect(() => koseleriSirala(SAYFA.slice(0, 3))).toThrow(RangeError);
  });
});

describe('disbukeyZarf + dortKoseyeIndir', () => {
  it('hull of a square with inside points is the square', () => {
    const p = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }, { x: 2, y: 7 }, { x: 5, y: 0 }];
    const h = disbukeyZarf(p);
    expect(h).toHaveLength(4);
    expect(alan(h)).toBeCloseTo(100);   // clockwise on screen
  });

  it('dents (finger, spiral holes) on the edge do not move the corners', () => {
    const pts: Nokta[] = [];
    // outline of SAYFA, 50 points per edge
    for (let e = 0; e < 4; e++) {
      const a = SAYFA[e], b = SAYFA[(e + 1) % 4];
      for (let i = 0; i < 50; i++) pts.push({ x: a.x + (b.x - a.x) * i / 50, y: a.y + (b.y - a.y) * i / 50 });
    }
    // spiral holes: bites into the left edge; finger: a deep notch at the bottom
    const dented = pts.map((p, i) => {
      if (i > 150 && i < 200 && i % 5 === 0) return { x: p.x + 15, y: p.y };
      if (i >= 115 && i < 125) return { x: p.x, y: p.y - 60 };
      return p;
    });
    const k = dortKoseyeIndir(disbukeyZarf(dented));
    expect(k).not.toBeNull();
    yakin4(k!, SAYFA, 0.001);
  });

  it('many hull points: still the right corners (thinned)', () => {
    const pts: Nokta[] = [];
    for (let i = 0; i < 2000; i++) {
      const t = i / 2000 * Math.PI * 2;
      // rounded square ("superellipse") with sharp-ish corners
      const c = Math.cos(t), s = Math.sin(t);
      pts.push({ x: 500 + 300 * Math.sign(c) * Math.abs(c) ** 0.1, y: 400 + 300 * Math.sign(s) * Math.abs(s) ** 0.1 });
    }
    const k = dortKoseyeIndir(disbukeyZarf(pts))!;
    yakin4(k, [{ x: 200, y: 100 }, { x: 800, y: 100 }, { x: 800, y: 700 }, { x: 200, y: 700 }], 30);
  });

  it('fewer than 4 hull points → null', () => {
    expect(dortKoseyeIndir([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }])).toBeNull();
  });
});

describe('dortgenPuani', () => {
  it('a tilted page scores well', () => {
    expect(dortgenPuani(SAYFA, 1000, 800)).toBeGreaterThan(0.7);
  });

  it('rejects the whole frame, tiny and non-convex shapes', () => {
    expect(dortgenPuani([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 800 }, { x: 0, y: 800 }], 1000, 800)).toBe(0);
    expect(dortgenPuani([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], 1000, 800)).toBe(0);
    expect(dortgenPuani([{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 700 }], 1000, 800)).toBe(0);
  });

  it('a strongly skewed shape scores lower than a straight one', () => {
    const duz: Kose4 = [{ x: 200, y: 100 }, { x: 800, y: 100 }, { x: 800, y: 700 }, { x: 200, y: 700 }];
    const egri: Kose4 = [{ x: 400, y: 100 }, { x: 900, y: 150 }, { x: 600, y: 700 }, { x: 100, y: 650 }];
    expect(dortgenPuani(egri, 1000, 800)).toBeLessThan(dortgenPuani(duz, 1000, 800));
  });
});

describe('cikisBoyutu', () => {
  it('averages opposite edges', () => {
    expect(cikisBoyutu([{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 800 }, { x: 0, y: 800 }])).toEqual({ width: 600, height: 800 });
  });

  it('long edge never over MAX_KENAR, aspect kept', () => {
    const k = olcekle([{ x: 0, y: 0 }, { x: 2100, y: 0 }, { x: 2100, y: 2970 }, { x: 0, y: 2970 }], 1);
    const b = cikisBoyutu(k);
    expect(b.height).toBe(MAX_KENAR);
    expect(b.width).toBe(Math.round(2100 * MAX_KENAR / 2970));
  });

  it('never enlarges', () => {
    expect(cikisBoyutu([{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 150 }, { x: 10, y: 150 }])).toEqual({ width: 100, height: 140 });
  });
});

describe('homografi', () => {
  const kare: Kose4 = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

  it('maps each corner onto its target', () => {
    const H = homografi(kare, SAYFA)!;
    kare.forEach((p, i) => yakin(uygula(H, p), SAYFA[i], 1e-6));
  });

  it('rectangle → page and back is the identity', () => {
    const rect: Kose4 = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 800 }, { x: 0, y: 800 }];
    const H = homografi(rect, SAYFA)!, Hi = homografi(SAYFA, rect)!;
    for (const p of [{ x: 300, y: 400 }, { x: 17, y: 650 }, { x: 590, y: 3 }]) yakin(uygula(Hi, uygula(H, p)), p, 1e-6);
  });

  it('straight lines stay straight (centre of square → crossing of the diagonals)', () => {
    const H = homografi(kare, SAYFA)!;
    const m = uygula(H, { x: 0.5, y: 0.5 });
    const [a, , c] = SAYFA, [, b, , d] = SAYFA;
    // m lies on both diagonals a–c and b–d
    const onLine = (p: Nokta, q: Nokta) => (q.x - p.x) * (m.y - p.y) - (q.y - p.y) * (m.x - p.x);
    expect(Math.abs(onLine(a, c))).toBeLessThan(1e-6);
    expect(Math.abs(onLine(b, d))).toBeLessThan(1e-6);
  });

  it('three points on a line → null', () => {
    expect(homografi(kare, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 0, y: 5 }])).toBeNull();
  });
});

describe('method B on a synthetic photo', () => {
  // dark wooden desk, warm-lit grid paper, spiral holes on the left edge, a finger over the bottom edge
  function foto(w: number, h: number, k: Kose4): Uint8ClampedArray {
    const d = new Uint8ClampedArray(w * h * 4);
    const inside = (x: number, y: number) => {
      for (let i = 0; i < 4; i++) {
        const a = k[i], b = k[(i + 1) % 4];
        if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
      }
      return true;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let c = [70 + ((x * 7 + y * 3) % 20), 45, 30];   // desk
        if (inside(x + 0.5, y + 0.5)) {
          c = (x % 20 === 0 || y % 20 === 0) ? [190, 175, 160] : [235, 205, 165];   // warm paper + grid
          const hx = k[0].x + (k[3].x - k[0].x) * (y - k[0].y) / (k[3].y - k[0].y) + 12;
          if (Math.hypot(x - hx, (y % 30) - 15) < 5) c = [40, 30, 25];   // spiral hole
          if (Math.hypot(x - 450, y - (k[3].y + k[2].y) / 2) < 40) c = [200, 140, 110];   // finger (skin)
        }
        d.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
      }
    }
    return d;
  }

  it('finds the page corners', () => {
    const k: Kose4 = [{ x: 150, y: 70 }, { x: 640, y: 95 }, { x: 670, y: 560 }, { x: 115, y: 545 }];
    const r = koseBRgba(foto(800, 600, k), 800, 600);
    expect(r).not.toBeNull();
    yakin4(r!.koseler, k, 6);
    expect(r!.guven).toBeGreaterThan(0.6);
  });

  it('an even picture has no page → null', () => {
    const d = new Uint8ClampedArray(200 * 150 * 4).fill(120);
    expect(koseBRgba(d, 200, 150)).toBeNull();
  });

  it('otsu splits two groups', () => {
    const v = new Float32Array(1000);
    v.fill(50, 0, 600);
    v.fill(200, 600);
    const t = otsu(v);
    expect(t).toBeGreaterThanOrEqual(50);
    expect(t).toBeLessThan(200);
  });
});
