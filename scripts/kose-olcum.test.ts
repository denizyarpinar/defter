// Task 6.2d-1/6.2d-2: measures koseB on real notebook photos against hand-set corners.
// The photos and the corners live outside the repo (../defter-test-dosyalari/kose/: *.jpg + dogru.json);
// without that folder the test is skipped. Writes kose/sonuc-koseB.json (read by kose-kontrol.mjs)
// and kose/tani/<photo>.png (paper value | threshold mask, region used in green, hull in red).
// Compares with kose/sonuc-koseB-bugun.json (the 6.2d-1 result) when it is there.
// Run: npx vitest run scripts/kose-olcum.test.ts
//   KOSE_AYAR=acma | acma,incelt | …   stages on (default: koseB's own KOSE_B_AYAR)
//   KOSE_KONTROL=1                       also measure the held-out control photos (KONTROL)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { koseleriSirala, type Kose4, type Nokta } from '../src/defter/kirp/kirpHesap';
import { ilkKarar, koseleriBuyut } from '../src/defter/kirp/kirpKarar';
import { B_KENAR, KOSE_B_AYAR, koseBAsamalar, type KoseBAyar } from '../src/defter/kirp/koseB';

const KOSE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'defter-test-dosyalari', 'kose');
const IOU_IYI = 0.95, HATA_IYI = 2;   // a result is "bad" below this IoU or above this corner error (% long edge)
const YANLIS_KIRP = 0.9;              // a "kirp" decision with IoU below this is a wrong crop
// Held out while tuning (6.2d-2): not measured, not drawn unless KOSE_KONTROL=1.
const KONTROL = ['wa-2303-2.jpg', 'img-1384-lamba.jpg'];
const kontrolAcik = process.env.KOSE_KONTROL === '1';
const ayarYazi = process.env.KOSE_AYAR;
const ayar: KoseBAyar = ayarYazi === undefined ? KOSE_B_AYAR
  : { acma: ayarYazi.includes('acma'), incelt: ayarYazi.includes('incelt'), destek: ayarYazi.includes('destek') };
const KAPALI: KoseBAyar = { acma: false, incelt: false, destek: false };
// scene = one physical photo; the full-resolution copies are the same scenes as the WhatsApp ones
const sahne = (dosya: string) => dosya.replace(/\.jpg$/, '').replace(/^img-1383/, 'wa-2303-1').replace(/^img-1384/, 'wa-2303-0');

type Dogru = Record<string, { w: number; h: number; koseler: [number, number][]; not?: string }>;
type Bugun = { dosya: string; iou: number; hataYuzde: number | null; karar: string; koseler: [number, number][] | null };
type Satir = {
  dosya: string; sahne: string; kontrol: boolean; iou: number; hataYuzde: number | null; guven: number | null; karar: string;
  kotu: boolean; otsu: number; bolge: number; esikUstu: number; destek: number[] | null; koseler: number[][] | null;
  bugunIou: number | null; bugunHata: number | null; bugunKarar: string | null;
};

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

