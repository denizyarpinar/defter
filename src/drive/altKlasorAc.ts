import { altKlasorBul, KlasorYok, type AltKlasor } from '../defter/konuyaDosyaEkle';
import { DriveError, FOLDER_MIME, type DriveFile } from './drive';
import type { KokCocuk } from './kok';
import type { KurulumOgesi, YeniOgeMeta } from './kurulum';
import { IdZatenVar, tekrarlanabilir } from './pdfOlustur';

// Task 6.K6a: a topic's Uebungen / Oedevler folder, made when the first file of that kind is added
// (CLAUDE.md → Faz 6.K6a). kitapOlustur's / K5a's ways:
// - Only with ?kurulum=1 (and a root loaded); locked → KlasorYok, as before, without any request.
// - The parent chain before any write: the topic folder → (each folder of its path) → the book's folder → the
//   root's kitaplar/. The owner's "Kitaplık" too, only inside its root. Anything else: no create.
// - "Is it there?" first: the same matcher as the reader (altKlasorBul), not in the trash → that one is used.
//   A folder named Übungen / Ödevler (the reader doesn't know it) → AltKlasorAdiFarkli, nothing written
//   (Deniz's decision: no second folder next to it).
// - The id from generateIds once per islemId (kept in memory), appProperties { defter: "1", defterIslem };
//   an earlier try found by islemId, Drive's 409 = it arrived. A retry never makes a second folder.
// - The folder made (or found) is remembered for this session: the next adding in the topic uses it at once.
// - Creates one folder only. No files.delete.

export interface AltKlasorDrive {
  yeniIdler(n: number): Promise<string[]>;
  islemAra(islemId: string): Promise<KurulumOgesi[]>;
  olustur(meta: YeniOgeMeta): Promise<{ id: string }>;
  kokCocuklari(id: string): Promise<KokCocuk[]>;
  oge(id: string): Promise<(KurulumOgesi & { mimeType?: string; trashed?: boolean }) | null>;
  cocuklar(id: string): Promise<DriveFile[]>;   // not in the trash
}

export interface AltKlasorIstek {
  konuId: string;          // the topic folder
  konuYolu: string;        // its path from the book's folder (kitap.json's klasor)
  kitapKlasorId: string;
  kokId: string;
  klasor: AltKlasor;
  islemId: string;         // the file adding's islemId ("Tekrar dene" keeps it)
}

export interface AltKlasorSecenek { kilitAcik: boolean; bekleMs?: number; deneme?: number }

// ---- errors (Turkish, say what to do) ----

export class AltKlasorAdiFarkli extends Error {
  constructor(ad: string, klasor: AltKlasor) { super(`Bu konuda ${ad} adlı bir klasör var; Drive'da adını ${klasor} yap ve tekrar dene. Hiçbir şey yazılmadı.`); }
}
export class AltKlasorAcilamadi extends Error {
  constructor(ne: string) { super(`Klasör açılmadı: ${ne}. Hiçbir şey yazılmadı; sayfayı yenileyip tekrar dene.`); }
}
export class AltKlasorAgHatasi extends Error {
  constructor() { super('Klasör açılamadı: Drive\'a bağlanılamadı ya da Drive meşgul. İnternetini kontrol edip tekrar dene; çift klasör oluşmaz.'); }
}
export class AltKlasorIzinYok extends Error {
  constructor() { super('Drive yazmaya izin vermedi. Tekrar giriş yapıp Drive iznini onayla.'); }
}

// ---- memory (this session) ----

const acilanlar = new Map<string, string>();   // konuId|klasor → the folder's id
const idler = new Map<string, string>();       // islemId|klasor → the id from generateIds
const denenen = new Set<string>();             // islemId|klasor: a create was sent

export function altKlasorBelleginiSifirla(): void { acilanlar.clear(); idler.clear(); denenen.clear(); }

// The names the reader doesn't know but a person would mean the same by (NFC, any case)
const UMLAUTLU: Record<AltKlasor, string> = { Uebungen: 'übungen', Oedevler: 'ödevler' };
const umlautlu = (f: DriveFile, klasor: AltKlasor) => f.mimeType === FOLDER_MIME && f.name.normalize('NFC').trim().toLowerCase() === UMLAUTLU[klasor];

export async function altKlasorAc(drive: AltKlasorDrive, i: AltKlasorIstek, s: AltKlasorSecenek): Promise<string> {
  if (!s.kilitAcik) throw new KlasorYok(i.klasor);   // as before the lock opened: no request
  const bellek = `${i.konuId}|${i.klasor}`;
  try {
    await zincir(drive, i);
    const cocuklar = await drive.cocuklar(i.konuId);
    const bilinen = acilanlar.get(bellek);
    const vardi = (bilinen && cocuklar.find(f => f.id === bilinen)) || altKlasorBul(cocuklar, i.klasor);
    if (vardi) { acilanlar.set(bellek, vardi.id); return vardi.id; }
    const farkli = cocuklar.find(f => umlautlu(f, i.klasor));
    if (farkli) throw new AltKlasorAdiFarkli(farkli.name, i.klasor);
    const id = await olustur(drive, i, s);
    acilanlar.set(bellek, id);
    return id;
  } catch (e) {
    if (e instanceof TypeError) throw new AltKlasorAgHatasi();
    if (e instanceof DriveError && e.status === 403) throw new AltKlasorIzinYok();
    if (tekrarlanabilir(e)) throw new AltKlasorAgHatasi();
    throw e;
  }
}

