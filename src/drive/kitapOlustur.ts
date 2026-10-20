import type { KitapPlani, PlanOgesi } from '../kitap/kitapPlani';
import { DriveError, driveFetch, FOLDER_MIME, getModifiedTime, ok, qv, readJsonStrict, updateJson } from './drive';
import type { KokKaynagi } from './kok';
import { driveKurulumApi, type KurulumDrive, type KurulumOgesi, type YeniOgeMeta } from './kurulum';
import { ebeveynGecerliMi } from './ebeveyn';
import { IdZatenVar, tekrarlanabilir } from './pdfOlustur';

// Task 6.K4b: the book wizard's "Oluştur" — kitapPlani's items written to Drive, in order:
// kitaplar/<kitapId>/ → unit folders → topic folders → kitap.json (last: the book is whole once it is there)
// → the shelf entry in kitaplik.json. Rules (CLAUDE.md → Faz 6.K4b):
// - Only with ?kurulum=1. Task 6.K4c: in the owner's "Kitaplık" (found by name) too, only under its kitaplar/.
// - Every item carries appProperties { defter: "1", defterIslem: <islemId> }. The ids come from files.generateIds
//   once, at the start; they and the islemId stay in memory (KitapIslemi), so "Tekrar dene" goes on where it
//   stopped and never makes a second one (Drive's 409 = an earlier try did arrive). Not kept on the device.
// - A folder with the book's name in kitaplar/ (not from this islemId) → nothing is written (AyniKitapVar, or
//   YarimKitapVar for one of ours without kitap.json). Nothing is written into a folder this islemId didn't make.
// - kitaplik.json: the latest file, the id added to the chosen shelf (the first one if it is gone) only when no
//   shelf has it yet; modifiedTime before and after reading, one more try when it changed.
// - Creates only (and the one kitaplik.json update). No files.delete.
// - 6.K4c: kitaplar/ and kitaplik.json are the root's children by name (the owner's are not marked). No kitaplar/ →
//   nothing is written (no folder is made). No kitaplik.json in the owner's root → the book is made without the
//   shelf entry (the file is not created here; it lands in "Yeni gelenler"); in our own root that is an error.
// - Before each create: the parent is the root's kitaplar/ or a folder this operation made (ebeveynGecerliMi).

export interface KitapOlusturDrive extends KurulumDrive {
  yeniIdler(n: number): Promise<string[]>;                                  // files.generateIds
  oge(id: string): Promise<(KurulumOgesi & { trashed?: boolean }) | null>;  // null: no such file
  islemAra(islemId: string): Promise<KurulumOgesi[]>;                       // everything with this defterIslem
  jsonOku(id: string): Promise<unknown>;                                    // broken JSON → an error
  degisimZamani(id: string): Promise<string>;                               // modifiedTime
  jsonYaz(id: string, obj: unknown): Promise<void>;                         // PATCH, the same id
}

// ---- errors (Turkish, say what to do) ----

export class KitapOlusturKilitli extends Error {
  constructor() { super('Kitap oluşturma kilitli: hiçbir şey yazılmadı. Denemek için adrese ?kurulum=1 eklenmeli.'); }
}

export class KitaplikYapisiBeklenmedik extends Error {
  constructor() { super('Kitaplık yapısı beklenmedik: kökte "kitaplar" klasörü yok. Hiçbir şey yazılmadı; klasör oluşturulmaz. Drive\'da kitaplığın içine "kitaplar" klasörü açıp tekrar dene.'); }
}

export class KitapOlusturYazmaYok extends Error {
  constructor() { super('Kitap oluşturulamaz: Google ile giriş yapılmamış ya da örnek kitaplık açık. Google ile giriş yapıp tekrar dene.'); }
}

export class AyniKitapVar extends Error {
  constructor(ad: string) { super(`"kitaplar" içinde "${ad}" adında bir klasör zaten var; hiçbir şey yazılmadı. Kitap için başka bir ad seç.`); }
}

