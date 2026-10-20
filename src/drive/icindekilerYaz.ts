import { icindekilerUygula, IcindekilerUyusmuyor, uniteAnahtarlari, uniteKlasoru, uniteKlasoruBul, type AltKlasor, type IcindekilerIslemi } from '../kitap/icindekiler';
import { bosAd, sonrakiNumara } from '../kitap/klasorNumarasi';
import { CopAgHatasi, CopIzinYok, driveAltAgac, driveCopDurumu, driveOge, type CopDrive } from './copeAt';
import { DriveError, driveFetch, FOLDER_MIME, getModifiedTime, ok, qv, readJsonStrict, updateJson } from './drive';
import { ebeveynGecerliMi } from './ebeveyn';
import { copYaz, type CopIsi } from './icindekilerCop';
import { jsonDegistir } from './jsonDegistir';
import type { KokCocuk, KokKaynagi } from './kok';
import type { KurulumOgesi, YeniOgeMeta } from './kurulum';
import { IdZatenVar, tekrarlanabilir } from './pdfOlustur';

// Task 6.K5a: the contents' changes written to Drive (CLAUDE.md → Faz 6.K5a).
// - Only with ?kurulum=1, only a Drive library (never the sample one), only surum 2 books with a kitap.json.
// - A new unit / topic = a new folder first (kitapOlustur's ways: the id from generateIds once, appProperties
//   { defter: "1", defterIslem }, "is it there?" by islemId, Drive's 409 = an earlier try arrived, "Tekrar dene" goes
//   on where it stopped), then kitap.json. The folder's name is chosen once (klasorNumarasi.ts) and kept for retries.
// - Parent check before the create: a unit goes into the book's folder, a topic into one of that book's unit
//   folders (a child of the book's folder in Drive); the book's folder must be in the root's kitaplar/.
// - kitap.json: modifiedTime → the latest file → the change (icindekilerUygula) → modifiedTime again; changed
//   meanwhile → once more from the start, then IcindekilerCakisma. PATCH on the same id. Names and order: only this.
// - Creates folders and updates kitap.json only. No files.delete, no trash, no move, no rename in Drive.
// - Task 6.K5b: a topic / unit to the trash (and back) goes through the same queue (icindekilerCop.ts).

export interface IcindekilerDrive extends CopDrive {
  yeniIdler(n: number): Promise<string[]>;
  islemAra(islemId: string): Promise<KurulumOgesi[]>;
  olustur(meta: YeniOgeMeta, icerik?: string | Uint8Array): Promise<{ id: string }>;
  kokCocuklari(id: string): Promise<KokCocuk[]>;
  klasorler(ebeveynIdleri: readonly string[]): Promise<(AltKlasor & { parents?: string[] })[]>;   // folders, not in the trash
  jsonOku(id: string): Promise<unknown>;
  degisimZamani(id: string): Promise<string>;
  jsonYaz(id: string, obj: unknown): Promise<void>;
}

// ---- errors (Turkish, say what to do) ----

export class IcindekilerKilitli extends Error {
  constructor() { super('İçindekiler düzenleme kilitli: hiçbir şey yazılmadı. Denemek için adrese ?kurulum=1 eklenmeli.'); }
}
export class IcindekilerYazmaYok extends Error {
  constructor() { super('İçindekiler kaydedilemez: Google ile giriş yapılmamış ya da örnek kitaplık açık. Google ile giriş yapıp tekrar dene.'); }
}
export class Surum1Duzenlenemez extends Error {
  constructor() { super('Bu kitap eski biçimde (surum 1); içindekiler düzenlenemez. Hiçbir şey yazılmadı.'); }
}
export class KitapJsonYok extends Error {
  constructor() { super('Bu kitapta kitap.json yok; içindekiler düzenlenemez. Hiçbir şey yazılmadı.'); }
}
export class UniteKlasoruYok extends Error {
  constructor(ad: string) { super(`"${ad}" ünitesinin Drive klasörü bulunamadı; konu eklenemez. Hiçbir şey yazılmadı.`); }
}
export class IcindekilerIzinYok extends Error {
  constructor() { super('Drive yazmaya izin vermedi. Tekrar giriş yapıp Drive iznini onayla.'); }
}
export class IcindekilerAgHatasi extends Error {
  constructor() { super('İçindekiler kaydedilemedi: Drive\'a bağlanılamadı. İnternetini kontrol edip tekrar dene; çift klasör oluşmaz.'); }
}
export class IcindekilerCakisma extends Error {
  constructor() { super('İçindekiler kaydedilemedi: kitap.json bu sırada başka bir yerde değişti. Tekrar dene.'); }
}
export class IcindekilerBeklenmedik extends Error {
  constructor(ne: string) { super(`İçindekiler kaydı durdu: ${ne}. Drive'da kitabın klasörüne bakıp tekrar dene.`); }
}

