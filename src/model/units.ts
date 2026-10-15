import type { Book, ChapterStatus, Source } from './types';

// One view of a book's contents for both data versions (see CLAUDE.md → Veri modeli (kitap.json surum 2)):
// surum 2 → its units and topics; surum 1 → one unit "Genel", every chapter a topic with its sources.

export interface TopicView {
  baslik: string;
  durum: ChapterStatus;
  klasor?: string;        // surum 2: the topic's folder
  kaynaklar?: Source[];   // surum 1: the chapter's sources
}

export interface UnitView {
  baslik: string;
  konular: TopicView[];
}

export const usesUnits = (b: Book) => b.surum >= 2;

export function bookUnits(b: Book): UnitView[] {
  if (usesUnits(b)) {
    return b.uniteler.map(u => ({ baslik: u.baslik, konular: u.konular.map(t => ({ baslik: t.baslik, durum: t.durum, klasor: t.klasor })) }));
  }
  if (!b.bolumler.length) return [];
  return [{ baslik: 'Genel', konular: b.bolumler.map(c => ({ baslik: c.baslik, durum: c.durum, kaynaklar: c.kaynaklar })) }];
}

export function topicCount(b: Book): number {
  return bookUnits(b).reduce((a, u) => a + u.konular.length, 0);
}
