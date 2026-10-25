// Task 6.4d-3: the handwriting atlas package (tools/atlas/paket.py → el-yazisi-atlas.json + .png).
// The PNG is one 8-bit grey channel: ink density per sample, decoded with `kodlama` and `olcek`
// (dogrusal: D = px / olcek; karekok: D = (px/255)² · 255 / olcek). The JSON says where each sample is.
// Drawing comes in 6.4e; here only the shape is checked. Unknown fields are kept (the checked object is
// passed on as it is). A broken file or a newer surum is an error.

export const ATLAS_TUR = 'defter-el-yazisi';
export const ATLAS_SURUM = 1;
export const ATLAS_MAX_GENISLIK = 2048;
export const ATLAS_KODLAMALAR = ['dogrusal', 'karekok'] as const;
export type AtlasKodlama = typeof ATLAS_KODLAMALAR[number];

export interface AtlasOrnek {
  x: number; y: number; w: number; h: number;   // the sample's box in the PNG (px)
  taban: number;                                 // box top → baseline (px, at xh)
  turetilmis?: boolean;                          // built from real parts (Ç, Ğ, İ…)
}
export interface AtlasRenk { p: [number, number, number]; yogunluk: number }

export interface ElYazisiAtlas {
  tur: typeof ATLAS_TUR;
  surum: 1;
  xh: number;                                    // x height of the samples (px)
  kodlama: AtlasKodlama;
  olcek: number;
  sayfa: { w: number; h: number };               // PNG size
  aralik: { harf: number; kelime: number };      // between glyph boxes, in xh
  stiller: Record<string, unknown>;              // tukenmez / yumusak parameters (6.4e)
  renkler: Record<string, AtlasRenk>;
  karakterler: Record<string, AtlasOrnek[]>;
  eksikler: string[];
}

export class AtlasBozuk extends Error {
  constructor(neden: string) { super(`El yazısı atlası bozuk: ${neden}. Paketi yeniden üret (uret.py paket) ve tekrar seç.`); }
}
export class AtlasYeniSurum extends Error {
  constructor(surum: number) { super(`El yazısı atlası daha yeni bir sürümle yazılmış (surum ${surum}). Uygulamayı yenile.`); }
}

const nesne = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const sayi = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const pozitif = (x: unknown): x is number => sayi(x) && x > 0;
const tamSayi = (x: unknown, min = 0): x is number => Number.isInteger(x) && (x as number) >= min;

function ornekKontrol(o: unknown, yer: string, sayfa: { w: number; h: number }): void {
  if (!nesne(o)) throw new AtlasBozuk(`${yer} nesne değil`);
  if (!tamSayi(o.x) || !tamSayi(o.y) || !tamSayi(o.w, 1) || !tamSayi(o.h, 1)) throw new AtlasBozuk(`${yer} kutusu yanlış`);
  if (o.x + o.w > sayfa.w || o.y + o.h > sayfa.h) throw new AtlasBozuk(`${yer} sayfanın dışında`);
  if (!sayi(o.taban)) throw new AtlasBozuk(`${yer}.taban yanlış`);
  if (o.turetilmis !== undefined && typeof o.turetilmis !== 'boolean') throw new AtlasBozuk(`${yer}.turetilmis yanlış`);
}

// Parsed JSON → the atlas (the same object, unknown fields included), or an error
export function atlasOku(x: unknown): ElYazisiAtlas {
  if (!nesne(x) || x.tur !== ATLAS_TUR) throw new AtlasBozuk(`tur "${ATLAS_TUR}" değil`);
  if (typeof x.surum === 'number' && x.surum > ATLAS_SURUM) throw new AtlasYeniSurum(x.surum);
  if (x.surum !== ATLAS_SURUM) throw new AtlasBozuk('surum yanlış');
  if (!pozitif(x.xh)) throw new AtlasBozuk('xh yanlış');
  if (!ATLAS_KODLAMALAR.includes(x.kodlama as AtlasKodlama)) throw new AtlasBozuk('kodlama bilinmiyor');
  if (!pozitif(x.olcek)) throw new AtlasBozuk('olcek yanlış');
  const s = x.sayfa;
  if (!nesne(s) || !tamSayi(s.w, 1) || !tamSayi(s.h, 1)) throw new AtlasBozuk('sayfa boyutu yanlış');
  if (s.w > ATLAS_MAX_GENISLIK) throw new AtlasBozuk(`sayfa ${ATLAS_MAX_GENISLIK} px'ten geniş`);
  const a = x.aralik;
  if (!nesne(a) || !sayi(a.harf) || !sayi(a.kelime)) throw new AtlasBozuk('aralik yanlış');
  if (!nesne(x.stiller)) throw new AtlasBozuk('stiller yok');
  if (!nesne(x.renkler) || !Object.keys(x.renkler).length) throw new AtlasBozuk('renkler yok');
  for (const [ad, r] of Object.entries(x.renkler)) {
    if (!nesne(r) || !Array.isArray(r.p) || r.p.length !== 3 || !r.p.every(sayi) || !pozitif(r.yogunluk)) throw new AtlasBozuk(`renkler.${ad} yanlış`);
  }
  if (!nesne(x.karakterler)) throw new AtlasBozuk('karakterler yok');
  const sayfa = { w: s.w, h: s.h };
  for (const [k, oo] of Object.entries(x.karakterler)) {
    if ([...k].length !== 1) throw new AtlasBozuk(`karakter "${k}" tek harf değil`);
    if (!Array.isArray(oo) || !oo.length) throw new AtlasBozuk(`karakterler.${k} boş`);
    oo.forEach((o, i) => ornekKontrol(o, `karakterler.${k}[${i}]`, sayfa));
  }
  if (!Array.isArray(x.eksikler) || !x.eksikler.every(e => typeof e === 'string')) throw new AtlasBozuk('eksikler yanlış');
  return x as unknown as ElYazisiAtlas;
}

// The JSON file's text → the atlas
export function atlasJsonOku(metin: string): ElYazisiAtlas {
  let x: unknown;
  try { x = JSON.parse(metin); } catch { throw new AtlasBozuk('geçerli JSON değil'); }
  return atlasOku(x);
}

// ---- the PNG ----

const PNG_IMZA = [137, 80, 78, 71, 13, 10, 26, 10];

export interface PngBilgisi { w: number; h: number; bit: number; renkTuru: number }   // renkTuru 0 = grey

// The PNG header (IHDR); null: not a PNG
export function pngBilgisi(b: Uint8Array): PngBilgisi | null {
  if (b.length < 29 || PNG_IMZA.some((v, i) => b[i] !== v)) return null;
  if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20), bit: b[24], renkTuru: b[25] };
}

// The PNG belongs to this atlas: 8-bit grey, the size in the JSON
export function pngKontrol(b: Uint8Array, atlas: Pick<ElYazisiAtlas, 'sayfa'>): PngBilgisi {
  const p = pngBilgisi(b);
  if (!p) throw new AtlasBozuk('görsel PNG değil');
  if (p.bit !== 8 || p.renkTuru !== 0) throw new AtlasBozuk(`PNG 8 bit gri değil (bit ${p.bit}, renk türü ${p.renkTuru})`);
  if (p.w !== atlas.sayfa.w || p.h !== atlas.sayfa.h) {
    throw new AtlasBozuk(`PNG boyutu (${p.w}×${p.h}) JSON'dakiyle (${atlas.sayfa.w}×${atlas.sayfa.h}) aynı değil; iki dosya aynı paketten olmalı`);
  }
  return p;
}