// ---- the real Drive ----

const WHAT = 'İçindekiler kaydedilirken';
const GRUP = 40;   // parents in one query

// kitapOlustur's requests, loaded on the first write (it stays out of the first bundle, as before)
const kitapApi = () => import('./kitapOlustur').then(m => m.driveKitapOlusturApi);

export const driveIcindekilerApi: IcindekilerDrive = {
  yeniIdler: async n => (await kitapApi()).yeniIdler(n),
  oge: driveOge,
  altAgac: driveAltAgac,
  copDurumu: driveCopDurumu,
  islemAra: async islemId => (await kitapApi()).islemAra(islemId),
  olustur: async (meta, icerik) => (await kitapApi()).olustur(meta, icerik),
  kokCocuklari: async id => (await kitapApi()).kokCocuklari(id),
  async klasorler(ebeveynIdleri) {
    const out: (AltKlasor & { parents?: string[] })[] = [];
    for (let i = 0; i < ebeveynIdleri.length; i += GRUP) {
      const ic = ebeveynIdleri.slice(i, i + GRUP).map(id => `'${qv(id)}' in parents`).join(' or ');
      const q = `(${ic}) and mimeType = '${FOLDER_MIME}' and trashed = false`;
      let pageToken = '';
      do {
        const params = new URLSearchParams({ q, fields: 'nextPageToken,files(id,name,parents,appProperties)', pageSize: '1000' });
        if (pageToken) params.set('pageToken', pageToken);
        const j = await (await ok(await driveFetch('files?' + params), WHAT)).json() as { files?: (AltKlasor & { parents?: string[] })[]; nextPageToken?: string };
        out.push(...(j.files ?? []));
        pageToken = j.nextPageToken ?? '';
      } while (pageToken);
    }
    return out;
  },
  jsonOku: id => readJsonStrict(id, 'kitap.json okunurken'),
  degisimZamani: id => getModifiedTime(id, 'kitap.json okunurken'),
  jsonYaz: (id, obj) => updateJson(id, obj, 'kitap.json kaydedilirken')
};

// ---- one change (kept in memory for "Tekrar dene") ----

// What the edit mode asks. Adding: the folder's name is chosen on the first try (→ islem).
export type IcindekilerIstegi =
  | { tur: 'uniteEkle'; baslik: string }
  | { tur: 'konuEkle'; unite: string; uniteSira: number; baslik: string }   // unite: its key; uniteSira: 0-based
  | { tur: 'cop'; cop: CopIsi }                                              // 6.K5b: to the trash / "Geri al"
  | Exclude<IcindekilerIslemi, { tur: 'uniteEkle' | 'konuEkle' }>;

export interface IcindekilerIsi {
  islemId: string;
  kitapId: string;
  istek: IcindekilerIstegi;
  islem: IcindekilerIslemi | null;   // adding: with the folder names, fixed after the first try
  ebeveynId: string | null;          // adding: where the new folder goes
  id: string | null;                 // adding: from generateIds
  denendi: boolean;                  // a create request was sent: a retry asks Drive by id first
  klasorTamam: boolean;
  bitti?: (hata: unknown) => void;   // 6.K5b: told after each try (null: done), e.g. the trash dialog
}

export const yeniIs = (islemId: string, kitapId: string, istek: IcindekilerIstegi): IcindekilerIsi => ({
  islemId, kitapId, istek, islem: istek.tur === 'uniteEkle' || istek.tur === 'konuEkle' || istek.tur === 'cop' ? null : istek,
  ebeveynId: null, id: null, denendi: false, klasorTamam: false
});

export const eklemeMi = (i: IcindekilerIsi) => i.istek.tur === 'uniteEkle' || i.istek.tur === 'konuEkle';
export const copIsi = (i: IcindekilerIsi): CopIsi | null => i.istek.tur === 'cop' ? i.istek.cop : null;

export interface IcindekilerSecenek {
  kilitAcik: boolean;               // ?kurulum=1
  kokKaynagi: KokKaynagi | null;    // null: no root loaded → locked
  kokId: string;
  yazabilir: () => boolean;         // signed in and not the sample library
  surum: number;                    // the book in memory
  kitapKlasorId: string | undefined;
  kitapJsonId: string | undefined;
  oncesi?: () => Promise<void>;     // the book's other kitap.json writers first (ribbon / status, cover)
  bekleMs?: number;
  deneme?: number;
}

