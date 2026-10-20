import { topicKey } from '../model/okumaYamasi';
import { IcindekilerUyusmuyor, uniteAnahtarlari, uniteKlasoru } from './icindekiler';

// Task 6.K5b: a topic / unit out of the contents (and back for "Geri al"), a book's shelf entry out of kitaplik.json
// (and back). Pure, tested. The same code for kitap.json as read from Drive and for the book in memory: both have
// `uniteler` and `kurdele`.
// - A topic / unit is found by its folder (topic: topicKey; unit: its folder), never by its place.
// - The book's ribbon (`kurdele.konu` = a topic's folder) pointing into what goes → null; kept for "Geri al".
// - A unit without its own `klasor` whose last topic goes: its folder (from the topic's path) is written as `klasor`,
//   so "+ Konu" still knows it.
// - "Geri al" puts the very object back after the one that stood before it (else at its old place). Already there →
//   no change (a retry).

export type CopHedefi =
  | { tur: 'konu'; konu: string }                   // konu: topicKey (its folder path)
  | { tur: 'unite'; klasor: string };               // klasor: the unit's folder

interface KonuBenzeri { baslik: unknown; klasor: unknown }
interface UniteBenzeri { baslik: unknown; klasor?: unknown; konular: KonuBenzeri[] }
interface Tutucu { uniteler?: unknown; kurdele?: unknown }

