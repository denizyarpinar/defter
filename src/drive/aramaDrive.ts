import { DriveError, qv } from './drive';
import { saltOkunurFetch, type Getirici } from './saltOkunur';

// Task 6.3d: Drive queries for the library search. Reads only: every request goes through a read-only
// fetcher (saltOkunur.ts), GET only. Drive's fullText finds whole words only (6.3a); names are matched
// on the device (arama/adEsle.ts).

export const GRUP = 40;                 // folders per "'id' in parents or …" query (6.3a: long q strings work)
export const METIN_SAYFA = 100;         // pageSize of a fullText query
export const METIN_EN_FAZLA_SAYFA = 2;  // pages per group; more → eksik

// [a, b, c, …] → groups of n
export function parcala<T>(dizi: readonly T[], n = GRUP): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < dizi.length; i += n) out.push(dizi.slice(i, i + n));
  return out;
}

export const parentsKosulu = (ids: readonly string[]) => `(${ids.map(id => `'${qv(id)}' in parents`).join(' or ')})`;

// The query's words for fullText: split at spaces; " is dropped (Drive would read it as a phrase)
export const fullTextKelimeleri = (q: string) => q.replace(/"/g, ' ').split(/\s+/u).filter(Boolean);

// Task 6.4c-3: a word's two spellings for fullText (Drive does not fold ä = ae; measured): "Einrückung" ↔
// "Einrueckung", "Fuß" ↔ "Fuss". A word with ä/ö/ü/ß → the ae/oe/ue/ss form; one with ae/oe/ue/ss → the
// umlaut form (every one of them: "Quelle" → "Qülle" just finds nothing). Otherwise the word alone.
const AE: Record<string, string> = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue' };
const UMLAUT: Record<string, string> = { ae: 'ä', oe: 'ö', ue: 'ü', ss: 'ß', a: 'Ä', o: 'Ö', u: 'Ü' };
export function yazimlar(w: string): string[] {
  const alt = /[äöüßÄÖÜ]/u.test(w) ? w.replace(/[äöüßÄÖÜ]/gu, c => AE[c])
    : w.replace(/[aou]e|ss/giu, c => /^[AOU]/u.test(c) ? UMLAUT[c[0].toLowerCase()] : UMLAUT[c.toLowerCase()]);
  return alt === w ? [w] : [w, alt];
}

export interface SorguSecenek { yazimlar?: boolean }   // 6.4c-3: both spellings, with or

// Every word must be in the file (and); only the given folders; not in the trash; not a temporary
// conversion file (6.1b). null: no word.
export function fullTextSorgusu(q: string, parentIds: readonly string[], o: SorguSecenek = {}): string | null {
  const k = fullTextKelimeleri(q);
  if (!k.length || !parentIds.length) return null;
  const kosul = (w: string) => {
    const y = o.yazimlar ? yazimlar(w) : [w];
    return y.length === 1 ? `fullText contains '${qv(w)}'` : `(${y.map(x => `fullText contains '${qv(x)}'`).join(' or ')})`;
  };
  return [
    ...k.map(kosul),
    parentsKosulu(parentIds),
    'trashed = false',
    "not appProperties has { key='defterGecici' and value='1' }",
  ].join(' and ');
}

export interface Listelenen<T> { dosyalar: T[]; istek: number; eksik: boolean }

// One files.list query, at most enFazlaSayfa pages; eksik: Drive had more
export async function listele<T>(
  getir: Getirici, q: string, alanlar: string,
  o: { pageSize: number; enFazlaSayfa: number; ne: string; signal?: AbortSignal }
): Promise<Listelenen<T>> {
  const dosyalar: T[] = [];
  let pageToken = '', istek = 0;
  do {
    const p = new URLSearchParams({ q, fields: `nextPageToken,files(${alanlar})`, pageSize: String(o.pageSize) });
    if (pageToken) p.set('pageToken', pageToken);
    const res = await getir('files?' + p, { signal: o.signal });
    istek++;
    if (!res.ok) throw new DriveError(res.status, o.ne);
    const j = await res.json() as { files?: T[]; nextPageToken?: string };
    dosyalar.push(...(j.files ?? []));
    pageToken = j.nextPageToken ?? '';
  } while (pageToken && istek < o.enFazlaSayfa);
  return { dosyalar, istek, eksik: !!pageToken };
}

// Task 6.4c-3: a handwriting record (<pdf>.ocr.json) Drive found: the PDF it belongs to and its folder
export interface OcrBulgusu { kaynak: string; klasor?: string }

export interface MetinSonucu {
  idler: Set<string>; istek: number; eksik: boolean; ms: number;
  ocr?: OcrBulgusu[];   // only with elYazisi
}

// 6.4c-3: both spellings, and the records Drive found (6.4c-4: always in the library search)
export interface MetinSecenek { elYazisi?: boolean }

export interface MetinDosyasi { id: string; parents?: string[]; appProperties?: Record<string, string> }

// fullText in the given folders: groups of 40 in parallel, 100 per page, at most 2 pages per group
export async function driveMetinAra(q: string, klasorIdleri: readonly string[], getir: Getirici = saltOkunurFetch, signal?: AbortSignal, o: MetinSecenek = {}): Promise<MetinSonucu> {
  const t0 = performance.now();
  const sorgular = parcala(klasorIdleri).map(g => fullTextSorgusu(q, g, { yazimlar: o.elYazisi })).filter((s): s is string => !!s);
  const r = await Promise.all(sorgular.map(s => listele<MetinDosyasi>(getir, s, o.elYazisi ? 'id,parents,appProperties' : 'id', {
    pageSize: METIN_SAYFA, enFazlaSayfa: METIN_EN_FAZLA_SAYFA, ne: 'Kitaplıkta aranırken', signal,
  })));
  const dosyalar = r.flatMap(x => x.dosyalar);
  const sonuc: MetinSonucu = {
    idler: new Set(dosyalar.map(f => f.id)),
    istek: r.reduce((t, x) => t + x.istek, 0),
    eksik: r.some(x => x.eksik),
    ms: performance.now() - t0,
  };
  if (o.elYazisi) sonuc.ocr = ocrBulgulari(dosyalar);
  return sonuc;
}

// The records among Drive's answers (appProperties defterOcr=1 with defterOcrKaynak)
export function ocrBulgulari(dosyalar: readonly MetinDosyasi[]): OcrBulgusu[] {
  return dosyalar.filter(f => f.appProperties?.defterOcr === '1' && f.appProperties.defterOcrKaynak)
    .map(f => ({ kaynak: f.appProperties!.defterOcrKaynak, klasor: f.parents?.[0] }));
}