export class YarimKitapVar extends Error {
  // 6.K5b: the folder's id for "Yarım kitabı çöpe at"
  constructor(readonly ad: string, readonly klasorId?: string) { super(`Yarım kalmış bir kitap var: ${ad}. Hiçbir şey yazılmadı. Başka bir ad seç; yarım klasör daha sonra çöpe atılabilir.`); }
}

export class KitapOlusturIzinYok extends Error {
  constructor() { super('Drive yazmaya izin vermedi. Tekrar giriş yapıp Drive iznini onayla.'); }
}

export class KitapOlusturAgHatasi extends Error {
  constructor() { super('Kitap oluşturma bitmedi: Drive\'a bağlanılamadı ya da Drive meşgul. İnternet bağlantını kontrol edip tekrar dene; tekrar denemede çift klasör oluşmaz.'); }
}

export class RafKaydiCakisma extends Error {
  constructor() { super('Klasörler hazır ama raf kaydedilemedi: kitaplik.json bu sırada başka bir yerde değişti. Tekrar dene.'); }
}

export class KitapOlusturBeklenmedik extends Error {
  constructor(ne: string) { super(`Kitap oluşturma durdu: ${ne}. Drive'da "kitaplar" klasörüne bakıp tekrar dene.`); }
}

// ---- the real Drive ----

const WHAT = 'Kitap oluşturulurken';
const ID_GRUBU = 1000;   // generateIds gives at most 1000 at a time

export const driveKitapOlusturApi: KitapOlusturDrive = {
  ...driveKurulumApi,
  async yeniIdler(n) {
    const idler: string[] = [];
    while (idler.length < n) {
      const k = Math.min(ID_GRUBU, n - idler.length);
      const res = await ok(await driveFetch(`files/generateIds?count=${k}&space=drive&type=files`), WHAT);
      const ids = (await res.json() as { ids?: string[] }).ids ?? [];
      if (ids.length !== k) throw new DriveError(500, WHAT);
      idler.push(...ids);
    }
    return idler;
  },
  async oge(id) {
    const res = await driveFetch(`files/${encodeURIComponent(id)}?fields=id,name,parents,appProperties,trashed`);
    if (res.status === 404) return null;
    return await (await ok(res, WHAT)).json() as KurulumOgesi & { trashed?: boolean };
  },
  async islemAra(islemId) {
    const q = `appProperties has { key='defterIslem' and value='${qv(islemId)}' } and trashed = false`;
    const out: KurulumOgesi[] = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({ q, fields: 'nextPageToken,files(id,name)', pageSize: '1000' });
      if (pageToken) params.set('pageToken', pageToken);
      const j = await (await ok(await driveFetch('files?' + params), WHAT)).json() as { files?: KurulumOgesi[]; nextPageToken?: string };
      out.push(...(j.files ?? []));
      pageToken = j.nextPageToken ?? '';
    } while (pageToken);
    return out;
  },
  jsonOku: id => readJsonStrict(id, 'kitaplik.json okunurken'),
  degisimZamani: id => getModifiedTime(id, 'kitaplik.json okunurken'),
  jsonYaz: (id, obj) => updateJson(id, obj, 'kitaplik.json kaydedilirken')
};

// ---- one operation (kept in memory for "Tekrar dene") ----

export interface KitapIslemi {
  islemId: string;
  plan: KitapPlani;               // the same plan on every try (the wizard's fields are locked)
  idler: string[] | null;         // one per item before the shelf entry, from generateIds
  tamam: Map<number, string>;     // item index → its Drive id (made or found)
  denenen: Set<number>;           // a create request was sent: a retry asks Drive by id first
  vardi: number[];                // the last try: items that were there already
  rafTamam: boolean;
  rafa: string | null;            // the shelf the book was put on (null: no shelf at all)
  kitaplikYok: boolean;           // 6.K4c: the owner's root has no kitaplik.json: no shelf entry ("Yeni gelenler")
}

export const yeniKitapIslemi = (islemId: string, plan: KitapPlani): KitapIslemi =>
  ({ islemId, plan, idler: null, tamam: new Map(), denenen: new Set(), vardi: [], rafTamam: false, rafa: null, kitaplikYok: false });

