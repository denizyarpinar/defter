import { JPEG_KALITE } from './ayarlar';
import { GorselHatasi, hataTuru, hedefBoyut } from './gorselHesap';

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
  const src = await coz(file);
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
    ctx.drawImage(src.image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', JPEG_KALITE));
    if (!blob) throw new GorselHatasi('acilamadi');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes, width, height, eskiWidth: src.width, eskiHeight: src.height, eskiBoyut: file.size, yeniBoyut: bytes.length };
  } finally {
    src.close();
    canvas.width = canvas.height = 0;
  }
}
