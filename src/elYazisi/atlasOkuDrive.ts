import { aktifKapsam } from '../drive/auth';
import { FOLDER_MIME, ok, qv } from '../drive/drive';
import { driveKokApi, kokBul } from '../drive/kok';
import { saltOkunurFetch } from '../drive/saltOkunur';
import { ATLAS_JSON, ATLAS_PNG, EL_YAZISI_KLASORU, SISTEM_KLASORU, eskiOnce, type AtlasOge } from './atlasDrive';
import { atlasJsonOku, pngKontrol, type ElYazisiAtlas } from './atlasSema';

// Task 6.4e-1: the handwriting atlas read from Drive (<library root>/_sistem/el-yazisi/), READ ONLY.
// Every request is a GET through saltOkunurFetch: nothing is created, written, moved or trashed.
// - Only items marked by the app (appProperties defter=1, defterSistem=1, the right kind) count; an unmarked
//   item with the same name is ignored (a warning). Several marked → the oldest (createdTime, then id; atlasDrive.ts).
// - No root, folder or file → null (not an error: the atlas is simply not there yet).
// - The result stays in memory for the session; two calls at the same time share one download.
//   A failed read is forgotten, so the next call tries again.
// - Task 6.4e-2b: the root the reader knows is used (no root search); the four names in one search; the atlas
//   copied on the device (per account): used at once, one search behind it tells whether it changed.

export interface AtlasOkuDrive {
  kok(): Promise<{ id: string; name: string } | null>;
  cocuklar(ebeveynId: string, ad: string): Promise<AtlasOge[]>;    // by name, not trashed
  indir(id: string): Promise<Uint8Array>;
  // task 6.4e-2b: the four names in one search (with parents); null: too many → folder by folder (cocuklar)
  toplu?(adlar: string[]): Promise<AtlasOge[] | null>;
}

// The two files read (to see later whether they changed)
export interface AtlasKimlik { pngId: string; jsonId: string; pngMt: string; jsonMt: string }

export interface OkunanAtlas {
  atlas: ElYazisiAtlas;
  png: Uint8Array;
  json: string;
  kimlik: AtlasKimlik;
  uyarilar: string[];
  sure: { indirme: number };   // ms, the whole read (search + download + check)
  nereden: 'drive' | 'cihaz';
}

const isaretli = (o: AtlasOge, klasor: boolean) =>
  o.appProperties?.defter === '1' && o.appProperties?.defterSistem === '1' && (o.mimeType === FOLDER_MIME) === klasor;

// The marked item to use among the same-named ones; null = none
export function okunacakSec(ogeler: AtlasOge[], ad: string, klasor: boolean, uyarilar: string[]): AtlasOge | null {
  const bizim = ogeler.filter(o => isaretli(o, klasor)).sort(eskiOnce);
  if (bizim.length < ogeler.length) uyarilar.push(`"${ad}" adında uygulamanın oluşturmadığı ${ogeler.length - bizim.length} öğe var; okunmadı.`);
  if (bizim.length > 1) uyarilar.push(`"${ad}" ${bizim.length} tane; en eskisi okundu.`);
  return bizim[0] ?? null;
}

// The png and json to read (root → _sistem → el-yazisi → the two files), the same rules either way: with toplu
// one search (at the same time as the root) and the folders followed in memory, otherwise folder by folder.
async function atlasSec(drive: AtlasOkuDrive, uyarilar: string[]): Promise<{ png: AtlasOge; json: AtlasOge } | null> {
  const [kok, toplu] = await Promise.all([drive.kok(), drive.toplu?.([SISTEM_KLASORU, EL_YAZISI_KLASORU, ATLAS_PNG, ATLAS_JSON]) ?? null]);
  if (!kok) return null;
  const cocuklar = toplu
    ? async (eb: string, ad: string) => toplu.filter(o => o.name === ad && !!o.parents?.includes(eb))
    : (eb: string, ad: string) => drive.cocuklar(eb, ad);
  const sistem = okunacakSec(await cocuklar(kok.id, SISTEM_KLASORU), SISTEM_KLASORU, true, uyarilar);
  if (!sistem) return null;
  const klasor = okunacakSec(await cocuklar(sistem.id, EL_YAZISI_KLASORU), EL_YAZISI_KLASORU, true, uyarilar);
  if (!klasor) return null;
  const [png, json] = await Promise.all([ATLAS_PNG, ATLAS_JSON].map(async ad => okunacakSec(await cocuklar(klasor.id, ad), ad, false, uyarilar)));
  return png && json ? { png, json } : null;
}

const kimlikOf = (png: AtlasOge, json: AtlasOge): AtlasKimlik =>
  ({ pngId: png.id, jsonId: json.id, pngMt: png.modifiedTime ?? '', jsonMt: json.modifiedTime ?? '' });

export async function atlasOku(drive: AtlasOkuDrive): Promise<OkunanAtlas | null> {
  const t0 = performance.now();
  const uyarilar: string[] = [];
  const sec = await atlasSec(drive, uyarilar);
  if (!sec) return null;
  const [png, jsonBayt] = await Promise.all([drive.indir(sec.png.id), drive.indir(sec.json.id)]);
  const json = new TextDecoder().decode(jsonBayt);
  const atlas = atlasJsonOku(json);
  pngKontrol(png, atlas);
  return { atlas, png, json, kimlik: kimlikOf(sec.png, sec.json), uyarilar, sure: { indirme: Math.round(performance.now() - t0) }, nereden: 'drive' };
}

// ---- task 6.4e-2b: the copy on the device (key = account; temizYaziBagla.ts gives the real one) ----

