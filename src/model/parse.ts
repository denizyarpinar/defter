import { CHAPTER_STATUSES, MIN_SHELVES, type Book, type Chapter, type ChapterStatus, type Cover, type CoverStyle, type Extra, type FloorKey, type Library, type ModeKey, type PageMark, type Ribbon, type Room, type Shelf, type Source, type SourceType, type Topic, type Unit } from './types';

// Reading + validation. Missing or broken fields get a default; unknown fields go to `extra`.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function rest(o: Obj, known: string[]): Extra {
  const out: Extra = {};
  for (const k of Object.keys(o)) if (!known.includes(k)) out[k] = o[k];
  return out;
}

const str = (v: unknown, def: string) => typeof v === 'string' && v.trim() ? v : def;
const num = (v: unknown, def: number) => typeof v === 'number' && Number.isFinite(v) ? v : def;
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], def: T): T => allowed.includes(v as T) ? v as T : def;
const color = (v: unknown, def: string) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : def;

export const GREY_COVER = '#8a8a8a';
const DEFAULT_WALL = '#efe6d8';

function parseRoom(v: unknown): Room {
  const o = isObj(v) ? v : {};
  return {
    duvar: color(o.duvar, DEFAULT_WALL),
    zemin: oneOf<FloorKey>(o.zemin, ['mese', 'ceviz', 'acik'], 'mese'),
    mod: oneOf<ModeKey>(o.mod, ['otomatik', 'gunduz', 'aksam'], 'otomatik'),
    extra: rest(o, ['duvar', 'zemin', 'mod'])
  };
}

function parseShelf(v: unknown, i: number, usedIds: Set<string>, placed: Set<string>): Shelf {
  const o = isObj(v) ? v : {};
  let id = str(o.id, `raf-${i + 1}`);
  while (usedIds.has(id)) id += '-2';
  usedIds.add(id);
  const books: string[] = [];
  // a book can stand on one shelf only: the first one wins
  if (Array.isArray(o.kitaplar)) for (const b of o.kitaplar) if (typeof b === 'string' && !placed.has(b)) { placed.add(b); books.push(b); }
  return { id, ad: str(o.ad, `Raf ${i + 1}`), kitaplar: books, extra: rest(o, ['id', 'ad', 'kitaplar']) };
}

export function emptyShelf(i: number, usedIds: Set<string>): Shelf {
  return parseShelf({}, i, usedIds, new Set());
}

// kitaplik.json → Library (null = file missing)
export function parseLibrary(json: unknown): Library {
  const o = isObj(json) ? json : {};
  const used = new Set<string>(), placed = new Set<string>();
  const raflar = Array.isArray(o.raflar) ? o.raflar.map((s, i) => parseShelf(s, i, used, placed)) : [];
  while (raflar.length < MIN_SHELVES) raflar.push(emptyShelf(raflar.length, used));
  return { surum: num(o.surum, 1), raflar, oda: parseRoom(o.oda), extra: rest(o, ['surum', 'raflar', 'oda']) };
}

function parseSource(v: unknown): Source | null {
  if (!isObj(v)) return null;
  const s: Source = {
    tur: oneOf<SourceType>(v.tur, ['pdf', 'defter', 'claude', 'link'], 'pdf'),
    dosya: str(v.dosya, ''),
    extra: rest(v, ['tur', 'dosya', 'sayfalar'])
  };
  if (typeof v.sayfalar === 'string' || typeof v.sayfalar === 'number') s.sayfalar = v.sayfalar;
  return s;
}

function parseChapter(v: unknown, i: number): Chapter {
  const o = isObj(v) ? v : {};
  return {
    baslik: str(o.baslik, `Bölüm ${i + 1}`),
    durum: oneOf<ChapterStatus>(o.durum, CHAPTER_STATUSES, 'okunmadi'),
    kaynaklar: Array.isArray(o.kaynaklar) ? o.kaynaklar.map(parseSource).filter((s): s is Source => s !== null) : [],
    extra: rest(o, ['baslik', 'durum', 'kaynaklar'])
  };
}