async function taniResmi(dosya: string, a: ReturnType<typeof koseBAsamalar>, w: number, h: number, dogru: Kose4) {
  const n = w * h, gri = Buffer.alloc(n * 3), maske = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const g = Math.max(0, Math.min(255, Math.round(a.v[i])));
    gri[i * 3] = gri[i * 3 + 1] = gri[i * 3 + 2] = g;
    const ust = a.maske[i] === 1, bolge = a.bolge?.[i] === 1;
    maske[i * 3] = bolge ? 40 : ust ? 200 : 0;
    maske[i * 3 + 1] = bolge ? 200 : ust ? 200 : 0;
    maske[i * 3 + 2] = bolge ? 60 : ust ? 200 : 0;
  }
  const yol = (p: Nokta[]) => p.map(q => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
  const destek = a.destek ? ' · destek ' + a.destek.map(d => d.toFixed(2)).join('/') : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <polygon points="${yol(a.zarf)}" fill="none" stroke="#f33" stroke-width="2"/>
    <polygon points="${yol(dogru)}" fill="none" stroke="#3f3" stroke-width="2" stroke-dasharray="6 4"/>
    ${a.kose ? `<polygon points="${yol(a.kose)}" fill="none" stroke="#f0f" stroke-width="3"/>` : ''}
    <text x="8" y="22" font-size="18" fill="#ff0" stroke="#000" stroke-width="0.6">Otsu ${a.t} · eşik üstü %${(a.ustEsikOran * 100).toFixed(0)} · bölge %${(a.bolgeBoyut / n * 100).toFixed(0)}${destek}</text></svg>`;
  const sol = await sharp(gri, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  const sag = await sharp(maske, { raw: { width: w, height: h, channels: 3 } }).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  await sharp({ create: { width: 2 * w + 10, height: h, channels: 3, background: '#333' } })
    .composite([{ input: sol, left: 0, top: 0 }, { input: sag, left: w + 10, top: 0 }])
    .png().toFile(join(KOSE, 'tani', dosya.replace(/\.jpg$/, '.png')));
}

// median of a few runs, ms
function sure(f: () => unknown, kez = 7): number {
  const t: number[] = [];
  for (let i = 0; i < kez; i++) { const s = performance.now(); f(); t.push(performance.now() - s); }
  return t.sort((a, b) => a - b)[Math.floor(kez / 2)];
}

const ort = (rs: Satir[], f: (r: Satir) => number | null) => rs.reduce((t, r) => t + (f(r) ?? 0), 0) / Math.max(1, rs.length);

function ozet(ad: string, rs: Satir[]) {
  if (!rs.length) return;
  const yanlisBugun = rs.filter(r => r.bugunKarar === 'kirp' && (r.bugunIou ?? 0) < YANLIS_KIRP).length;
  const yanlisYeni = rs.filter(r => r.karar === 'kirp' && r.iou < YANLIS_KIRP).length;
  const dusus = rs.filter(r => r.bugunIou !== null && r.iou < r.bugunIou - 0.01).map(r => r.dosya);
  console.log(`${ad} (${rs.length} foto): IoU bugün ${ort(rs, r => r.bugunIou).toFixed(3)} → yeni ${ort(rs, r => r.iou).toFixed(3)}`
    + ` · hata bugün %${ort(rs, r => r.bugunHata).toFixed(2)} → yeni %${ort(rs, r => r.hataYuzde).toFixed(2)}`
    + ` · yanlış kırpma ${yanlisBugun} → ${yanlisYeni} · kırpılan ${rs.filter(r => r.karar === 'kirp').length}`
    + ` · IoU düşüşü > 0.01: ${dusus.length ? dusus.join(', ') : 'yok'}`);
}

describe.skipIf(!existsSync(join(KOSE, 'dogru.json')))('koseB ölçümü (gerçek fotoğraflar)', () => {
  it('her fotoğraf için IoU, köşe hatası, güven, ilkKarar', { timeout: 600_000 }, async () => {
    const dogruTum = JSON.parse(readFileSync(join(KOSE, 'dogru.json'), 'utf8')) as Dogru;
    const bugunYol = join(KOSE, 'sonuc-koseB-bugun.json');
    const bugun = new Map<string, Bugun>(existsSync(bugunYol) ? (JSON.parse(readFileSync(bugunYol, 'utf8')) as Bugun[]).map(r => [r.dosya, r]) : []);
    mkdirSync(join(KOSE, 'tani'), { recursive: true });
    const satirlar: Satir[] = [];
    let sureEski = 0, sureYeni = 0;
    for (const [dosya, d] of Object.entries(dogruTum)) {
      if (dosya.startsWith('_')) continue;
      const kontrol = KONTROL.includes(dosya);
      if (kontrol && !kontrolAcik) continue;
      const img = sharp(join(KOSE, dosya)).rotate();
      const meta = await sharp(join(KOSE, dosya)).rotate().toBuffer({ resolveWithObject: true });
      const W = meta.info.width, H = meta.info.height;
      expect([W, H]).toEqual([d.w, d.h]);
      // same small size as koseB(): scale to B_KENAR long edge, rounded per side
      const s = Math.min(1, B_KENAR / Math.max(W, H));
      const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
      const { data } = await img.resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const rgba = new Uint8Array(data.buffer, data.byteOffset, data.length);
      const a = koseBAsamalar(rgba, w, h, ayar);
      const sonuc = a.kose && a.guven > 0 ? { koseler: koseleriBuyut(a.kose, { width: w, height: h }, { width: W, height: H }), guven: a.guven } : null;
      const karar = ilkKarar(sonuc);
      const dogru = koseleriSirala(d.koseler.map(([x, y]) => ({ x, y })));
      const uzun = Math.max(W, H);
      let i = 0, hata = Infinity;
      if (sonuc) {
        i = iou(dogru, sonuc.koseler);
        hata = Math.max(...dogru.map((p, k) => Math.hypot(p.x - sonuc.koseler[k].x, p.y - sonuc.koseler[k].y))) / uzun * 100;
      }
      // with every stage off, koseB must still give the 6.2d-1 corners
      const b = bugun.get(dosya);
      const eski = koseBAsamalar(rgba, w, h, KAPALI);
      if (b?.koseler && eski.kose) {
        const ek = koseleriBuyut(eski.kose, { width: w, height: h }, { width: W, height: H });
        expect(ek.map(p => [Math.round(p.x), Math.round(p.y)])).toEqual(b.koseler);
      }
      sureEski += sure(() => koseBAsamalar(rgba, w, h, KAPALI));
      sureYeni += sure(() => koseBAsamalar(rgba, w, h, ayar));
      await taniResmi(dosya, a, w, h, dogru.map(p => ({ x: p.x * w / W, y: p.y * h / H })) as Kose4);
      satirlar.push({
        dosya, sahne: sahne(dosya), kontrol, iou: +i.toFixed(3), hataYuzde: Number.isFinite(hata) ? +hata.toFixed(2) : null,
        guven: sonuc?.guven ?? null, karar: karar.kip === 'kirp' ? 'kirp' : karar.kirpilamadi ? 'tumu (kırpılamadı)' : 'tumu',
        kotu: i < IOU_IYI || hata > HATA_IYI, otsu: a.t, bolge: +(a.bolgeBoyut / (w * h)).toFixed(3), esikUstu: +a.ustEsikOran.toFixed(3),
        destek: a.destek?.map(x => +x.toFixed(2)) ?? null,
        koseler: sonuc ? sonuc.koseler.map(p => [Math.round(p.x), Math.round(p.y)]) : null,
        bugunIou: b?.iou ?? null, bugunHata: b?.hataYuzde ?? null, bugunKarar: b?.karar ?? null
      });
    }
    writeFileSync(join(KOSE, 'sonuc-koseB.json'), JSON.stringify(satirlar, null, 2) + '\n');

    console.log(`ayar: ${JSON.stringify(ayar)} · kontrol seti ${kontrolAcik ? 'AÇIK' : 'gizli'}`);
    console.table(satirlar.map(r => ({
      dosya: r.dosya, K: r.kontrol ? 'K' : '', 'IoU bugün': r.bugunIou, 'IoU yeni': r.iou,
      fark: r.bugunIou === null ? '' : (r.iou - r.bugunIou).toFixed(3),
      'hata% bugün': r.bugunHata, 'hata% yeni': r.hataYuzde, güven: r.guven,
      'karar bugün': r.bugunKarar, 'karar yeni': r.karar, destek: r.destek?.join(' ') ?? ''
    })));
    ozet('ayar seti', satirlar.filter(r => !r.kontrol));
    ozet('kontrol seti', satirlar.filter(r => r.kontrol));
    // per scene: the two resolutions of a photo count once
    const sahneler = new Map<string, Satir[]>();
    for (const r of satirlar) sahneler.set(r.sahne, [...(sahneler.get(r.sahne) ?? []), r]);
    console.table([...sahneler].map(([s, rs]) => ({ sahne: s, foto: rs.length, 'IoU bugün': +ort(rs, r => r.bugunIou).toFixed(3), 'IoU yeni': +ort(rs, r => r.iou).toFixed(3) })));
    const sOrt = (f: (r: Satir) => number | null) => [...sahneler.values()].reduce((t, rs) => t + ort(rs, f), 0) / sahneler.size;
    console.log(`sahne ortalaması (${sahneler.size} sahne): IoU bugün ${sOrt(r => r.bugunIou).toFixed(3)} → yeni ${sOrt(r => r.iou).toFixed(3)}`);
    console.log(`süre (800 px, 7 tekrarın medyanı, fotoğraf başına ort.): eski ${(sureEski / satirlar.length).toFixed(1)} ms → yeni ${(sureYeni / satirlar.length).toFixed(1)} ms`);
    expect(satirlar.length).toBeGreaterThan(0);
  });
});