export interface AtlasKopya { png: Uint8Array; json: string; kimlik: AtlasKimlik }

export interface AtlasOnbellegi {
  oku(): Promise<unknown>;
  yaz(k: AtlasKopya): Promise<void>;
  sil(): Promise<void>;
}

// A copy that does not pass the atlas checks → null (Drive is read)
export function kopyaCoz(x: unknown): OkunanAtlas | null {
  const t0 = performance.now();
  if (!x || typeof x !== 'object') return null;
  const k = x as Partial<AtlasKopya>;
  const m = k.kimlik as Partial<AtlasKimlik> | undefined;
  if (!(k.png instanceof Uint8Array) || typeof k.json !== 'string' || !m
    || ![m.pngId, m.jsonId, m.pngMt, m.jsonMt].every(v => typeof v === 'string')) return null;
  try {
    const atlas = atlasJsonOku(k.json);
    pngKontrol(k.png, atlas);
    return { atlas, png: k.png, json: k.json, kimlik: { ...m } as AtlasKimlik, uyarilar: [], sure: { indirme: Math.round(performance.now() - t0) }, nereden: 'cihaz' };
  } catch {
    return null;
  }
}

const kimlikAyni = (a: AtlasKimlik, b: AtlasKimlik) =>
  a.pngId === b.pngId && a.jsonId === b.jsonId && a.pngMt === b.pngMt && a.jsonMt === b.jsonMt;

const kopyaOf = (a: OkunanAtlas): AtlasKopya => ({ png: a.png, json: a.json, kimlik: a.kimlik });

// Behind a copy that was used: one search (the files' ids and modifiedTime); changed → read again into the copy
// (used on the next opening); gone → the copy removed. A failure only warns.
async function arkadanTazele(drive: AtlasOkuDrive, onbellek: AtlasOnbellegi, eski: AtlasKimlik): Promise<void> {
  try {
    const sec = await atlasSec(drive, []);
    if (!sec) { await onbellek.sil(); return; }
    if (kimlikAyni(kimlikOf(sec.png, sec.json), eski)) return;
    const a = await atlasOku(drive);
    await (a ? onbellek.yaz(kopyaOf(a)) : onbellek.sil());
  } catch (e) {
    console.warn('El yazısı atlasının yeni sürümü olup olmadığına bakılamadı; cihazdaki kullanılıyor.', e);
  }
}

// ---- the session memory ----

let bellek: Promise<OkunanAtlas | null> | null = null;
let tazeleme: Promise<void> | null = null;

// The copy on the device first (no Drive request on the way; checked behind it), otherwise Drive (then copied)
export function atlasOkuBellekli(drive: AtlasOkuDrive = driveAtlasOkuApi, onbellek?: AtlasOnbellegi): Promise<OkunanAtlas | null> {
  if (!bellek) {
    bellek = (async () => {
      let kopya: OkunanAtlas | null = null;
      if (onbellek) { try { kopya = kopyaCoz(await onbellek.oku()); } catch { kopya = null; } }
      if (kopya) { tazeleme = arkadanTazele(drive, onbellek!, kopya.kimlik); return kopya; }
      const a = await atlasOku(drive);
      if (onbellek) {
        try { await (a ? onbellek.yaz(kopyaOf(a)) : onbellek.sil()); } catch { /* only no copy */ }
      }
      return a;
    })();
    bellek.catch(() => { bellek = null; });
  }
  return bellek;
}

// Sign-out / another account: forget it
export function atlasBellekTemizle(): void { bellek = null; tazeleme = null; }

// Tests: the check behind the copy
export const atlasTazelemesi = (): Promise<void> | null => tazeleme;

// ---- the real Drive (GET only) ----

const WHAT = 'El yazısı atlası okunurken';

// bilinenKok: the root the reader already knows (no root search); otherwise kokBul as before
export function driveAtlasOkuApiKur(bilinenKok?: () => string | null): AtlasOkuDrive {
  const alanlar = 'files(id,name,mimeType,createdTime,modifiedTime,appProperties,parents)';
  return {
    async kok() {
      const id = bilinenKok?.();
      if (id) return { id, name: '' };
      const k = await kokBul(driveKokApi, aktifKapsam() ?? 'dar');
      return k.tur === 'yok' ? null : { id: k.kok.id, name: k.kok.name };
    },
    async cocuklar(ebeveynId, ad) {
      const q = `'${qv(ebeveynId)}' in parents and name = '${qv(ad)}' and trashed = false`;
      const params = new URLSearchParams({ q, fields: alanlar, pageSize: '100' });
      const j = await (await ok(await saltOkunurFetch('files?' + params), WHAT)).json() as { files?: AtlasOge[] };
      return j.files ?? [];
    },
    async toplu(adlar) {
      const q = `(${adlar.map(a => `name = '${qv(a)}'`).join(' or ')}) and trashed = false`;
      const params = new URLSearchParams({ q, fields: 'nextPageToken,' + alanlar, pageSize: '100' });
      const j = await (await ok(await saltOkunurFetch('files?' + params), WHAT)).json() as { files?: AtlasOge[]; nextPageToken?: string };
      return j.nextPageToken ? null : j.files ?? [];
    },
    async indir(id) {
      const res = await ok(await saltOkunurFetch(`files/${encodeURIComponent(id)}?alt=media`), WHAT);
      return new Uint8Array(await res.arrayBuffer());
    }
  };
}

export const driveAtlasOkuApi: AtlasOkuDrive = driveAtlasOkuApiKur();
