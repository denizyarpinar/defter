import { BOS_DOSYA_METIN, boyutMetni, heicAcilamadiMetni, turMetni } from './dosyaEklemeMetin';
import { dosyaTuru, ILK_BAYT_SAYISI } from './dosyaTuru';
import type { HazirGorsel } from './gorsel';
import { GorselHatasi } from './gorselHesap';
import type { Jpeg } from './sayfaEkle';

// Task 5.10d: the file chosen in "Dosya ekle" → the PDF bytes konuyaDosyaEkle takes. Nothing is written anywhere.
// Order: empty → too big (before reading the file) → first bytes → type. Office / unsupported / broken PDF:
// a Turkish error and nothing else is done. A PDF goes as it is (bytes before %PDF- are cleaned in
// konuyaDosyaEkle); an image becomes a one-page PDF exactly like a notebook photo, but WITHOUT cropping.

export type HazirKaynak = 'pdf' | 'gorsel';
export interface HazirDosya { ad: string; bytes: Uint8Array; kaynak: HazirKaynak }

export type HazirlanamamaNedeni = 'bos' | 'boyut' | 'tur' | 'gorsel';

export class DosyaHazirlanamadi extends Error {
  constructor(public neden: HazirlanamamaNedeni, mesaj: string, options?: { cause?: unknown }) {
    super(mesaj, options);
    this.name = 'DosyaHazirlanamadi';
  }
}

// The browser parts, given from outside so the tests can fake them
export interface HazirlaAraclari {
  gorselHazirla: (file: File) => Promise<Pick<HazirGorsel, 'bytes'>>;
  pdfYap: (jpegler: readonly Jpeg[]) => Promise<Uint8Array>;
}

// Loaded only when an image is added: canvas code and pdf-lib stay out of the first bundle
const VARSAYILAN: HazirlaAraclari = {
  gorselHazirla: async f => (await import('./gorsel')).hazirlaGorsel(f),
  pdfYap: async j => (await import('./sayfaEkle')).fotograflardanPdf(j),
};

const YEDEK_AD = 'gorsel.pdf';

// tahta.png → tahta.pdf, ders.notu.jpeg → ders.notu.pdf, foto → foto.pdf, ".png" / "" → gorsel.pdf
export function pdfAdi(ad: string): string {
  const temiz = ad.trim();
  const nokta = temiz.lastIndexOf('.');
  const kok = (nokta >= 0 ? temiz.slice(0, nokta) : temiz).trim();
  return kok ? `${kok}.pdf` : YEDEK_AD;
}

export async function dosyaHazirla(file: File, araclar: HazirlaAraclari = VARSAYILAN): Promise<HazirDosya> {
  if (file.size === 0) throw new DosyaHazirlanamadi('bos', BOS_DOSYA_METIN());
  const boyut = boyutMetni(file.size);
  if (boyut) throw new DosyaHazirlanamadi('boyut', boyut);

  const ilk = new Uint8Array(await file.slice(0, ILK_BAYT_SAYISI).arrayBuffer());
  const tur = dosyaTuru(file.name, file.type, ilk);
  const ret = turMetni(tur);
  if (ret) throw new DosyaHazirlanamadi('tur', ret);

  if (tur.tur === 'pdf') return { ad: file.name, bytes: new Uint8Array(await file.arrayBuffer()), kaynak: 'pdf' };

  let jpeg: Pick<HazirGorsel, 'bytes'>;
  try {
    jpeg = await araclar.gorselHazirla(file);
  } catch (e) {
    if (!(e instanceof GorselHatasi)) throw e;
    throw new DosyaHazirlanamadi('gorsel', e.tur === 'heic' ? heicAcilamadiMetni() : e.message, { cause: e });
  }
  return { ad: pdfAdi(file.name), bytes: await araclar.pdfYap([jpeg]), kaynak: 'gorsel' };
}
