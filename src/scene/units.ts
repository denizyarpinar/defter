import { Vector3 } from 'three';

// World coords from the plan: x → right, y → toward viewer, z → up (cm-ish).
// three.js coords: X = x, Y = z, Z = y (×0.01).
export const U = 0.01;
export const P = (x: number, y: number, z: number): Vector3 => new Vector3(x * U, z * U, y * U);

// room size (plan units)
export const W = 1000, D = 800, H = 600;
// bookcase
export const BX = 300, BW = 380, BD = 72, SH = 88, BASE = 26, TOP = 16;

export const DESK_SPOT = P(78, 412, 146);
// "Yeni gelenler" pile: on the floor, left of the bookcase.
export const PILE_X = 232, PILE_Y = 40;

export function mulberry(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function hexRgb(h: string): [number, number, number] {
  h = h.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.substring(i, i + 2), 16)) as [number, number, number];
}

export function mixHex(a: string, b: string, k: number): string {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
}

// Light text on dark colours, dark text on light ones.
export function isDark(h: string): boolean {
  const [r, g, b] = hexRgb(h);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 150;
}
