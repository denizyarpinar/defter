import { roundPressure } from './cizgi';
import type { KalemKaydi, Olay } from './kalemOlcum';
import { EventOrder, MIN_STEP, MIN_STEP_PX, pushLastPoint, pushPoint, roundPt } from './koordinat';

// Task 6.H2b, development only: replays a ?olcum=1 record (window.defterKalemOlcum() JSON) with the old
// and the new point rules, for the comparison page (?kalemTest=1, kalemTest.ts). No DOM, so it can be tested.
// The record has the events in client px and the kept points in pt, but not the page's place on screen.
// The page is taken as upright (pt y goes up the screen), and the scale (px per pt) is the one with which
// the old rules give back exactly the kept points; that also checks the replay.

// A record as far as this needs it (a pasted one may lack the newer fields)
export type Kayit = Pick<KalemKaydi, 'arac' | 'kalinlik' | 'olaylar' | 'saklanan' | 'hamUzunlukPx' | 'uzunlukPt'> & Partial<KalemKaydi>;

export interface Tekrar {
  noktalar: number[];
  basinc?: number[];
  cift: number;        // events dropped as repeats (new rules only)
}

// The JSON array out of a pasted text or a file (it may have text around it)
export function kayitlariAyikla(text: string): Kayit[] {
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  if (a < 0 || b < a) throw new Error('Metinde kalem kaydı (JSON dizisi) bulunamadı.');
  const list = JSON.parse(text.slice(a, b + 1)) as unknown;
  if (!Array.isArray(list)) throw new Error('Kalem kaydı bir dizi olmalı.');
  return list.filter((k): k is Kayit => !!k && Array.isArray(k.olaylar) && Array.isArray(k.saklanan) && k.sonuc !== 'reddedildi');
}

// The events as the pen input took them: the down, each move's coalesced events (the move itself when it had
// none), the up. In the record a move comes first, then its coalesced events.
export function gruplar(olaylar: readonly Olay[]): { down: Olay | null; moves: Olay[][]; up: Olay | null } {
  let down: Olay | null = null, up: Olay | null = null;
  const moves: { m: Olay; c: Olay[] }[] = [];
  for (const o of olaylar) {
    if (o[0] === 'd') down = o;
    else if (o[0] === 'm') moves.push({ m: o, c: [] });
    else if (o[0] === 'c' && moves.length) moves[moves.length - 1].c.push(o);
    else if (o[0] === 'u') up = o;
  }
  return { down, moves: moves.map(g => (g.c.length ? g.c : [g.m])), up };
}

type Map2 = (o: Olay) => [number, number];

function mapper(k: Kayit, s: number): Map2 | null {
  const d = gruplar(k.olaylar).down;
  if (!d || k.saklanan.length < 2) return null;
  const [x0, y0] = k.saklanan;
  return o => [x0 + (o[1] - d[1]) / s, y0 - (o[2] - d[2]) / s];
}

// The old rules (until 6.H2b): every event, 0.5 pt apart, unrounded, no up point, the same move twice taken twice
export function eskiKurallar(k: Kayit, s: number): Tekrar {
  const map = mapper(k, s);
  if (!map) return { noktalar: k.saklanan.slice(), cift: 0 };
  const g = gruplar(k.olaylar);
  const pts: number[] = [];
  pushPoint(pts, ...map(g.down!));
  for (const evs of g.moves) for (const o of evs) pushPoint(pts, ...map(o), MIN_STEP);
  return { noktalar: pts, cift: 0 };
}

// The new rules: repeats dropped (EventOrder), 1 screen px apart (at most 0.5 pt), 0.01 pt, the up point,
// the pen's pressure kept (a flat one draws at a constant width)
export function yeniKurallar(k: Kayit, s: number): Tekrar {
  const map = mapper(k, s);
  if (!map) return { noktalar: k.saklanan.slice(), cift: 0 };
  const g = gruplar(k.olaylar);
  const step = Math.min(MIN_STEP, MIN_STEP_PX / s);
  const order = new EventOrder();
  const pts: number[] = [], basinc: number[] = [];
  let cift = 0;
  const add = (o: Olay) => {
    if (!order.accept(o[3], o[1], o[2])) { cift++; return; }
    const [x, y] = map(o);
    if (pushPoint(pts, roundPt(x), roundPt(y), step)) basinc.push(roundPressure(o[4]));
  };
  add(g.down!);
  for (const evs of g.moves) for (const o of evs) add(o);
  if (g.up) {
    if (order.accept(g.up[3], g.up[1], g.up[2])) {
      const [x, y] = map(g.up);
      pushLastPoint(pts, basinc, roundPt(x), roundPt(y), step);
    } else cift++;
  }
  const out: Tekrar = { noktalar: pts, cift };
  if (k.pointerType === 'pen' && k.arac === 'kalem') out.basinc = basinc;
  return out;
}

// How far the old replay is from the kept points: count difference and the largest gap (pt)
export function fark(a: readonly number[], b: readonly number[]): { sayi: number; enCok: number } {
  let enCok = 0;
  for (let i = 0; i + 1 < Math.min(a.length, b.length); i += 2) enCok = Math.max(enCok, Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1]));
  return { sayi: (a.length - b.length) / 2, enCok };
}

