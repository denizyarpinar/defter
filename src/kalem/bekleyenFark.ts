import { validateStroke, type PageStrokes, type Stroke } from './cizgi';

// Task 4.8a: strokes not yet saved to Drive are kept on the device, one record per file. The record is
// the NET difference between the model now and the file as it was loaded (by stroke id), not the PDF:
// strokes added, ids removed. Everything undone → empty difference → no record.

export interface PenDiff {
  eklenen: { sayfa: number; stroke: Stroke }[];    // sayfa: 0-based page in the PDF
  silinenIdler: { sayfa: number; id: string }[];
}

export interface PendingRecord extends PenDiff {
  fileId: string;
  kaynakModifiedTime: string;   // the version of the file the difference is against
  dosyaAdi: string;
  guncelleme: string;           // ISO time of the last write
  // the record was applied to another version of the file (another device wrote it meanwhile); task 4.8b
  baskaSurum?: { oncekiModifiedTime: string };
}

// The file as loaded: stroke id → its page
export type StrokeBase = Map<string, number>;

export function baseOf(pages: PageStrokes): StrokeBase {
  const base: StrokeBase = new Map();
  for (const [page, list] of pages) for (const s of list) base.set(s.id, page);
  return base;
}

export function computeDiff(base: StrokeBase, pages: PageStrokes): PenDiff {
  const eklenen: PenDiff['eklenen'] = [];
  const now = new Set<string>();
  for (const [sayfa, list] of [...pages].sort((a, b) => a[0] - b[0])) {
    for (const stroke of list) {
      now.add(stroke.id);
      if (!base.has(stroke.id)) eklenen.push({ sayfa, stroke });
    }
  }
  const silinenIdler: PenDiff['silinenIdler'] = [];
  for (const [id, sayfa] of base) if (!now.has(id)) silinenIdler.push({ sayfa, id });
  return { eklenen, silinenIdler };
}

export const isEmptyDiff = (d: PenDiff) => !d.eklenen.length && !d.silinenIdler.length;

// The difference applied to freshly loaded strokes (changes pages). A stroke whose id is already there
// is not added again; an id that isn't there is skipped; a broken stroke (old / damaged record) too.
export function applyDiff(pages: PageStrokes, d: PenDiff): void {
  const ids = new Set<string>();
  for (const list of pages.values()) for (const s of list) ids.add(s.id);
  for (const { sayfa, id } of d.silinenIdler) {
    const list = pages.get(sayfa);
    const i = list ? list.findIndex(s => s.id === id) : -1;
    if (i >= 0) { list!.splice(i, 1); ids.delete(id); }
  }
  for (const { sayfa, stroke } of d.eklenen) {
    if (ids.has(stroke?.id) || !Number.isInteger(sayfa) || sayfa < 0) continue;
    try { validateStroke(stroke); } catch (e) { console.warn('Bekleyen çizgi atlandı.', e); continue; }
    let list = pages.get(sayfa);
    if (!list) pages.set(sayfa, list = []);
    list.push(stroke);
    ids.add(stroke.id);
  }
}

// A stroke the upload removed from the file (it was in the Drive version, the difference deleted it)
export interface RemovedStroke { sayfa: number; stroke: Stroke }

// Task 4.8b: what is still to upload after `sent` went to Drive. `now` is the difference against the
// same (old) version as `sent`, taken after the upload (strokes may have been drawn or erased meanwhile):
// - added now, not sent → still added;  deleted now, not sent → still deleted
// - sent as added, no longer added (erased / undone meanwhile) → now in the file: deleted
// - sent as deleted, no longer deleted (undone meanwhile) → gone from the file: added again
//   (its stroke from `removed`, what the upload took out of the file; not there → nothing to bring back)
export function remainingDiff(sent: PenDiff, now: PenDiff, removed: readonly RemovedStroke[] = []): PenDiff {
  const sentAdded = new Set(sent.eklenen.map(e => e.stroke.id));
  const sentDeleted = new Set(sent.silinenIdler.map(d => d.id));
  const nowAdded = new Set(now.eklenen.map(e => e.stroke.id));
  const nowDeleted = new Set(now.silinenIdler.map(d => d.id));
  const eklenen = now.eklenen.filter(e => !sentAdded.has(e.stroke.id));
  for (const r of removed) {
    if (sentDeleted.has(r.stroke.id) && !nowDeleted.has(r.stroke.id)) eklenen.push({ sayfa: r.sayfa, stroke: r.stroke });
  }
  const silinenIdler = now.silinenIdler.filter(d => !sentDeleted.has(d.id));
  for (const e of sent.eklenen) if (!nowAdded.has(e.stroke.id)) silinenIdler.push({ sayfa: e.sayfa, id: e.stroke.id });
  return { eklenen, silinenIdler };
}

// The pages a difference touches (sorted, each once)
export function touchedPages(d: PenDiff): number[] {
  return [...new Set([...d.eklenen.map(e => e.sayfa), ...d.silinenIdler.map(s => s.sayfa)])].sort((a, b) => a - b);
}
