import { FOLDER_MIME, type DriveFile } from '../drive/drive';
import { listele, parcala, parentsKosulu } from '../drive/aramaDrive';
import type { DriveLocation } from '../drive/driveLibrary';
import { saltOkunurFetch, type Getirici } from '../drive/saltOkunur';
import { newArrivals, shelfBooks } from '../model/library';
import type { Book, Library } from '../model/types';
import { bookUnits } from '../model/units';
import { splitPath } from '../okuma/kaynakCoz';
import { MATERIAL_KINDS, classifyTopic, type MaterialKind } from '../okuma/konuKesfi';
import { adAnahtari, dosyaAnahtari } from './adEsle';

// Task 6.3d: the Kitaplık tree in memory, for the library search. Every PDF under kitaplar/<kitap>/ with
// its book, topic (kitap.json) and material (the reader's rule: konuKesfi.classifyTopic). Reads only.
// Built with few requests: every folder in one query (the subtree of Kitaplık is cut out here), then the
// PDFs of those folders, 40 folders per query. More than 3000 folders in Drive: down from the root
// level by level instead ('id' in parents, 40 per query).

export interface AgacKitabi { id: string; baslik: string; sira: number; anahtar: string }

export interface AgacKonusu {
  kitap: AgacKitabi;
  uniteBaslik: string;
  baslik: string;
  klasor?: string;    // surum 2; surum 1 has no folder
  sira: number;       // the topic's place in the book (units one after the other, kitap.json order)
  anahtar: string;
}

export interface AgacDosyasi {
  id: string;
  ad: string;
  modifiedTime: string;
  kitap: AgacKitabi;
  konu: AgacKonusu | null;        // null: in no topic (konu dışı)
  materyal: MaterialKind | null;  // null: in a topic folder, but not one of its materials
  cozumMu: boolean;
  anahtar: string;
}

export interface AgacSuresi {
  yontem: 'tekSorgu' | 'bfs';
  ms: number;
  istek: number;
  klasor: number;   // folders under Kitaplık
}

export interface KitaplikAgaci {
  kitaplar: AgacKitabi[];
  konular: AgacKonusu[];
  dosyalar: AgacDosyasi[];
  klasorIdleri: string[];   // the folders with PDFs (where fullText looks)
  sure: AgacSuresi;
  kuruldu: number;          // Date.now() when building started
}

export interface AgacOrtami { loc: DriveLocation; books: Map<string, Book>; library: Library }

export interface HamKlasor { id: string; name: string; parents?: string[] }
export interface HamDosya extends DriveFile { parents?: string[] }

export interface KlasorBilgi { ad: string; ust: string | null }

export const TEK_SORGU_EN_FAZLA_SAYFA = 3;   // × 1000 folders; more → bfs
export const AGAC_OMRU_MS = 10 * 60_000;
const PDF_MIME = 'application/pdf';

// ---- pure: from Drive's lists to the tree ----

// Every folder Drive gave → the ones under Kitaplık (rootId) with their parent
export function klasorHaritasi(klasorler: readonly HamKlasor[], rootId: string): Map<string, KlasorBilgi> {
  const cocuk = new Map<string, HamKlasor[]>();
  for (const k of klasorler) for (const p of k.parents ?? []) {
    const l = cocuk.get(p);
    if (l) l.push(k); else cocuk.set(p, [k]);
  }
  const harita = new Map<string, KlasorBilgi>([[rootId, { ad: 'Kitaplık', ust: null }]]);
  const sira = [rootId];
  while (sira.length) {
    const id = sira.shift()!;
    for (const k of cocuk.get(id) ?? []) {
      if (harita.has(k.id)) continue;
      harita.set(k.id, { ad: k.name, ust: id });
      sira.push(k.id);
    }
  }
  return harita;
}

// Folder → the book it is in (the book's folder and everything under it)
export function kitapKlasorleri(harita: ReadonlyMap<string, KlasorBilgi>, bookFolderIds: ReadonlyMap<string, string>): Map<string, string> {
  const kitapOf = new Map<string, string>();
  const kitapKok = new Map([...bookFolderIds].map(([kitap, klasor]) => [klasor, kitap]));
  for (const id of harita.keys()) {
    for (let k: string | null = id; k; k = harita.get(k)?.ust ?? null) {
      const kitap = kitapKok.get(k);
      if (kitap) { kitapOf.set(id, kitap); break; }
    }
  }
  return kitapOf;
}

// Books in shelf order, then the ones on no shelf ("Yeni gelenler")
export function kitapSirasi(lib: Library, books: Map<string, Book>): string[] {
  return [...new Set([...lib.raflar.flatMap((_, i) => shelfBooks(lib, books, i)), ...newArrivals(lib, books)])];
}

const kucuk = (s: string) => s.trim().toLowerCase();
const cozumAdi = (ad: string) => /_cozum\.pdf$/i.test(ad.trim());

