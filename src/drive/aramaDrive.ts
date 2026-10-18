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

// Every word must be in the file (and); only the given folders; not in the trash; not a temporary
// conversion file (6.1b). null: no word.
export function fullTextSorgusu(q: string, parentIds: readonly string[]): string | null {
  const k = fullTextKelimeleri(q);
  if (!k.length || !parentIds.length) return null;
  return [
    ...k.map(w => `fullText contains '${qv(w)}'`),
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

export interface MetinSonucu { idler: Set<string>; istek: number; eksik: boolean; ms: number }

// fullText in the given folders: groups of 40 in parallel, 100 per page, at most 2 pages per group
export async function driveMetinAra(q: string, klasorIdleri: readonly string[], getir: Getirici = saltOkunurFetch, signal?: AbortSignal): Promise<MetinSonucu> {
  const t0 = performance.now();
  const sorgular = parcala(klasorIdleri).map(g => fullTextSorgusu(q, g)).filter((s): s is string => !!s);
  const r = await Promise.all(sorgular.map(s => listele<{ id: string }>(getir, s, 'id', {
    pageSize: METIN_SAYFA, enFazlaSayfa: METIN_EN_FAZLA_SAYFA, ne: 'Kitaplıkta aranırken', signal,
  })));
  return {
    idler: new Set(r.flatMap(x => x.dosyalar.map(f => f.id))),
    istek: r.reduce((t, x) => t + x.istek, 0),
    eksik: r.some(x => x.eksik),
    ms: performance.now() - t0,
  };
}
