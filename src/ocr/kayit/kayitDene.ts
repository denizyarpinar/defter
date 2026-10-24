import { aktifKapsam, isSignedIn } from '../../drive/auth';
import { driveFetch, ok, listChildren, FOLDER_MIME } from '../../drive/drive';
import { loadDriveLibrary, type DriveLoad } from '../../drive/driveLibrary';
import { bookUnits, usesUnits } from '../../model/units';
import { SourceResolver } from '../../okuma/kaynakCoz';
import { adimEtiketi, listeSatirlari, varsayilanKonu, type DeneAday, type DeneAdim } from './kayitDeneSec';
import { driveOcrApi, kayitOkuDrive, sayfaYaz, type OcrKaynakDosya } from './kayitDrive';
import { sayfaParmakIzleri } from './parmakIzi';
import { hamMetin, ocrDosyaAdi, type OcrSayfa } from './sema';

// Task 6.4c-1, development only (installed by ocr-ai.html, never in the build):
// window.defterOcrKayitDene(kitap?, konu?, sayfa = 1) writes a fake reading (model "deneme") of that page of
// the topic's ozet.pdf into ozet.ocr.json, then reads the record back and shows it.
// 6.4c-1b: no book given → the first real (not sample) topic with an ozet.pdf (a "test" topic first,
// varsayilanKonu). A real book is written only after a confirm(). Each miss says its step (library / book /
// topic / ozet.pdf) and lists the books and the topics with an ozet.pdf. The console never shows an e-mail
// or a Drive id; "same file as before" is told without the id.

const NE = 'defterOcrKayitDene';
const oncekiDosya = new Map<string, string>();   // kitap/konu → the record file of the last call

async function ornekMi(klasorId: string): Promise<boolean> {
  const res = await ok(await driveFetch(`files/${encodeURIComponent(klasorId)}?fields=appProperties`), 'Kitap klasörü okunurken');
  return ((await res.json()) as { appProperties?: Record<string, string> }).appProperties?.defterOrnek === '1';
}

interface Ozet { klasorId: string; id: string; ad: string }

// the topic folder and its ozet.pdf (name case-insensitive)
async function ozetBul(resolver: SourceResolver, klasor: string): Promise<{ klasorId: string | null; ozet: Ozet | null }> {
  const klasorId = await resolver.resolveFolder(klasor);
  if (!klasorId) return { klasorId: null, ozet: null };
  const f = (await listChildren(klasorId)).find(x => x.mimeType !== FOLDER_MIME && x.name.toLowerCase() === 'ozet.pdf');
  return { klasorId, ozet: f ? { klasorId, id: f.id, ad: f.name } : null };
}

const konular = (lib: DriveLoad, kitap: string) => {
  const book = lib.books.get(kitap);
  return book && usesUnits(book) ? bookUnits(book).flatMap(u => u.konular.map(t => t.klasor ?? '')).filter(k => k.trim()) : [];
};

// every book (sample or not) and every topic: has it an ozet.pdf
async function tara(lib: DriveLoad) {
  const kitaplar: { kitap: string; ornek: boolean }[] = [];
  const adaylar: DeneAday[] = [];
  for (const [kitap, klasorId] of lib.loc.bookFolderIds) {
    const ornek = await ornekMi(klasorId);
    kitaplar.push({ kitap, ornek });
    const resolver = new SourceResolver(klasorId);
    for (const konu of konular(lib, kitap)) adaylar.push({ kitap, ornek, konu, ozetVar: !!(await ozetBul(resolver, konu)).ozet });
  }
  return { kitaplar, adaylar };
}

async function bulunamadi(adim: DeneAdim, metin: string, lib: DriveLoad | null): Promise<void> {
  console.warn(`${NE}: ${adimEtiketi(adim)} ${metin}`);
  if (!lib) return;
  console.log(`${NE}: kitaplıktaki kitaplar ve ozet.pdf'li konular (tarama sürüyor…)`);
  const { kitaplar, adaylar } = await tara(lib);
  if (!kitaplar.length) { console.log(`${NE}: kitaplıkta hiç kitap yok.`); return; }
  console.table(listeSatirlari(kitaplar, adaylar));
  console.log(`${NE}: örnek: defterOcrKayitDene('<kitap>', '<konu yolu>', 1)`);
}

function sahteSayfa(sayfa: number, parmakIzi: string): OcrSayfa {
  return {
    sayfa, parmakIzi, model: 'deneme', okunma: new Date().toISOString(), dondurme: 0,
    satirlar: [
      { girinti: 0, parcalar: [{ metin: 'der Knoten (deneme)', renk: 'kirmizi' }, { metin: 'düğüm', renk: 'mavi' }] },
      { girinti: 1, parcalar: [{ metin: '\\sum_{v} \\deg(v) = 2|E|', renk: 'siyah', tur: 'formul' }] },
      { girinti: 1, parcalar: [{ metin: 'Kantn', renk: 'kursun', duzeltme: 'Kante' }, { metin: 'yanlış', renk: 'siyah', ustuCizili: true }] },
      { girinti: 1, cizim: 'üç düğümlü küçük graf (deneme)' }
    ]
  };
}

