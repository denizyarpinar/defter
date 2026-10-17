// Task 5.10b: what kind of file was chosen in "Dosya ekle" (no DOM, so it can be tested).
// The bytes' signature comes before the extension (a PDF with a wrong extension is still a PDF);
// the MIME type alone never makes a PDF or an image (iPad Safari may give it empty).

export type DosyaTuruAdi = 'pdf' | 'gorsel' | 'ofis' | 'desteklenmeyen';

// alt — pdf: 'onEkli' (%PDF- not at the start); gorsel: jpeg | png | heic | webp | gif;
// ofis: word | powerpoint | keynote | pages; desteklenmeyen: 'bozukPdf' (looks like a PDF, isn't one)
export interface DosyaTuruSonucu { tur: DosyaTuruAdi; alt?: string }

// How many bytes the caller reads from the start of the file (PDF readers allow up to 1024 bytes before %PDF-)
export const ILK_BAYT_SAYISI = 1024;

// The file input's accept list. Office files are in it on purpose: greyed out on iPad, the user
// would not know why; this way they can choose one and see "save it as PDF".
export const DOSYA_ACCEPT = [
  '.pdf', 'application/pdf',
  '.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.gif',
  'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'image/gif',
  '.doc', '.docx', '.ppt', '.pptx', '.odt', '.odp', '.key', '.pages', '.rtf',
].join(',');

const ascii = (b: Uint8Array, from: number, len: number) =>
  b.length >= from + len ? String.fromCharCode(...b.subarray(from, from + len)) : '';

const basliyor = (b: Uint8Array, imza: readonly number[], from = 0) =>
  b.length >= from + imza.length && imza.every((x, i) => b[from + i] === x);

// index of "%PDF-" in the first ILK_BAYT_SAYISI bytes, -1 if none
function pdfYeri(b: Uint8Array): number {
  const son = Math.min(b.length, ILK_BAYT_SAYISI) - 5;
  for (let i = 0; i <= son; i++) {
    if (b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46 && b[i + 4] === 0x2d) return i;
  }
  return -1;
}

const HEIC_MARKALAR = new Set(['heic', 'heix', 'mif1', 'msf1']);

// Only what hazirlaGorsel can open (the browser decodes it: JPEG, PNG, HEIC on iPad, WebP, GIF)
function gorselImzasi(b: Uint8Array): string | null {
  if (basliyor(b, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (basliyor(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (ascii(b, 4, 4) === 'ftyp' && HEIC_MARKALAR.has(ascii(b, 8, 4))) return 'heic';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  const gif = ascii(b, 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'gif';
  return null;
}

const OFIS_UZANTI = new Map([
  ['doc', 'word'], ['docx', 'word'], ['odt', 'word'], ['rtf', 'word'],
  ['ppt', 'powerpoint'], ['pptx', 'powerpoint'], ['odp', 'powerpoint'],
  ['key', 'keynote'], ['pages', 'pages'],
]);

function ofisMime(mime: string): string | null {
  if (mime === 'application/msword' || mime.includes('wordprocessingml') || mime === 'application/vnd.oasis.opendocument.text'
    || mime === 'application/rtf' || mime === 'text/rtf') return 'word';
  if (mime === 'application/vnd.ms-powerpoint' || mime.includes('presentationml') || mime === 'application/vnd.oasis.opendocument.presentation') return 'powerpoint';
  if (mime.includes('keynote')) return 'keynote';
  if (mime.includes('iwork-pages') || mime === 'application/vnd.apple.pages') return 'pages';
  return null;
}

export function dosyaTuru(ad: string, mime: string, ilkBaytlar: Uint8Array): DosyaTuruSonucu {
  const kucukAd = ad.trim().toLowerCase();
  const tip = mime.trim().toLowerCase();
  const nokta = kucukAd.lastIndexOf('.');
  const uzanti = nokta >= 0 ? kucukAd.slice(nokta + 1) : '';

  // (1) PDF signature
  const pdf = pdfYeri(ilkBaytlar);
  if (pdf === 0) return { tur: 'pdf' };
  if (pdf > 0) return { tur: 'pdf', alt: 'onEkli' };

  // (2) image signature
  const gorsel = gorselImzasi(ilkBaytlar);
  if (gorsel) return { tur: 'gorsel', alt: gorsel };

  // (3) Office by extension or MIME (ZIP/OLE bytes with an Office extension end up here too)
  const ofis = OFIS_UZANTI.get(uzanti) ?? ofisMime(tip);
  if (ofis) return { tur: 'ofis', alt: ofis };

  // (4) says it is a PDF, but the bytes are not
  if (uzanti === 'pdf' || tip === 'application/pdf') return { tur: 'desteklenmeyen', alt: 'bozukPdf' };

  return { tur: 'desteklenmeyen' };
}
