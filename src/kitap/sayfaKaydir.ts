import { topicKey } from '../model/okumaYamasi';
import type { OcrKayit, OcrSayfa, OcrSilinen } from '../ocr/kayit/sema';

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

// ---- task 6.S-4d: a deleted page's reading entries wait in `silinenler` for "Geri al" ----

export interface OcrSilHedefi { islemId: string; indeks: number; iz?: string; ayniIzVar?: boolean }

// The deleted page's entries (by fingerprint; when another page has the same one, only the entry on its number)
// go to silinenler, the later ones −1. A stale entry on that number (another fingerprint) keeps the number before.
export function ocrSil(kayit: OcrKayit, h: OcrSilHedefi): { kayit: OcrKayit; degisti: boolean } {
  let degisti = false;
  const sayfalar: OcrSayfa[] = [], giden: OcrSilinen[] = [];
  kayit.sayfalar.forEach((s, sira) => {
    const yeni = sayfaNumarasiKaydir(s.sayfa, h.indeks, -1);
    const gider = h.iz !== undefined ? s.parmakIzi === h.iz && (!h.ayniIzVar || yeni === null) : yeni === null;
    if (gider) { giden.push({ islemId: h.islemId, sira, sayfa: s }); return; }
    const sayfa = yeni ?? Math.max(1, h.indeks);
    if (sayfa !== s.sayfa) degisti = true;
    sayfalar.push(sayfa === s.sayfa ? s : { ...s, sayfa });
  });
  if (!giden.length && !degisti) return { kayit, degisti: false };
  const out: OcrKayit = { ...kayit, sayfalar };
  if (giden.length) out.silinenler = [...(kayit.silinenler ?? []).filter(x => x.islemId !== h.islemId), ...giden];
  return { kayit: out, degisti: true };
}

// Undo: the later entries +1, this removal's entries back at their old place, on the page put back (indeks).
// silinenler empty → the field goes (the record is as it was before the removal).
export function ocrGeriKoy(kayit: OcrKayit, h: { islemId: string; indeks: number }): { kayit: OcrKayit; degisti: boolean } {
  let degisti = false;
  const sayfalar = kayit.sayfalar.map(s => {
    const sayfa = sayfaNumarasiKaydir(s.sayfa, h.indeks, 1)!;
    if (sayfa === s.sayfa) return s;
    degisti = true;
    return { ...s, sayfa };
  });
  const bunun = (kayit.silinenler ?? []).filter(x => x.islemId === h.islemId).sort((a, b) => a.sira - b.sira);
  if (!bunun.length && !degisti) return { kayit, degisti: false };
  for (const x of bunun) sayfalar.splice(Math.min(x.sira, sayfalar.length), 0, x.sayfa.sayfa === h.indeks + 1 ? x.sayfa : { ...x.sayfa, sayfa: h.indeks + 1 });
  const out: OcrKayit = { ...kayit, sayfalar };
  const kalan = (kayit.silinenler ?? []).filter(x => x.islemId !== h.islemId);
  if (kalan.length) out.silinenler = kalan; else delete out.silinenler;
  return { kayit: out, degisti: true };
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

// ---- task 6.S-4d: ribbons on a deleted page come back with "Geri al" ----

// Which ribbons were on the deleted page: the topic's materials and the book's ribbon
export interface TasinanKurdele { materyaller: string[]; kitap: boolean }

const bunda = (m: unknown, h: Pick<KurdeleHedefi, 'dosya' | 'indeks'>) => isObj(m) && m.dosya === h.dosya && m.sayfa === h.indeks + 1;

export function silinenKurdeleler(t: Tutucu, h: Omit<KurdeleHedefi, 'delta'>): TasinanKurdele {
  const out: TasinanKurdele = { materyaller: [], kitap: false };
  if (Array.isArray(t.uniteler)) {
    for (const u of t.uniteler) {
      if (!isObj(u) || !Array.isArray(u.konular)) continue;
      for (const k of u.konular) {
        if (!isObj(k) || anahtar(k) !== h.konu || !isObj(k.kurdeleler)) continue;
        for (const [materyal, m] of Object.entries(k.kurdeleler)) if (bunda(m, h) && !out.materyaller.includes(materyal)) out.materyaller.push(materyal);
      }
    }
  }
  out.kitap = isObj(t.kurdele) && t.kurdele.konu === h.konu && bunda(t.kurdele, h);
  return out;
}

// Undo, in place: +1 from indeks; the ribbons that were on the page and still sit where they fell (the page
// before it) go back onto it. Only when the page went back where it was (yerinde).
export function kurdeleGeriKoyYerinde(t: Tutucu, h: Omit<KurdeleHedefi, 'delta'>, tasinan: TasinanKurdele | undefined, yerinde: boolean): boolean {
  let degisti = kurdeleKaydirYerinde(t, { ...h, delta: 1 });
  if (!tasinan || !yerinde) return degisti;
  const dustu = sayfaNumarasiKaydir(Math.max(1, h.indeks), h.indeks, 1);   // where they fell, after the +1
  const geri = (m: unknown) => isObj(m) && m.dosya === h.dosya && m.sayfa === dustu ? { ...m, sayfa: h.indeks + 1 } : null;
  if (Array.isArray(t.uniteler)) {
    for (const u of t.uniteler) {
      if (!isObj(u) || !Array.isArray(u.konular)) continue;
      for (const k of u.konular) {
        if (!isObj(k) || anahtar(k) !== h.konu || !isObj(k.kurdeleler)) continue;
        for (const materyal of tasinan.materyaller) {
          const g = geri(k.kurdeleler[materyal]);
          if (g) { k.kurdeleler[materyal] = g; degisti = true; }
        }
      }
    }
  }
  if (tasinan.kitap && isObj(t.kurdele) && t.kurdele.konu === h.konu) {
    const g = geri(t.kurdele);
    if (g) { t.kurdele = g; degisti = true; }
  }
  return degisti;
}

export function kurdeleGeriKoy(latest: unknown, h: Omit<KurdeleHedefi, 'delta'>, tasinan: TasinanKurdele | undefined, yerinde: boolean): { json: Obj; degisti: boolean } {
  const json = structuredClone(isObj(latest) ? latest : {}) as Obj;
  return { json, degisti: kurdeleGeriKoyYerinde(json, h, tasinan, yerinde) };
}
