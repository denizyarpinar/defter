import type { Book } from '../model/types';
import type { DriveLocation } from './driveLibrary';
import { saltOkunurSar, type Getirici } from './saltOkunur';
import {
  copIzni, eslesme, IZIN_LISTESI, kilitAcik, klasorIciTamam, konu99Kayitlari, OZET, type IzinOgesi, type Meta
} from './temizlikIzin';

// Task 6.3-0b, development only (main.ts loads it only under import.meta.env.DEV and ?temizlik=1):
//   window.defterTemizlikUygula()                → DRY run: every Drive request is GET-only (saltOkunurSar)
//   window.defterTemizlikUygula({ gercek: true }) → the real run
// What it does (Deniz's decision, Claude outputs\temizlik-listesi.md):
//   1. checks: pen strokes / photos waiting for ozet.pdf on this device → the real run stops
//   2. the 'cop' items of IZIN_LISTESI → trashed=true (files.update). Each is read again first; name, parent,
//      trashed=false must match, a folder must hold only listed items. Never files.delete, never another id.
//   3. ozet.pdf: pages 67–68 downloaded locally as a backup → the kept revision (27 pages) downloaded and checked
//      → uploaded as a new version with uploadPdf (modifiedTime / headRevisionId checks) → read again.
// kitap.json, kitaplik.json and the old revisions' keepForever are not touched.

const ne = 'defterTemizlikUygula';
const META = 'id,name,parents,trashed,mimeType';

export interface PdfBilgi { sayfa: number; ekIdler: (string | null)[]; not: number }

export interface BekleyenFotoOzeti { islemId: string; konuKlasorId: string; hedefFileId?: string; hedefAd: string }

export interface TemizlikDeps {
  istek: Getirici;                                       // driveFetch
  bekleyenKalem(): Promise<string[] | null>;             // file ids; null: could not be read
  bekleyenFoto(): Promise<BekleyenFotoOzeti[] | null>;
  kitap(): Book | undefined;
  kurdeleler(): { ad: string; sayfa: number }[];
  suankiOzet(modifiedTime: string): Promise<Uint8Array>; // the PDF cache or a download
  incele(bytes: Uint8Array): Promise<PdfBilgi>;
  sayfalariAyir(bytes: Uint8Array, sayfalar: readonly number[]): Promise<Uint8Array>;
  yedekKaydet(bytes: Uint8Array, ad: string): void;      // local only (a browser download)
  ozetYukle(bytes: Uint8Array, modifiedTime: string): Promise<{ modifiedTime: string; headRevisionId: string }>;
}

export type Sonuc = 'yapıldı' | 'yapılacaktı' | 'atlandı' | 'hata' | 'klasörüyle gitti' | 'klasörüyle gidecek';
export interface Satir { ad: string; id: string; sonuc: Sonuc; neden?: string }
export interface TemizlikRaporu { gercek: boolean; durdu: string | null; uyarilar: string[]; bilgiler: string[]; satirlar: Satir[]; ozet: string[] }

const json = async <T>(res: Response, what: string): Promise<T> => {
  if (!res.ok) throw new Error(`${what}: Drive ${res.status}`);
  return await res.json() as T;
};
const hataMetni = (e: unknown) => e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e);
const mb = (n: number) => `${(n / 1e6).toFixed(2)} MB`;

// The only trash call. Ids not on the list (as 'cop') throw before anything is sent.
export async function copeAt(istek: Getirici, id: string): Promise<void> {
  if (!copIzni(id)) throw new Error(`İzin listesinde olmayan id: ${id}. Çöpe atılmadı.`);
  const r = await json<{ trashed?: boolean }>(await istek(`files/${encodeURIComponent(id)}?fields=id,trashed`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ trashed: true })
  }), 'Çöpe atılırken');
  if (r.trashed !== true) throw new Error('Drive trashed=true demedi');
}

async function meta(istek: Getirici, id: string): Promise<Meta | null> {
  const res = await istek(`files/${encodeURIComponent(id)}?fields=${META}`);
  if (res.status === 404) return null;
  return json<Meta>(res, 'Bilgi okunurken');
}