export function agacCikar(
  harita: ReadonlyMap<string, KlasorBilgi>, dosyalar: readonly HamDosya[],
  g: { bookFolderIds: ReadonlyMap<string, string>; books: Map<string, Book>; library: Library }
): Pick<KitaplikAgaci, 'kitaplar' | 'konular' | 'dosyalar' | 'klasorIdleri'> {
  const kitapOf = kitapKlasorleri(harita, g.bookFolderIds);
  const cocuklar = new Map<string, string[]>();
  for (const [id, k] of harita) if (k.ust) {
    const l = cocuklar.get(k.ust);
    if (l) l.push(id); else cocuklar.set(k.ust, [id]);
  }
  // the PDFs under a book, by folder
  const pdfler = dosyalar.filter(f => f.mimeType === PDF_MIME);
  const ust = (f: HamDosya) => f.parents?.find(p => kitapOf.has(p));
  const klasorde = new Map<string, HamDosya[]>();
  for (const f of pdfler) {
    const p = ust(f);
    if (!p) continue;
    const l = klasorde.get(p);
    if (l) l.push(f); else klasorde.set(p, [f]);
  }
  // a name in a folder: exactly, else without case
  const bul = <T>(l: readonly T[], ad: (t: T) => string, aranan: string) =>
    l.find(x => ad(x) === aranan) ?? l.find(x => kucuk(ad(x)) === kucuk(aranan));
  const altKlasor = (ustId: string, ad: string) => bul(cocuklar.get(ustId) ?? [], id => harita.get(id)!.ad, ad) ?? null;
  const yol = (kok: string, parcalar: readonly string[]) => {
    let id: string | null = kok;
    for (const p of parcalar) { if (!id) break; id = altKlasor(id, p); }
    return id;
  };

  const kitaplar: AgacKitabi[] = [], konular: AgacKonusu[] = [];
  const konuKlasoru = new Map<string, AgacKonusu>();
  const bilgi = new Map<string, { konu: AgacKonusu; materyal: MaterialKind | null; cozumMu: boolean }>();

  kitapSirasi(g.library, g.books).forEach((id, sira) => {
    const b = g.books.get(id)!;
    const baslik = b.baslik || id;
    const kitap: AgacKitabi = { id, baslik, sira, anahtar: [adAnahtari(baslik), adAnahtari(b.sirt)].filter(Boolean).join('\n') };
    kitaplar.push(kitap);
    const kok = g.bookFolderIds.get(id);
    if (!b.hasJson) return;
    let konuSira = 0;
    for (const u of bookUnits(b)) for (const t of u.konular) {
      const konu: AgacKonusu = { kitap, uniteBaslik: u.baslik, baslik: t.baslik, klasor: t.klasor, sira: konuSira++, anahtar: adAnahtari(t.baslik) };
      konular.push(konu);
      if (!kok) continue;
      // surum 2: the topic's folder and its materials, as the reader finds them
      const parcalar = t.klasor ? splitPath(t.klasor) : null;
      const klasorId = parcalar ? yol(kok, parcalar) : null;
      if (klasorId && !konuKlasoru.has(klasorId)) {
        konuKlasoru.set(klasorId, konu);
        const icinde = (ad: string) => { const k = altKlasor(klasorId, ad); return k ? klasorde.get(k) ?? [] : []; };
        const m = classifyTopic(klasorde.get(klasorId) ?? [], icinde('Uebungen'), icinde('Oedevler'));
        for (const kind of MATERIAL_KINDS) for (const it of m[kind]) {
          bilgi.set(it.file.id, { konu, materyal: kind, cozumMu: false });
          if (it.cozum) bilgi.set(it.cozum.id, { konu, materyal: kind, cozumMu: true });
        }
      }
      // surum 1: the chapter's PDF sources
      for (const s of t.kaynaklar ?? []) {
        const p = splitPath(s.dosya);
        if (!p || !/\.pdf$/i.test(p[p.length - 1])) continue;
        const klasor = yol(kok, p.slice(0, -1));
        const f = klasor ? bul(klasorde.get(klasor) ?? [], x => x.name, p[p.length - 1]) : undefined;
        if (f && !bilgi.has(f.id)) bilgi.set(f.id, { konu, materyal: null, cozumMu: false });
      }
    }
  });

  const kitapById = new Map(kitaplar.map(k => [k.id, k]));
  const sonuc: AgacDosyasi[] = [];
  const klasorIdleri = new Set<string>();
  for (const f of pdfler) {
    const p = ust(f);
    const kitap = p ? kitapById.get(kitapOf.get(p)!) : undefined;
    if (!p || !kitap) continue;
    klasorIdleri.add(p);
    let b = bilgi.get(f.id) ?? null;
    if (!b) {
      // in a topic folder (deeper, or not one of its materials): the nearest topic, no material
      for (let k: string | null = p; k && !b; k = harita.get(k)?.ust ?? null) {
        const konu = konuKlasoru.get(k);
        if (konu) b = { konu, materyal: null, cozumMu: cozumAdi(f.name) };
      }
    }
    sonuc.push({
      id: f.id, ad: f.name, modifiedTime: f.modifiedTime, kitap,
      konu: b?.konu ?? null, materyal: b?.materyal ?? null, cozumMu: b?.cozumMu ?? cozumAdi(f.name),
      anahtar: dosyaAnahtari(f.name),
    });
  }
  return { kitaplar, konular, dosyalar: sonuc, klasorIdleri: [...klasorIdleri] };
}