// Nothing has reached Drive yet (a new name can be chosen with a new operation)
export const hicYazilmadi = (i: KitapIslemi): boolean => !i.denenen.size && !i.tamam.size && !i.rafTamam;

const ogeAdi = (o: PlanOgesi) => o.tur === 'rafKaydi' ? 'raf kaydı (kitaplik.json)' : `kitaplar/${o.yol}`;

// For the ?olcum=1 box
export function islemOzeti(i: KitapIslemi): string {
  const n = i.plan.ogeler.length;
  const bitti = i.tamam.size + (i.rafTamam ? 1 : 0);
  return [
    `işlem: ${i.islemId}`,
    `durum: ${bitti}/${n}`,
    `vardı: ${i.vardi.length ? i.vardi.map(k => ogeAdi(i.plan.ogeler[k])).join(', ') : 'yok'}`,
    `raf: ${i.kitaplikYok ? 'yok (kitaplik.json yok, Yeni gelenler)' : i.rafTamam ? i.rafa ?? 'yok (raf yok)' : '-'}`
  ].join('\n');
}

// ---- kitaplik.json: the shelf entry (pure) ----

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

// The book id on the chosen shelf (the first shelf if it is gone). Already on that shelf → no change.
// No shelf at all → no change (the book shows among "Yeni gelenler"). Every other field stays.
// 6.K5b: an entry of the id on another shelf is an old one (the folder this operation made is new: when it started
// no folder with that name was there, else AyniKitapVar — the old one is in the trash or gone): it is taken out, the
// book goes on the chosen shelf. On the chosen shelf already (e.g. an earlier try whose answer was lost) → as it is.
export function rafaEkle(ham: unknown, rafId: string, kitapId: string): { json: Obj; degisti: boolean; rafa: string | null } {
  const base = isObj(ham) ? ham : {};
  const raflar = Array.isArray(base.raflar) ? base.raflar : [];
  const rafIdsi = (r: unknown) => isObj(r) && typeof r.id === 'string' ? r.id : null;
  const kitaplari = (r: unknown) => isObj(r) && Array.isArray(r.kitaplar) ? r.kitaplar : [];
  let i = raflar.findIndex(r => isObj(r) && rafIdsi(r) === rafId);
  if (i < 0) i = raflar.findIndex(isObj);
  if (i < 0) {
    const bulundugu = raflar.find(r => kitaplari(r).includes(kitapId));
    return { json: base, degisti: false, rafa: bulundugu ? rafIdsi(bulundugu) : null };
  }
  const eski = raflar.some((r, k) => k !== i && kitaplari(r).includes(kitapId));
  const zatenOrada = kitaplari(raflar[i]).includes(kitapId);
  if (zatenOrada && !eski) return { json: base, degisti: false, rafa: rafIdsi(raflar[i]) };
  const yeniRaflar = raflar.map((r, k) => {
    if (k === i) return zatenOrada ? r : { ...(r as Obj), kitaplar: [...kitaplari(r), kitapId] };
    return kitaplari(r).includes(kitapId) ? { ...(r as Obj), kitaplar: kitaplari(r).filter(x => x !== kitapId) } : r;
  });
  return { json: { ...base, raflar: yeniRaflar }, degisti: true, rafa: rafIdsi(raflar[i]) };
}

// ---- kitapOlustur ----

export interface KitapOlusturSecenek {
  kilitAcik: boolean;                    // ?kurulum=1
  kokKaynagi: KokKaynagi | null;         // the loaded root (null: none → locked); 'ad' = the owner's "Kitaplık" (6.K4c)
  kokId: string;
  yazabilir: () => boolean;              // signed in and not the sample library
  ilerleme?: (i: number, n: number) => void;
  bekleMs?: number;                      // wait before a retry
  deneme?: number;                       // tries per item at most
  // dev (window.defterSihirbazHata): n → a made-up network error at item n (1-based) before it is written;
  // -n → item n is written, then the error (its answer "lost"). Asked once per try.
  yapayHata?: () => number | undefined;
}

