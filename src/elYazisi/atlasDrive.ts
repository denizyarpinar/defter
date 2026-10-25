import { aktifKapsam } from '../drive/auth';
import { driveFetch, FOLDER_MIME, ok, qv } from '../drive/drive';
import { driveKokApi, kokBul } from '../drive/kok';
import { UPLOAD } from '../drive/pdfYazici';

// Task 6.4d-3: the handwriting atlas in Drive: <library root>/_sistem/el-yazisi/ (el-yazisi-atlas.png + .json).
// Rules (CLAUDE.md → Değişmez kurallar, the 6.4d-3 exception):
// - Only when the user taps (the dev page atlas-yukle.html). Under the library root kokBul finds; no root → no request.
// - Missing folder / file → created, marked appProperties { defter: "1", defterSistem: "1" }.
//   An existing file → its content is updated (PATCH on the same id), never a second file.
// - Two or more with the same name → the oldest (createdTime, then id); the others are not touched (a warning).
// - The same name without our mark (defter ≠ "1") → AtlasAdDolu, nothing is written next to or over it.
// - After writing, both files are read back from Drive: size + SHA-256 compared.
// - No files.delete, no trash.

export const SISTEM_KLASORU = '_sistem';
export const EL_YAZISI_KLASORU = 'el-yazisi';
export const ATLAS_PNG = 'el-yazisi-atlas.png';
export const ATLAS_JSON = 'el-yazisi-atlas.json';
export const SISTEM_ISARETI: Record<string, string> = { defter: '1', defterSistem: '1' };

export interface AtlasOge {
  id: string; name: string; mimeType: string; createdTime?: string; appProperties?: Record<string, string>;
  modifiedTime?: string; parents?: string[];   // task 6.4e-2b: read only (the reader's atlas copy)
}

export interface AtlasDrive {
  kok(): Promise<{ id: string; name: string } | null>;
  cocuklar(ebeveynId: string, ad: string): Promise<AtlasOge[]>;    // by name, not trashed
  klasorOlustur(ebeveynId: string, ad: string): Promise<string>;
  dosyaOlustur(ebeveynId: string, ad: string, mime: string, bytes: Uint8Array): Promise<string>;
  dosyaGuncelle(id: string, mime: string, bytes: Uint8Array): Promise<void>;
  indir(id: string): Promise<Uint8Array>;
}

export class AtlasKokYok extends Error {
  constructor() { super('Drive\'da kitaplık klasörü bulunamadı; hiçbir şey yüklenmedi. Önce uygulamada kitaplığını kur, sonra tekrar dene.'); }
}
export class AtlasAdDolu extends Error {
  constructor(ad: string) { super(`"${ad}" adında uygulamanın oluşturmadığı bir dosya ya da klasör var; ona dokunulmadı, hiçbir şey yüklenmedi. Drive'da onu yeniden adlandır, sonra tekrar dene.`); }
}

export interface AtlasDosyasi { ad: string; mime: string; bytes: Uint8Array }

export interface AtlasDosyaSonucu {
  ad: string;
  id: string;
  islem: 'olusturuldu' | 'guncellendi';
  boyut: number;
  sha256: string;
  driveBoyut: number;
  driveSha256: string;
  esit: boolean;
}

export interface AtlasYuklemeSonucu {
  kok: string;                 // the root folder's name
  klasorId: string;            // _sistem/el-yazisi
  dosyalar: AtlasDosyaSonucu[];
  uyarilar: string[];
  tamam: boolean;              // every file read back the same
}

export async function sha256Hex(b: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>));
  return [...h].map(v => v.toString(16).padStart(2, '0')).join('');
}

export const eskiOnce = (a: AtlasOge, b: AtlasOge) =>
  (a.createdTime ?? '￿').localeCompare(b.createdTime ?? '￿') || a.id.localeCompare(b.id);

// The item to use among the same-named ones: null = none; an unmarked one → AtlasAdDolu; several → the oldest
export function ogeSec(ogeler: AtlasOge[], ad: string, klasor: boolean, uyarilar: string[]): AtlasOge | null {
  if (!ogeler.length) return null;
  if (ogeler.some(o => o.appProperties?.defter !== '1' || (o.mimeType === FOLDER_MIME) !== klasor)) throw new AtlasAdDolu(ad);
  const [ilk, ...diger] = [...ogeler].sort(eskiOnce);
  if (diger.length) uyarilar.push(`"${ad}" ${ogeler.length} tane; en eskisi kullanıldı, diğerlerine dokunulmadı.`);
  return ilk;
}

