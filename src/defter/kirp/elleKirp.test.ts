import { describe, expect, it } from 'vitest';
import { alan, type Kose4 } from './kirpHesap';
import { koseleriBuyut } from './kirpKarar';
import {
  BASLANGIC_PAY, ELLE_MIN_ALAN, TUTAMAC_YARICAP, baslangicDortgeni, buyutecKaynagi, ekrandanGorsele, enYakinKose,
  gecerliMi, gorseldenEkrana, koselerEsit, sigdir, sinirla
} from './elleKirp';

// Task 5.8d: the corner editor, pure part.

const FOTO = { width: 4000, height: 3000 };
const SAYFA: Kose4 = [{ x: 900, y: 300 }, { x: 3100, y: 380 }, { x: 3200, y: 2800 }, { x: 800, y: 2700 }];

describe('settings', () => {
  it('touch area at least 44 px, sensible limits', () => {
    expect(TUTAMAC_YARICAP * 2).toBeGreaterThanOrEqual(44);
    expect(BASLANGIC_PAY).toBe(0.08);
    expect(ELLE_MIN_ALAN).toBeGreaterThan(0);
    expect(ELLE_MIN_ALAN).toBeLessThan(0.15);
  });
});

describe('sigdir', () => {
  it('landscape photo in a portrait screen: width fills, centred vertically', () => {
    const s = sigdir(FOTO, { width: 800, height: 1000 });
    expect(s.olcek).toBeCloseTo(0.2);
    expect(s.ofsetX).toBeCloseTo(0);
    expect(s.ofsetY).toBeCloseTo((1000 - 600) / 2);
  });

  it('portrait photo in a landscape screen: height fills, centred horizontally, with a margin', () => {
    const s = sigdir({ width: 3000, height: 4000 }, { width: 1200, height: 820 }, 10);
    expect(s.olcek).toBeCloseTo(0.2);
    expect(s.ofsetY).toBeCloseTo(10);
    expect(s.ofsetX).toBeCloseTo((1200 - 600) / 2);
  });
});

describe('screen ↔ image', () => {
  const s = sigdir(FOTO, { width: 1024, height: 700 }, 16);

  it('round trip', () => {
    for (const p of SAYFA) {
      const q = ekrandanGorsele(gorseldenEkrana(p, s), s);
      expect(q.x).toBeCloseTo(p.x);
      expect(q.y).toBeCloseTo(p.y);
    }
  });

  it('image corners land on the fitted rectangle', () => {
    expect(gorseldenEkrana({ x: 0, y: 0 }, s)).toEqual({ x: s.ofsetX, y: s.ofsetY });
    const p = gorseldenEkrana({ x: 4000, y: 3000 }, s);
    expect(p.x).toBeCloseTo(s.ofsetX + 4000 * s.olcek);
    expect(p.y).toBeCloseTo(s.ofsetY + 3000 * s.olcek);
  });
});

describe('sinirla', () => {
  it('a handle stays inside the image', () => {
    expect(sinirla({ x: -50, y: 3200 }, FOTO)).toEqual({ x: 0, y: 3000 });
    expect(sinirla({ x: 4100, y: -1 }, FOTO)).toEqual({ x: 4000, y: 0 });
    expect(sinirla({ x: 10, y: 20 }, FOTO)).toEqual({ x: 10, y: 20 });
  });
});

describe('enYakinKose', () => {
  const ekran = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 400 }, { x: 100, y: 400 }];
  it('inside the radius: that handle; outside: -1', () => {
    expect(enYakinKose({ x: 110, y: 115 }, ekran)).toBe(0);
    expect(enYakinKose({ x: 300 - 21, y: 400 + 5 }, ekran)).toBe(2);
    expect(enYakinKose({ x: 200, y: 250 }, ekran)).toBe(-1);
  });
  it('two handles close together: the nearer one', () => {
    expect(enYakinKose({ x: 118, y: 100 }, [{ x: 100, y: 100 }, { x: 130, y: 100 }])).toBe(1);
  });
});

