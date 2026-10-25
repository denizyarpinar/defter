import type { OcrSayfa } from '../ocr/kayit/sema';
import { ornekD, pngCoz, type AtlasD } from './atlasCoz';
import type { ElYazisiAtlas } from './atlasSema';
import { GlifBellegi, kagitRengi, tukenmezAyar, type Glif, type Stil } from './basici';
import { dizgi, type Dizgi, type Kagit } from './dizgi';

// Task 6.4e-1: a typeset page (dizgi.ts) → a canvas, at any pixel size (zoom: call again with a bigger size).
// Paper in the atlas's paper colour; kareli/cizgili lines one device pixel wide, only a little darker than the
// paper so they never compete with the ink. Glyphs: tukenmez source-over, yumusak multiply (basici.ts).
// Fallback runs in the system font: normal weight, its x height measured to equal the atlas xh, in the colour's
// tukenmez tone a little toward the paper (so it does not stand out darker than the ink); drawings and the
// "devamı" note grey italic. A run is one fillText with the font's own spacing.
// 6.4e-2: weight 300 → 400, fallback 30 % → 15 % toward the paper; the "·" dot filled in the tukenmez tone;
// `bolge` draws only a part of the page into the canvas (the reader's sharp zoom canvas, like drawPdf's rect).

const AILE = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const AGIRLIK = 400;               // normal
const OLCU_PX = 100;               // font size the x height is measured at
const CIZGI_KOYULUK = 16;          // grid / rule: paper minus this (per channel)
const YEDEK_ACIK = 0.15;           // fallback colour: tone + 15 % of the way to the paper
const NOT_RENGI = '#8a8a8a';

const tip = (px: number, italik: boolean) => `${italik ? 'italic ' : ''}${AGIRLIK} ${px.toFixed(2)}px ${AILE}`;

// x height / font size of this font, measured once ('x' actualBoundingBoxAscent); 0.52 if the canvas cannot tell
const xOrani = new Map<boolean, number>();
export function yedekXOrani(italik: boolean): number {
  let r = xOrani.get(italik);
  if (r === undefined) {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) { ctx.font = tip(OLCU_PX, italik); r = ctx.measureText('x').actualBoundingBoxAscent / OLCU_PX; }
    if (!r || !Number.isFinite(r) || r < 0.3 || r > 0.8) r = 0.52;
    xOrani.set(italik, r);
  }
  return r;
}

// The font whose x height is xh
export const yedekFont = (xh: number, italik: boolean) => tip(xh / yedekXOrani(italik), italik);

// The fallback width for dizgi (page units), measured with the same font the page uses
export function canvasOlc(): (metin: string, xh: number, italik: boolean) => number {
  const ctx = document.createElement('canvas').getContext('2d')!;
  return (metin, xh, italik) => { ctx.font = yedekFont(xh, italik); return ctx.measureText(metin).width; };
}

const rgb = (c: readonly number[]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

// RGBA glyph → a small canvas, once per glyph
const resimler = new WeakMap<Glif, HTMLCanvasElement>();
function glifResmi(g: Glif): HTMLCanvasElement {
  let c = resimler.get(g);
  if (!c) {
    c = Object.assign(document.createElement('canvas'), { width: g.w, height: g.h });
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(g.rgba), g.w, g.h), 0, 0);
    resimler.set(g, c);
  }
  return c;
}

export interface TemizCizimAyar {
  genislik: number; yukseklik: number;   // canvas pixels
  atlas: ElYazisiAtlas;
  stil: Stil;
  bellek: GlifBellegi;
  bolge?: { x: number; y: number; w: number };   // 0–1 fractions of the page: only that part, filling the canvas
}

