// Task 6.2d-1: measures koseB on real notebook photos against hand-set corners.
// The photos and the corners live outside the repo (../defter-test-dosyalari/kose/: *.jpg + dogru.json);
// without that folder the test is skipped. Writes kose/sonuc-koseB.json (read by kose-kontrol.mjs)
// and kose/tani/<photo>.png (paper value | threshold mask, largest region in green, hull in red).
// Run: npx vitest run scripts/kose-olcum.test.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { disbukeyZarf, dortKoseyeIndir, koseleriSirala, type Kose4, type Nokta } from '../src/defter/kirp/kirpHesap';
import { ilkKarar, koseleriBuyut } from '../src/defter/kirp/kirpKarar';
import { B_KENAR, BLUR_YARICAP, DOYGUNLUK_AGIRLIGI, koseBRgba, otsu } from '../src/defter/kirp/koseB';

const KOSE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'defter-test-dosyalari', 'kose');
const IOU_IYI = 0.95, HATA_IYI = 2;   // a result is "bad" below this IoU or above this corner error (% long edge)

type Dogru = Record<string, { w: number; h: number; koseler: [number, number][]; not?: string }>;

// Sutherland–Hodgman: clip convex polygon a by convex polygon b (both clockwise on screen).
function kesisim(a: Nokta[], b: Nokta[]): Nokta[] {
  let out = a;
  for (let i = 0; i < b.length && out.length; i++) {
    const p = b[i], q = b[(i + 1) % b.length];
    const ic = (r: Nokta) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x) >= 0;
    const kes = (r: Nokta, s: Nokta): Nokta => {
      const a1 = q.y - p.y, b1 = p.x - q.x, c1 = a1 * p.x + b1 * p.y;
      const a2 = s.y - r.y, b2 = r.x - s.x, c2 = a2 * r.x + b2 * r.y;
      const d = a1 * b2 - a2 * b1;
      return { x: (b2 * c1 - b1 * c2) / d, y: (a1 * c2 - a2 * c1) / d };
    };
    const inp = out;
    out = [];
    for (let j = 0; j < inp.length; j++) {
      const cur = inp[j], prev = inp[(j + inp.length - 1) % inp.length];
      if (ic(cur)) { if (!ic(prev)) out.push(kes(prev, cur)); out.push(cur); }
      else if (ic(prev)) out.push(kes(prev, cur));
    }
  }
  return out;
}
const alanAbs = (p: Nokta[]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2);
function iou(a: Kose4, b: Kose4): number {
  const i = alanAbs(kesisim(a, b));
  return i / (alanAbs(a) + alanAbs(b) - i);
}

// Same stages as koseBRgba, kept here so the intermediate images can be drawn (koseB.ts does not export them).
function asamalar(rgba: Uint8Array, w: number, h: number) {
  const n = w * h;
  let v: Float32Array = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    v[i] = 0.299 * r + 0.587 * g + 0.114 * b - DOYGUNLUK_AGIRLIGI * (Math.max(r, g, b) - Math.min(r, g, b));
  }
  const blur = (src: Float32Array, yatay: boolean) => {
    const out = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let d = -BLUR_YARICAP; d <= BLUR_YARICAP; d++) {
        const xx = yatay ? x + d : x, yy = yatay ? y : y + d;
        if (xx >= 0 && xx < w && yy >= 0 && yy < h) { s += src[yy * w + xx]; c++; }
      }
      out[y * w + x] = s / c;
    }
    return out;
  };
  for (let k = 0; k < 2; k++) v = blur(blur(v, true), false);
  const t = otsu(v);
  const label = new Int32Array(n), stack = new Int32Array(n);
  let best = 0, bestSize = 0, next = 0;
  for (let s = 0; s < n; s++) {
    if (label[s] !== 0 || v[s] <= t) continue;
    next++;
    let top = 0, size = 0;
    stack[top++] = s;
    label[s] = next;
    while (top > 0) {
      const p = stack[--top];
      size++;
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= n || label[q] !== 0 || v[q] <= t) continue;
        label[q] = next;
        stack[top++] = q;
      }
    }
    if (size > bestSize) { bestSize = size; best = next; }
  }
  const ends: Nokta[] = [];
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) if (label[y * w + x] === best) { if (l < 0) l = x; r = x; }
    if (l >= 0) ends.push({ x: l, y }, { x: r + 1, y }, { x: l, y: y + 1 }, { x: r + 1, y: y + 1 });
  }
  const zarf = disbukeyZarf(ends);
  let ustEsik = 0;
  for (let i = 0; i < n; i++) if (v[i] > t) ustEsik++;
  return { v, t, label, best, bestSize, zarf, kose: dortKoseyeIndir(zarf), ustEsikOran: ustEsik / n };
}

