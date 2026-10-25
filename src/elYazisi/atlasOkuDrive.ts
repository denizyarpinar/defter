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

export interface AtlasOkuDrive {
  kok(): Promise<{ id: string; name: string } | null>;
  cocuklar(ebeveynId: string, ad: string): Promise<AtlasOge[]>;    // by name, not trashed
  indir(id: string): Promise<Uint8Array>;
}

export interface OkunanAtlas {
  atlas: ElYazisiAtlas;
  png: Uint8Array;
  uyarilar: string[];
  sure: { indirme: number };   // ms, the whole read (search + download + check)
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

export async function atlasOku(drive: AtlasOkuDrive): Promise<OkunanAtlas | null> {
  const t0 = performance.now();
  const uyarilar: string[] = [];
  const kok = await drive.kok();
  if (!kok) return null;
  const sistem = okunacakSec(await drive.cocuklar(kok.id, SISTEM_KLASORU), SISTEM_KLASORU, true, uyarilar);
  if (!sistem) return null;
  const klasor = okunacakSec(await drive.cocuklar(sistem.id, EL_YAZISI_KLASORU), EL_YAZISI_KLASORU, true, uyarilar);
  if (!klasor) return null;
  const [pngOge, jsonOge] = await Promise.all([ATLAS_PNG, ATLAS_JSON].map(async ad => okunacakSec(await drive.cocuklar(klasor.id, ad), ad, false, uyarilar)));
  if (!pngOge || !jsonOge) return null;
  const [png, json] = await Promise.all([drive.indir(pngOge.id), drive.indir(jsonOge.id)]);
  const atlas = atlasJsonOku(new TextDecoder().decode(json));
  pngKontrol(png, atlas);
  return { atlas, png, uyarilar, sure: { indirme: Math.round(performance.now() - t0) } };
}

// ---- the session memory ----

let bellek: Promise<OkunanAtlas | null> | null = null;

export function atlasOkuBellekli(drive: AtlasOkuDrive = driveAtlasOkuApi): Promise<OkunanAtlas | null> {
  if (!bellek) {
    bellek = atlasOku(drive);
    bellek.catch(() => { bellek = null; });
  }
  return bellek;
}

// Sign-out / another account: forget it
export function atlasBellekTemizle(): void { bellek = null; }

// ---- the real Drive (GET only) ----

const WHAT = 'El yazısı atlası okunurken';

export const driveAtlasOkuApi: AtlasOkuDrive = {
  async kok() {
    const k = await kokBul(driveKokApi, aktifKapsam() ?? 'dar');
    return k.tur === 'yok' ? null : { id: k.kok.id, name: k.kok.name };
  },
  async cocuklar(ebeveynId, ad) {
    const q = `'${qv(ebeveynId)}' in parents and name = '${qv(ad)}' and trashed = false`;
    const params = new URLSearchParams({ q, fields: 'files(id,name,mimeType,createdTime,appProperties)', pageSize: '100' });
    const j = await (await ok(await saltOkunurFetch('files?' + params), WHAT)).json() as { files?: AtlasOge[] };
    return j.files ?? [];
  },
  async indir(id) {
    const res = await ok(await saltOkunurFetch(`files/${encodeURIComponent(id)}?alt=media`), WHAT);
    return new Uint8Array(await res.arrayBuffer());
  }
};