// The scale (px per pt) with which the old rules give back the kept points: searched around the length ratio
export function olcekBul(k: Kayit): { s: number; tutuyor: boolean; enCok: number } {
  const s0 = k.uzunlukPt > 0 ? k.hamUzunlukPx / k.uzunlukPt : 3;
  let best = { s: s0, puan: Infinity, enCok: Infinity, sayi: 0 };
  for (let f = 0.8; f <= 1.25; f += 0.0005) {
    const s = s0 * f;
    const d = fark(eskiKurallar(k, s).noktalar, k.saklanan);
    const puan = Math.abs(d.sayi) * 100 + d.enCok;
    if (puan < best.puan) best = { s, puan, enCok: d.enCok, sayi: d.sayi };
  }
  return { s: best.s, tutuyor: best.sayi === 0 && best.enCok < 0.03, enCok: best.enCok };
}

// ---- built-in samples: what a pen without pressure sends at 3 px/pt, on a 0.5 px grid, every ~4 ms ----

const ORNEK_OLCEK = 3;

// A path in pt (upright: y up) → a record: events in client px, the kept points by the old rules.
// tekrar: these moves come twice (as on the iPad)
function ornekKayit(arac: 'kalem' | 'fosforlu', kalinlik: number, yol: [number, number][], tekrar: number[] = []): Kayit {
  const q = (v: number) => Math.round(v * 2) / 2;
  const ev = (tur: Olay[0], p: [number, number], t: number): Olay => [tur, q(400 + p[0] * ORNEK_OLCEK), q(400 - p[1] * ORNEK_OLCEK), t, 0.12];
  const olaylar: Olay[] = [ev('d', yol[0], 0)];
  let t = 0;
  for (let i = 1, m = 0; i < yol.length; i += 4, m++) {
    const grup: Olay[] = [];
    for (let j = i; j < Math.min(i + 4, yol.length); j++) grup.push(ev('c', yol[j], (t += 4)));
    const mOlay: Olay = ['m', grup[grup.length - 1][1], grup[grup.length - 1][2], t, 0.12];
    olaylar.push(mOlay, ...grup);
    if (tekrar.includes(m)) olaylar.push(mOlay, ...grup);
  }
  const son = yol[yol.length - 1];
  olaylar.push(ev('u', [son[0] + 0.3, son[1] - 0.2], t + 8));
  olaylar[olaylar.length - 1][4] = 0;
  const k: Kayit = {
    arac, kalinlik, olaylar, saklanan: [yol[0][0], yol[0][1]], hamUzunlukPx: 0, uzunlukPt: 0, pointerType: 'pen'
  };
  k.saklanan = eskiKurallar(k, ORNEK_OLCEK).noktalar.map(roundPt);
  k.uzunlukPt = 1; k.hamUzunlukPx = ORNEK_OLCEK;   // the scale is known: the search starts there
  return k;
}

// points along a path given by a function of u (0–1), about `adim` pt apart
function boyunca(f: (u: number) => [number, number], adim: number): [number, number][] {
  const fine: [number, number][] = [];
  for (let i = 0; i <= 2000; i++) fine.push(f(i / 2000));
  const out: [number, number][] = [fine[0]];
  let acc = 0;
  for (let i = 1; i < fine.length; i++) {
    acc += Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]);
    if (acc >= adim) { out.push(fine[i]); acc = 0; }
  }
  return out;
}

export function ornekKayitlar(): { ad: string; kayit: Kayit }[] {
  const adim = 0.33;   // ~1 px at 3 px/pt: a slow pen
  // "u" 6 pt high: down, a half circle at the bottom, up
  const u = boyunca(v => {
    if (v < 0.3) return [0, 6 - (v / 0.3) * 4];
    if (v < 0.7) { const a = Math.PI * (v - 0.3) / 0.4; return [2 - 2 * Math.cos(a), 2 - 2 * Math.sin(a)]; }
    return [4, 2 + (v - 0.7) / 0.3 * 4];
  }, adim);
  // "s": the top arc anticlockwise from the upper right, the bottom one clockwise to the lower left
  const deg = Math.PI / 180;
  const s = boyunca(v => {
    if (v < 0.5) { const a = (30 + 240 * v / 0.5) * deg; return [2 + 1.5 * Math.cos(a), 6 + 1.5 * Math.sin(a)]; }
    const a = (90 - 240 * (v - 0.5) / 0.5) * deg;
    return [2 + 1.5 * Math.cos(a), 3 + 1.5 * Math.sin(a)];
  }, adim);
  // "A": up, down (a sharp tip)
  const A = boyunca(v => (v < 0.5 ? [v * 2 * 3, v * 2 * 8] : [3 + (v - 0.5) * 2 * 3, 8 - (v - 0.5) * 2 * 8]), adim);
  // highlighter: tight loops, 12 pt wide
  const kivrim = boyunca(v => {
    const a = v * 6 * Math.PI;
    return [v * 60 + 5 * Math.cos(a), 5 * Math.sin(a)];
  }, 1);
  return [
    { ad: 'Örnek: u', kayit: ornekKayit('kalem', 2.2, u) },
    { ad: 'Örnek: s (2 move iki kez)', kayit: ornekKayit('kalem', 2.2, s, [3, 4]) },
    { ad: 'Örnek: A', kayit: ornekKayit('kalem', 2.2, A) },
    { ad: 'Örnek: fosforlu, sıkı kıvrım', kayit: ornekKayit('fosforlu', 12, kivrim) },
  ];
}
