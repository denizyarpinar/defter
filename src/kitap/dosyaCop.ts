import { t as dilT } from '../dil';   // 6.5-3: t is a topic in this file
import type { DriveFile } from '../drive/drive';
import { topicKey } from '../model/okumaYamasi';
import { defaultKind, type MaterialKind, type TopicMaterials } from '../okuma/konuKesfi';

// Task 6.K6b: the open file (and its solution) to the trash — the pure part (tested). Drive: drive/dosyaCop.ts.
// - Ribbons point at a file by its name: the topic's `kurdeleler[materyal]` and the book's `kurdele` (konu + materyal
//   + dosya) pointing at a file that goes are taken out (the book's → null) and kept for "Geri al". Others stay.
// - "Geri al" puts a ribbon back only where nothing took its place meanwhile (as 6.K5b).
// - The same code for kitap.json as read from Drive and for the book in memory (both have uniteler / kurdele).

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

interface Tutucu { uniteler?: unknown; kurdele?: unknown }

// What went out, enough to put it back
export interface CikanKurdeleler {
  konu: unknown;          // the topic's old mark for the material (undefined: it had none that pointed at the files)
  kitap: unknown;         // the book's old ribbon (undefined: it didn't point at the files)
}

const anahtar = (t: Obj) => topicKey(typeof t.klasor === 'string' ? t.klasor : '', typeof t.baslik === 'string' ? t.baslik : '');

function konuBul(t: Tutucu, konu: string): Obj | null {
  if (!Array.isArray(t.uniteler)) return null;
  for (const u of t.uniteler) {
    if (!isObj(u) || !Array.isArray(u.konular)) continue;
    for (const k of u.konular) if (isObj(k) && anahtar(k) === konu) return k;
  }
  return null;
}

const dosyasi = (m: unknown): string | null => isObj(m) && typeof m.dosya === 'string' ? m.dosya : null;

// Takes the ribbons out of `t` (in place). null: none pointed at the files.
function cikar(t: Tutucu, konu: string, materyal: MaterialKind, adlar: readonly string[]): CikanKurdeleler | null {
  const ad = new Set(adlar);
  const c: CikanKurdeleler = { konu: undefined, kitap: undefined };
  const k = konuBul(t, konu);
  if (k && isObj(k.kurdeleler)) {
    const d = dosyasi(k.kurdeleler[materyal]);
    if (d !== null && ad.has(d)) {
      c.konu = k.kurdeleler[materyal];
      const { [materyal]: _, ...kalan } = k.kurdeleler;
      k.kurdeleler = kalan;
    }
  }
  const r = t.kurdele;
  if (isObj(r) && r.konu === konu && r.materyal === materyal && ad.has(dosyasi(r) ?? '\0')) {
    c.kitap = r;
    t.kurdele = null;
  }
  return c.konu === undefined && c.kitap === undefined ? null : c;
}

// Puts them back (in place) where nothing took their place; false: nothing changed
function geriKoy(t: Tutucu, konu: string, materyal: MaterialKind, c: CikanKurdeleler): boolean {
  let degisti = false;
  const k = konuBul(t, konu);
  if (c.konu !== undefined && k) {
    const kd = isObj(k.kurdeleler) ? k.kurdeleler : {};
    if (kd[materyal] === undefined || kd[materyal] === null) { k.kurdeleler = { ...kd, [materyal]: structuredClone(c.konu) }; degisti = true; }
  }
  if (c.kitap !== undefined && (t.kurdele === null || t.kurdele === undefined)) { t.kurdele = structuredClone(c.kitap); degisti = true; }
  return degisti;
}

// ---- kitap.json as read from Drive (the input is not changed) ----

export function jsondanKurdeleCikar(latest: unknown, konu: string, materyal: MaterialKind, adlar: readonly string[]): { json: Obj; degisti: boolean; cikan: CikanKurdeleler | null } {
  const json = structuredClone(isObj(latest) ? latest : {}) as Obj;
  const cikan = cikar(json, konu, materyal, adlar);
  return { json, degisti: cikan !== null, cikan };
}

export function jsonaKurdeleGeriKoy(latest: unknown, konu: string, materyal: MaterialKind, c: CikanKurdeleler): { json: Obj; degisti: boolean } {
  const json = structuredClone(isObj(latest) ? latest : {}) as Obj;
  return { json, degisti: geriKoy(json, konu, materyal, c) };
}

// ---- the book in memory ----

export const kitaptanKurdeleCikar = (b: Tutucu, konu: string, materyal: MaterialKind, adlar: readonly string[]): CikanKurdeleler | null =>
  cikar(b, konu, materyal, adlar);
export const kitabaKurdeleGeriKoy = (b: Tutucu, konu: string, materyal: MaterialKind, c: CikanKurdeleler): boolean =>
  geriKoy(b, konu, materyal, c);

// ---- the reader ----

// 6.5-3: the label in the chosen language (getters; only shown); the folder in the path stays (ALT_KLASOR)
export const TUR_ETIKETI: Record<MaterialKind, string> = {
  get orijinal() { return dilT('materyal.orijinal'); }, get ozet() { return dilT('materyal.ozet'); },
  get uebungen() { return dilT('cop.tur.uebung'); }, get oedevler() { return dilT('cop.tur.oedev'); }
};
const ALT_KLASOR: Partial<Record<MaterialKind, string>> = { uebungen: 'Uebungen/', oedevler: 'Oedevler/' };