async function cocuklar(istek: Getirici, klasorId: string): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = [];
  let pageToken = '';
  do {
    const p = new URLSearchParams({ q: `'${klasorId}' in parents and trashed = false`, fields: 'nextPageToken,files(id,name)', pageSize: '1000' });
    if (pageToken) p.set('pageToken', pageToken);
    const j = await json<{ files?: { id: string; name: string }[]; nextPageToken?: string }>(await istek('files?' + p), 'Klasör listelenirken');
    out.push(...(j.files ?? []));
    pageToken = j.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

async function copAdimi(istek: Getirici, gercek: boolean, rapor: TemizlikRaporu): Promise<void> {
  const cop = IZIN_LISTESI.filter(o => o.islem === 'cop');
  // files first, then the folders (their contents go with them)
  const sira: IzinOgesi[] = [...cop.filter(o => o.tur === 'dosya'), ...cop.filter(o => o.tur === 'klasor')];
  for (const o of sira) {
    const s: Satir = { ad: o.tur === 'klasor' ? `${o.ad}/ (klasör)` : o.ad, id: o.id, sonuc: 'atlandı' };
    rapor.satirlar.push(s);
    try {
      const m = await meta(istek, o.id);
      if (!m) { s.neden = 'Drive\'da bulunamadı'; continue; }
      const e = eslesme(o, m);
      if (!e.tamam) { s.neden = e.neden; continue; }
      if (o.tur === 'klasor') {
        const ic = klasorIciTamam(o.id, await cocuklar(istek, o.id));
        if (!ic.tamam) { s.neden = ic.neden; continue; }
      }
      if (!gercek) { s.sonuc = 'yapılacaktı'; continue; }
      await copeAt(istek, o.id);
      s.sonuc = 'yapıldı';
    } catch (err) {
      s.sonuc = 'hata';
      s.neden = hataMetni(err);
    }
  }
  // the folders' contents: only read
  for (const o of IZIN_LISTESI.filter(x => x.islem === 'klasorle')) {
    const s: Satir = { ad: `${o.ad} (klasörün içi)`, id: o.id, sonuc: 'atlandı' };
    rapor.satirlar.push(s);
    try {
      const m = await meta(istek, o.id);
      if (!m) { s.neden = 'Drive\'da bulunamadı'; continue; }
      const klasorSatiri = rapor.satirlar.find(x => x.id === o.ebeveyn);
      if (gercek) {
        if (m.trashed === true) s.sonuc = 'klasörüyle gitti';
        else s.neden = `hâlâ çöpte değil (klasör: ${klasorSatiri?.sonuc ?? '?'})`;
      } else {
        const e = eslesme(o, m);
        if (e.tamam && klasorSatiri?.sonuc === 'yapılacaktı') s.sonuc = 'klasörüyle gidecek';
        else s.neden = e.tamam ? `klasör: ${klasorSatiri?.sonuc ?? '?'}` : e.neden;
      }
    } catch (err) {
      s.sonuc = 'hata';
      s.neden = hataMetni(err);
    }
  }
}

async function ozetAdimi(deps: TemizlikDeps, istek: Getirici, gercek: boolean, rapor: TemizlikRaporu): Promise<void> {
  const y = (s: string) => rapor.ozet.push(s);
  const f = `files/${encodeURIComponent(OZET.id)}`;
  try {
    // a. the file, as the list saw it
    const m = await json<Meta & { modifiedTime?: string; headRevisionId?: string; capabilities?: { canEdit?: boolean } }>(
      await istek(`${f}?fields=${META},modifiedTime,headRevisionId,capabilities/canEdit`), 'ozet.pdf okunurken');
    const e = eslesme({ ...OZET, tur: 'dosya' }, m);
    if (!e.tamam) { y(`ATLANDI: ozet.pdf eşleşmedi (${e.neden}).`); return; }
    if (m.headRevisionId !== OZET.head) { y(`ATLANDI: ozet.pdf'in head sürümü değişmiş: ${m.headRevisionId} (beklenen ${OZET.head}). Liste yeniden çıkarılmalı.`); return; }
    if (m.capabilities?.canEdit !== true) { y('ATLANDI: ozet.pdf\'e yazma izni yok.'); return; }
    const mt = m.modifiedTime ?? '';
    y(`- Şu an: head ${m.headRevisionId}, modifiedTime ${mt} (beklenenle aynı).`);

    // b. pages 67–68 → a local PDF (before anything else)
    const simdi = await deps.suankiOzet(mt);
    const sB = await deps.incele(simdi);
    const yanlis = OZET.yedekSayfalar.filter(n => sB.ekIdler[n - 1] !== OZET.yedekEkId);
    if (yanlis.length) { y(`ATLANDI: ${yanlis.join(', ')}. sayfa beklenen DefterEkId'yi (${OZET.yedekEkId}) taşımıyor (dosya ${sB.sayfa} sayfa). Yedek alınmadı.`); return; }
    const yedek = await deps.sayfalariAyir(simdi, OZET.yedekSayfalar);
    const yB = await deps.incele(yedek);
    if (yB.sayfa !== OZET.yedekSayfalar.length) { y(`ATLANDI: yedek PDF ${yB.sayfa} sayfa çıktı (beklenen ${OZET.yedekSayfalar.length}).`); return; }
    deps.yedekKaydet(yedek, OZET.yedekAd);
    y(`- Yedek: ${OZET.yedekAd} (${OZET.yedekSayfalar.join('–')}. sayfalar, ${mb(yedek.byteLength)}) indirildi (İndirilenler klasörü). Şu anki dosya: ${sB.sayfa} sayfa, ${sB.not} Defter notu.`);

    // c. the kept revision: metadata, then its bytes
    const rv = await json<{ id?: string; keepForever?: boolean; size?: string; modifiedTime?: string }>(
      await istek(`${f}/revisions/${encodeURIComponent(OZET.rev)}?fields=id,keepForever,size,modifiedTime`), 'Sürüm okunurken');
    if (rv.keepForever !== true) { y(`ATLANDI: sürüm ${OZET.rev} keepForever değil.`); return; }
    const res = await istek(`${f}/revisions/${encodeURIComponent(OZET.rev)}?alt=media`);
    if (!res.ok) { y(`ATLANDI: sürüm indirilemedi (Drive ${res.status}).`); return; }
    const eski = new Uint8Array(await res.arrayBuffer());
    if (rv.size && +rv.size !== eski.byteLength) { y(`ATLANDI: indirilen sürüm ${eski.byteLength} bayt, Drive ${rv.size} diyor.`); return; }
    const eB = await deps.incele(eski);
    const ekli = eB.ekIdler.filter(Boolean).length;
    if (eB.sayfa !== OZET.sayfa || ekli || eB.not) { y(`ATLANDI: sürüm beklenen gibi değil: ${eB.sayfa} sayfa, ${ekli} DefterEkId'li sayfa, ${eB.not} Defter notu (beklenen ${OZET.sayfa} / 0 / 0).`); return; }
    y(`- keepForever sürümü (${rv.modifiedTime}): ${eB.sayfa} sayfa, DefterEkId yok, Defter notu yok, ${mb(eski.byteLength)}. Doğrulandı.`);

    if (!gercek) { y('- KURU: yüklenmedi. Gerçek çalışmada bu baytlar ozet.pdf\'in yeni sürümü olur.'); return; }

    // d. upload (uploadPdf: canEdit, modifiedTime, backup check, headRevisionId), then read it again
    const r = await deps.ozetYukle(eski, mt);
    y(`- YÜKLENDİ: yeni head ${r.headRevisionId}, modifiedTime ${r.modifiedTime}.`);
    const kontrol = await istek(`${f}?alt=media`);
    if (!kontrol.ok) { y(`- Kontrol indirmesi olmadı (Drive ${kontrol.status}); sayfayı yenileyip defterTemizlikListesi() çalıştır.`); return; }
    const k = await deps.incele(new Uint8Array(await kontrol.arrayBuffer()));
    const tamam = k.sayfa === OZET.sayfa && !k.ekIdler.some(Boolean) && k.not === 0;
    y(`- ${tamam ? 'KONTROL TAMAM' : 'KONTROL TUTMADI'}: Drive'daki ozet.pdf ${k.sayfa} sayfa, ${k.ekIdler.filter(Boolean).length} DefterEkId'li sayfa, ${k.not} Defter notu.`);
  } catch (err) {
    y(`HATA: ${hataMetni(err)}`);
  }
}

export async function temizlikCalistir(deps: TemizlikDeps, o: { gercek: boolean; search: string }): Promise<TemizlikRaporu> {
  const rapor: TemizlikRaporu = { gercek: o.gercek, durdu: null, uyarilar: [], bilgiler: [], satirlar: [], ozet: [] };
  if (!kilitAcik(o.search)) { rapor.durdu = 'Kilit kapalı: adrese ?temizlik=1 ekle. Hiçbir istek yapılmadı.'; return rapor; }
  const istek = o.gercek ? deps.istek : saltOkunurSar(deps.istek);   // dry run: GET only, by construction

  // 1. checks (this device)
  const kitap = deps.kitap();
  const k99 = konu99Kayitlari(kitap);
  if (k99.length) rapor.uyarilar.push(`UYARI: Konu-99-Test-5.7 kitap.json'da kayıtlı: ${k99.join('; ')}. Klasör çöpe gidince bu konu "Konu klasörü bulunamadı" der. Ayrı karar gerekir (bu adımda kitap.json'a yazılmaz).`);
  else rapor.bilgiler.push(kitap ? 'Konu-99-Test-5.7 kitap.json\'da kayıtlı değil.' : 'Kitap (programmiergrundlagen) bellekte yok; Konu-99 kaydı kontrol edilemedi.');
  for (const kd of deps.kurdeleler()) rapor.bilgiler.push(`${kd.ad}: sayfa ${kd.sayfa}${kd.sayfa > OZET.sayfa ? ` → ${OZET.sayfa} sayfalık dosyada yok; okuyucu ozet'i 1. sayfadan açar (kitap.json'a yazılmaz)` : ' → geçerli kalır'}.`);

  const kalem = await deps.bekleyenKalem();
  const foto = await deps.bekleyenFoto();
  const fotoOzet = foto?.filter(f => f.hedefFileId === OZET.id || f.konuKlasorId === OZET.ebeveyn) ?? null;
  const izinli = new Set(IZIN_LISTESI.map(x => x.id));
  rapor.bilgiler.push(`Bekleyen kalem kaydı (defter-kalem): ${kalem == null ? 'OKUNAMADI' : `${kalem.length} dosya${kalem.includes(OZET.id) ? ', ozet.pdf İÇİN VAR' : ', ozet.pdf için yok'}${kalem.some(id => izinli.has(id)) ? `; çöpe gidecek dosyalardan: ${kalem.filter(id => izinli.has(id)).join(', ')}` : ''}`}.`);
  rapor.bilgiler.push(`Bekleyen fotoğraf (defter-foto): ${fotoOzet == null ? 'OKUNAMADI' : `${foto!.length} kayıt, Konu-01 / ozet.pdf için ${fotoOzet.length}${fotoOzet.length ? ` (${fotoOzet.map(f => `${f.hedefAd} ${f.islemId}`).join(', ')})` : ''}`}.`);
  const engel = kalem == null || fotoOzet == null || kalem.includes(OZET.id) || fotoOzet.length > 0;
  if (engel && o.gercek) {
    rapor.durdu = 'DURDU: bu cihazda ozet.pdf için bekleyen kayıt var ya da depo okunamadı. Hiçbir şey yazılmadı; Deniz\'e sor.';
    return rapor;
  }
  if (engel) rapor.uyarilar.push('UYARI: bekleyen kayıt var ya da depo okunamadı; gerçek çalışma bu durumda başlamadan durur.');

  // 2. trash, 3. ozet.pdf
  await copAdimi(istek, o.gercek, rapor);
  await ozetAdimi(deps, istek, o.gercek, rapor);
  return rapor;
}

