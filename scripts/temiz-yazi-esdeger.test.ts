import { existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { dCoz, ornekD, type AtlasD } from '../src/elYazisi/atlasCoz';
import { atlasJsonOku } from '../src/elYazisi/atlasSema';
import { GlifBellegi, satirBas, type Stil } from '../src/elYazisi/basici';

// Task 6.4e-1: the browser printer (basici.ts) against the Python one (basici.py), the same lines from the same
// package (tools/atlas `uret.py referans` → 5-referans; oynama off, no paper noise). Outside the repo; missing → skipped.
// Limits (Deniz): mean ≤ 1/255 and largest ≤ 8/255 per line. Not loosened: a failure prints where the difference is.
const PAKET = '../defter-test-dosyalari/atlas/4-paket/';
const REF = '../defter-test-dosyalari/atlas/5-referans/';
const VAR = existsSync(PAKET + 'el-yazisi-atlas.json') && existsSync(REF + 'referans.json');

interface RefSatir { dosya: string; metin: string; renk: string; stil: Stil; w: number; h: number; eksik: string[] }

async function hamPng(yol: string, kanal: 1 | 3): Promise<{ w: number; h: number; px: Uint8Array }> {
  // sharp gives a grey PNG as three equal channels; the first is the grey value
  const s = sharp(yol);
  const { data, info } = await (kanal === 1 ? s.extractChannel(0) : s.removeAlpha()).raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== kanal) throw new Error(`${yol}: ${info.channels} kanal, ${kanal} bekleniyordu`);
  return { w: info.width, h: info.height, px: new Uint8Array(data) };
}

describe.skipIf(!VAR)('temiz yazı: Python ile eşdeğerlik', () => {
  it('PNG çözme: ilk örneklerin D değerleri Python ile bire bir', async () => {
    const atlas = atlasJsonOku(readFileSync(PAKET + 'el-yazisi-atlas.json', 'utf8'));
    const png = await hamPng(PAKET + 'el-yazisi-atlas.png', 1);
    const sayfa: AtlasD = { w: png.w, h: png.h, D: dCoz(png.px, atlas.olcek, atlas.kodlama) };
    const ornekler = (JSON.parse(readFileSync(REF + 'd-ornek.json', 'utf8')) as { ornekler: { karakter: string; sira: number; w: number; h: number; D: number[] }[] }).ornekler;
    expect(ornekler.length).toBe(3);
    for (const o of ornekler) {
      const g = ornekD(sayfa, atlas.karakterler[o.karakter][o.sira]);
      expect([g.w, g.h]).toEqual([o.w, o.h]);
      expect(Array.from(g.D)).toEqual(o.D);
    }
  });

  it('aynı satırlar, ortalama ≤ 1/255, en büyük ≤ 8/255', async () => {
    const atlas = atlasJsonOku(readFileSync(PAKET + 'el-yazisi-atlas.json', 'utf8'));
    const png = await hamPng(PAKET + 'el-yazisi-atlas.png', 1);
    const sayfa: AtlasD = { w: png.w, h: png.h, D: dCoz(png.px, atlas.olcek, atlas.kodlama) };
    const bellek = new GlifBellegi(atlas, (k, i) => ornekD(sayfa, atlas.karakterler[k][i]));
    const satirlar = (JSON.parse(readFileSync(REF + 'referans.json', 'utf8')) as { satirlar: RefSatir[] }).satirlar;
    expect(satirlar.length).toBe(20);
    const tablo: Record<string, string> = {};
    const hatalar: string[] = [];
    for (const r of satirlar) {
      const ref = await hamPng(REF + r.dosya, 3);
      const ts = satirBas(r.metin, r.renk, r.stil, atlas, bellek);
      expect([ts.w, ts.h], r.dosya).toEqual([ref.w, ref.h]);
      expect(ts.eksik, r.dosya).toEqual(r.eksik);
      let top = 0, enb = 0, yer = -1;
      for (let i = 0; i < ref.px.length; i++) {
        const d = Math.abs(ts.rgb[i] - ref.px[i]);
        top += d;
        if (d > enb) { enb = d; yer = i; }
      }
      const ort = top / ref.px.length;
      tablo[r.dosya] = `ort ${ort.toFixed(3)}/255, en büyük ${enb}/255`;
      if (ort > 1 || enb > 8) {
        const p = Math.floor(yer / 3);
        hatalar.push(`${r.dosya}: ort ${ort.toFixed(3)}, en büyük ${enb} @ x ${p % ref.w}, y ${Math.floor(p / ref.w)}, kanal ${yer % 3} (TS ${ts.rgb[yer]}, Python ${ref.px[yer]})`);
      }
    }
    console.table(tablo);
    expect(hatalar).toEqual([]);
  });
});
