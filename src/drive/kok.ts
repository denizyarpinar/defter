import { t } from '../dil';
import { FOLDER_MIME, ok, qv } from './drive';
import { saltOkunurFetch } from './saltOkunur';

// Task 6.K2a: where the library's root folder is. Reads only (every request is a GET, saltOkunurFetch).
// - dar (drive.file): only the app's own root, marked appProperties defterKok = "1".
// - tam (the owner, full drive): first the old "Kitaplık" by name (as before), else the defterKok root.
//   So a "Defter Library" made in a narrow test never hides the owner's real Kitaplık.
// The choice is pure (kokSec, kokTamMi) and tested; kokBul asks Drive.

export const ROOT_NAME = 'Kitaplık';
export const KOK_ADI = 'Defter Library';

export type KokModu = 'tam' | 'dar';
export type KokKaynagi = 'defterKok' | 'ad';
export type KokEksik = 'kitaplar' | 'kitaplik.json';

export interface KokAday { id: string; name: string; createdTime?: string }
export interface KokCocuk { id?: string; name: string; mimeType: string }

export type KokSecimi =
  | { tur: 'bulundu'; kok: KokAday; kaynak: KokKaynagi; uyari?: string }
  | { tur: 'yok' }
  | { tur: 'cokKok'; kok: KokAday; kokler: KokAday[]; uyari: string };

export type KokSonucu =
  | { tur: 'bulundu'; kok: KokAday; kaynak: KokKaynagi; uyari?: string }
  | { tur: 'yok' }
  | { tur: 'cokKok'; kok: KokAday; kokler: KokAday[]; uyari: string; eksik: KokEksik[] }   // kaynak: always defterKok
  | { tur: 'yarim'; kok: KokAday; kaynak: KokKaynagi; eksik: KokEksik[]; uyari?: string };

// the warning loadDriveLibrary gave before for two "Kitaplık" folders (kept word for word)
const adUyarisi = (n: number) => t('hata.kok.cokAd', { n, ad: ROOT_NAME });
const kokUyarisi = (n: number) => t('hata.kok.cokKok', { n, ad: KOK_ADI });

// Oldest first (no createdTime: last); the same time → by id, so the choice is stable.
const eskiOnce = (a: KokAday, b: KokAday) =>
  (a.createdTime ?? '￿').localeCompare(b.createdTime ?? '￿') || a.id.localeCompare(b.id);

// adla: the "Kitaplık" folders in My Drive's root (null: not asked, e.g. narrow mode)
export function kokSec(o: { mod: KokModu; adla: KokAday[] | null; defterKok: KokAday[] }): KokSecimi {
  if (o.mod === 'tam' && o.adla?.length) {
    // as before: the first one Drive lists, with the old warning
    return o.adla.length > 1 ? { tur: 'bulundu', kok: o.adla[0], kaynak: 'ad', uyari: adUyarisi(o.adla.length) } : { tur: 'bulundu', kok: o.adla[0], kaynak: 'ad' };
  }
  if (!o.defterKok.length) return { tur: 'yok' };
  if (o.defterKok.length === 1) return { tur: 'bulundu', kok: o.defterKok[0], kaynak: 'defterKok' };
  const kokler = [...o.defterKok].sort(eskiOnce);
  return { tur: 'cokKok', kok: kokler[0], kokler, uyari: kokUyarisi(kokler.length) };
}

// The root's children: a "kitaplar" folder and a kitaplik.json file? Missing ones → 'yarim'.
export function eksikler(cocuklar: KokCocuk[]): KokEksik[] {
  const out: KokEksik[] = [];
  if (!cocuklar.some(c => c.name === 'kitaplar' && c.mimeType === FOLDER_MIME)) out.push('kitaplar');
  if (!cocuklar.some(c => c.name === 'kitaplik.json' && c.mimeType !== FOLDER_MIME)) out.push('kitaplik.json');
  return out;
}

export function kokTamMi(secim: KokSecimi, cocuklar: KokCocuk[]): KokSonucu {
  if (secim.tur === 'yok') return secim;
  const eksik = eksikler(cocuklar);
  if (secim.tur === 'cokKok') return { ...secim, eksik };
  if (!eksik.length) return secim;
  return { tur: 'yarim', kok: secim.kok, kaynak: secim.kaynak, eksik, ...(secim.uyari ? { uyari: secim.uyari } : {}) };
}

// ---- Drive ----

export interface KokDrive {
  adlaAra(): Promise<KokAday[]>;                // "Kitaplık" folders in My Drive's root
  defterKokAra(): Promise<KokAday[]>;           // folders with appProperties defterKok = "1"
  kokCocuklari(id: string): Promise<KokCocuk[]>;
}

const WHAT = t('hata.kok.ne');

async function liste(q: string, fields: string, orderBy?: string): Promise<Array<KokAday & { mimeType: string }>> {
  const out: Array<KokAday & { mimeType: string }> = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ q, fields: `nextPageToken,files(${fields})`, pageSize: '1000' });
    if (orderBy) params.set('orderBy', orderBy);
    if (pageToken) params.set('pageToken', pageToken);
    const res = await ok(await saltOkunurFetch('files?' + params), WHAT);
    const j = await res.json() as { files?: Array<KokAday & { mimeType: string }>; nextPageToken?: string };
    out.push(...(j.files ?? []));
    pageToken = j.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

export const driveKokApi: KokDrive = {
  // the same query as findRootFolders (drive.ts), sorted by name as before
  adlaAra: () => liste(`'root' in parents and name = '${qv(ROOT_NAME)}' and mimeType = '${FOLDER_MIME}' and trashed = false`, 'id,name,mimeType,createdTime', 'name')
    .then(f => f.map(({ id, name, createdTime }) => ({ id, name, createdTime }))),
  defterKokAra: () => liste(`mimeType = '${FOLDER_MIME}' and appProperties has { key='defterKok' and value='1' } and trashed = false`, 'id,name,mimeType,createdTime')
    .then(f => f.map(({ id, name, createdTime }) => ({ id, name, createdTime }))),
  kokCocuklari: id => liste(`'${qv(id)}' in parents and trashed = false`, 'id,name,mimeType')
    .then(f => f.map(({ id, name, mimeType }) => ({ id, name, mimeType })))
};

export async function kokBul(drive: KokDrive, mod: KokModu): Promise<KokSonucu> {
  const adla = mod === 'tam' ? await drive.adlaAra() : null;
  const secim = kokSec({ mod, adla, defterKok: adla?.length ? [] : await drive.defterKokAra() });
  if (secim.tur === 'yok') return secim;
  return kokTamMi(secim, await drive.kokCocuklari(secim.kok.id));
}