const pageNo = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1;

export function parseMark(v: unknown): PageMark | null {
  return isObj(v) && typeof v.dosya === 'string' && v.dosya && pageNo(v.sayfa) ? { dosya: v.dosya, sayfa: v.sayfa as number } : null;
}

// Broken entries are left out (only in memory: writing works on the file itself, see okumaYamasi.ts).
function parseMarks(v: unknown): Record<string, PageMark> {
  const out: Record<string, PageMark> = {};
  if (isObj(v)) for (const [k, m] of Object.entries(v)) { const p = parseMark(m); if (p) out[k] = p; }
  return out;
}

export function parseRibbon(v: unknown): Ribbon | null {
  if (typeof v === 'number' || typeof v === 'string') return v;   // old format: a page
  if (!isObj(v)) return null;
  const m = parseMark(v);
  if (m && typeof v.konu === 'string' && typeof v.materyal === 'string') return { konu: v.konu, materyal: v.materyal, ...m };
  if (typeof v.bolum === 'number' && Number.isInteger(v.bolum) && v.bolum >= 0 && pageNo(v.sayfa)) return { bolum: v.bolum, sayfa: v.sayfa as number };
  return null;
}

function parseTopic(v: unknown, i: number): Topic {
  const o = isObj(v) ? v : {};
  return {
    baslik: str(o.baslik, `Konu ${i + 1}`),
    klasor: typeof o.klasor === 'string' ? o.klasor.trim() : '',
    durum: oneOf<ChapterStatus>(o.durum, CHAPTER_STATUSES, 'okunmadi'),
    kurdeleler: parseMarks(o.kurdeleler),
    extra: rest(o, ['baslik', 'klasor', 'durum', 'kurdeleler'])
  };
}

function parseUnit(v: unknown, i: number): Unit {
  const o = isObj(v) ? v : {};
  return {
    baslik: str(o.baslik, `Ünite ${i + 1}`),
    ...(typeof o.klasor === 'string' && o.klasor.trim() ? { klasor: o.klasor.trim() } : {}),
    konular: Array.isArray(o.konular) ? o.konular.map(parseTopic) : [],
    extra: rest(o, ['baslik', 'klasor', 'konular'])
  };
}

function parseCover(v: unknown): Cover {
  const o = isObj(v) ? v : {};
  return {
    renk: color(o.renk, GREY_COVER),
    stil: oneOf<CoverStyle>(o.stil, ['kumas', 'deri'], 'kumas'),
    extra: rest(o, ['renk', 'stil'])
  };
}

// kitap.json → Book. json = null: the folder has no kitap.json (book still shows, grey cover).
export function parseBook(id: string, json: unknown | null): Book {
  const hasJson = json !== null && json !== undefined;
  const o = isObj(json) ? json : {};
  const baslik = str(o.baslik, id);
  return {
    id, hasJson,
    surum: num(o.surum, 1),
    baslik,
    sirt: str(o.sirt, baslik),
    kod: typeof o.kod === 'string' ? o.kod : '',
    ders: typeof o.ders === 'string' ? o.ders : '',
    ...(typeof o.dil === 'string' && o.dil.trim() ? { dil: o.dil.trim() } : {}),
    kapak: parseCover(o.kapak),
    sonAcilis: typeof o.sonAcilis === 'string' && !Number.isNaN(Date.parse(o.sonAcilis)) ? o.sonAcilis : null,
    kurdele: parseRibbon(o.kurdele),
    bolumler: Array.isArray(o.bolumler) ? o.bolumler.map(parseChapter) : [],
    uniteler: Array.isArray(o.uniteler) ? o.uniteler.map(parseUnit) : [],
    extra: rest(o, ['surum', 'baslik', 'sirt', 'kod', 'ders', 'dil', 'kapak', 'sonAcilis', 'kurdele', 'bolumler', 'uniteler'])
  };
}
