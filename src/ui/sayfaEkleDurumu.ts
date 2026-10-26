import type { YapistirilmisSayfa, Yon } from '../defter/bosSayfa';

// Task 6.S-4: the "Sayfa ekle" button and its popover, without DOM (tested). ui/sayfaEkleBalon.ts draws it.
// - Shown: a Drive library (not the sample one), surum 2 with kitap.json, a material open. With the pen on too.
// - The target page: PDF mode the page on screen; book mode (6.S-4b) the page being read (the side last touched,
//   else the left; chosen in the popover), Önüne / Arkasına that page. After the job that page stays on screen,
//   the blank page beside it (kitapCiftiSonrasi; the spread may start one page later, BookView.ofset).
// - Task 6.S-4d: "Bu sayfayı sil" for the page read (any PDF page, the blank one too), confirmed; "Son silineni geri
//   getir" while this session's last deleted page belongs to a file in the open list.

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

// ---- task 6.S-4d: deleting the page read ----

export interface SilmeHedefi { liste: number; dosyaId: string; ad: string; indeks: number }   // indeks: 0-based in the PDF

export function silmeHedefi(gorunen: readonly GorunenSayfa[], taraf: Taraf = 'sol'): SilmeHedefi | null {
  const h = eklemeHedefi(gorunen, 'sonra', taraf);
  return h && { liste: h.liste, dosyaId: h.dosyaId, ad: h.ad, indeks: h.komsu };
}

export const SIL_METNI = 'Bu sayfayı sil';
export const GERI_GETIR_METNI = 'Son silineni geri getir';
// n: the page number in the reader (as the popover's "s. N")
export const silOnay = (n: number) => `s. ${n} silinecek. Sayfadaki kalem yazısı ve okunmuş el yazısı da gider. Geri al ile hemen geri getirebilirsin.`;

export interface SilmeEngelGirdisi {
  isSuruyor: boolean;
  kalemYazamaz: string | null;
  okumaSuruyor: boolean;
  sonSayfa: boolean;            // the file has one page
  hedefYok: boolean;            // the page read is not a PDF page
}

// Why "Bu sayfayı sil" is grey (null: it works)
export function silmeEngeli(g: SilmeEngelGirdisi): string | null {
  if (g.isSuruyor) return 'Bir sayfa işi sürüyor; bitince tekrar dene.';
  if (g.hedefYok) return 'Bu sayfa silinemiyor (PDF sayfası değil).';
  if (g.kalemYazamaz) return g.kalemYazamaz;
  if (g.okumaSuruyor) return 'El yazısı okunuyor; bitince tekrar dene.';
  if (g.sonSayfa) return 'Son sayfa silinemez; dosyada en az bir sayfa kalmalı.';
  return null;
}

// "Son silineni geri getir": this session's last deleted page, its file in the open list
export const geriGetirGorunur = (sonDosya: string | null, listedekiDosyalar: Iterable<string | null>): boolean =>
  sonDosya !== null && [...listedekiDosyalar].includes(sonDosya);

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

// After the job: the PDF page (1-based) the reader opens at. ekle / geriKoy: the new page; kaldir / sil: the page
// before it (or 1); 6.S-4c yapistir / geri al: the same page
export const isSonrasiSayfa = (tur: 'ekle' | 'kaldir' | 'yapistir' | 'yapistirGeriAl' | 'sil' | 'geriKoy', indeks: number): number =>
  tur === 'kaldir' || tur === 'sil' ? Math.max(1, indeks) : indeks + 1;

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

// Deleting: the other page on screen stays on its side (a page after the deleted one in the same file moves up one).
// null: no other PDF page on screen (the reader goes on as in 6.S-4)
export function silmeSonrasiOkunan(gorunen: readonly GorunenSayfa[], h: SilmeHedefi): OkunanSonrasi | null {
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