export function raporMetni(r: TemizlikRaporu): string {
  const md: string[] = [];
  const y = (s = '') => md.push(s);
  y(`# Test temizliği – ${r.gercek ? 'GERÇEK çalışma' : 'KURU çalışma (hiçbir şey yazılmadı)'} (6.3-0b)`);
  y();
  y(new Date().toISOString());
  for (const u of r.uyarilar) { y(); y(`**${u}**`); }
  if (r.durdu) { y(); y(`**${r.durdu}**`); }
  y();
  y('## Ön kontrol');
  for (const b of r.bilgiler) y(`- ${b}`);
  if (r.satirlar.length) {
    const say = (s: Sonuc) => r.satirlar.filter(x => x.sonuc === s).length;
    y();
    y(`## Çöp (${r.satirlar.length} öğe)`);
    y();
    y(`yapıldı: ${say('yapıldı')} · yapılacaktı: ${say('yapılacaktı')} · klasörüyle: ${say('klasörüyle gitti') + say('klasörüyle gidecek')} · atlandı: ${say('atlandı')} · hata: ${say('hata')}`);
    y();
    y('| ad | id | sonuç | neden |');
    y('|---|---|---|---|');
    for (const s of r.satirlar) y(`| ${s.ad.replace(/\|/g, '\\|')} | ${s.id} | ${s.sonuc} | ${(s.neden ?? '').replace(/\|/g, '\\|')} |`);
  }
  if (r.ozet.length) {
    y();
    y('## ozet.pdf (Konu-01)');
    for (const s of r.ozet) y(s.startsWith('-') ? s : `- ${s}`);
  }
  return md.join('\n');
}