// ---- Drive ----

const KLASOR_ALAN = 'id,name,parents';
const DOSYA_ALAN = 'id,name,mimeType,parents,modifiedTime';

// Every folder in one query; null when there are more than TEK_SORGU_EN_FAZLA_SAYFA pages
async function klasorlerTekSorgu(getir: Getirici, sayac: { istek: number }): Promise<HamKlasor[] | null> {
  const r = await listele<HamKlasor>(getir, `mimeType = '${FOLDER_MIME}' and trashed = false`, KLASOR_ALAN, {
    pageSize: 1000, enFazlaSayfa: TEK_SORGU_EN_FAZLA_SAYFA, ne: 'Kitaplık klasörleri okunurken',
  });
  sayac.istek += r.istek;
  return r.eksik ? null : r.dosyalar;
}

// Down from the root, one level at a time, 40 folders per query
async function klasorlerBfs(getir: Getirici, rootId: string, sayac: { istek: number }): Promise<HamKlasor[]> {
  const hepsi: HamKlasor[] = [];
  const gorulen = new Set([rootId]);
  let seviye = [rootId];
  while (seviye.length) {
    const r = await Promise.all(parcala(seviye).map(g => listele<HamKlasor>(getir,
      `${parentsKosulu(g)} and mimeType = '${FOLDER_MIME}' and trashed = false`, KLASOR_ALAN,
      { pageSize: 1000, enFazlaSayfa: Infinity, ne: 'Kitaplık klasörleri okunurken' })));
    seviye = [];
    for (const x of r) {
      sayac.istek += x.istek;
      for (const k of x.dosyalar) if (!gorulen.has(k.id)) { gorulen.add(k.id); hepsi.push(k); seviye.push(k.id); }
    }
  }
  return hepsi;
}

async function pdfleriAl(getir: Getirici, klasorIdleri: readonly string[], sayac: { istek: number }): Promise<HamDosya[]> {
  const r = await Promise.all(parcala(klasorIdleri).map(g => listele<HamDosya>(getir,
    `${parentsKosulu(g)} and mimeType = '${PDF_MIME}' and trashed = false`, DOSYA_ALAN,
    { pageSize: 1000, enFazlaSayfa: Infinity, ne: 'Kitaplık dosyaları okunurken' })));
  for (const x of r) sayac.istek += x.istek;
  return r.flatMap(x => x.dosyalar);
}

export async function agacKur(o: AgacOrtami, getir: Getirici = saltOkunurFetch): Promise<KitaplikAgaci> {
  const kuruldu = Date.now(), t0 = performance.now();
  const sayac = { istek: 0 };
  const rootId = o.loc.rootId;
  let yontem: AgacSuresi['yontem'] = 'tekSorgu';
  let klasorler = await klasorlerTekSorgu(getir, sayac);
  if (!klasorler) { yontem = 'bfs'; klasorler = await klasorlerBfs(getir, rootId, sayac); }
  const harita = klasorHaritasi(klasorler, rootId);
  const kitapOf = kitapKlasorleri(harita, o.loc.bookFolderIds);
  const dosyalar = await pdfleriAl(getir, [...kitapOf.keys()], sayac);
  const a = agacCikar(harita, dosyalar, { bookFolderIds: o.loc.bookFolderIds, books: o.books, library: o.library });
  return { ...a, sure: { yontem, ms: performance.now() - t0, istek: sayac.istek, klasor: harita.size }, kuruldu };
}

// ---- in memory for the session ----

let bellek: { loc: DriveLocation; books: Map<string, Book>; p: Promise<KitaplikAgaci>; zaman: number } | null = null;

const gecerli = (o: AgacOrtami, simdi: number) =>
  !!bellek && bellek.loc === o.loc && bellek.books === o.books && simdi - bellek.zaman < AGAC_OMRU_MS;

// The tree: the one in memory (ready or being built), else a new one. A failed build is not kept.
export function agacAl(o: AgacOrtami, getir: Getirici = saltOkunurFetch, simdi = Date.now()): Promise<KitaplikAgaci> {
  if (gecerli(o, simdi)) return bellek!.p;
  const p = agacKur(o, getir);
  const b = { loc: o.loc, books: o.books, p, zaman: simdi };
  bellek = b;
  p.catch(() => { if (bellek === b) bellek = null; });
  return p;
}

// true: agacAl answers from memory (ready or being built)
export const agacBellekte = (o: AgacOrtami, simdi = Date.now()) => gecerli(o, simdi);

// Start building in the background (the search panel, 6.3e, when it opens)
export function agacHazirla(o: AgacOrtami): void {
  agacAl(o).catch(e => console.warn('Kitaplık ağacı kurulamadı; arama açılınca tekrar denenecek.', e));
}

// The library was loaded again, a file or photos were added: the next search builds a new tree
export function agacGecersiz(): void {
  bellek = null;
}