describe('gecerliMi', () => {
  it('the found page is valid and stays as it is', () => {
    const g = gecerliMi(SAYFA, FOTO);
    expect(g.gecerli).toBe(true);
    expect(g.koseler).toEqual(SAYFA);
  });

  it('handles swapped crosswise (convex as points) → sorted into the right turn, valid', () => {
    // top-left ↔ top-right and bottom-left ↔ bottom-right swapped: drawn in handle order it is a bow tie
    const g = gecerliMi([SAYFA[1], SAYFA[0], SAYFA[3], SAYFA[2]], FOTO);
    expect(g.gecerli).toBe(true);
    expect(g.koseler).toEqual(SAYFA);
    expect(alan(g.koseler)).toBeGreaterThan(0);   // clockwise on screen: not mirrored
  });

  it('diagonal handles swapped → the same sorted page', () => {
    expect(gecerliMi([SAYFA[2], SAYFA[3], SAYFA[0], SAYFA[1]], FOTO).koseler).toEqual(SAYFA);
  });

  it('a dent (one corner pulled inside) → not convex', () => {
    const g = gecerliMi([SAYFA[0], SAYFA[1], { x: 1500, y: 1000 }, SAYFA[3]], FOTO);
    expect(g).toMatchObject({ gecerli: false, neden: 'disbukeyDegil' });
  });

  it('three corners on a line or two on the same spot → not valid', () => {
    expect(gecerliMi([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 0 }, { x: 1000, y: 2000 }], FOTO).gecerli).toBe(false);
    expect(gecerliMi([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 2000, y: 2000 }, { x: 0, y: 2000 }], FOTO).gecerli).toBe(false);
  });

  it('too small → kucuk', () => {
    const g = gecerliMi([{ x: 100, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 400 }, { x: 100, y: 400 }], FOTO);
    expect(g).toMatchObject({ gecerli: false, neden: 'kucuk' });
  });
});

describe('baslangicDortgeni', () => {
  it('no corners: 8 % inside the photo, valid', () => {
    const k = baslangicDortgeni(null, FOTO);
    expect(k).toEqual([{ x: 320, y: 240 }, { x: 3680, y: 240 }, { x: 3680, y: 2760 }, { x: 320, y: 2760 }]);
    expect(gecerliMi(k, FOTO).gecerli).toBe(true);
  });

  it('corners found: those, kept inside the photo', () => {
    expect(baslangicDortgeni(SAYFA, FOTO)).toEqual(SAYFA);
    expect(baslangicDortgeni([{ x: -2, y: 0 }, SAYFA[1], SAYFA[2], { x: 800, y: 3001 }], FOTO)[0]).toEqual({ x: 0, y: 0 });
  });
});

describe('koselerEsit', () => {
  it('same values, null', () => {
    expect(koselerEsit(SAYFA, SAYFA.map(p => ({ ...p })) as Kose4)).toBe(true);
    expect(koselerEsit(SAYFA, baslangicDortgeni(null, FOTO))).toBe(false);
    expect(koselerEsit(null, null)).toBe(true);
    expect(koselerEsit(SAYFA, null)).toBe(false);
  });
});

describe('koseleriBuyut (preview ↔ full size)', () => {
  const tam = { width: 4032, height: 3024 }, onizleme = { width: 1600, height: 1200 };
  it('round trip keeps the corners', () => {
    const geri = koseleriBuyut(koseleriBuyut(SAYFA, tam, onizleme), onizleme, tam);
    geri.forEach((p, i) => { expect(p.x).toBeCloseTo(SAYFA[i].x); expect(p.y).toBeCloseTo(SAYFA[i].y); });
  });
  it('the preview\'s far corner is the photo\'s far corner', () => {
    const [p] = koseleriBuyut([{ x: 1600, y: 1200 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], onizleme, tam);
    expect(p).toEqual({ x: 4032, y: 3024 });
  });
});

describe('buyutecKaynagi', () => {
  const onizleme = { width: 1600, height: 1200 };   // 4000×3000 photo at 0.4
  it('in the middle: a square around the point, the whole magnifier filled', () => {
    // screen scale 0.2 → 120 px magnifier at 2.5x shows 48 screen px = 240 photo px = 96 preview px
    const b = buyutecKaynagi({ x: 2000, y: 1500 }, FOTO, onizleme, 0.2, 120)!;
    expect(b.sx).toBeCloseTo(800 - 48);
    expect(b.sy).toBeCloseTo(600 - 48);
    expect(b.sw).toBeCloseTo(96);
    expect(b.sh).toBeCloseTo(96);
    expect([b.dx, b.dy, b.dw, b.dh]).toEqual([0, 0, 120, 120]);
  });
  it('at the image corner: cut to the image, drawn in the lower right quarter', () => {
    const b = buyutecKaynagi({ x: 0, y: 0 }, FOTO, onizleme, 0.2, 120)!;
    expect([b.sx, b.sy]).toEqual([0, 0]);
    expect(b.sw).toBeCloseTo(48);
    expect(b.dx).toBeCloseTo(60);
    expect(b.dy).toBeCloseTo(60);
    expect(b.dw).toBeCloseTo(60);
  });
});
