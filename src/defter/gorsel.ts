import { JPEG_KALITE, MAX_KENAR } from './ayarlar';
import { renkDuzelt } from './filtre/filtreler';
import { GorselHatasi, hataTuru, hedefBoyut } from './gorselHesap';
import type { Kose4 } from './kirp/kirpHesap';
import { ilkKarar, kirpPenceresi, type KirpKarari, type KirpKip } from './kirp/kirpKarar';
import { koseB } from './kirp/koseB';
import { duzelt } from './kirp/perspektif';
import { hazirlikEkle, kb, olcumAcik, sure, zamanla, zamanlaA, type Ek } from './sureOlcum';

// Task 5.3: a photo (File) → smaller JPEG for a PDF page. Nothing is written anywhere.
// Decoding: createImageBitmap with the EXIF orientation applied; if that fails, an <img>
// (browsers apply EXIF orientation to images on their own). The canvas is at most
// MAX_KENAR × MAX_KENAR (4 MP), so it never gets near the 16 MP limit; decoding with
// resizeWidth/resizeHeight is left out on purpose (Safari support unclear, see plan 5.3).

export interface HazirGorsel {
  bytes: Uint8Array;   // JPEG
  width: number;
  height: number;
  eskiWidth: number;   // pixels of the original, after EXIF orientation
  eskiHeight: number;
  eskiBoyut: number;   // bytes of the original file
  yeniBoyut: number;   // bytes of the JPEG
}

type Kaynak = { image: CanvasImageSource; width: number; height: number; close: () => void };

async function coz(file: File): Promise<Kaynak> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch { /* try the <img> below */ }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    img.src = url;
    await img.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw new GorselHatasi(hataTuru(file), { cause: e });
  }
  return { image: img, width: img.naturalWidth, height: img.naturalHeight, close: () => { URL.revokeObjectURL(url); img.src = ''; } };
}

export async function hazirlaGorsel(file: File): Promise<HazirGorsel> {
  if (file.size === 0) throw new GorselHatasi('bos');
  const z = zamanOlc(), t0 = z ? performance.now() : 0;
  const src = await zamanlaA(z, 'okuma+çözme', () => coz(file));   // dil-kontrol: yoksay
  try {
    const g = (await tumunuHazirla(src, file, false, z)).gorsel;   // "Dosya ekle" too: never filtered
    if (z) hazirlikYaz(file, z, t0, g, { kip: 'tumu' });
    return g;
  } finally {
    src.close();
  }
}

// Task 6.2e-1: ?olcum=1 → the steps of one photo (null: no measuring, the code runs as before)
const zamanOlc = (): Record<string, number> | null => olcumAcik() ? {} : null;

function hazirlikYaz(file: File, z: Record<string, number>, t0: number, g: HazirGorsel, ek: Ek): void {
  const adimlar = Object.fromEntries(Object.entries(z).map(([k, v]) => [k, sure(v)]));
  hazirlikEkle({ ad: `foto ${file.name}`, ms: performance.now() - t0, grup: 'hazirlik',
    ek: { ...adimlar, kaynak: `${g.eskiWidth}×${g.eskiHeight}`, sayfa: `${g.width}×${g.height}`, jpeg: kb(g.yeniBoyut), dosya: kb(file.size), ...ek } });
}

// Task 6.2c: filter E on the finished page, just before the JPEG step. Its buffers are local and go
// when it returns (one photo at a time). A failure leaves the canvas as it was: false.
function renkDuzeltTuvale(canvas: HTMLCanvasElement): boolean {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    img.data.set(renkDuzelt(img).data);
    ctx.putImageData(img, 0, 0);
    return true;
  } catch (e) {
    console.warn('Renk düzeltilemedi, fotoğraf olduğu gibi kullanılıyor.', e);
    return false;
  }
}

interface Hazir { gorsel: HazirGorsel; renkDuzelt: boolean }

async function jpegHazirla(canvas: HTMLCanvasElement, src: Kaynak, file: File, renk: boolean, z?: Record<string, number> | null): Promise<Hazir> {
  const renkDuzelt = renk && zamanla(z, 'renk düzelt', () => renkDuzeltTuvale(canvas));   // dil-kontrol: yoksay
  return { gorsel: await zamanlaA(z, 'JPEG', () => jpegBilgisi(canvas, src, file)), renkDuzelt };
}

// The whole photo, shrunk to MAX_KENAR (what hazirlaGorsel has always done).
async function tumunuHazirla(src: Kaynak, file: File, renk = false, z?: Record<string, number> | null): Promise<Hazir> {
  const canvas = document.createElement('canvas');
  try {
    if (!(src.width > 0 && src.height > 0)) throw new GorselHatasi(hataTuru(file));
    const { width, height } = hedefBoyut(src.width, src.height);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new GorselHatasi('acilamadi');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff';   // JPEG has no transparency: a see-through PNG would turn black
    ctx.fillRect(0, 0, width, height);
    zamanla(z, 'küçültme', () => ctx.drawImage(src.image, 0, 0, width, height));   // dil-kontrol: yoksay
    return await jpegHazirla(canvas, src, file, renk, z);
  } finally {
    canvas.width = canvas.height = 0;
  }
}