async function klasor(drive: AtlasDrive, ebeveynId: string, ad: string, uyarilar: string[]): Promise<string> {
  return ogeSec(await drive.cocuklar(ebeveynId, ad), ad, true, uyarilar)?.id ?? await drive.klasorOlustur(ebeveynId, ad);
}

export async function atlasYukle(drive: AtlasDrive, dosyalar: AtlasDosyasi[]): Promise<AtlasYuklemeSonucu> {
  const kok = await drive.kok();
  if (!kok) throw new AtlasKokYok();
  const uyarilar: string[] = [];
  const sistemId = await klasor(drive, kok.id, SISTEM_KLASORU, uyarilar);
  const klasorId = await klasor(drive, sistemId, EL_YAZISI_KLASORU, uyarilar);

  // every name is checked before anything is written into the folder
  const hedefler = [];
  for (const d of dosyalar) hedefler.push({ d, var: ogeSec(await drive.cocuklar(klasorId, d.ad), d.ad, false, uyarilar) });

  const sonuc: AtlasDosyaSonucu[] = [];
  for (const { d, var: eski } of hedefler) {
    let id: string;
    if (eski) { await drive.dosyaGuncelle(eski.id, d.mime, d.bytes); id = eski.id; }
    else id = await drive.dosyaOlustur(klasorId, d.ad, d.mime, d.bytes);
    const geri = await drive.indir(id);
    const [sha256, driveSha256] = await Promise.all([sha256Hex(d.bytes), sha256Hex(geri)]);
    sonuc.push({
      ad: d.ad, id, islem: eski ? 'guncellendi' : 'olusturuldu',
      boyut: d.bytes.length, sha256, driveBoyut: geri.length, driveSha256,
      esit: geri.length === d.bytes.length && sha256 === driveSha256
    });
  }
  return { kok: kok.name, klasorId, dosyalar: sonuc, uyarilar, tamam: sonuc.every(s => s.esit) };
}

// ---- the real Drive ----

const WHAT = 'El yazısı atlası yüklenirken';

export const driveAtlasApi: AtlasDrive = {
  async kok() {
    const k = await kokBul(driveKokApi, aktifKapsam() ?? 'dar');
    return k.tur === 'yok' ? null : { id: k.kok.id, name: k.kok.name };
  },
  async cocuklar(ebeveynId, ad) {
    const q = `'${qv(ebeveynId)}' in parents and name = '${qv(ad)}' and trashed = false`;
    const params = new URLSearchParams({ q, fields: 'files(id,name,mimeType,createdTime,appProperties)', pageSize: '100' });
    const j = await (await ok(await driveFetch('files?' + params), WHAT)).json() as { files?: AtlasOge[] };
    return j.files ?? [];
  },
  async klasorOlustur(ebeveynId, ad) {
    const res = await ok(await driveFetch('files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name: ad, parents: [ebeveynId], mimeType: FOLDER_MIME, appProperties: SISTEM_ISARETI })
    }), WHAT);
    return (await res.json() as { id: string }).id;
  },
  async dosyaOlustur(ebeveynId, ad, mime, bytes) {
    const boundary = 'defter' + Math.random().toString(36).slice(2);
    const meta = { name: ad, parents: [ebeveynId], mimeType: mime, appProperties: SISTEM_ISARETI };
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
      bytes as Uint8Array<ArrayBuffer>,
      `\r\n--${boundary}--`
    ]);
    const res = await ok(await driveFetch(`${UPLOAD}files?uploadType=multipart&fields=id`, {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body
    }), WHAT);
    return (await res.json() as { id: string }).id;
  },
  async dosyaGuncelle(id, mime, bytes) {
    await ok(await driveFetch(`${UPLOAD}files/${encodeURIComponent(id)}?uploadType=media&fields=id`, {
      method: 'PATCH', headers: { 'Content-Type': mime }, body: bytes as Uint8Array<ArrayBuffer>
    }), WHAT);
  },
  async indir(id) {
    const res = await ok(await driveFetch(`files/${encodeURIComponent(id)}?alt=media`), 'El yazısı atlası geri okunurken');
    return new Uint8Array(await res.arrayBuffer());
  }
};
