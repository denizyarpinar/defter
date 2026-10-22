// Data model for the Drive folder "Kitaplık" (see CLAUDE.md → Veri modeli).
// Every object keeps the fields we don't know in `extra`, so they are written back unchanged.

export type Extra = Record<string, unknown>;

export type FloorKey = 'mese' | 'ceviz' | 'acik';
export type ModeKey = 'otomatik' | 'gunduz' | 'aksam';

export interface Room {
  duvar: string;
  zemin: FloorKey;
  mod: ModeKey;
  extra: Extra;
}

export interface Shelf {
  id: string;
  ad: string;
  kitaplar: string[];   // book ids, left to right
  extra: Extra;
}

// kitaplik.json
export interface Library {
  surum: number;
  raflar: Shelf[];      // top shelf first
  oda: Room;
  extra: Extra;
}

export type CoverStyle = 'kumas' | 'deri';
// okunuyor / okundu: task 3.5 (set by the reader); the order is the order of a tap on the status
export type ChapterStatus = 'okunmadi' | 'okunuyor' | 'okundu' | 'calisildi' | 'tekrar';
export const CHAPTER_STATUSES: readonly ChapterStatus[] = ['okunmadi', 'okunuyor', 'okundu', 'calisildi', 'tekrar'];
export type SourceType = 'pdf' | 'defter' | 'claude' | 'link';

export interface Cover {
  renk: string;
  stil: CoverStyle;
  extra: Extra;
}

export interface Source {
  tur: SourceType;
  dosya: string;
  sayfalar?: string | number;
  extra: Extra;
}

export interface Chapter {
  baslik: string;
  durum: ChapterStatus;
  kaynaklar: Source[];
  extra: Extra;
}

// Where the reader stopped inside one material: file name (as in Drive) + page inside that PDF (1-based).
export interface PageMark {
  dosya: string;
  sayfa: number;
}

// Book-level ribbon. surum 2: topic (its klasor) + material + page mark; surum 1: chapter index + page inside the chapter.
export interface RibbonV2 extends PageMark {
  konu: string;
  materyal: string;
}
export interface RibbonV1 {
  bolum: number;
  sayfa: number;
}
// number / string: the old format (only a page), still read
export type Ribbon = RibbonV1 | RibbonV2 | number | string;

// surum 2: a topic's files are found in its folder (see CLAUDE.md → Veri modeli (kitap.json surum 2))
export interface Topic {
  baslik: string;
  klasor: string;       // path relative to the book's folder, e.g. "Unite-01-Logik/Konu-01-Aussagenlogik"
  durum: ChapterStatus;
  kurdeleler: Record<string, PageMark>;   // material kind → where the reader stopped in it
  extra: Extra;
}

export interface Unit {
  baslik: string;
  klasor?: string;      // task 6.K5a: the unit's folder, e.g. "Unite-03-Graphen" (older books: from its topics' paths)
  konular: Topic[];
  extra: Extra;
}

// kitaplar/<id>/kitap.json
export interface Book {
  id: string;           // folder name
  hasJson: boolean;     // false: folder without kitap.json (shown with grey cover)
  surum: number;
  baslik: string;
  sirt: string;
  kod: string;
  ders: string;
  dil?: string;         // language of the book's texts, e.g. "en"; missing: Turkish rules
  kapak: Cover;
  sonAcilis: string | null;   // ISO date
  kurdele: Ribbon | null;
  bolumler: Chapter[];   // surum 1
  uniteler: Unit[];      // surum 2
  extra: Extra;
}

export const MIN_SHELVES = 2;
export const MAX_SHELVES = 6;