async function jpegBilgisi(canvas: HTMLCanvasElement, src: Kaynak, file: File): Promise<HazirGorsel> {
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', JPEG_KALITE));
  if (!blob) throw new GorselHatasi('acilamadi');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, width: canvas.width, height: canvas.height, eskiWidth: src.width, eskiHeight: src.height, eskiBoyut: file.size, yeniBoyut: bytes.length };
}

// Task 5.8c: only the page's part of the full-resolution photo → straightened page, long edge ≤ MAX_KENAR.
async function kirpiliHazirla(src: Kaynak, file: File, k: Kose4, renk = false, z?: Record<string, number> | null): Promise<Hazir> {
  const p = kirpPenceresi(k, src);
  const canvas = document.createElement('canvas');
  let out: HTMLCanvasElement | null = null;
  try {
    canvas.width = p.width;
    canvas.height = p.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new GorselHatasi('acilamadi');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, p.width, p.height);
    out = zamanla(z, 'kırpma+perspektif', () => {   // dil-kontrol: yoksay
      ctx.drawImage(src.image, p.sx, p.sy, p.sw, p.sh, 0, 0, p.width, p.height);
      return duzelt(canvas, p.koseler, MAX_KENAR);
    });
    canvas.width = canvas.height = 0;   // before the filter and JPEG steps: one big canvas at a time
    return await jpegHazirla(out, src, file, renk, z);
  } finally {
    canvas.width = canvas.height = 0;
    if (out) out.width = out.height = 0;
  }
}

// Task 5.8d: the corner editor's preview. Only kept while the editor is open; width/height are
// the full image's (the corners' pixels), the canvas is the photo with its long edge ≤ maxKenar.
export const ONIZLEME_KENAR = 1600;
export interface Onizleme { canvas: HTMLCanvasElement; width: number; height: number }

export async function onizlemeHazirla(file: File, maxKenar = ONIZLEME_KENAR): Promise<Onizleme> {
  if (file.size === 0) throw new GorselHatasi('bos');
  const src = await coz(file);
  try {
    if (!(src.width > 0 && src.height > 0)) throw new GorselHatasi(hataTuru(file));
    const { width, height } = hedefBoyut(src.width, src.height, maxKenar);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { canvas.width = canvas.height = 0; throw new GorselHatasi('acilamadi'); }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(src.image, 0, 0, width, height);
    return { canvas, width: src.width, height: src.height };
  } finally {
    src.close();
  }
}

// renkDuzelt: filter E was applied (task 6.2c); false when not asked or when it failed
export interface KirpliGorsel extends KirpKarari { gorsel: HazirGorsel; renkDuzelt: boolean }

// Task 5.8c: the photo panel's preparation. Without koseler the corners are found first (method B
// on a small copy) and ilkKarar picks the mode; with koseler (the thumbnail's toggle) they are
// reused and the asked mode is made. If the perspective step fails: the whole photo, "kırpılamadı".
// Task 6.2c: secenek.renkDuzelt (only the photo panel asks for it) → filter E before the JPEG.
export async function hazirlaKirpli(file: File, kip: KirpKip, onceki?: KirpKarari, secenek: { renkDuzelt?: boolean } = {}): Promise<KirpliGorsel> {
  const renk = secenek.renkDuzelt === true;
  if (file.size === 0) throw new GorselHatasi('bos');
  const z = zamanOlc(), t0 = z ? performance.now() : 0;
  const src = await zamanlaA(z, 'okuma+çözme', () => coz(file));   // dil-kontrol: yoksay
  const yaz = (r: KirpliGorsel): KirpliGorsel => {
    if (z) hazirlikYaz(file, z, t0, r.gorsel, { kip: r.kip, renk: r.renkDuzelt, yeniden: onceki ? 'evet' : undefined });
    return r;
  };
  try {
    if (!(src.width > 0 && src.height > 0)) throw new GorselHatasi(hataTuru(file));
    let karar: KirpKarari;
    if (onceki) karar = { ...onceki, kip: onceki.koseler ? kip : 'tumu' };
    else {
      karar = ilkKarar(zamanla(z, 'koseB', () => koseB(src.image, src.width, src.height)));
      if (kip === 'tumu') karar.kip = 'tumu';
    }
    if (karar.kip === 'kirp' && karar.koseler) {
      try {
        return yaz({ ...karar, ...await kirpiliHazirla(src, file, karar.koseler, renk, z) });
      } catch (e) {
        if (e instanceof GorselHatasi) throw e;
        console.warn('Sayfa kırpılamadı, fotoğrafın tamamı kullanılıyor.', e);
        karar = { ...karar, kip: 'tumu', kirpilamadi: true };
      }
    }
    return yaz({ ...karar, kip: 'tumu', ...await tumunuHazirla(src, file, renk, z) });
  } finally {
    src.close();
  }
}
