import { t as dilT } from '../dil';   // 6.5-3: t is a topic in this file
import { topicKey } from '../model/okumaYamasi';
import type { Book, Topic, Unit } from '../model/types';
import { klasorAdi } from './klasorAdi';

// Task 6.K5a: the contents' edit mode (surum 2 only): add a unit / topic, rename, reorder. Pure, tested.
// - Names and order change only in kitap.json; Drive's folders keep their names and places.
// - The same change goes to the file read from Drive (icindekilerUygula: unknown fields, ribbons, cover and
//   statuses stay) and to the book in memory (kitabaUygula: the same Unit / Topic objects, only moved or renamed).
// - Units and topics are found by a key, not by their place, so a change still lands right when another device
//   reordered meanwhile. Topic: topicKey (its folder). Unit: its folder (klasor, or the folder its topics are in);
//   without one, its title (+ which one of that title).

export type IcindekilerIslemi =
  | { tur: 'uniteEkle'; baslik: string; klasor: string }
  | { tur: 'konuEkle'; unite: string; uniteKlasor: string; baslik: string; klasor: string }   // klasor: the topic's whole path
  | { tur: 'uniteAdi'; unite: string; baslik: string }
  | { tur: 'konuAdi'; konu: string; baslik: string }
  | { tur: 'uniteSirasi'; sira: string[] }
  | { tur: 'konuSirasi'; unite: string; sira: string[] };

// The file and the book in memory don't fit the change (e.g. the unit is gone): nothing is written.
export class IcindekilerUyusmuyor extends Error {
  constructor(ne: string) { super(dilT('icindekiler.hata.uyusmuyor', { ne })); }
}

const ilkParca = (yol: string) => yol.includes('/') ? yol.slice(0, yol.indexOf('/')) : '';

// The unit's folder: its own klasor, else the one folder all its topics (with a path) are in; '' if not known
export function uniteKlasoru(klasor: unknown, konuYollari: readonly unknown[]): string {
  if (typeof klasor === 'string' && klasor.trim()) return klasor.trim();
  const yollar = konuYollari.filter((y): y is string => typeof y === 'string' && !!y.trim()).map(y => ilkParca(y.trim()));
  return yollar.length && yollar[0] && yollar.every(y => y === yollar[0]) ? yollar[0] : '';
}

interface UniteBilgisi { baslik: unknown; klasor?: unknown; konular: readonly { klasor: unknown }[] }

// One key per unit, in order: "k:<folder>" or "b:<title>#<n>" (n: the how-manieth unit with that title)
export function uniteAnahtarlari(uniteler: readonly UniteBilgisi[]): string[] {
  const kac = new Map<string, number>();
  return uniteler.map(u => {
    const k = uniteKlasoru(u.klasor, u.konular.map(t => t.klasor));
    if (k) return 'k:' + k;
    const b = String(u.baslik ?? '');
    const n = kac.get(b) ?? 0;
    kac.set(b, n + 1);
    return `b:${b}#${n}`;
  });
}

const konuAnahtari = (t: { baslik: unknown; klasor: unknown }) =>
  topicKey(typeof t.klasor === 'string' ? t.klasor : '', typeof t.baslik === 'string' ? t.baslik : '');

export const kitapUniteAnahtarlari = (b: Book) => uniteAnahtarlari(b.uniteler);
export const kitapKonuAnahtari = (t: Topic) => konuAnahtari(t);

// ---- one implementation for both: the raw file and the book in memory ----

interface KonuBenzeri { baslik: unknown; klasor: unknown }
interface UniteBenzeri<K extends KonuBenzeri> { baslik: unknown; klasor?: unknown; konular: K[] }

interface Yeni<U, K> { unite(baslik: string, klasor: string): U; konu(baslik: string, klasor: string): K }

// key order: the units / topics named in `sira` in that order, then the rest (e.g. added by another device) as they were
function sirala<T>(liste: T[], anahtarlar: string[], sira: readonly string[]): T[] {
  const kalan = liste.map((x, i) => ({ x, k: anahtarlar[i], alindi: false }));
  const out: T[] = [];
  for (const k of sira) {
    const e = kalan.find(e => !e.alindi && e.k === k);
    if (e) { e.alindi = true; out.push(e.x); }
  }
  for (const e of kalan) if (!e.alindi) out.push(e.x);
  return out;
}