// What went out, enough to put it back
export interface Cikan<U = unknown, K = unknown> {
  tur: 'konu' | 'unite';
  nesne: U | K;                    // the unit / topic object itself
  uniteKlasor: string;             // topic: the unit it was in; unit: its own folder
  onceki: string | null;           // the key of the one before it (topic: topicKey; unit: its folder key)
  sira: number;                    // its old place
  kurdele?: unknown;               // the book's ribbon before it was set to null (only when it was)
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const konuAnahtari = (t: KonuBenzeri) => topicKey(typeof t.klasor === 'string' ? t.klasor : '', typeof t.baslik === 'string' ? t.baslik : '');
const uniteKlasoruOf = (u: UniteBenzeri) => uniteKlasoru(u.klasor, u.konular.map(t => t.klasor));

function uniteListesi(t: Tutucu): UniteBenzeri[] {
  const u = t.uniteler;
  if (u === undefined) return [];
  if (!Array.isArray(u) || !u.every(x => isObj(x) && Array.isArray(x.konular) && x.konular.every(isObj))) {
    throw new IcindekilerUyusmuyor('kitap.json\'daki ünite listesi beklenmedik biçimde');
  }
  return u as UniteBenzeri[];
}

// The topic folders a target takes along (the ribbon and the reader look at these)
export function gidenKonular(uniteler: readonly UniteBenzeri[], h: CopHedefi): string[] {
  if (h.tur === 'konu') return [h.konu];
  const u = uniteler.find(x => uniteKlasoruOf(x) === h.klasor);
  return u ? u.konular.map(konuAnahtari) : [];
}

const kurdeleKonusu = (k: unknown): string | null => isObj(k) && typeof k.konu === 'string' ? k.konu : null;

// Takes the target out of `t` (in place). null: not there (already out).
function cikar(t: Tutucu, h: CopHedefi): Cikan | null {
  const uniteler = uniteListesi(t);
  const giden = new Set(gidenKonular(uniteler, h));
  let c: Cikan | null = null;
  if (h.tur === 'konu') {
    for (const u of uniteler) {
      const i = u.konular.findIndex(k => konuAnahtari(k) === h.konu);
      if (i < 0) continue;
      const uk = uniteKlasoruOf(u);
      if (uk && !(typeof u.klasor === 'string' && u.klasor.trim())) u.klasor = uk;   // the folder stays known
      c = { tur: 'konu', nesne: u.konular[i], uniteKlasor: uk, onceki: i > 0 ? konuAnahtari(u.konular[i - 1]) : null, sira: i };
      u.konular.splice(i, 1);
      break;
    }
  } else {
    const i = uniteler.findIndex(u => uniteKlasoruOf(u) === h.klasor);
    if (i >= 0) {
      c = { tur: 'unite', nesne: uniteler[i], uniteKlasor: h.klasor, onceki: i > 0 ? uniteAnahtarlari(uniteler)[i - 1] : null, sira: i };
      uniteler.splice(i, 1);
    }
  }
  if (!c) return null;
  const k = kurdeleKonusu(t.kurdele);
  if (k !== null && giden.has(k)) { c.kurdele = t.kurdele; t.kurdele = null; }
  return c;
}

// Puts it back (in place); false: it was there already
function geriKoy(t: Tutucu, c: Cikan): boolean {
  const uniteler = uniteListesi(t);
  if (t.uniteler === undefined) t.uniteler = uniteler;
  let degisti = false;
  if (c.tur === 'konu') {
    const nesne = c.nesne as KonuBenzeri;
    const key = konuAnahtari(nesne);
    if (!uniteler.some(u => u.konular.some(k => konuAnahtari(k) === key))) {
      const u = uniteler.find(x => uniteKlasoruOf(x) === c.uniteKlasor);
      if (!u) throw new IcindekilerUyusmuyor('konunun ünitesi kitap.json\'da bulunamadı');
      const j = c.onceki === null ? -1 : u.konular.findIndex(k => konuAnahtari(k) === c.onceki);
      u.konular.splice(j >= 0 ? j + 1 : c.onceki === null ? 0 : Math.min(c.sira, u.konular.length), 0, nesne);
      degisti = true;
    }
  } else if (!uniteler.some(u => uniteKlasoruOf(u) === c.uniteKlasor)) {
    const j = c.onceki === null ? -1 : uniteAnahtarlari(uniteler).indexOf(c.onceki);
    uniteler.splice(j >= 0 ? j + 1 : c.onceki === null ? 0 : Math.min(c.sira, uniteler.length), 0, c.nesne as UniteBenzeri);
    degisti = true;
  }
  // the ribbon only when nothing took its place meanwhile
  if (c.kurdele !== undefined && (t.kurdele === null || t.kurdele === undefined)) { t.kurdele = c.kurdele; degisti = true; }
  return degisti;
}

// ---- kitap.json as read from Drive (the input is not changed) ----

export function jsondanCikar(latest: unknown, h: CopHedefi): { json: Obj; degisti: boolean; cikan: Cikan | null } {
  const json = structuredClone(isObj(latest) ? latest : {}) as Obj;
  const cikan = cikar(json, h);
  return { json, degisti: cikan !== null, cikan };
}

export function jsonaGeriKoy(latest: unknown, c: Cikan): { json: Obj; degisti: boolean } {
  const json = structuredClone(isObj(latest) ? latest : {}) as Obj;
  // the object goes in as a copy: the one kept for a retry stays as it was
  const degisti = geriKoy(json, { ...c, nesne: structuredClone(c.nesne) });
  return { json, degisti };
}

// ---- the book in memory (the same Unit / Topic objects) ----

export const kitaptanCikar = (b: Tutucu, h: CopHedefi): Cikan | null => cikar(b, h);
export const kitabaGeriKoy = (b: Tutucu, c: Cikan): boolean => geriKoy(b, c);

// ---- the reader: where to go when the open topic goes ----

// The topic to show instead of `acik` (a topic folder that goes): the next one in its unit, else the one before,
// else the first of a later unit, else the last of an earlier one; none left → null. On the book before the change.
export function komsuKonu(uniteler: readonly UniteBenzeri[], acik: string, giden: ReadonlySet<string>): string | null {
  const kalan = (u: UniteBenzeri) => u.konular.map(konuAnahtari).filter(k => !giden.has(k));
  const ui = uniteler.findIndex(u => u.konular.some(k => konuAnahtari(k) === acik));
  if (ui < 0) return null;
  const hepsi = uniteler[ui].konular.map(konuAnahtari);
  const ti = hepsi.indexOf(acik);
  const sonra = hepsi.slice(ti + 1).find(k => !giden.has(k));
  if (sonra) return sonra;
  const once = hepsi.slice(0, ti).reverse().find(k => !giden.has(k));
  if (once) return once;
  for (const u of uniteler.slice(ui + 1)) { const k = kalan(u)[0]; if (k) return k; }
  for (const u of uniteler.slice(0, ui).reverse()) { const k = kalan(u).at(-1); if (k) return k; }
  return null;
}

// ---- kitaplik.json: the shelf entry ----

export interface RafYeri { rafId: string; sira: number }

const rafIdsi = (r: unknown) => isObj(r) && typeof r.id === 'string' ? r.id : null;
const kitaplari = (r: unknown): unknown[] => isObj(r) && Array.isArray(r.kitaplar) ? r.kitaplar : [];

// Every entry of the book goes (each shelf, each place); the places are kept for "Geri al". Other fields stay.
export function raftanCikar(ham: unknown, kitapId: string): { json: Obj; degisti: boolean; yerler: RafYeri[] } {
  const base = isObj(ham) ? ham : {};
  const raflar = Array.isArray(base.raflar) ? base.raflar : [];
  const yerler: RafYeri[] = [];
  let degisti = false;
  const yeniRaflar = raflar.map(r => {
    const k = kitaplari(r);
    const i = k.indexOf(kitapId);
    if (i < 0 || !isObj(r)) return r;
    const id = rafIdsi(r);
    if (id !== null) yerler.push({ rafId: id, sira: i });
    degisti = true;
    return { ...r, kitaplar: k.filter(x => x !== kitapId) };
  });
  return degisti ? { json: { ...base, raflar: yeniRaflar }, degisti, yerler } : { json: base, degisti, yerler };
}

// The book back on its old shelf at its old place (the shelf gone: the end of the first shelf). Already on a shelf
// (or no shelf at all) → no change.
export function rafaGeriKoy(ham: unknown, yerler: readonly RafYeri[], kitapId: string): { json: Obj; degisti: boolean } {
  const base = isObj(ham) ? ham : {};
  const raflar = Array.isArray(base.raflar) ? base.raflar : [];
  if (raflar.some(r => kitaplari(r).includes(kitapId))) return { json: base, degisti: false };
  const yer = yerler.find(y => raflar.some(r => rafIdsi(r) === y.rafId));
  let i = yer ? raflar.findIndex(r => rafIdsi(r) === yer.rafId) : raflar.findIndex(isObj);
  if (i < 0) return { json: base, degisti: false };
  const raf = raflar[i] as Obj;
  const k = [...kitaplari(raf)];
  k.splice(yer ? Math.min(yer.sira, k.length) : k.length, 0, kitapId);
  return { json: { ...base, raflar: raflar.map((r, j) => j === i ? { ...raf, kitaplar: k } : r) }, degisti: true };
}

// ---- the dialog ----

// Changes on the device not in Drive yet, inside what goes: pen records (by file id) and photo records (by the topic
// folder they go to)
export function bekleyenSay(g: { kalemIdleri: readonly string[]; fotoKonulari: readonly string[]; dosyaIdleri: ReadonlySet<string>; klasorIdleri: ReadonlySet<string> }): number {
  return g.kalemIdleri.filter(id => g.dosyaIdleri.has(id)).length + g.fotoKonulari.filter(id => g.klasorIdleri.has(id)).length;
}

// The book's name typed in the dialog: no spaces around, any case; İ/I/ı/i count as one letter (a Turkish or an
// English keyboard gives either)
const adAnahtari = (s: string) => s.trim().toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/\u0307/g, '');

export function adEsitMi(yazilan: string, ad: string): boolean {
  const a = adAnahtari(yazilan);
  return a !== '' && a === adAnahtari(ad);
}
