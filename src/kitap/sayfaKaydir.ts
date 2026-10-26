import { topicKey } from '../model/okumaYamasi';
import type { OcrKayit } from '../ocr/kayit/sema';

// Task 6.S-4: a blank page went in (delta +1) or out (−1) at `indeks` (0-based) of one PDF: the page numbers that
// point into that PDF follow. Pure (tested); the same code for kitap.json from Drive and the book in memory
// (both have uniteler[].konular[].kurdeleler and kurdele), and for the reading record (.ocr.json).
// - Page numbers are 1-based (kurdele.sayfa, OcrSayfa.sayfa). Pages before `indeks` stay.
// - Removed page: its reading entry goes; a ribbon on it goes to the page before (the first page: page 1).
// - Ribbons point at a file by its name inside one topic (konu = the topic's klasor key).
// - Unknown fields stay; the input is not changed.

export type Delta = 1 | -1;

// One page number after the change; null: it was the removed page
export function sayfaNumarasiKaydir(sayfa: number, indeks: number, delta: Delta): number | null {
  const i = sayfa - 1;
  if (delta === 1) return i >= indeks ? sayfa + 1 : sayfa;
  if (i === indeks) return null;
  return i > indeks ? sayfa - 1 : sayfa;
}

// A ribbon on the removed page: the page before it (or 1)
const kurdeleSayfasi = (sayfa: number, indeks: number, delta: Delta) => sayfaNumarasiKaydir(sayfa, indeks, delta) ?? Math.max(1, indeks);

// ---- the reading record ----

// kaldirilanIz: the removed page's fingerprint (its entries go wherever they say they are; without it: by number)
export function ocrKaydir(kayit: OcrKayit, indeks: number, delta: Delta, kaldirilanIz?: string): { kayit: OcrKayit; degisti: boolean } {
  let degisti = false;
  const sayfalar = [];
  for (const s of kayit.sayfalar) {
    const yeni = sayfaNumarasiKaydir(s.sayfa, indeks, delta);
    const gider = delta === -1 && (kaldirilanIz !== undefined ? s.parmakIzi === kaldirilanIz : yeni === null);
    if (gider) { degisti = true; continue; }
    // a stale entry on the removed number (another fingerprint): it keeps the number before
    const sayfa = yeni ?? Math.max(1, indeks);
    if (sayfa !== s.sayfa) degisti = true;
    sayfalar.push(sayfa === s.sayfa ? s : { ...s, sayfa });
  }
  return { kayit: degisti ? { ...kayit, sayfalar } : kayit, degisti };
}

// ---- ribbons ----

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const anahtar = (t: Obj) => topicKey(typeof t.klasor === 'string' ? t.klasor : '', typeof t.baslik === 'string' ? t.baslik : '');

export interface KurdeleHedefi { konu: string; dosya: string; indeks: number; delta: Delta }

// A { dosya, sayfa } mark of this file: its new page (null: not this file or nothing changes)
function yeniSayfa(m: unknown, h: KurdeleHedefi): number | null {
  if (!isObj(m) || m.dosya !== h.dosya || typeof m.sayfa !== 'number' || !Number.isInteger(m.sayfa) || m.sayfa < 1) return null;
  const s = kurdeleSayfasi(m.sayfa, h.indeks, h.delta);
  return s === m.sayfa ? null : s;
}

interface Tutucu { uniteler?: unknown; kurdele?: unknown }

// In place; true: something changed
export function kurdeleKaydirYerinde(t: Tutucu, h: KurdeleHedefi): boolean {
  let degisti = false;
  if (Array.isArray(t.uniteler)) {
    for (const u of t.uniteler) {
      if (!isObj(u) || !Array.isArray(u.konular)) continue;
      for (const k of u.konular) {
        if (!isObj(k) || anahtar(k) !== h.konu || !isObj(k.kurdeleler)) continue;
        const kd = k.kurdeleler;
        for (const [materyal, m] of Object.entries(kd)) {
          const s = yeniSayfa(m, h);
          if (s !== null) { kd[materyal] = { ...(m as Obj), sayfa: s }; degisti = true; }
        }
      }
    }
  }
  const r = t.kurdele;
  if (isObj(r) && r.konu === h.konu) {
    const s = yeniSayfa(r, h);
    if (s !== null) { t.kurdele = { ...r, sayfa: s }; degisti = true; }
  }
  return degisti;
}

// kitap.json as read from Drive (the input is not changed)
export function kurdeleKaydir(latest: unknown, h: KurdeleHedefi): { json: Obj; degisti: boolean } {
  const json = structuredClone(isObj(latest) ? latest : {}) as Obj;
  return { json, degisti: kurdeleKaydirYerinde(json, h) };
}
