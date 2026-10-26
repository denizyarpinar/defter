import type { BosSayfaKaydi, Yon } from '../defter/bosSayfa';

// Task 6.S-4: the "Sayfa ekle" button and its popover, without DOM (tested). ui/sayfaEkleBalon.ts draws it.
// - Shown: a Drive library (not the sample one), surum 2 with kitap.json, a material open. With the pen on too.
// - The target page: PDF mode the page on screen; book mode (25 Oct decision) Önüne = before the LEFT page of the
//   spread, Arkasına = after the RIGHT page (one page shown, or the right side empty / not a PDF page: that page).
// - "Bu sayfayı kaldır" only on pages carrying /DefterBosSayfa; two on screen → Soldaki / Sağdaki.

export interface GorunenSayfa {
  liste: number;              // index in the reader's list
  dosyaId: string | null;
  pdfSayfa?: number;          // 1-based in its PDF; missing: not a PDF page ("Dosya bulunamadı", a photo)
  ad?: string;
}

export interface GorunurlukGirdisi { drive: boolean; surum2: boolean; materyal: boolean }
export const sayfaEkleGorunur = (g: GorunurlukGirdisi): boolean => g.drive && g.surum2 && g.materyal;

const pdfMi = (p: GorunenSayfa | undefined): p is GorunenSayfa & { dosyaId: string; pdfSayfa: number } => !!p?.dosyaId && !!p.pdfSayfa;

export interface EklemeHedefi { liste: number; dosyaId: string; ad: string; komsu: number; yon: Yon }   // komsu: 0-based in the PDF

// gorunen: the pages on screen in order (PDF mode one, book mode one or two)
export function eklemeHedefi(gorunen: readonly GorunenSayfa[], yon: Yon): EklemeHedefi | null {
  const sol = gorunen[0], sag = gorunen[1];
  const p = yon === 'once' ? sol : pdfMi(sag) ? sag : sol;
  if (!pdfMi(p)) return null;
  return { liste: p.liste, dosyaId: p.dosyaId, ad: p.ad ?? '', komsu: p.pdfSayfa - 1, yon };
}

export interface KaldirmaHedefi { taraf: 'tek' | 'sol' | 'sag'; liste: number; dosyaId: string; ad: string; indeks: number; kayit: BosSayfaKaydi }

// bos(dosyaId, indeks 0-based): the blank page's mark, or null
export function kaldirmaHedefleri(gorunen: readonly GorunenSayfa[], bos: (dosyaId: string, indeks: number) => BosSayfaKaydi | null): KaldirmaHedefi[] {
  const out: KaldirmaHedefi[] = [];
  gorunen.forEach((p, i) => {
    if (!pdfMi(p)) return;
    const kayit = bos(p.dosyaId, p.pdfSayfa - 1);
    if (kayit) out.push({ taraf: gorunen.length > 1 ? (i === 0 ? 'sol' : 'sag') : 'tek', liste: p.liste, dosyaId: p.dosyaId, ad: p.ad ?? '', indeks: p.pdfSayfa - 1, kayit });
  });
  if (out.length === 1) out[0].taraf = 'tek';
  return out;
}

export const KALDIR_METNI: Record<KaldirmaHedefi['taraf'], string> = { tek: 'Bu sayfayı kaldır', sol: 'Soldaki boş sayfayı kaldır', sag: 'Sağdaki boş sayfayı kaldır' };
export const KALDIR_ONAY = 'Bu boş sayfa ve üstündeki kalem yazısı silinecek. Devam edilsin mi?';

export interface EngelGirdisi {
  isSuruyor: boolean;           // a blank-page job of this reader is going
  kalemYazamaz: string | null;  // the PDF can't be written (encrypted / signed / unreadable): its message
  okumaSuruyor: boolean;        // the handwriting panel is reading / saving
  hedefYok: boolean;            // the page on screen is not a PDF page
}

// Why the patterns are grey (null: they work)
export function eklemeEngeli(g: EngelGirdisi): string | null {
  if (g.isSuruyor) return 'Bir sayfa işi sürüyor; bitince tekrar dene.';
  if (g.kalemYazamaz) return g.kalemYazamaz;
  if (g.okumaSuruyor) return 'El yazısı okunuyor; bitince tekrar dene.';
  if (g.hedefYok) return 'Bu sayfanın yanına sayfa eklenemiyor (PDF sayfası değil).';
  return null;
}

// After the job: the PDF page (1-based) the reader opens at. ekle: the new page; kaldir: the page before it (or 1)
export const isSonrasiSayfa = (tur: 'ekle' | 'kaldir', indeks: number): number => tur === 'ekle' ? indeks + 1 : Math.max(1, indeks);