// topic → … → the book's folder (as many steps as its path has parts) → the root's kitaplar/
async function zincir(drive: AltKlasorDrive, i: AltKlasorIstek): Promise<void> {
  const kitaplarId = (await drive.kokCocuklari(i.kokId)).find(c => c.name === 'kitaplar' && c.mimeType === FOLDER_MIME)?.id;
  if (!kitaplarId) throw new AltKlasorAcilamadi('kitaplığın kökünde "kitaplar" klasörü yok');
  const adim = i.konuYolu.split('/').filter(p => p.trim()).length;
  if (!adim || i.konuId === i.kitapKlasorId) throw new AltKlasorAcilamadi('konunun klasörü bilinmiyor');
  let id = i.konuId;
  for (let n = 0; n < adim; n++) {
    const o = await drive.oge(id);
    if (!o || o.trashed || o.mimeType !== FOLDER_MIME) throw new AltKlasorAcilamadi('konunun klasörü Drive\'da bulunamadı');
    const ust = o.parents?.[0];
    if (!ust || ust === i.kokId || ust === kitaplarId) throw new AltKlasorAcilamadi('konunun klasörü kitabın içinde değil');
    id = ust;
  }
  if (id !== i.kitapKlasorId) throw new AltKlasorAcilamadi('konunun klasörü bu kitabın içinde değil');
  const kitap = await drive.oge(i.kitapKlasorId);
  if (!kitap || kitap.trashed || !kitap.parents?.includes(kitaplarId)) throw new AltKlasorAcilamadi('kitabın klasörü kitaplığın "kitaplar" klasöründe değil');
}

const bekle = (ms: number) => new Promise(r => setTimeout(r, ms));

async function olustur(drive: AltKlasorDrive, i: AltKlasorIstek, s: AltKlasorSecenek): Promise<string> {
  const anahtar = `${i.islemId}|${i.klasor}`;
  let id = idler.get(anahtar);
  if (!id) {
    id = (await drive.yeniIdler(1))[0];
    if (!id) throw new AltKlasorAcilamadi('klasör kimliği alınamadı');
    idler.set(anahtar, id);
  }
  // an earlier try (this islemId) that arrived
  if ((await drive.islemAra(i.islemId)).some(f => f.id === id)) return id;
  if (denenen.has(anahtar)) {
    const f = await drive.oge(id);
    if (f) { bizimMi(f, i); return id; }
  }
  const meta: YeniOgeMeta = { id, name: i.klasor, parents: [i.konuId], mimeType: FOLDER_MIME, appProperties: { defter: '1', defterIslem: i.islemId } };
  const max = s.deneme ?? 3;
  for (let deneme = 1; ; deneme++) {
    try {
      denenen.add(anahtar);
      await drive.olustur(meta);
      return id;
    } catch (e) {
      if (e instanceof IdZatenVar) {
        const f = await drive.oge(id);
        if (!f) throw new AltKlasorAcilamadi(`${i.klasor} için Drive "zaten var" dedi ama bulunamadı`);
        bizimMi(f, i);
        return id;
      }
      if (!tekrarlanabilir(e)) throw e;
      if (deneme >= max) throw new AltKlasorAgHatasi();
    }
    await bekle(s.bekleMs ?? 2000);
  }
}

// An item Drive has with our id: ours only with our name, islemId and parent, not in the trash
function bizimMi(f: KurulumOgesi & { trashed?: boolean }, i: AltKlasorIstek): void {
  if (f.name !== i.klasor || f.appProperties?.defterIslem !== i.islemId || (f.parents && !f.parents.includes(i.konuId))) {
    throw new AltKlasorAcilamadi(`${i.klasor} için alınan kimlik başka bir dosyada`);
  }
  if (f.trashed) throw new AltKlasorAcilamadi(`${i.klasor} Drive'da çöpe atılmış`);
}

// ---- the real Drive (lazy: kitapOlustur's requests) ----

export async function driveAltKlasorApi(): Promise<AltKlasorDrive> {
  const [{ driveKitapOlusturApi: k }, { driveOge }, { listChildren }] = await Promise.all([import('./kitapOlustur'), import('./copeAt'), import('./drive')]);
  return {
    yeniIdler: n => k.yeniIdler(n),
    islemAra: id => k.islemAra(id),
    olustur: meta => k.olustur(meta),
    kokCocuklari: id => k.kokCocuklari(id),
    oge: driveOge,
    cocuklar: id => listChildren(id),
  };
}