export interface KitapOlusturSonucu {
  kitapId: string;
  olusturulan: number;    // items made in this try
  vardi: string[];        // items that were there already (an earlier try)
  rafa: string | null;
  kitaplikYok: boolean;   // no kitaplik.json (owner's root): no shelf entry, the book is in "Yeni gelenler"
}

// 6.K4c: the parent rule (ebeveyn.ts; also used by the contents' edit mode, 6.K5a)
export { ebeveynGecerliMi };

const bekle = (ms: number) => new Promise(r => setTimeout(r, ms));
const ebeveyn = (yol: string) => yol.includes('/') ? yol.slice(0, yol.lastIndexOf('/')) : '';
const sonAd = (yol: string) => yol.slice(yol.lastIndexOf('/') + 1);

export async function kitapOlustur(drive: KitapOlusturDrive, islem: KitapIslemi, s: KitapOlusturSecenek): Promise<KitapOlusturSonucu> {
  // checks without any request
  if (!s.kilitAcik || s.kokKaynagi === null) throw new KitapOlusturKilitli();
  if (!s.yazabilir()) throw new KitapOlusturYazmaYok();
  const { plan } = islem;
  if (plan.engel) throw new KitapOlusturBeklenmedik(plan.engel);
  const n = plan.ogeler.length;
  const yazilacak = plan.ogeler.slice(0, -1);
  const raf = plan.ogeler[n - 1];
  if (raf?.tur !== 'rafKaydi' || yazilacak.some(o => o.tur === 'rafKaydi')) throw new KitapOlusturBeklenmedik('plan bozuk');
  const yapay = s.yapayHata?.();
  islem.vardi = [];

  try {
    const cocuklar = await drive.kokCocuklari(s.kokId);
    const kitaplarId = cocuklar.find(c => c.name === 'kitaplar' && c.mimeType === FOLDER_MIME)?.id;
    const kitaplikId = cocuklar.find(c => c.name === 'kitaplik.json' && c.mimeType !== FOLDER_MIME)?.id;
    if (!kitaplarId) throw new KitaplikYapisiBeklenmedik();
    // the owner's root may have no kitaplik.json yet: it is not created here (the saver makes it on a shelf change)
    if (!kitaplikId && s.kokKaynagi !== 'ad') throw new KitapOlusturBeklenmedik('kitaplik.json bulunamadı');

    // a folder with the book's name that this operation didn't make: nothing is written
    const ayni = await drive.cocukAra(kitaplarId, plan.kitapId);
    const yabanci = ayni.find(f => f.appProperties?.defterIslem !== islem.islemId);
    if (yabanci) {
      const yarim = yabanci.appProperties?.defter === '1' && !(await drive.cocukAra(yabanci.id, 'kitap.json')).length;
      throw yarim ? new YarimKitapVar(plan.kitapId, yabanci.id) : new AyniKitapVar(plan.kitapId);
    }

    islem.idler ??= await drive.yeniIdler(yazilacak.length);
    const idler = islem.idler;
    if (idler.length !== yazilacak.length) throw new KitapOlusturBeklenmedik('kimlik sayısı plana uymuyor');
    // what an earlier try (this islemId) made
    const bulunan = new Set((await drive.islemAra(islem.islemId)).map(f => f.id));

    const klasorId = new Map<string, string>([['', kitaplarId]]);
    const izinli = new Set<string>();   // folders this operation made (or found as its own) in this try
    let olusturulan = 0;
    for (let i = 0; i < yazilacak.length; i++) {
      const o = yazilacak[i] as Exclude<PlanOgesi, { tur: 'rafKaydi' }>;
      const id = idler[i];
      const ad = sonAd(o.yol);
      const ebeveynId = klasorId.get(ebeveyn(o.yol));
      if (!ebeveynId) throw new KitapOlusturBeklenmedik(`"${ad}" için üst klasör yok`);
      if (!ebeveynGecerliMi(ebeveynId, kitaplarId, izinli)) throw new KitapOlusturBeklenmedik(`"${ad}" için üst klasör doğrulanamadı`);
      let vardi = islem.tamam.has(i) || bulunan.has(id);
      if (!vardi && islem.denenen.has(i)) {
        const f = await drive.oge(id);
        if (f) { bizimMi(f, ad, islem.islemId); vardi = true; }
      }
      if (vardi) {
        islem.vardi.push(i);
      } else {
        if (yapay === i + 1) throw new KitapOlusturAgHatasi();
        islem.denenen.add(i);
        const meta: YeniOgeMeta = {
          id, name: ad, parents: [ebeveynId],
          mimeType: o.tur === 'klasor' ? FOLDER_MIME : 'application/json',
          appProperties: { defter: '1', defterIslem: islem.islemId }
        };
        await olusturIdIle(drive, meta, o.tur === 'json' ? JSON.stringify(plan.kitapJson, null, 2) : undefined, islem.islemId, s);
        olusturulan++;
        if (yapay === -(i + 1)) throw new KitapOlusturAgHatasi();
      }
      islem.tamam.set(i, id);
      if (o.tur === 'klasor') { klasorId.set(o.yol, id); izinli.add(id); }
      s.ilerleme?.(i + 1, n);
    }

    if (!islem.rafTamam) {
      islem.kitaplikYok = !kitaplikId;
      islem.rafa = kitaplikId ? await rafaKaydet(drive, kitaplikId, raf.rafId, raf.kitapId) : null;
      islem.rafTamam = true;
    } else {
      islem.vardi.push(n - 1);
    }
    s.ilerleme?.(n, n);
    return { kitapId: plan.kitapId, olusturulan, vardi: islem.vardi.map(k => ogeAdi(plan.ogeler[k])), rafa: islem.rafa, kitaplikYok: islem.kitaplikYok };
  } catch (e) {
    if (e instanceof TypeError) throw new KitapOlusturAgHatasi();   // fetch failed: no connection
    if (e instanceof DriveError && e.status === 403) throw new KitapOlusturIzinYok();
    if (tekrarlanabilir(e)) throw new KitapOlusturAgHatasi();
    throw e;
  }
}