// ---- the real dependencies (dynamic imports: the test above needs none of them) ----

async function gercekDeps(book: () => Book | undefined): Promise<TemizlikDeps> {
  const [{ driveFetch }, { IdbPendingStore }, { bekleyenFotoDepo }, { getPdf, putPdf }, { pdfLib, readDefterStrokes }, { EK_ID }, { drivePdfApi, uploadPdf }, liste] = await Promise.all([
    import('./drive'), import('../kalem/bekleyenDepo'), import('../defter/bekleyenFoto'), import('../okuma/pdfOnbellek'),
    import('../kalem/pdfNotlari'), import('../defter/ozeteEkle'), import('./pdfYazici'), import('./temizlikListesi')
  ]);
  return {
    istek: driveFetch,
    async bekleyenKalem() {
      const s = new IdbPendingStore();
      const ids = await s.listIds();
      return s.ok ? ids : null;
    },
    async bekleyenFoto() {
      try { return await bekleyenFotoDepo.hepsi(); } catch (e) { console.warn(ne, e); return null; }
    },
    kitap: book,
    kurdeleler: () => liste.kurdeleler(book()),
    async suankiOzet(mt) { return new Uint8Array(await getPdf(OZET.id, mt)); },
    async incele(bytes) {
      const L = await pdfLib();
      const doc = await L.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      const key = L.PDFName.of(EK_ID);
      const ekIdler = doc.getPages().map(p => {
        const v = doc.context.lookup(p.node.get(key));
        return v instanceof L.PDFString || v instanceof L.PDFHexString ? v.decodeText() : null;
      });
      let not = 0;
      for (const list of (await readDefterStrokes(bytes)).values()) not += list.length;
      return { sayfa: ekIdler.length, ekIdler, not };
    },
    async sayfalariAyir(bytes, sayfalar) {
      const L = await pdfLib();
      const src = await L.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      const out = await L.PDFDocument.create();
      for (const p of await out.copyPages(src, sayfalar.map(n => n - 1))) out.addPage(p);
      return out.save();
    },
    yedekKaydet(bytes, ad) { liste.indir(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), ad); },
    async ozetYukle(bytes, mt) {
      const r = await uploadPdf(drivePdfApi, OZET.id, bytes, mt);
      await putPdf(OZET.id, r.modifiedTime, bytes);
      return r;
    }
  };
}