function uniteBul<K extends KonuBenzeri, U extends UniteBenzeri<K>>(uniteler: U[], anahtar: string, klasor?: string): U | undefined {
  const anahtarlar = uniteAnahtarlari(uniteler);
  const i = anahtarlar.indexOf(anahtar);
  if (i >= 0) return uniteler[i];
  // the unit's key changed meanwhile (its first topic made its folder known): by the folder
  return klasor ? uniteler.find(u => uniteKlasoru(u.klasor, u.konular.map(t => t.klasor)) === klasor) : undefined;
}

const ayni = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// Changes `uniteler` in place; true when something changed. Throws IcindekilerUyusmuyor when the change doesn't fit.
function uygula<K extends KonuBenzeri, U extends UniteBenzeri<K>>(uniteler: U[], islem: IcindekilerIslemi, yeni: Yeni<U, K>): boolean {
  switch (islem.tur) {
    case 'uniteEkle': {
      if (uniteAnahtarlari(uniteler).includes('k:' + islem.klasor)) return false;   // there already (a retry)
      uniteler.push(yeni.unite(islem.baslik, islem.klasor));
      return true;
    }
    case 'konuEkle': {
      const u = uniteBul(uniteler, islem.unite, islem.uniteKlasor);
      if (!u) throw new IcindekilerUyusmuyor(dilT('icindekiler.neden.konuUnitesiYok'));
      let degisti = false;
      if (uniteKlasoru(u.klasor, []) === '') { u.klasor = islem.uniteKlasor; degisti = true; }   // the folder becomes known
      const key = topicKey(islem.klasor, islem.baslik);
      if (uniteler.some(x => x.konular.some(t => konuAnahtari(t) === key))) return degisti;
      u.konular.push(yeni.konu(islem.baslik, islem.klasor));
      return true;
    }
    case 'uniteAdi': {
      const u = uniteBul(uniteler, islem.unite);
      if (!u) throw new IcindekilerUyusmuyor(dilT('icindekiler.neden.uniteYok'));
      if (u.baslik === islem.baslik) return false;
      u.baslik = islem.baslik;
      return true;
    }
    case 'konuAdi': {
      const t = uniteler.flatMap(u => u.konular).find(t => konuAnahtari(t) === islem.konu);
      if (!t) throw new IcindekilerUyusmuyor(dilT('icindekiler.neden.konuYok'));
      if (t.baslik === islem.baslik) return false;
      t.baslik = islem.baslik;
      return true;
    }
    case 'uniteSirasi': {
      const yeniSira = sirala(uniteler, uniteAnahtarlari(uniteler), islem.sira);
      if (ayni(yeniSira, uniteler)) return false;
      uniteler.splice(0, uniteler.length, ...yeniSira);
      return true;
    }
    case 'konuSirasi': {
      const u = uniteBul(uniteler, islem.unite);
      if (!u) throw new IcindekilerUyusmuyor(dilT('icindekiler.neden.uniteYok'));
      const yeniSira = sirala(u.konular, u.konular.map(konuAnahtari), islem.sira);
      if (ayni(yeniSira, u.konular)) return false;
      u.konular.splice(0, u.konular.length, ...yeniSira);
      return true;
    }
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

// latest: kitap.json as just read from Drive (surum 2). Returns the new content; the input is not changed.
export function icindekilerUygula(latest: unknown, islem: IcindekilerIslemi): { json: Obj; degisti: boolean } {
  const json = structuredClone(isObj(latest) ? latest : {}) as Obj;
  if (json.uniteler === undefined) json.uniteler = [];
  const uniteler = json.uniteler;
  // parse.ts would show odd entries anyway, but we don't write over a list we can't read
  if (!Array.isArray(uniteler) || !uniteler.every(u => isObj(u) && Array.isArray(u.konular) && u.konular.every(isObj))) {
    throw new IcindekilerUyusmuyor(dilT('icindekiler.neden.uniteListesi'));
  }
  const degisti = uygula(uniteler as (Obj & UniteBenzeri<Obj & KonuBenzeri>)[], islem, {
    unite: (baslik, klasor) => ({ baslik, klasor, konular: [] }) as unknown as Obj & UniteBenzeri<Obj & KonuBenzeri>,
    konu: (baslik, klasor) => ({ baslik, klasor, durum: 'okunmadi' }) as Obj & KonuBenzeri
  });
  return { json, degisti };
}

// The same change on the book in memory (after Drive took it; names and order also before)
export function kitabaUygula(b: Book, islem: IcindekilerIslemi): boolean {
  return uygula<Topic, Unit>(b.uniteler, islem, {
    unite: (baslik, klasor) => ({ baslik, klasor, konular: [], extra: {} }),
    konu: (baslik, klasor) => ({ baslik, klasor, durum: 'okunmadi', kurdeleler: {}, extra: {} })
  });
}

// Task 6.K5a-2 ("Vazgeç"): the book in memory takes the names and the order of its units / topics from kitap.json as
// just read from Drive. Matched by key (topic: its folder; unit: its folder, else the same place among the units
// without one). Statuses, ribbons and the cover stay as in memory; units / topics only in Drive are not added.
export function kitabiEsitle(b: Book, json: unknown): boolean {
  if (!isObj(json) || !Array.isArray(json.uniteler)) return false;
  const ham = json.uniteler.map(u => isObj(u)
    ? { baslik: u.baslik, klasor: u.klasor, konular: Array.isArray(u.konular) ? u.konular.filter(isObj).map(t => ({ baslik: t.baslik, klasor: t.klasor })) : [] }
    : { baslik: '', konular: [] as { baslik: unknown; klasor: unknown }[] });
  const hamAnahtar = uniteAnahtarlari(ham);
  const bizimAnahtar = kitapUniteAnahtarlari(b);
  const alinan = new Set<number>();
  const eslesen = bizimAnahtar.map((k, i) => {
    let j = hamAnahtar.indexOf(k);
    // a unit without a folder: its title is its key, so a renamed one is found by its place
    if (j < 0 && k.startsWith('b:') && hamAnahtar[i]?.startsWith('b:')) j = i;
    if (j < 0 || alinan.has(j)) return -1;
    alinan.add(j);
    return j;
  });
  let degisti = false;
  b.uniteler.forEach((u, i) => {
    const h = ham[eslesen[i]];
    if (!h) return;
    if (typeof h.baslik === 'string' && h.baslik !== u.baslik) { u.baslik = h.baslik; degisti = true; }
    const hamKonular = h.konular.map(konuAnahtari);
    for (const t of u.konular) {
      const ht = h.konular[hamKonular.indexOf(konuAnahtari(t))];
      if (ht && typeof ht.baslik === 'string' && ht.baslik !== t.baslik) { t.baslik = ht.baslik; degisti = true; }
    }
    const yeniSira = sirala(u.konular, u.konular.map(konuAnahtari), hamKonular);
    if (!ayni(yeniSira, u.konular)) { u.konular.splice(0, u.konular.length, ...yeniSira); degisti = true; }
  });
  const sira = bizimAnahtar.map((k, i) => ({ k, j: eslesen[i] })).filter(e => e.j >= 0).sort((x, y) => x.j - y.j).map(e => e.k);
  const yeniUniteler = sirala(b.uniteler, bizimAnahtar, sira);
  if (!ayni(yeniUniteler, b.uniteler)) { b.uniteler.splice(0, b.uniteler.length, ...yeniUniteler); degisti = true; }
  return degisti;
}

// ---- an old unit without a known folder (6.K5a, Deniz's rule) ----

export interface AltKlasor { id: string; name: string; appProperties?: Record<string, string> }

// Folders under the book's folder: the one ours (defter = 1), not used by another unit's topics or klasor, named
// exactly klasorAdi('unite', sira, baslik). None or more than one → null ("+ Konu" stays grey).
export function uniteKlasoruBul(uniteler: readonly UniteBilgisi[], i: number, adaylar: readonly AltKlasor[]): string | null {
  const u = uniteler[i];
  if (!u) return null;
  const kendi = uniteKlasoru(u.klasor, u.konular.map(t => t.klasor));
  if (kendi) return kendi;
  const kullanilan = new Set<string>();
  uniteler.forEach((x, j) => {
    if (j === i) return;
    if (typeof x.klasor === 'string' && x.klasor.trim()) kullanilan.add(x.klasor.trim());
    for (const t of x.konular) if (typeof t.klasor === 'string') kullanilan.add(ilkParca(t.klasor.trim()));
  });
  const ad = klasorAdi('unite', i + 1, String(u.baslik ?? ''));
  const uyan = adaylar.filter(f => f.appProperties?.defter === '1' && !kullanilan.has(f.name) && f.name === ad);
  return uyan.length === 1 ? uyan[0].name : null;
}