// Resolves with the change as written (adding: with its folder names; the trash: null).
export async function icindekilerYaz(drive: IcindekilerDrive, is: IcindekilerIsi, s: IcindekilerSecenek): Promise<IcindekilerIslemi | null> {
  // checks without any request
  if (!s.kilitAcik || s.kokKaynagi === null) throw new IcindekilerKilitli();
  if (!s.yazabilir()) throw new IcindekilerYazmaYok();
  if (s.surum < 2) throw new Surum1Duzenlenemez();
  if (!s.kitapJsonId || !s.kitapKlasorId) throw new KitapJsonYok();
  const jsonId = s.kitapJsonId, kitapKlasorId = s.kitapKlasorId;

  if (is.istek.tur === 'cop') {
    try {
      await s.oncesi?.();
      await copYaz(drive, is.istek.cop, { kokId: s.kokId, kitapKlasorId, kitapJsonId: jsonId });
      return null;
    } catch (e) {
      if (e instanceof TypeError) throw new CopAgHatasi();
      if (e instanceof DriveError && e.status === 403) throw new CopIzinYok();
      if (tekrarlanabilir(e)) throw new CopAgHatasi();
      throw e;
    }
  }

  try {
    await s.oncesi?.();
    if (eklemeMi(is) && !is.klasorTamam) await klasorOlustur(drive, is, kitapKlasorId, jsonId, s);
    const islem = is.islem;
    if (!islem) throw new IcindekilerBeklenmedik('değişiklik hazırlanamadı');
    await jsonaYaz(drive, jsonId, islem);
    return islem;
  } catch (e) {
    if (e instanceof TypeError) throw new IcindekilerAgHatasi();
    if (e instanceof DriveError && e.status === 403) throw new IcindekilerIzinYok();
    if (tekrarlanabilir(e)) throw new IcindekilerAgHatasi();
    throw e;
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function sonHalKontrol(j: unknown): Obj {
  if (!isObj(j)) throw new IcindekilerBeklenmedik('kitap.json okunamadı');
  if (typeof j.surum !== 'number' || j.surum < 2) throw new Surum1Duzenlenemez();
  return j;
}

const sonHal = async (drive: IcindekilerDrive, jsonId: string): Promise<Obj> => sonHalKontrol(await drive.jsonOku(jsonId));

interface HamUnite { baslik: unknown; klasor?: unknown; konular: { klasor: unknown }[] }
const hamUniteler = (j: Obj): HamUnite[] =>
  (Array.isArray(j.uniteler) ? j.uniteler : []).map(u => isObj(u) ? { baslik: u.baslik, klasor: u.klasor, konular: Array.isArray(u.konular) ? u.konular.map(t => isObj(t) ? { klasor: t.klasor } : { klasor: '' }) : [] } : { baslik: '', konular: [] });

// Every folder name / path kitap.json knows (for the numbers)
function jsonAdlari(uniteler: readonly HamUnite[]): string[] {
  const out: string[] = [];
  for (const u of uniteler) {
    if (typeof u.klasor === 'string') out.push(u.klasor);
    for (const t of u.konular) if (typeof t.klasor === 'string') out.push(t.klasor);
  }
  return out;
}

async function klasorOlustur(drive: IcindekilerDrive, is: IcindekilerIsi, kitapKlasorId: string, jsonId: string, s: IcindekilerSecenek): Promise<void> {
  // the book's folder: in the root's kitaplar/ (also in the owner's "Kitaplık")
  const kitaplarId = (await drive.kokCocuklari(s.kokId)).find(c => c.name === 'kitaplar' && c.mimeType === FOLDER_MIME)?.id;
  const kitap = await drive.oge(kitapKlasorId);
  if (!kitaplarId || !kitap || kitap.trashed || !kitap.parents?.includes(kitaplarId)) throw new IcindekilerBeklenmedik('kitabın klasörü kitaplığın "kitaplar" klasöründe değil');
  const uniteKlasorleri = await drive.klasorler([kitapKlasorId]);
  const izinli = new Set(uniteKlasorleri.map(f => f.id));   // the book's unit folders (children of its folder)

  if (!is.islem) {
    // the first try: the folder's name and parent, kept for every retry
    const uniteler = hamUniteler(await sonHal(drive, jsonId));
    const istek = is.istek;
    if (istek.tur === 'uniteEkle') {
      const konuKlasorleri = uniteKlasorleri.length ? await drive.klasorler(uniteKlasorleri.map(f => f.id)) : [];
      const n = sonrakiNumara('unite', [...jsonAdlari(uniteler), ...uniteKlasorleri.map(f => f.name), ...konuKlasorleri.map(f => f.name)]);
      const ad = bosAd('unite', n, istek.baslik, [...uniteKlasorleri.map(f => f.name), ...uniteler.map(u => uniteKlasoru(u.klasor, []))]);
      is.islem = { tur: 'uniteEkle', baslik: istek.baslik, klasor: ad };
      is.ebeveynId = kitapKlasorId;
    } else if (istek.tur === 'konuEkle') {
      const i = uniteAnahtarlari(uniteler).indexOf(istek.unite);
      if (i < 0) throw new IcindekilerUyusmuyor('konunun ünitesi kitap.json\'da bulunamadı');
      const uk = uniteKlasoruBul(uniteler, i, uniteKlasorleri);
      const ust = uk ? uniteKlasorleri.filter(f => f.name === uk) : [];
      if (ust.length !== 1) throw new UniteKlasoruYok(String(uniteler[i].baslik ?? ''));
      const konuKlasorleri = await drive.klasorler(uniteKlasorleri.map(f => f.id));
      const n = sonrakiNumara('konu', [...jsonAdlari(uniteler), ...konuKlasorleri.map(f => f.name)]);
      const kardes = [...konuKlasorleri.filter(f => f.parents?.includes(ust[0].id)).map(f => f.name),
        ...uniteler[i].konular.map(t => typeof t.klasor === 'string' ? t.klasor.slice(t.klasor.indexOf('/') + 1) : '')];
      const ad = bosAd('konu', n, istek.baslik, kardes);
      is.islem = { tur: 'konuEkle', unite: istek.unite, uniteKlasor: uk!, baslik: istek.baslik, klasor: `${uk}/${ad}` };
      is.ebeveynId = ust[0].id;
    }
  }
  const islem = is.islem;
  if (!islem || (islem.tur !== 'uniteEkle' && islem.tur !== 'konuEkle') || !is.ebeveynId) throw new IcindekilerBeklenmedik('değişiklik hazırlanamadı');
  if (!ebeveynGecerliMi(is.ebeveynId, kitapKlasorId, izinli)) throw new IcindekilerBeklenmedik('yeni klasörün üst klasörü doğrulanamadı');
  const ad = islem.klasor.slice(islem.klasor.lastIndexOf('/') + 1);

  is.id ??= (await drive.yeniIdler(1))[0];
  if (!is.id) throw new IcindekilerBeklenmedik('klasör kimliği alınamadı');
  const id = is.id;
  let vardi = (await drive.islemAra(is.islemId)).some(f => f.id === id);
  if (!vardi && is.denendi) {
    const f = await drive.oge(id);
    if (f) { bizimMi(f, ad, is.islemId); vardi = true; }
  }
  if (!vardi) {
    // a folder with this name made meanwhile (not by us): it is never written into; a new name next time
    const ayni = (await drive.klasorler([is.ebeveynId])).filter(f => f.name.toLowerCase() === ad.toLowerCase());
    if (ayni.length) { is.islem = null; is.ebeveynId = null; throw new IcindekilerBeklenmedik(`"${ad}" adında bir klasör bu sırada oluştu; tekrar dene`); }
    is.denendi = true;
    await olusturIdIle(drive, { id, name: ad, parents: [is.ebeveynId], mimeType: FOLDER_MIME, appProperties: { defter: '1', defterIslem: is.islemId } }, is.islemId, s);
  }
  is.klasorTamam = true;
}

// An item Drive has with our id: ours only with our name and islemId, not in the trash
function bizimMi(f: KurulumOgesi & { trashed?: boolean }, ad: string, islemId: string): void {
  if (f.name !== ad || f.appProperties?.defterIslem !== islemId) throw new IcindekilerBeklenmedik(`"${ad}" için alınan kimlik başka bir dosyada`);
  if (f.trashed) throw new IcindekilerBeklenmedik(`"${ad}" Drive'da çöpe atılmış`);
}

const bekle = (ms: number) => new Promise(r => setTimeout(r, ms));

async function olusturIdIle(drive: IcindekilerDrive, meta: YeniOgeMeta, islemId: string, s: IcindekilerSecenek): Promise<void> {
  const max = s.deneme ?? 3;
  for (let deneme = 1; ; deneme++) {
    try {
      await drive.olustur(meta);
      return;
    } catch (e) {
      if (e instanceof IdZatenVar) {
        const f = await drive.oge(meta.id!);
        if (!f) throw new IcindekilerBeklenmedik(`"${meta.name}" için Drive "zaten var" dedi ama bulunamadı`);
        bizimMi(f, meta.name, islemId);
        return;
      }
      if (!tekrarlanabilir(e)) throw e;
      if (deneme >= max) throw new IcindekilerAgHatasi();
    }
    await bekle(s.bekleMs ?? 2000);
  }
}

// kitap.json: modifiedTime → latest → the change → modifiedTime again (changed: once more, then an error)
async function jsonaYaz(drive: IcindekilerDrive, jsonId: string, islem: IcindekilerIslemi): Promise<void> {
  await jsonDegistir(drive, jsonId, latest => icindekilerUygula(sonHalKontrol(latest), islem), () => new IcindekilerCakisma());
}

// ---- the edit mode's read-only look: which units can take a new topic ----

// One entry per unit: its folder, or null ("+ Konu" grey). Asks Drive only when a unit's folder isn't known.
export async function uniteKlasorDurumu(drive: Pick<IcindekilerDrive, 'klasorler'>, kitapKlasorId: string, uniteler: readonly HamUnite[]): Promise<(string | null)[]> {
  const bilinen = uniteler.map(u => uniteKlasoru(u.klasor, u.konular.map(t => t.klasor)) || null);
  if (bilinen.every(Boolean)) return bilinen;
  const adaylar = await drive.klasorler([kitapKlasorId]);
  return uniteler.map((_, i) => bilinen[i] ?? uniteKlasoruBul(uniteler, i, adaylar));
}

// ---- the queue: one change at a time, in order; a failed one waits for "Tekrar dene" ----

export type KayitDurumu =
  | { tur: 'bos' }
  | { tur: 'kaydediliyor'; ekleme: boolean; cop?: 'at' | 'geri' }
  | { tur: 'kaydedildi' }
  | { tur: 'hata'; mesaj: string; izin: boolean };

export interface KuyrukBaglami {
  drive: IcindekilerDrive;
  secenek: (kitapId: string) => IcindekilerSecenek;
  durum: (d: KayitDurumu) => void;
  basarili: (is: IcindekilerIsi, islem: IcindekilerIslemi | null) => void;   // adding / trash: the book in memory changes only now
}

// a listener's error never stops the queue
function haberVer(is: IcindekilerIsi, hata: unknown): void {
  try { is.bitti?.(hata); } catch (e) { console.warn('İçindekiler: dinleyici hata verdi.', e); }
}

export class IcindekilerKuyrugu {
  private isler: IcindekilerIsi[] = [];
  private calisiyor = false;
  private hata: IcindekilerIsi | null = null;
  private readonly b: KuyrukBaglami;

  constructor(b: KuyrukBaglami) { this.b = b; }

  get hasUnsaved(): boolean { return this.isler.length > 0; }
  get hataVar(): boolean { return this.hata !== null; }
  get bekleyenler(): readonly IcindekilerIsi[] { return this.isler; }

  ekle(is: IcindekilerIsi): Promise<void> {
    this.isler.push(is);
    return this.calistir();
  }

  // "Tekrar dene": the failed change again (the same islemId), then the rest
  tekrarDene(): Promise<void> {
    this.hata = null;
    return this.calistir();
  }

  // "Vazgeç": the failed change is dropped and returned (adding: nothing shows; a name / order: the screen goes
  // back to Drive's version, icindekilerBaglami.ts)
  vazgec(): IcindekilerIsi | null {
    const is = this.hata;
    if (!is) return null;
    this.isler = this.isler.filter(i => i !== is);
    this.hata = null;
    if (this.isler.length) void this.calistir(); else this.b.durum({ tur: 'bos' });
    return is;
  }

  private async calistir(): Promise<void> {
    if (this.calisiyor || this.hata) return;
    this.calisiyor = true;
    try {
      while (this.isler.length) {
        const is = this.isler[0];
        const cop = copIsi(is);
        this.b.durum(cop ? { tur: 'kaydediliyor', ekleme: false, cop: cop.geriAl ? 'geri' : 'at' } : { tur: 'kaydediliyor', ekleme: eklemeMi(is) });
        try {
          const islem = await icindekilerYaz(this.b.drive, is, this.b.secenek(is.kitapId));
          this.isler.shift();
          this.b.basarili(is, islem);
          haberVer(is, null);
        } catch (e) {
          this.hata = is;
          this.b.durum({ tur: 'hata', mesaj: e instanceof Error ? e.message : 'İçindekiler kaydedilemedi.', izin: e instanceof IcindekilerIzinYok || e instanceof CopIzinYok });
          haberVer(is, e);
          return;
        }
      }
      this.b.durum({ tur: 'kaydedildi' });
    } finally {
      this.calisiyor = false;
    }
  }
}