export function installTemizlikUygula(activeLocation: () => DriveLocation | null, books: () => Map<string, Book> | null): void {
  (window as unknown as { defterTemizlikUygula: (o?: { gercek?: boolean }) => Promise<void> }).defterTemizlikUygula = async (o = {}) => {
    const gercek = o.gercek === true;
    const loc = activeLocation();
    if (!loc) { console.warn(`${ne}: Drive kitaplığı yüklü değil (giriş yapıp bekle).`); return; }
    const liste = await import('./temizlikListesi');
    try {
      const book = () => books()?.get('programmiergrundlagen');
      console.log(`${ne}: ${gercek ? 'GERÇEK' : 'kuru'} çalışma başlıyor…`);
      let md = raporMetni(await temizlikCalistir(await gercekDeps(book), { gercek, search: location.search }));
      if (gercek) {
        console.log(`${ne}: bitti; liste yeniden çıkarılıyor (defterTemizlikListesi)…`);
        try {
          md += '\n\n---\n\n' + (await liste.rapor(loc, books(), s => console.log(`${ne}: ${s}`))).md;
        } catch (e) {
          md += `\n\n---\n\nListe yeniden çıkarılamadı: ${hataMetni(e)}. Sayfayı yenileyip defterTemizlikListesi() çalıştır.`;
        }
      }
      console.log(md);
      liste.kutu(md, null);
    } catch (e) {
      const m = `HATA ${hataMetni(e)}`;
      console.error(`${ne}: ${m}`, e);
      liste.kutu(m, null);
    }
  };
}
