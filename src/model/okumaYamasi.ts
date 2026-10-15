import { CHAPTER_STATUSES, type ChapterStatus, type PageMark, type RibbonV1, type RibbonV2 } from './types';

// Reading state (task 3.5): what the reader changed, as a patch on kitap.json.
// The patch holds only what changed in this session. It is applied to the latest file from Drive, so
// fields we don't write (baslik, kapak, klasor, unknown ones) and topics we didn't touch stay as they are.
// Written fields: sonAcilis, kurdele, uniteler[].konular[].durum / .kurdeleler (surum 1: bolumler[].durum).

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export interface TopicPatch {
  baslik: string;                          // surum 1: to find the chapter if the order changed
  durum?: ChapterStatus;
  kurdeleler?: Record<string, PageMark>;   // surum 2: material kind → mark
}

export interface ReadingPatch {
  sonAcilis?: string;
  kurdele?: RibbonV1 | RibbonV2;
  konular?: Record<string, TopicPatch>;    // surum 2: topicKey → change
  bolumler?: Record<number, TopicPatch>;   // surum 1: chapter index → change
}

// A surum 2 topic is found by its folder (stays right when topics are reordered); without one, by its title.
export const topicKey = (klasor: string, baslik: string) => klasor.trim() || 'baslik:' + baslik;

function mergeTopic(a: TopicPatch | undefined, b: TopicPatch): TopicPatch {
  if (!a) return { ...b, ...(b.kurdeleler ? { kurdeleler: { ...b.kurdeleler } } : {}) };
  const out: TopicPatch = { ...a, ...b };
  if (a.kurdeleler || b.kurdeleler) out.kurdeleler = { ...a.kurdeleler, ...b.kurdeleler };
  return out;
}

function mergeTopics<K extends string | number>(a: Record<K, TopicPatch> | undefined, b: Record<K, TopicPatch> | undefined): Record<K, TopicPatch> | undefined {
  if (!a && !b) return undefined;
  const out = { ...a } as Record<K, TopicPatch>;
  for (const k of Object.keys(b ?? {}) as K[]) out[k] = mergeTopic(out[k], b![k]);
  return out;
}

// b is newer: its values win, topics and marks are combined.
export function mergePatch(a: ReadingPatch, b: ReadingPatch): ReadingPatch {
  const out: ReadingPatch = { ...a, ...b };
  const konular = mergeTopics(a.konular, b.konular);
  const bolumler = mergeTopics(a.bolumler, b.bolumler);
  if (konular) out.konular = konular;
  if (bolumler) out.bolumler = bolumler;
  return out;
}

// Sub-fields we don't know stay (a ribbon / mark written by a newer version keeps its extras).
const over = (old: unknown, ours: object) => ({ ...(isObj(old) ? old : {}), ...ours });

function patchTopic(t: Obj, p: TopicPatch): void {
  if (p.durum !== undefined) t.durum = p.durum;
  if (p.kurdeleler) {
    const marks: Obj = isObj(t.kurdeleler) ? { ...t.kurdeleler } : {};
    for (const [k, m] of Object.entries(p.kurdeleler)) marks[k] = over(marks[k], m);
    t.kurdeleler = marks;
  }
}

// surum 1: the chapter at that index if its title is the same, else the first one with that title.
function findChapter(list: unknown[], i: number, baslik: string): Obj | null {
  const at = list[i];
  if (isObj(at) && at.baslik === baslik) return at;
  return list.find((c): c is Obj => isObj(c) && c.baslik === baslik) ?? null;
}

// latest: kitap.json as just read from Drive. Returns the new content and whether it differs at all.
// The input is not changed.
export function applyPatch(latest: unknown, patch: ReadingPatch): { json: Obj; changed: boolean } {
  const before = JSON.stringify(latest);
  const json = structuredClone(isObj(latest) ? latest : {}) as Obj;
  if (patch.sonAcilis !== undefined) json.sonAcilis = patch.sonAcilis;
  if (patch.kurdele !== undefined) {
    // the other format's fields go (surum 1 ↔ 2), unknown ones stay
    const { konu: _k, materyal: _m, dosya: _d, sayfa: _s, bolum: _b, ...old } = isObj(json.kurdele) ? json.kurdele : {};
    json.kurdele = { ...old, ...patch.kurdele };
  }

  if (patch.konular && Array.isArray(json.uniteler)) {
    for (const u of json.uniteler) {
      if (!isObj(u) || !Array.isArray(u.konular)) continue;
      for (const t of u.konular) {
        if (!isObj(t)) continue;
        const key = topicKey(typeof t.klasor === 'string' ? t.klasor : '', typeof t.baslik === 'string' ? t.baslik : '');
        const p = patch.konular[key];
        if (p) patchTopic(t, p);
      }
    }
  }
  if (patch.bolumler && Array.isArray(json.bolumler)) {
    for (const [i, p] of Object.entries(patch.bolumler)) {
      const c = findChapter(json.bolumler, Number(i), p.baslik);
      if (c && p.durum !== undefined) c.durum = p.durum;
    }
  }
  return { json, changed: JSON.stringify(json) !== before };
}

// ---- status ----

// A tap on the status: Okunmadı → Okunuyor → Okundu → Çalışıldı → Tekrar → Okunmadı.
export function nextStatus(s: ChapterStatus): ChapterStatus {
  return CHAPTER_STATUSES[(CHAPTER_STATUSES.indexOf(s) + 1) % CHAPTER_STATUSES.length];
}

// The reader moves the status only forward: entered → okunuyor, last page seen → okundu.
// okundu, calisildi and tekrar are never changed by it.
export function autoStatus(s: ChapterStatus, event: 'girildi' | 'bitti'): ChapterStatus {
  if (event === 'girildi') return s === 'okunmadi' ? 'okunuyor' : s;
  return s === 'okunmadi' || s === 'okunuyor' ? 'okundu' : s;
}