async function taniResmi(dosya: string, a: ReturnType<typeof asamalar>, w: number, h: number, bulunan: Kose4 | null, dogru: Kose4) {
  const n = w * h, gri = Buffer.alloc(n * 3), maske = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const g = Math.max(0, Math.min(255, Math.round(a.v[i])));
    gri[i * 3] = gri[i * 3 + 1] = gri[i * 3 + 2] = g;
    const ust = a.v[i] > a.t, enBuyuk = a.label[i] === a.best;
    maske[i * 3] = enBuyuk ? 40 : ust ? 200 : 0;
    maske[i * 3 + 1] = enBuyuk ? 200 : ust ? 200 : 0;
    maske[i * 3 + 2] = enBuyuk ? 60 : ust ? 200 : 0;
  }
  const yol = (p: Nokta[]) => p.map(q => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <polygon points="${yol(a.zarf)}" fill="none" stroke="#f33" stroke-width="2"/>
    <polygon points="${yol(dogru)}" fill="none" stroke="#3f3" stroke-width="2" stroke-dasharray="6 4"/>
    ${bulunan ? `<polygon points="${yol(bulunan)}" fill="none" stroke="#f0f" stroke-width="3"/>` : ''}
    <text x="8" y="22" font-size="18" fill="#ff0" stroke="#000" stroke-width="0.6">Otsu ${a.t} · eşik üstü %${(a.ustEsikOran * 100).toFixed(0)} · en büyük bölge %${(a.bestSize / n * 100).toFixed(0)}</text></svg>`;
  const sol = await sharp(gri, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  const sag = await sharp(maske, { raw: { width: w, height: h, channels: 3 } }).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  await sharp({ create: { width: 2 * w + 10, height: h, channels: 3, background: '#333' } })
    .composite([{ input: sol, left: 0, top: 0 }, { input: sag, left: w + 10, top: 0 }])
    .png().toFile(join(KOSE, 'tani', dosya.replace(/\.jpg$/, '.png')));
}

describe.skipIf(!existsSync(join(KOSE, 'dogru.json')))('koseB ölçümü (gerçek fotoğraflar)', () => {
  it('her fotoğraf için IoU, köşe hatası, güven, ilkKarar', { timeout: 120_000 }, async () => {
    const dogruTum = JSON.parse(readFileSync(join(KOSE, 'dogru.json'), 'utf8')) as Dogru;
    mkdirSync(join(KOSE, 'tani'), { recursive: true });
    const satirlar: Record<string, unknown>[] = [];
    for (const [dosya, d] of Object.entries(dogruTum)) {
      if (dosya.startsWith('_')) continue;
      const img = sharp(join(KOSE, dosya)).rotate();
      const meta = await sharp(join(KOSE, dosya)).rotate().toBuffer({ resolveWithObject: true });
      const W = meta.info.width, H = meta.info.height;
      expect([W, H]).toEqual([d.w, d.h]);
      // same small size as koseB(): scale to B_KENAR long edge, rounded per side
      const s = Math.min(1, B_KENAR / Math.max(W, H));
      const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
      const { data } = await img.resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const rgba = new Uint8Array(data.buffer, data.byteOffset, data.length);
      const kucuk = koseBRgba(rgba, w, h);
      const sonuc = kucuk && { koseler: koseleriBuyut(kucuk.koseler, { width: w, height: h }, { width: W, height: H }), guven: kucuk.guven };
      const karar = ilkKarar(sonuc);
      const dogru = koseleriSirala(d.koseler.map(([x, y]) => ({ x, y })));
      const uzun = Math.max(W, H);
      let i = 0, hata = Infinity;
      if (sonuc) {
        i = iou(dogru, sonuc.koseler);
        hata = Math.max(...dogru.map((p, k) => Math.hypot(p.x - sonuc.koseler[k].x, p.y - sonuc.koseler[k].y))) / uzun * 100;
      }
      const a = asamalar(rgba, w, h);
      // the copy of the stages must give koseB's own corners
      if (kucuk) expect(a.kose).toEqual(kucuk.koseler);
      await taniResmi(dosya, a, w, h, kucuk?.koseler ?? null, dogru.map(p => ({ x: p.x * w / W, y: p.y * h / H })) as Kose4);
      const kotu = i < IOU_IYI || hata > HATA_IYI;
      satirlar.push({
        dosya, iou: +i.toFixed(3), hataYuzde: Number.isFinite(hata) ? +hata.toFixed(2) : null,
        guven: sonuc?.guven ?? null, karar: karar.kip === 'kirp' ? 'kirp' : karar.kirpilamadi ? 'tumu (kırpılamadı)' : 'tumu',
        kotu, otsu: a.t, enBuyukBolge: +(a.bestSize / (w * h)).toFixed(3), esikUstu: +a.ustEsikOran.toFixed(3),
        koseler: sonuc ? sonuc.koseler.map(p => [Math.round(p.x), Math.round(p.y)]) : null
      });
    }
    writeFileSync(join(KOSE, 'sonuc-koseB.json'), JSON.stringify(satirlar, null, 2) + '\n');
    const ort = (k: string) => satirlar.reduce((t, r) => t + ((r[k] as number | null) ?? 0), 0) / satirlar.length;
    console.table(satirlar.map(r => ({ dosya: r.dosya, IoU: r.iou, 'hata %': r.hataYuzde, güven: r.guven, karar: r.karar, kötü: r.kotu ? 'X' : '', otsu: r.otsu, bölge: r.enBuyukBolge })));
    console.log(`ortalama IoU ${ort('iou').toFixed(3)} · ortalama köşe hatası %${ort('hataYuzde').toFixed(2)} · kırpılan ${satirlar.filter(r => r.karar === 'kirp').length}/${satirlar.length} · kötü ${satirlar.filter(r => r.kotu).length}`);
    expect(satirlar.length).toBeGreaterThan(0);
  });
});