export function temizSayfaCiz(canvas: HTMLCanvasElement, d: Dizgi, o: TemizCizimAyar): void {
  canvas.width = Math.round(o.genislik);
  canvas.height = Math.round(o.yukseklik);
  const ctx = canvas.getContext('2d')!;
  const b = o.bolge ?? { x: 0, y: 0, w: 1 };
  const s = canvas.width / (b.w * d.en);
  const kagit = kagitRengi(o.atlas);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = rgb(kagit);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // a part of the page: shifted by whole pixels, so the paper lines stay on the pixel grid
  ctx.translate(-Math.round(b.x * d.en * s), -Math.round(b.y * d.boy * s));
  const W = Math.ceil(d.en * s), H = Math.ceil(d.boy * s);

  // paper lines: 1 device px, snapped to the pixel grid
  if (d.kagit !== 'duz') {
    ctx.strokeStyle = rgb(kagit.map(v => Math.max(0, v - CIZGI_KOYULUK)));
    ctx.lineWidth = 1;
    ctx.beginPath();
    const adim = d.kagit === 'kareli' ? d.kare : d.satirAraligi;
    const yatay = (y: number) => { const p = Math.round(y * s) + 0.5; ctx.moveTo(0, p); ctx.lineTo(W, p); };
    for (let y = d.ilkTaban - Math.floor(d.ilkTaban / adim) * adim; y <= d.boy; y += adim) yatay(y);
    if (d.kagit === 'kareli') {
      for (let x = d.kenar - Math.floor(d.kenar / adim) * adim; x <= d.en; x += adim) {
        const p = Math.round(x * s) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, H);
      }
    }
    ctx.stroke();
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const tonlar = tukenmezAyar(o.atlas).tonlar;
  for (const e of d.ogeler) {
    if (e.tur === 'glif') {
      const g = o.bellek.glif(o.stil, e.renk, e.karakter, e.ornek);
      ctx.globalCompositeOperation = o.stil === 'tukenmez' ? 'source-over' : 'multiply';
      ctx.drawImage(glifResmi(g), e.x * s, e.y * s, g.w * e.olcek * s, g.h * e.olcek * s);
      continue;
    }
    ctx.globalCompositeOperation = 'source-over';
    if (e.tur === 'nokta') {
      ctx.fillStyle = rgb(tonlar[e.renk] ?? tonlar.siyah ?? [25, 25, 30]);
      ctx.beginPath(); ctx.arc(e.x * s, e.y * s, e.r * s, 0, 2 * Math.PI); ctx.fill();
      continue;
    }
    const italik = e.tur !== 'yedek';
    ctx.font = yedekFont(e.xh * s, italik);
    if (e.tur === 'yedek') {
      const ton = tonlar[e.renk] ?? tonlar.siyah ?? [25, 25, 30];
      ctx.fillStyle = rgb(ton.map((v, i) => Math.round(v + YEDEK_ACIK * (kagit[i] - v))));
    } else ctx.fillStyle = NOT_RENGI;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(e.metin, e.x * s, e.taban * s);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ---- atlas + page in one step (the dev page and the Playwright check use this; 6.4e's reader will too) ----

export interface TemizYazici { atlas: ElYazisiAtlas; sayfa: AtlasD; bellek: GlifBellegi; sure: { coz: number } }

export async function temizYaziciKur(atlas: ElYazisiAtlas, png: Blob): Promise<TemizYazici> {
  const t0 = performance.now();
  const sayfa = await pngCoz(png, atlas);
  const bellek = new GlifBellegi(atlas, (k, i) => ornekD(sayfa, atlas.karakterler[k][i]));
  return { atlas, sayfa, bellek, sure: { coz: Math.round(performance.now() - t0) } };
}

export interface TemizSayfaAyar {
  en: number; boy: number;               // page units (e.g. PDF points)
  genislik: number; yukseklik: number;   // canvas pixels
  stil: Stil;
  kagit?: Kagit;
  oynama?: boolean;
}

export interface TemizSayfaSonucu { dizgi: Dizgi; sure: { dizgi: number; glif: number; cizim: number }; yeniGlif: number }

// Typeset, prepare the glyphs it needs (timed apart), draw
export function temizSayfa(canvas: HTMLCanvasElement, y: TemizYazici, sayfa: Pick<OcrSayfa, 'satirlar'>, a: TemizSayfaAyar): TemizSayfaSonucu {
  const t0 = performance.now();
  const d = dizgi(sayfa, { en: a.en, boy: a.boy, atlas: y.atlas, kagit: a.kagit, oynama: a.oynama, olc: canvasOlc() });
  const t1 = performance.now();
  const once = y.bellek.boyut;
  for (const e of d.ogeler) if (e.tur === 'glif') y.bellek.glif(a.stil, e.renk, e.karakter, e.ornek);
  const t2 = performance.now();
  temizSayfaCiz(canvas, d, { genislik: a.genislik, yukseklik: a.yukseklik, atlas: y.atlas, stil: a.stil, bellek: y.bellek });
  const t3 = performance.now();
  return { dizgi: d, sure: { dizgi: Math.round(t1 - t0), glif: Math.round(t2 - t1), cizim: Math.round(t3 - t2) }, yeniGlif: y.bellek.boyut - once };
}
