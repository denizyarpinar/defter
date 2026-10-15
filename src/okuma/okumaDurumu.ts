import { autoStatus, nextStatus, topicKey, type ReadingPatch } from '../model/okumaYamasi';
import type { Book, ChapterStatus, PageMark, RibbonV2 } from '../model/types';
import { usesUnits } from '../model/units';
import { MATERIAL_LABEL, type MaterialKind } from './konuKesfi';

// Reading state of the book in memory (status, ribbon, last opened) + the patch for Drive (task 3.5).
// The sink is the Drive writer; with the sample library there is none, so nothing is written.

let sink: ((bookId: string, patch: ReadingPatch) => void) | null = null;

export function setReadingSink(fn: ((bookId: string, patch: ReadingPatch) => void) | null): void {
  sink = fn;
}

// unit / topic: as in bookUnits (surum 1: unit 0, topic = chapter index)
export function topicStatus(b: Book, unit: number, topic: number): ChapterStatus | null {
  return (usesUnits(b) ? b.uniteler[unit]?.konular[topic] : b.bolumler[topic])?.durum ?? null;
}

function setStatus(b: Book, unit: number, topic: number, durum: ChapterStatus): void {
  if (usesUnits(b)) {
    const t = b.uniteler[unit]?.konular[topic];
    if (!t || t.durum === durum) return;
    t.durum = durum;
    sink?.(b.id, { konular: { [topicKey(t.klasor, t.baslik)]: { baslik: t.baslik, durum } } });
  } else {
    const c = b.bolumler[topic];
    if (!c || c.durum === durum) return;
    c.durum = durum;
    sink?.(b.id, { bolumler: { [topic]: { baslik: c.baslik, durum } } });
  }
}

// A tap on the status icon: the next one.
export function cycleStatus(b: Book, unit: number, topic: number): void {
  const s = topicStatus(b, unit, topic);
  if (s) setStatus(b, unit, topic, nextStatus(s));
}

// The reader: entered → okunuyor, last page seen → okundu (only forward).
export function autoTopicStatus(b: Book, unit: number, topic: number, event: 'girildi' | 'bitti'): void {
  const s = topicStatus(b, unit, topic);
  if (s) setStatus(b, unit, topic, autoStatus(s, event));
}

// surum 2: the reader is on page `sayfa` of file `dosya` in this material of the topic.
export function markTopicPage(b: Book, unit: number, topic: number, materyal: MaterialKind, mark: PageMark): void {
  const t = b.uniteler[unit]?.konular[topic];
  if (!t) return;
  const konu = topicKey(t.klasor, t.baslik);
  const old = t.kurdeleler[materyal], r = b.kurdele;
  const same = old?.dosya === mark.dosya && old.sayfa === mark.sayfa
    && typeof r === 'object' && r !== null && 'konu' in r && r.konu === konu && r.materyal === materyal && r.dosya === mark.dosya && r.sayfa === mark.sayfa;
  if (same) return;
  t.kurdeleler[materyal] = { ...mark };
  b.kurdele = { konu, materyal, ...mark };
  sink?.(b.id, { kurdele: { ...b.kurdele }, konular: { [konu]: { baslik: t.baslik, kurdeleler: { [materyal]: { ...mark } } } } });
}

// surum 1: page `sayfa` (1-based) of chapter `bolum`.
export function markChapterPage(b: Book, bolum: number, sayfa: number): void {
  const r = b.kurdele;
  if (typeof r === 'object' && r !== null && 'bolum' in r && r.bolum === bolum && r.sayfa === sayfa) return;
  b.kurdele = { bolum, sayfa };
  sink?.(b.id, { kurdele: { bolum, sayfa } });
}

// The book was opened on the desk.
export function markOpened(b: Book): void {
  b.sonAcilis = new Date().toISOString();
  sink?.(b.id, { sonAcilis: b.sonAcilis });
}

// ---- "Kaldığın yerden devam" ----

export interface Resume {
  unit: number;
  topic: number;
  materyal?: MaterialKind;   // surum 2
  dosya?: string;            // surum 2
  sayfa: number;             // surum 2: page in the file; surum 1: page in the chapter
  label: string;             // "<konu>, <materyal>, s. 12"
}

const isKind = (k: string): k is MaterialKind => k in MATERIAL_LABEL;

// null: no ribbon, the old format (only a page number), or its topic is not in the book any more.
export function resumeOf(b: Book): Resume | null {
  const r = b.kurdele;
  if (typeof r !== 'object' || r === null) return null;
  if (usesUnits(b)) {
    if (!('konu' in r) || !isKind(r.materyal)) return null;
    const v2 = r as RibbonV2;
    for (const [ui, u] of b.uniteler.entries()) {
      const ti = u.konular.findIndex(t => topicKey(t.klasor, t.baslik) === v2.konu);
      if (ti >= 0) return { unit: ui, topic: ti, materyal: r.materyal, dosya: v2.dosya, sayfa: v2.sayfa, label: `${u.konular[ti].baslik}, ${MATERIAL_LABEL[r.materyal]}, s. ${v2.sayfa}` };
    }
    return null;
  }
  if (!('bolum' in r)) return null;
  const c = b.bolumler[r.bolum];
  return c ? { unit: 0, topic: r.bolum, sayfa: r.sayfa, label: `${c.baslik}, s. ${r.sayfa}` } : null;
}
