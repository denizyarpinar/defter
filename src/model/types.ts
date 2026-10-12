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
export type ChapterStatus = 'okunmadi' | 'calisildi' | 'tekrar';
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

// kitaplar/<id>/kitap.json
export interface Book {
  id: string;           // folder name
  hasJson: boolean;     // false: folder without kitap.json (shown with grey cover)
  surum: number;
  baslik: string;
  sirt: string;
  kod: string;
  ders: string;
  kapak: Cover;
  sonAcilis: string | null;   // ISO date
  kurdele: number | string | null;
  bolumler: Chapter[];
  extra: Extra;
}

export const MIN_SHELVES = 2;
export const MAX_SHELVES = 6;
