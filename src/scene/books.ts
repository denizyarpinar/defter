import { BoxGeometry, Group, Mesh } from 'three';
import { daysSinceOpened } from '../model/library';
import type { Book } from '../model/types';
import { topicCount } from '../model/units';
import { add } from './geometry';
import { M, own, std } from './materials';
import { canvas, clothNoise, noise, tex } from './textures';
import { U, isDark, mixHex, mulberry } from './units';

// Book size in plan units (cm-ish). d = depth (front to back).
export interface BookDims { t: number; h: number; d: number }
export const BOOK_DEPTH = 54;

// Upper case by the book's language: English "i" → "I"; Turkish (and books without "dil") "i" → "İ".
const upper = (b: Book, s: string) => s.toLocaleUpperCase(b.dil?.toLowerCase().startsWith('en') ? 'en' : 'tr-TR');

// Thickness grows with chapters (surum 2: topics) and sources; height is fixed per book (from its id).
export function bookDims(b: Book): BookDims {
  const sources = b.bolumler.reduce((a, c) => a + c.kaynaklar.length, 0);
  const t = Math.max(17, Math.min(32, 14 + 3 * topicCount(b) + 1.5 * sources));
  let hash = 0;
  for (const ch of b.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { t, h: 60 + hash % 15, d: BOOK_DEPTH };
}

// A book not opened for 3 weeks gathers dust.
export const isDusty = (b: Book) => (daysSinceOpened(b) ?? 0) > 21;

const leatherOf = (b: Book) => b.kapak.stil === 'deri';
const inkOn = (b: Book) => leatherOf(b) ? '#dcbb6e' : (isDark(b.kapak.renk) ? '#f3eadb' : '#2a231d');

function spineCanvas(b: Book, t: number, h: number, dusty: boolean): HTMLCanvasElement {
  const k = 11, w = Math.max(48, Math.round(t * k)), hh = Math.round(h * k);
  return canvas(w, hh, g => {
    const leather = leatherOf(b);
    g.fillStyle = b.kapak.renk; g.fillRect(0, 0, w, hh);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(0,0,0,.30)'); gr.addColorStop(.3, 'rgba(255,255,255,.07)'); gr.addColorStop(.55, 'rgba(255,255,255,.03)'); gr.addColorStop(1, 'rgba(0,0,0,.34)');
    g.fillStyle = gr; g.fillRect(0, 0, w, hh);
    if (leather) {
      const r = mulberry(31);
      for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.12})`; g.beginPath(); g.ellipse(r() * w, r() * hh, 1 + r() * 3, .5 + r() * 1.5, r() * 3, 0, 7); g.fill(); }
    } else {
      g.globalAlpha = .08; g.fillStyle = '#000';
      for (let y = 0; y < hh; y += 2) g.fillRect(0, y, w, 1);
      for (let x = 0; x < w; x += 2) g.fillRect(x, 0, 1, hh);
      g.globalAlpha = 1;
    }
    const fg = inkOn(b);
    g.fillStyle = fg; g.globalAlpha = leather ? .9 : .5;
    const band = (y: number) => g.fillRect(0, y, w, Math.max(2, hh * 0.006));
    band(hh * .06); band(hh * .075); band(hh * .86); band(hh * .875); g.globalAlpha = 1;
    // title, top-to-bottom
    const txt = leather ? b.sirt : upper(b, b.sirt);
    let fs = w * 0.56;
    const fnt = (s: number) => leather ? `600 ${s}px "Cormorant Garamond", Georgia, serif` : `700 ${s * 0.8}px Figtree, Arial, sans-serif`;
    g.font = fnt(fs);
    while (g.measureText(txt).width > hh * 0.68 && fs > 8) { fs -= 1; g.font = fnt(fs); }
    g.save(); g.translate(w / 2, hh * 0.46); g.rotate(Math.PI / 2); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
    if (leather) { g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowOffsetY = 1; g.shadowBlur = 1; }
    g.fillText(txt, 0, 0); g.restore();
    g.font = `700 ${w * 0.3}px Figtree, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
    g.fillText(b.kod, w / 2, hh * 0.93);
    if (dusty) {
      g.fillStyle = 'rgba(232,226,214,.30)'; g.fillRect(0, 0, w, hh);
      const r = mulberry(5);
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(245,240,230,${r() * .5})`; g.fillRect(r() * w, r() * hh, 1.2, 1.2); }
    }
    noise(g, w, hh, 10, 7);
  });
}

function coverCanvas(b: Book, h: number): HTMLCanvasElement {
  const w = BOOK_DEPTH * 11, hh = Math.round(h * 11);
  return canvas(w, hh, g => {
    g.fillStyle = b.kapak.renk; g.fillRect(0, 0, w, hh);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(0,0,0,.25)'); gr.addColorStop(.06, 'rgba(0,0,0,.05)'); gr.addColorStop(1, 'rgba(0,0,0,.08)');
    g.fillStyle = gr; g.fillRect(0, 0, w, hh);
    const fg = inkOn(b);
    g.strokeStyle = fg; g.globalAlpha = .45; g.lineWidth = 2; g.strokeRect(40, 40, w - 80, hh - 80); g.globalAlpha = 1;
    g.fillStyle = fg; g.textAlign = 'center';
    const fs = 64; g.font = `600 ${fs}px "Cormorant Garamond", Georgia, serif`;
    const lines: string[] = []; let line = '';
    for (const wd of b.baslik.split(' ')) {
      const tryL = line ? line + ' ' + wd : wd;
      if (g.measureText(tryL).width > w - 140 && line) { lines.push(line); line = wd; } else line = tryL;
    }
    lines.push(line);
    lines.forEach((l, i) => g.fillText(l, w / 2, hh * 0.42 + (i - (lines.length - 1) / 2) * fs * 1.05));
    g.font = '700 20px Figtree, sans-serif'; g.globalAlpha = .75; g.fillText(upper(b, b.ders), w / 2, hh * 0.78); g.globalAlpha = 1;
    noise(g, w, hh, 10, 9);
  });
}

// 3D book standing upright: local X = thickness, Y = height, Z = depth (spine at +Z).
export function makeBook(b: Book): Group {
  const dims = bookDims(b);
  const t = dims.t * U, h = dims.h * U, d = dims.d * U, c = 0.013;
  const dusty = isDusty(b), leather = leatherOf(b);
  const g = new Group();
  const rough = leather ? .5 : .82;
  const cloth = clothNoise(leather ? 17 : 6);   // shared, cached texture
  const cov = own(std({ color: dusty ? mixHex(b.kapak.renk, '#d8d2c6', .25) : b.kapak.renk, map: cloth, roughness: dusty ? .95 : rough }));
  const spineTex = tex(spineCanvas(b, dims.t, dims.h, dusty)), frontTex = tex(coverCanvas(b, dims.h));
  const spineM = own(std({ map: spineTex, roughness: dusty ? .95 : rough }), spineTex);
  const frontM = own(std({ map: frontTex, roughness: rough }), frontTex);
  // pages block
  const pg = new Mesh(new BoxGeometry(t - 2 * c, h - 0.016, d - c - 0.008), M.pages);
  pg.position.z = ((-d / 2 + 0.008) + (d / 2 - c)) / 2; add(pg, g);
  // boards + spine
  const back = new Mesh(new BoxGeometry(c, h, d), cov); back.position.x = -t / 2 + c / 2; add(back, g);
  const front = new Mesh(new BoxGeometry(c, h, d), [frontM, cov, cov, cov, cov, cov]); front.position.x = t / 2 - c / 2; add(front, g);
  const spine = new Mesh(new BoxGeometry(t, h, c), [cov, cov, cov, cov, spineM, cov]); spine.position.z = d / 2 - c / 2; add(spine, g);
  if (b.kurdele !== null) {
    const rb = new Mesh(new BoxGeometry(0.022, 0.14, 0.003), own(std({ color: 0xb5302b, roughness: .45 })));
    rb.position.set(t * 0.15, h / 2 - 0.05, d / 2 + 0.003); add(rb, g);
  }
  g.traverse(o => { o.userData.bookId = b.id; });
  g.userData.dims = dims;
  return g;
}
