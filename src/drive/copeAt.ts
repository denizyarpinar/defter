import { t } from '../dil';
import { driveFetch, FOLDER_MIME, ok, qv } from './drive';
import type { KokCocuk } from './kok';
import type { KurulumOgesi } from './kurulum';

// Task 6.K5b: trashing a topic / unit / book folder (CLAUDE.md → 6.K5b). The one exception to "Hiçbir dosya
// silinmez" for the user's own content:
// - Only files.update with trashed=true (30 days in Drive's trash; "Geri al" = trashed=false). Never files.delete,
//   never emptyTrash.
// - Only a folder, never the root, kitaplar/ or kitaplik.json; the parent chain is checked before any write:
//   topic → a unit folder of this book → the book's folder → the root's kitaplar/. Anything else: no request.
// - Already in the trash = done (a retry is safe).

export interface CopOgesi extends KurulumOgesi { mimeType?: string; trashed?: boolean }
export interface AgacOgesi { id: string; name: string; mimeType: string; parents?: string[] }

export interface CopDrive {
  oge(id: string): Promise<CopOgesi | null>;
  kokCocuklari(id: string): Promise<KokCocuk[]>;
  altAgac(ebeveynIdleri: readonly string[]): Promise<AgacOgesi[]>;   // everything below, not in the trash
  copDurumu(id: string, trashed: boolean): Promise<void>;
}

// ---- errors (in the chosen language, say what to do) ----

export class CopKilitli extends Error {
  constructor() { super(t('cop.hata.kilitli')); }
}
export class CopYazmaYok extends Error {
  constructor() { super(t('cop.hata.yazmaYok')); }
}
export class CopYeriBeklenmedik extends Error {
  constructor(ne: string) { super(t('cop.hata.yer', { ne })); }
}
export class CopIzinYok extends Error {
  constructor() { super(t('hata.yazmaIzniYok')); }
}
export class CopAgHatasi extends Error {
  constructor() { super(t('cop.hata.ag')); }
}
export class CopCakisma extends Error {
  constructor(dosya: string) { super(t('cop.hata.cakisma', { dosya })); }
}

// ---- the real Drive ----

const what = () => t('cop.atilirken');
const GRUP = 40;   // parents in one query

export async function driveOge(id: string): Promise<CopOgesi | null> {
  const res = await driveFetch(`files/${encodeURIComponent(id)}?fields=id,name,mimeType,parents,appProperties,trashed`);
  if (res.status === 404) return null;
  return await (await ok(res, what())).json() as CopOgesi;
}

// Everything below the given folders, level by level (folders and files, not in the trash)
export async function driveAltAgac(ebeveynIdleri: readonly string[]): Promise<AgacOgesi[]> {
  const out: AgacOgesi[] = [];
  let katman = [...ebeveynIdleri];
  while (katman.length) {
    const sonraki: string[] = [];
    for (let i = 0; i < katman.length; i += GRUP) {
      const ic = katman.slice(i, i + GRUP).map(id => `'${qv(id)}' in parents`).join(' or ');
      let pageToken = '';
      do {
        const params = new URLSearchParams({ q: `(${ic}) and trashed = false`, fields: 'nextPageToken,files(id,name,mimeType,parents)', pageSize: '1000' });
        if (pageToken) params.set('pageToken', pageToken);
        const j = await (await ok(await driveFetch('files?' + params), what())).json() as { files?: AgacOgesi[]; nextPageToken?: string };
        for (const f of j.files ?? []) {
          out.push(f);
          if (f.mimeType === FOLDER_MIME) sonraki.push(f.id);
        }
        pageToken = j.nextPageToken ?? '';
      } while (pageToken);
    }
    katman = sonraki;
  }
  return out;
}

// files.update: only the trashed field (never DELETE)
export async function driveCopDurumu(id: string, trashed: boolean): Promise<void> {
  await ok(await driveFetch(`files/${encodeURIComponent(id)}?fields=id,trashed`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ trashed })
  }), what());
}

// ---- the guard ----

export interface KokYeri { kitaplarId: string; kitaplikId: string | null }

// The root's kitaplar/ and kitaplik.json (by name: the owner's are not marked)
export async function kokYeri(drive: Pick<CopDrive, 'kokCocuklari'>, kokId: string): Promise<KokYeri> {
  const c = await drive.kokCocuklari(kokId);
  const kitaplarId = c.find(x => x.name === 'kitaplar' && x.mimeType === FOLDER_MIME)?.id;
  if (!kitaplarId) throw new CopYeriBeklenmedik(t('cop.neden.kitaplarYok'));
  return { kitaplarId, kitaplikId: c.find(x => x.name === 'kitaplik.json' && x.mimeType !== FOLDER_MIME)?.id ?? null };
}

// zincir: the folder to trash first, then each parent up to the book's folder; the book's folder must be a child of
// kitaplar/. Every one: a folder, not the root / kitaplar/ / kitaplik.json, with the next one as its parent.
// Returns the first one (its `trashed` tells whether it is in the trash already).
export async function zincirKontrol(drive: Pick<CopDrive, 'oge'>, zincir: readonly string[], kokId: string, yer: KokYeri): Promise<CopOgesi> {
  const yasak = new Set([kokId, yer.kitaplarId, ...(yer.kitaplikId ? [yer.kitaplikId] : [])]);
  if (!zincir.length) throw new CopYeriBeklenmedik(t('cop.neden.klasorBilinmiyor'));
  let ilk: CopOgesi | null = null;
  for (let i = 0; i < zincir.length; i++) {
    const id = zincir[i];
    const ust = zincir[i + 1] ?? yer.kitaplarId;
    if (yasak.has(id)) throw new CopYeriBeklenmedik(t('cop.neden.yasak'));
    const o = await drive.oge(id);
    if (!o) throw new CopYeriBeklenmedik(t('cop.neden.klasorYok'));
    if (o.mimeType !== FOLDER_MIME) throw new CopYeriBeklenmedik(t('cop.neden.sadeceKlasor'));
    if (!o.parents?.includes(ust)) throw new CopYeriBeklenmedik(t('cop.neden.yeriYanlis', { ad: o.name }));
    ilk ??= o;
  }
  return ilk!;
}
