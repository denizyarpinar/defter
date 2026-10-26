import { t } from '../dil';
import type { PageMark } from '../model/types';
import type { MaterialKind, TopicMaterials } from './konuKesfi';

// Task 6.K6a: a topic without materials (kind null) in the reader — the pure part (tested).
// The bar shows "Fotoğraf ekle" and "Dosya ekle"; pen, search and Kitap/PDF stay hidden (CSS: o-materyalsiz).
// Nothing of the reading state is written for it: no ribbon, no status, no kitap.json.

export const bosKonuMetni = () => t('bosKonu.metin');
export const klasorYokNotu = () => t('bosKonu.klasorYok');

export interface DugmeDurumu { aktif: boolean; not: string | null }
export interface BosKonuDurumu { foto: DugmeDurumu; dosya: DugmeDurumu; metin: string }

// klasorVar: the topic has a folder (kitap.json's klasor, found in Drive). klasorYokMetni: the reader's text for a
// klasor that Drive doesn't have (kept as before); a topic without any klasor gets the short note as its text.
export function bosKonuDurumu(g: { klasorVar: boolean; klasorYokMetni?: string }): BosKonuDurumu {
  if (g.klasorVar) return { foto: { aktif: true, not: null }, dosya: { aktif: true, not: null }, metin: bosKonuMetni() };
  const kapali = { aktif: false, not: klasorYokNotu() };
  return { foto: kapali, dosya: kapali, metin: g.klasorYokMetni ?? t('bosKonu.klasorYokMetin') };
}

// The reading state (ribbon, "okunuyor" / "okundu") is written only for a material on screen
export const okumaKaydiYazilsinMi = (kind: MaterialKind | null): kind is MaterialKind => kind !== null;

// The topic's ribbon for the material on screen; no material: none
export function konuKurdelesi(kurdeleler: Record<string, PageMark> | undefined, kind: MaterialKind | null): PageMark | null {
  return kind === null ? null : kurdeleler?.[kind] ?? null;
}

// Übungen / Ödevler: the ribbon chooses the file (and the solution, if it was in it). mark null: its file is gone.
// No material: no mark.
export function kurdeleSecimi(m: TopicMaterials, kind: MaterialKind | null, mark: PageMark): { mark: PageMark | null; fileIndex?: number; solution?: boolean } {
  if (kind === null) return { mark: null };
  const list = kind === 'uebungen' || kind === 'oedevler' ? m[kind] : null;
  if (!list) return { mark };
  const i = list.findIndex(x => x.file.name === mark.dosya || x.cozum?.name === mark.dosya);
  if (i < 0) return { mark: null };
  return { mark, fileIndex: i, solution: list[i].cozum?.name === mark.dosya };
}