export interface DosyaCopHedefi {
  materyal: MaterialKind;
  dosya: DriveFile;
  cozum: DriveFile | null;     // X_cozum.pdf of X (the dialog's box); null: none, or the solution itself goes
  sadeceCozum: boolean;        // the solution was on screen: only it goes
  etiket: string;              // "Übung · Uebungen/blatt1.pdf"
}

export interface AcikKonu { materials: TopicMaterials; kind: MaterialKind | null; fileIndex: number; solution: boolean }

// The file on screen. Übungen / Ödevler: the chosen file, or its solution when the page in focus is one of the
// solution's (focus ≥ mainCount). Orijinal / Özet: the file of the page in focus (brifing + sorular: either one).
export function dosyaCopHedefi(t: AcikKonu, odakDosyaId: string | null, odak: number, mainCount: number): DosyaCopHedefi | null {
  const kind = t.kind;
  if (kind === null) return null;
  const list = t.materials[kind];
  const m = kind === 'uebungen' || kind === 'oedevler'
    ? list[t.fileIndex]
    : list.find(x => x.file.id === odakDosyaId || x.cozum?.id === odakDosyaId) ?? list[0];
  if (!m) return null;
  const yol = (f: DriveFile) => `${TUR_ETIKETI[kind]} · ${ALT_KLASOR[kind] ?? ''}${f.name}`;
  if (m.cozum && ((t.solution && odak >= mainCount) || odakDosyaId === m.cozum.id)) {
    return { materyal: kind, dosya: m.cozum, cozum: null, sadeceCozum: true, etiket: `${dilT('materyal.cozum')} · ${ALT_KLASOR[kind] ?? ''}${m.cozum.name}` };
  }
  return { materyal: kind, dosya: m.file, cozum: m.cozum, sadeceCozum: false, etiket: yol(m.file) };
}

// After the trash: the same kind if it still has files (Übungen / Ödevler: the file at the same place, else the
// one before), else the default kind; nothing left → null (the empty topic of 6.K6a)
export function copSonrasiSecim(kind: MaterialKind | null, fileIndex: number, m: TopicMaterials): { kind: MaterialKind; fileIndex: number } | null {
  if (kind && m[kind].length) {
    const liste = kind === 'uebungen' || kind === 'oedevler';
    return { kind, fileIndex: liste ? Math.min(Math.max(fileIndex, 0), m[kind].length - 1) : 0 };
  }
  const k = defaultKind(m);
  return k ? { kind: k, fileIndex: 0 } : null;
}

// The trash button: only where writing may happen and a material is on screen (not with the pen on)
export function copDugmesiGorunur(g: { kilitAcik: boolean; drive: boolean; surum2: boolean; materyal: boolean; kalem: boolean }): boolean {
  return g.kilitAcik && g.drive && g.surum2 && g.materyal && !g.kalem;
}

// The topic's materials without the files that went (no Drive request); a solution that went leaves its X alone
export function materyallerdenCikar(m: TopicMaterials, giden: readonly string[]): TopicMaterials {
  const g = new Set(giden);
  const temiz = (list: TopicMaterials[MaterialKind]) => list
    .filter(x => !g.has(x.file.id))
    .map(x => x.cozum && g.has(x.cozum.id) ? { ...x, cozum: null } : x);
  return { orijinal: temiz(m.orijinal), ozet: temiz(m.ozet), uebungen: temiz(m.uebungen), oedevler: temiz(m.oedevler) };
}

// After "Geri al": where the file that came back is (its solution alone: its X with "Çözümü göster" on); null: not
// listed (yet)
export function geriGelenSecim(m: TopicMaterials, gelen: readonly string[]): { kind: MaterialKind; fileIndex: number; solution: boolean } | null {
  const ilk = gelen[0];
  for (const kind of ['orijinal', 'ozet', 'uebungen', 'oedevler'] as const) {
    const list = m[kind];
    const liste = kind === 'uebungen' || kind === 'oedevler';
    const i = list.findIndex(x => x.file.id === ilk);
    if (i >= 0) return { kind, fileIndex: liste ? i : 0, solution: false };
    const j = list.findIndex(x => x.cozum?.id === ilk);
    if (j >= 0) return { kind, fileIndex: liste ? j : 0, solution: liste };
  }
  return null;
}

// The dialog's count: photos waiting for this topic block a summary (they would go into it, or into a new ozet.pdf);
// pen records / uploads of the files are only a warning (they stay on the device)
export function dosyaCopSayimi(g: { hedef: DosyaCopHedefi; konuKlasorId: string; kalemIdleri: readonly string[]; fotoKonulari: readonly string[]; yukleniyor: (id: string) => boolean }): { engel: boolean; bekleyen: number } {
  if (g.hedef.materyal === 'ozet' && g.fotoKonulari.includes(g.konuKlasorId)) return { engel: true, bekleyen: 0 };
  const ids = [g.hedef.dosya.id, ...(g.hedef.cozum ? [g.hedef.cozum.id] : [])];
  return { engel: false, bekleyen: ids.filter(id => g.kalemIdleri.includes(id) || g.yukleniyor(id)).length };
}
