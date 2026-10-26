import type { BosSayfaKaydi, YapistirilmisSayfa, Yon } from '../defter/bosSayfa';

// Task 6.S-4: the "Sayfa ekle" button and its popover, without DOM (tested). ui/sayfaEkleBalon.ts draws it.
// - Shown: a Drive library (not the sample one), surum 2 with kitap.json, a material open. With the pen on too.
// - The target page: PDF mode the page on screen; book mode (6.S-4b) the page being read (the side last touched,
//   else the left; chosen in the popover), Önüne / Arkasına that page. After the job that page stays on screen,
//   the blank page beside it (kitapCiftiSonrasi; the spread may start one page later, BookView.ofset).
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

export type Taraf = 'sol' | 'sag';

// gorunen: the pages on screen in order (PDF mode one, book mode one or two); taraf: the page being read
// (book mode; not a PDF page → the other one)
export function eklemeHedefi(gorunen: readonly GorunenSayfa[], yon: Yon, taraf: Taraf = 'sol'): EklemeHedefi | null {
  const sol = gorunen[0], sag = gorunen[1];
  const p = taraf === 'sag' ? (pdfMi(sag) ? sag : sol) : pdfMi(sol) ? sol : sag;
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

// After the job: the PDF page (1-based) the reader opens at. ekle: the new page; kaldir: the page before it (or 1);
// 6.S-4c yapistir / geri al: the same page
export const isSonrasiSayfa = (tur: 'ekle' | 'kaldir' | 'yapistir' | 'yapistirGeriAl', indeks: number): number =>
  tur === 'kaldir' ? Math.max(1, indeks) : indeks + 1;

// ---- task 6.S-4c: "Deftere yapıştır" for the page being read ----

export type YapistirHedefi =
  | { tur: 'yapistir'; liste: number; dosyaId: string; ad: string; indeks: number; yataySayisi: number }   // yataySayisi: the file's landscape pages not pasted yet
  | { tur: 'geriAl'; liste: number; dosyaId: string; ad: string; indeks: number; kayit: YapistirilmisSayfa };

export interface YapistirBilgisi { yatay: ReadonlySet<number>; yapistirilmis: ReadonlyMap<number, YapistirilmisSayfa> }

// The page being read (as eklemeHedefi): landscape → paste; pasted → undo; upright / not a PDF page / unknown → null
export function yapistirHedefi(gorunen: readonly GorunenSayfa[], taraf: Taraf, bilgi: (dosyaId: string) => YapistirBilgisi | null): YapistirHedefi | null {
  const h = eklemeHedefi(gorunen, 'sonra', taraf);
  const b = h && bilgi(h.dosyaId);
  if (!h || !b) return null;
  const o = { liste: h.liste, dosyaId: h.dosyaId, ad: h.ad, indeks: h.komsu };
  const kayit = b.yapistirilmis.get(h.komsu);
  if (kayit) return { tur: 'geriAl', ...o, kayit };
  return b.yatay.has(h.komsu) ? { tur: 'yapistir', ...o, yataySayisi: b.yatay.size } : null;
}

// Both sides of a two-page spread (the popover switches between them), else the one page ('sol')
export function yapistirHedefleri(gorunen: readonly GorunenSayfa[], bilgi: (dosyaId: string) => YapistirBilgisi | null): Partial<Record<Taraf, YapistirHedefi>> {
  const out: Partial<Record<Taraf, YapistirHedefi>> = {};
  for (const t of ['sol', 'sag'] as const) { const h = yapistirHedefi(gorunen, t, bilgi); if (h) out[t] = h; }
  return out;
}

export const YAPISTIR_GERI_AL_ONAY = 'Slaytın dışındaki kalem yazısı da silinecek. Devam edilsin mi?';

// ---- task 6.S-4b: book mode, two pages: the page being read stays on screen ----

// The sides that can be chosen in the popover (PDF pages only); n: the reader's page number (1-based)
export function okunanTaraflar(gorunen: readonly GorunenSayfa[]): Partial<Record<Taraf, number>> {
  if (gorunen.length < 2) return {};
  const out: Partial<Record<Taraf, number>> = {};
  if (pdfMi(gorunen[0])) out.sol = gorunen[0].liste + 1;
  if (pdfMi(gorunen[1])) out.sag = gorunen[1].liste + 1;
  return out;
}

// The side shown first: the page last touched if it is on screen and a PDF page, else the left (else the right)
export function varsayilanTaraf(gorunen: readonly GorunenSayfa[], dokunulan: number | null): Taraf {
  const t = okunanTaraflar(gorunen);
  if (dokunulan !== null && gorunen[1]?.liste === dokunulan && t.sag) return 'sag';
  return t.sol || !t.sag ? 'sol' : 'sag';
}

export interface OkunanSonrasi { dosya: string; sayfa: number; taraf: Taraf }   // sayfa: 1-based in its PDF, after the job

// Adding: the page read (komsu) after the job and the side it stays on: Önüne → right (B | R), Arkasına → left (L | B)
export const eklemeSonrasiOkunan = (h: EklemeHedefi): OkunanSonrasi =>
  h.yon === 'once' ? { dosya: h.ad, sayfa: h.komsu + 2, taraf: 'sag' } : { dosya: h.ad, sayfa: h.komsu + 1, taraf: 'sol' };

// Removing: the other page on screen stays on its side (a page after the removed one in the same file moves up one).
// null: no other PDF page on screen (the reader goes on as in 6.S-4)
export function kaldirmaSonrasiOkunan(gorunen: readonly GorunenSayfa[], h: KaldirmaHedefi): OkunanSonrasi | null {
  if (gorunen.length < 2) return null;
  const i = gorunen.findIndex(x => x.liste !== h.liste), k = gorunen[i];
  if (i < 0 || !pdfMi(k)) return null;
  const sayfa = k.dosyaId === h.dosyaId && k.pdfSayfa - 1 > h.indeks ? k.pdfSayfa - 1 : k.pdfSayfa;
  return { dosya: k.ad ?? '', sayfa, taraf: i === 0 ? 'sol' : 'sag' };
}

// The spread after the job: okunanIndeks = the page read in the NEW list, on its side. The start may be −1
// (an empty paper left of the first page); ofset = the start's parity (BookView.show).
export function kitapCiftiSonrasi(g: { okunanIndeks: number; taraf: Taraf; sayfaSayisi: number }): { ciftBaslangic: number; ofset: 0 | 1 } {
  const bas = Math.max(-1, Math.min(g.sayfaSayisi - 1, g.taraf === 'sol' ? g.okunanIndeks : g.okunanIndeks - 1));
  return { ciftBaslangic: bas, ofset: (((bas % 2) + 2) % 2) as 0 | 1 };
}
