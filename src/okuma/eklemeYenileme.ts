import type { DriveFile } from '../drive/drive';
import type { DosyaEklendi, DosyaHedefi } from '../defter/konuyaDosyaEkle';
import { MATERIAL_KINDS, type Material, type MaterialKind, type TopicMaterials } from './konuKesfi';

// Task 5.8g: photos were added to a topic (konuyaEkle.ts). What the open reader does then, without DOM or Drive:
// - its page list grows (the file on screen got the pages), or
// - its tabs are listed again (a new ozet.pdf), or
// - nothing (another file, another topic, the reader closed).
// "Göster" in the success toast goes to the first new page.

// true: the reader goes to the first new page by itself when the adding is done (Deniz decides after testing)
export const GOSTER_OTOMATIK = false;

export interface EklemeSonucu {
  tur: 'yeni' | 'eklendi';
  fileId: string;
  ad: string;
  eskiSayfa: number;   // pages before the adding
  yeniSayfa: number;   // pages after it
}

export interface OkuyucuDurumu {
  acik: boolean;
  ayniKonu: boolean;                  // the topic the photos went to is the open one
  odakDosyaId: string | null;         // the file of the page on screen
  konuOzetIdleri: readonly string[];  // the summary files the open topic knows
}

export interface GosterHedefi { fileId: string; ad: string; sayfa: number }   // sayfa: 1-based in the PDF

export interface YenilemeKarari {
  yenile: 'yok' | 'liste' | 'konu';
  goster: GosterHedefi | null;        // null: no "Göster" button
}

export function yenilemeKarari(s: EklemeSonucu, o: OkuyucuDurumu): YenilemeKarari {
  if (!o.acik || !o.ayniKonu) return { yenile: 'yok', goster: null };
  const sayfa = s.tur === 'yeni' ? 1 : Math.max(1, Math.min(s.eskiSayfa + 1, s.yeniSayfa));
  const goster = { fileId: s.fileId, ad: s.ad, sayfa };
  // a new summary (or one another device made meanwhile): the tabs don't know it yet
  if (s.tur === 'yeni' || !o.konuOzetIdleri.includes(s.fileId)) return { yenile: 'konu', goster };
  // only the file on screen is refreshed; another file comes new the next time it opens
  return { yenile: o.odakDosyaId === s.fileId ? 'liste' : 'yok', goster };
}

export interface SayfaBilgisi { dosyaId: string | null; pdfSayfa?: number }

export interface Genisleme<T> {
  pages: T[];
  ekYeri: number;     // index of the first new page
  eklenen: number;
  sonaMi: boolean;    // the new pages are at the end of the list (nothing after them moves)
}

// The file's pages in the list get the pages up to `toplam` after its last one (pages are only added at the
// end of a PDF). yap: a new page from its number and the file's last page. null: nothing to add.
export function sayfaListesiniGenislet<T extends SayfaBilgisi>(
  pages: readonly T[], fileId: string, toplam: number, yap: (pdfSayfa: number, ornek: T) => T
): Genisleme<T> | null {
  let son = -1, n = 0;
  pages.forEach((p, i) => {
    if (p.dosyaId === fileId && p.pdfSayfa) { son = i; n = Math.max(n, p.pdfSayfa); }
  });
  if (son < 0 || toplam <= n) return null;
  const yeni: T[] = [];
  for (let k = n + 1; k <= toplam; k++) yeni.push(yap(k, pages[son]));
  const ekYeri = son + 1;
  return { pages: [...pages.slice(0, ekYeri), ...yeni, ...pages.slice(ekYeri)], ekYeri, eklenen: yeni.length, sonaMi: ekYeri === pages.length };
}

// Index i of the old list in the new one (the page stays the same page)
export const yeniIndeks = (i: number, g: Pick<Genisleme<unknown>, 'ekYeri' | 'eklenen'>): number => i >= g.ekYeri ? i + g.eklenen : i;

// "Göster": the target page in the list now (-1: not in it)
export const gosterIndeksi = (pages: readonly SayfaBilgisi[], g: GosterHedefi): number =>
  pages.findIndex(p => p.dosyaId === g.fileId && p.pdfSayfa === g.sayfa);

// ---- task 5.10f: a whole file was added ("Dosya ekle", konuyaDosyaEkle.ts) ----
// The topic's tabs and file lists are read again; the tab and file on screen stay. "Göster" opens the new
// file (a solution: its X with "Çözümü göster" on).

// What the adding went to. kind null: the solution's X is not in the open topic (only the toast).
export interface EklenenDosya { kind: MaterialKind | null; fileId: string; ad: string; cozumOf: string | null }

export function eklenenMateryal(hedef: DosyaHedefi, r: Pick<DosyaEklendi, 'fileId' | 'ad'>, m: TopicMaterials): EklenenDosya {
  if (typeof hedef !== 'object') return { kind: hedef, fileId: r.fileId, ad: r.ad, cozumOf: null };
  const x = hedef.cozumOf.id;
  const kind = MATERIAL_KINDS.find(k => m[k].some(it => it.file.id === x)) ?? null;
  return { kind, fileId: r.fileId, ad: r.ad, cozumOf: x };
}

export function dosyaEklemeKarari(e: EklenenDosya, o: { acik: boolean; ayniKonu: boolean }): { yenile: boolean; goster: boolean } {
  const yenile = o.acik && o.ayniKonu;
  return { yenile, goster: yenile && e.kind !== null };
}

// The lists from Drive (new order, new files), but a file the reader knew keeps its object: its modifiedTime
// stays the one the pages, the pen model and the caches use (task 5.8g: versions move only in refreshList).
export function konuBirlestir(eski: TopicMaterials, yeni: TopicMaterials): TopicMaterials {
  const bilinen = new Map<string, DriveFile>();
  for (const k of MATERIAL_KINDS) for (const it of eski[k]) for (const f of [it.file, it.cozum]) if (f) bilinen.set(f.id, f);
  const ayni = (f: DriveFile) => bilinen.get(f.id) ?? f;
  const r = {} as TopicMaterials;
  for (const k of MATERIAL_KINDS) r[k] = yeni[k].map((it): Material => ({ file: ayni(it.file), cozum: it.cozum && ayni(it.cozum) }));
  return r;
}

// The open file's place in the new list (a new file sorted before it doesn't move it); gone: the first one
export function acikIndeks(eski: readonly Material[], yeni: readonly Material[], i: number): number {
  const id = eski[i]?.file.id;
  const j = id ? yeni.findIndex(it => it.file.id === id) : -1;
  return j >= 0 ? j : 0;
}

export interface DosyaGosterHedefi { kind: MaterialKind; fileIndex: number; solution: boolean }

// "Göster" after the topic was read again; null: the new file is not in it
export function dosyaGosterHedefi(e: EklenenDosya, m: TopicMaterials): DosyaGosterHedefi | null {
  if (!e.kind) return null;
  const list = m[e.kind];
  const i = e.cozumOf
    ? list.findIndex(it => it.file.id === e.cozumOf && it.cozum?.id === e.fileId)
    : list.findIndex(it => it.file.id === e.fileId);
  if (i < 0) return null;
  const tekli = e.kind === 'uebungen' || e.kind === 'oedevler';
  return { kind: e.kind, fileIndex: tekli ? i : 0, solution: !!e.cozumOf };
}