// An item Drive has with our id: ours only with our name and islemId, not in the trash
function bizimMi(f: KurulumOgesi & { trashed?: boolean }, ad: string, islemId: string): void {
  if (f.name !== ad || f.appProperties?.defterIslem !== islemId) throw new KitapOlusturBeklenmedik(`"${ad}" için alınan kimlik başka bir dosyada`);
  if (f.trashed) throw new KitapOlusturBeklenmedik(`"${ad}" Drive'da çöpe atılmış`);
}

async function olusturIdIle(drive: KitapOlusturDrive, meta: YeniOgeMeta, icerik: string | undefined, islemId: string, s: KitapOlusturSecenek): Promise<void> {
  const max = s.deneme ?? 3;
  for (let deneme = 1; ; deneme++) {
    try {
      await drive.olustur(meta, icerik);
      return;
    } catch (e) {
      if (e instanceof IdZatenVar) {
        const f = await drive.oge(meta.id!);
        if (!f) throw new KitapOlusturBeklenmedik(`"${meta.name}" için Drive "zaten var" dedi ama bulunamadı`);
        bizimMi(f, meta.name, islemId);
        return;
      }
      if (!tekrarlanabilir(e)) throw e;
      if (deneme >= max) throw new KitapOlusturAgHatasi();
    }
    await bekle(s.bekleMs ?? 2000);
  }
}

// kitaplik.json: modifiedTime → latest content → the entry → modifiedTime again (changed: once more from the start)
async function rafaKaydet(drive: KitapOlusturDrive, dosyaId: string, rafId: string, kitapId: string): Promise<string | null> {
  for (let tur = 1; ; tur++) {
    const once = await drive.degisimZamani(dosyaId);
    const r = rafaEkle(await drive.jsonOku(dosyaId), rafId, kitapId);
    if (!r.degisti) return r.rafa;
    if (await drive.degisimZamani(dosyaId) !== once) {
      if (tur >= 2) throw new RafKaydiCakisma();
      continue;
    }
    await drive.jsonYaz(dosyaId, r.json);
    return r.rafa;
  }
}