export function installOcrKayitDene(): void {
  const w = window as unknown as { defterOcrKayitDene: (kitap?: string, konu?: string, sayfa?: number) => Promise<void> };
  w.defterOcrKayitDene = async (kitapAdi?: string, konuYolu?: string, sayfa = 1) => {
    let lib: DriveLoad | null = null;
    try {
      // 1. library
      if (!isSignedIn()) { console.warn(`${NE}: ${adimEtiketi('kitaplik')} giriş yok. Önce sayfadaki "Google ile giriş" düğmesine bas.`); return; }
      try { lib = await loadDriveLibrary(aktifKapsam() ?? 'dar'); }
      catch (e) { return bulunamadi('kitaplik', `Drive kitaplığı yüklenemedi: ${e instanceof Error ? e.message : String(e)}`, null); }

      // 2.–4. book, topic, ozet.pdf: the given ones or the default
      let kitap = kitapAdi ?? '', konu = konuYolu ?? '';
      if (!kitap) {
        if (konu) return bulunamadi('kitap', 'konu verildi ama kitap verilmedi.', lib);
        console.log(`${NE}: kitap verilmedi; ozet.pdf'li ilk gerçek (örnek olmayan) konu aranıyor…`);
        const { kitaplar, adaylar } = await tara(lib);
        const secilen = varsayilanKonu(adaylar);
        if (!secilen) {
          console.warn(`${NE}: ${adimEtiketi('ozet')} örnek olmayan hiçbir kitapta ozet.pdf'li konu yok.`);
          if (kitaplar.length) console.table(listeSatirlari(kitaplar, adaylar)); else console.log(`${NE}: kitaplıkta hiç kitap yok.`);
          return;
        }
        ({ kitap, konu } = secilen);
        console.log(`${NE}: seçilen: ${kitap} / ${konu}`);
      }
      const klasorId = lib.loc.bookFolderIds.get(kitap);
      if (!klasorId || !lib.books.has(kitap)) return bulunamadi('kitap', `"${kitap}" adlı kitap kitaplıkta yok.`, lib);
      if (!usesUnits(lib.books.get(kitap)!)) return bulunamadi('kitap', `"${kitap}" surum 1 kitabı; konu klasörü yok.`, lib);
      if (!konu) {
        const resolver = new SourceResolver(klasorId);
        for (const k of konular(lib, kitap)) if ((await ozetBul(resolver, k)).ozet) { konu = k; break; }
        if (!konu) return bulunamadi('ozet', `"${kitap}" kitabının hiçbir konusunda ozet.pdf yok.`, lib);
      }
      const { klasorId: konuId, ozet } = await ozetBul(new SourceResolver(klasorId), konu);
      if (!konuId) return bulunamadi('konu', `"${kitap}" kitabında "${konu}" klasörü yok.`, lib);
      if (!ozet) return bulunamadi('ozet', `"${kitap}/${konu}" klasöründe ozet.pdf yok.`, lib);

      const ornek = await ornekMi(klasorId);
      if (!ornek && !confirm(`"${kitap}" gerçek bir kitap (örnek kitap değil).\n${konu}/${ocrDosyaAdi(ozet.ad)} dosyasına sahte bir okuma (model "deneme") yazılsın mı?`)) {
        console.log(`${NE}: vazgeçildi, hiçbir şey yazılmadı.`);
        return;
      }

      const pdf = new Uint8Array(await (await ok(await driveFetch(`files/${encodeURIComponent(ozet.id)}?alt=media`), 'ozet.pdf indirilirken')).arrayBuffer());
      const izler = await sayfaParmakIzleri(pdf);
      if (sayfa < 1 || sayfa > izler.length) { console.warn(`${NE}: ${adimEtiketi('ozet')} ozet.pdf'te ${izler.length} sayfa var; sayfa ${sayfa} yok.`); return; }

      const kaynak: OcrKaynakDosya = { id: ozet.id, ad: ozet.ad, klasorId: ozet.klasorId };
      const drive = driveOcrApi(lib.loc);
      const r = await sayfaYaz(drive, kaynak, sahteSayfa(sayfa, izler[sayfa - 1]));
      const anahtar = `${kitap}/${konu}`;
      const once = oncekiDosya.get(anahtar);
      oncekiDosya.set(anahtar, r.dosyaId);
      console.log(`${NE}: ${r.yeni ? 'yeni dosya oluşturuldu' : 'var olan dosya güncellendi'} · ${kitap}/${konu}/${ocrDosyaAdi(ozet.ad)} · sayfa ${sayfa} · bu PDF için dosya sayısı ${r.kopyaSayisi}`
        + (once ? ` · önceki çağrıyla aynı dosya: ${once === r.dosyaId ? 'evet' : 'HAYIR'}` : ''));

      const okunan = await kayitOkuDrive(drive, kaynak);
      console.table((okunan.kayit?.sayfalar ?? []).map(s => ({ sayfa: s.sayfa, parmakIzi: s.parmakIzi.slice(0, 14) + '…', model: s.model, okunma: s.okunma, satir: s.satirlar.length })));
      const s = okunan.kayit?.sayfalar.find(x => x.parmakIzi === izler[sayfa - 1]);
      if (s) console.log(`${NE}: sayfa ${sayfa} ham metin:\n${hamMetin(s)}`);
    } catch (e) {
      console.error(`${NE}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  console.info('6.4c-1 dev: defterOcrKayitDene(kitap?, konu?, sayfa = 1) hazır (girişten sonra).');
}
