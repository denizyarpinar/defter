import type { DriveLocation } from '../drive/driveLibrary';
import { DriveError } from '../drive/drive';
import { saltOkunurFetch } from '../drive/saltOkunur';
import { elYazisiHazirla, type ElYazisiSayfasi, type ElYazisiSonucu } from '../okuma/elYazisiAra';
import type { BookPage } from '../okuma/kitapSayfalari';
import { isSampleId } from '../okuma/ornekKaynak';
import { getPdf } from '../okuma/pdfOnbellek';
import { eslestir } from './kayit/eslestir';
import { driveOcrApi, kayitOkuDrive, type OcrKaynakDosya } from './kayit/kayitDrive';
import { kayitOnbellegeYaz, kayitOnbellektenOku, kayitOnbellektenSil } from './kayit/kayitOnbellek';
import { sayfaParmakIzleri } from './kayit/parmakIzi';
import { duzeltilmisMetin, hamMetin, type OcrKayit, type OcrSayfa } from './kayit/sema';

// Task 6.4c-3: the reader's search in the read handwriting (6.4c-4: for everyone in a Drive library, loaded on the first search).
// For the photo pages of the open list: per file its fingerprints (the PDF's bytes from the cache), its
// folder, its record (<pdf>.ocr.json) → eslestir → the page's texts (as written and corrected). "eski"
// entries (their fingerprint is on no page) are never searched. Reads only.
// Memory: fingerprints per file version; folder per file; the record KAYIT_OMRU_MS long (a page read
// meanwhile, in the panel or after adding photos, is found on a search after that).
// Task 6.4e-2b: the last known record (memory, then the device copy, kayitOnbellek.ts) is given at once while
// Drive is read behind it; Drive's answer always goes to the device copy, and when it differs the reader is
// told (yenilendi → a new look at the list). No last known record → Drive is waited for, as before.

export const KAYIT_OMRU_MS = 30_000;

export interface OcrKaynakBagimlilik {
  izler(id: string, modifiedTime: string): Promise<string[]>;
  klasor(id: string): Promise<string>;
  kayit(k: OcrKaynakDosya): Promise<OcrKayit | null>;
  simdi?(): number;
  onbellek?: KayitOnbellegi;               // task 6.4e-2b: the device copy (none: memory only)
  yenilendi?(id: string): void;            // Drive's record differs from the one given at once
}

export interface KayitOnbellegi {
  oku(id: string): Promise<OcrKayit | null>;
  yaz(id: string, k: OcrKayit): Promise<void>;
  sil(id: string): Promise<void>;
}

// What the last opening took how long (?olcum=1, the clean view's line)
export interface KayitIzi { kaynak: 'bellek' | 'cihaz' | 'drive'; ms: number }

// Task 6.4e-2: the clean view's matches (index in the list → …)
export interface Eslesmeler { sayfalar: Map<number, OcrSayfa>; izler: Map<number, string> }

// A read page → its texts in search form (as written; corrected only when it differs)
export function sayfaMetinleri(s: Pick<OcrSayfa, 'satirlar'>): string[] {
  return [...new Set([hamMetin(s), duzeltilmisMetin(s)].map(elYazisiHazirla))];
}

export class OkuyucuOcrKaynak {
  private izBellek = new Map<string, Promise<string[]>>();
  private klasorBellek = new Map<string, Promise<string>>();
  private kayitBellek = new Map<string, { p: Promise<OcrKayit | null>; zaman: number; bitti: boolean }>();
  private sonKayit = new Map<string, OcrKayit>();   // task 6.4e-2b: the last known record per file
  sonKayitIzi: KayitIzi | null = null;

  constructor(private d: OcrKaynakBagimlilik) {}

  // metinsiz: indexes in pages (pages without PDF text). A file that fails is skipped (its pages count as
  // not read); every file failing → the error (the search goes on with the PDF text only).
  async ara(pages: readonly BookPage[], metinsiz: readonly number[]): Promise<ElYazisiSonucu> {
    const dosyalar = new Map<string, { mt: string; ad: string; klasorId?: string; indeksler: number[] }>();
    for (const i of metinsiz) {
      const p = pages[i];
      if (!p?.dosyaId || !p.modifiedTime || !p.pdfSayfa || isSampleId(p.dosyaId)) continue;
      const f = dosyalar.get(p.dosyaId);
      if (f) f.indeksler.push(i); else dosyalar.set(p.dosyaId, { mt: p.modifiedTime, ad: p.ad ?? '', klasorId: p.klasorId, indeksler: [i] });
    }
    const sayfalar: ElYazisiSayfasi[] = [];
    const hatalar: unknown[] = [];
    await Promise.all([...dosyalar].map(async ([id, f]) => {
      try {
        const [izler, kayit] = await Promise.all([this.izler(id, f.mt), this.kayit(id, f.ad, f.klasorId)]);
        if (!kayit) return;
        const eslesme = eslestir(kayit, izler).sayfalar;
        for (const i of f.indeksler) {
          const s = eslesme[pages[i].pdfSayfa! - 1];
          if (s) sayfalar.push({ sayfa: i, metinler: sayfaMetinleri(s) });
        }
      } catch (e) {
        console.warn(`El yazısı kaydı okunamadı (${f.ad || id}); bu dosyanın fotoğraf sayfaları okunmamış sayılır.`, e);
        hatalar.push(e);
      }
    }));
    if (dosyalar.size && hatalar.length === dosyalar.size) throw hatalar[0];
    return { sayfalar: sayfalar.sort((a, b) => a.sayfa - b.sayfa) };
  }

  // Task 6.4e-2: the read pages of the open list for the clean view: page index → its record's entry (always by
  // fingerprint, eslestir; never by page number) and page index → fingerprint (the counter's photo pages).
  // The records first: no file of the list has a record with pages → no fingerprints at all (pdf-lib is not
  // loaded). A file that fails is skipped (warned); this never throws.
  async eslesmeler(pages: readonly BookPage[]): Promise<Eslesmeler> {
    const out: Eslesmeler = { sayfalar: new Map(), izler: new Map() };
    const dosyalar = new Map<string, { mt: string; ad: string; klasorId?: string; indeksler: number[] }>();
    pages.forEach((p, i) => {
      if (!p.dosyaId || !p.modifiedTime || !p.pdfSayfa || isSampleId(p.dosyaId)) return;
      const f = dosyalar.get(p.dosyaId);
      if (f) f.indeksler.push(i); else dosyalar.set(p.dosyaId, { mt: p.modifiedTime, ad: p.ad ?? '', klasorId: p.klasorId, indeksler: [i] });
    });
    const uyar = (f: { ad: string }, id: string, e: unknown) =>
      console.warn(`El yazısı kaydı okunamadı (${f.ad || id}); temiz yazı bu dosyada gösterilmez.`, e);
    const kayitlar = new Map<string, OcrKayit>();
    await Promise.all([...dosyalar].map(async ([id, f]) => {
      try { const k = await this.kayit(id, f.ad, f.klasorId); if (k?.sayfalar.length) kayitlar.set(id, k); } catch (e) { uyar(f, id, e); }
    }));
    if (!kayitlar.size) return out;
    // fingerprints of every file of the list (also those without a record: their photo pages count as not read)
    await Promise.all([...dosyalar].map(async ([id, f]) => {
      let izler: string[];
      try { izler = await this.izler(id, f.mt); } catch (e) { uyar(f, id, e); return; }
      const k = kayitlar.get(id);
      const eslesme = k ? eslestir(k, izler).sayfalar : [];
      for (const i of f.indeksler) {
        const n = pages[i].pdfSayfa! - 1;
        if (izler[n]) out.izler.set(i, izler[n]);
        if (eslesme[n]) out.sayfalar.set(i, eslesme[n]!);
      }
    }));
    return out;
  }

  // The file changed (pages added, a page read): its record is read again from Drive (and waited for) next time
  unut(id: string): void {
    this.kayitBellek.delete(id);
    this.sonKayit.delete(id);
    void this.d.onbellek?.sil(id);
  }

  // Task 6.4e-3: a record we just wrote (a hand correction): fresh in memory and on the device at once, so the
  // clean view and the search use it without waiting for Drive (unut would delete the device copy)
  async guncelle(id: string, kayit: OcrKayit): Promise<void> {
    this.kayitBellek.set(id, { p: Promise.resolve(kayit), zaman: this.d.simdi?.() ?? Date.now(), bitti: true });
    this.sonKayit.set(id, kayit);
    try { await this.d.onbellek?.yaz(id, kayit); } catch { /* the device copy is only a copy */ }
  }

  // Sign-out (the device copies are emptied by the reader: temizDepo.depoTemizle)
  temizle(): void {
    this.izBellek.clear();
    this.klasorBellek.clear();
    this.kayitBellek.clear();
    this.sonKayit.clear();
  }

  private izler(id: string, mt: string): Promise<string[]> {
    return bellekte(this.izBellek, `${id}@${mt}`, () => this.d.izler(id, mt));
  }

  // Fresh in memory → that; otherwise Drive is read, and meanwhile the last known record (memory, device) is
  // given at once. Drive's answer: into memory and the device copy; when it differs from what was given, yenilendi.
  // klasorId: the PDF's folder when the reader knows it (listed there; no parents request)
  private async kayit(id: string, ad: string, klasorId?: string): Promise<OcrKayit | null> {
    const t0 = this.d.simdi?.() ?? performance.now();
    const simdi = this.d.simdi?.() ?? Date.now();
    const b = this.kayitBellek.get(id);
    const iz = (kaynak: KayitIzi['kaynak']) => { this.sonKayitIzi = { kaynak, ms: Math.round((this.d.simdi?.() ?? performance.now()) - t0) }; };
    if (b && simdi - b.zaman < KAYIT_OMRU_MS) {
      const son = this.sonKayit.get(id);
      if (!b.bitti && son) { iz('bellek'); return son; }   // Drive still on the way: the last known one
      const k = await b.p;
      iz(b.bitti ? 'bellek' : 'drive');
      return k;
    }
    const p = this.drivedan(id, ad, simdi, klasorId);
    const yeni = this.kayitBellek.get(id)!;
    const bellekteki = this.sonKayit.get(id);
    const onceki = bellekteki ?? await this.cihazdan(id);
    // nothing known, or Drive answered while the device was read (its answer is newer)
    if (!onceki || yeni.bitti) { const k = await p; iz('drive'); return k; }
    iz(bellekteki ? 'bellek' : 'cihaz');
    this.sonKayit.set(id, onceki);
    p.then(k => { if (JSON.stringify(k) !== JSON.stringify(onceki)) this.d.yenilendi?.(id); }, () => {});
    return onceki;
  }

  private async cihazdan(id: string): Promise<OcrKayit | null> {
    try { return (await this.d.onbellek?.oku(id)) ?? null; } catch { return null; }
  }

  private drivedan(id: string, ad: string, simdi: number, bilinenKlasor?: string): Promise<OcrKayit | null> {
    const klasor = bilinenKlasor ? Promise.resolve(bilinenKlasor) : bellekte(this.klasorBellek, id, () => this.d.klasor(id));
    const p = klasor.then(klasorId => this.d.kayit({ id, ad, klasorId }));
    const yeni = { p, zaman: simdi, bitti: false };
    this.kayitBellek.set(id, yeni);
    p.then(k => {
      yeni.bitti = true;
      if (this.kayitBellek.get(id) !== yeni) return;   // forgotten meanwhile (unut)
      if (k) { this.sonKayit.set(id, k); void this.d.onbellek?.yaz(id, k).catch(() => {}); }
      else { this.sonKayit.delete(id); void this.d.onbellek?.sil(id).catch(() => {}); }
    }, () => { if (this.kayitBellek.get(id) === yeni) this.kayitBellek.delete(id); });
    return p;
  }
}

// A promise kept in a map; a failed one is forgotten (tried again next time)
function bellekte<T>(m: Map<string, Promise<T>>, k: string, yap: () => Promise<T>): Promise<T> {
  let p = m.get(k);
  if (!p) {
    const yeni = yap();
    m.set(k, yeni);
    yeni.catch(() => { if (m.get(k) === yeni) m.delete(k); });
    p = yeni;
  }
  return p;
}

// The real one: the PDF from the cache (already open in the reader), Drive reads only (GET)
export interface DriveOcrKaynak {
  ara(pages: BookPage[], metinsiz: number[]): Promise<ElYazisiSonucu | null>;
  eslesmeler(pages: readonly BookPage[]): Promise<Eslesmeler>;
  unut(id: string): void;
  guncelle(id: string, kayit: OcrKayit): Promise<void>;
  temizle(): void;
  kayitIzi(): KayitIzi | null;
}

// hesap: the signed-in account (null: no device copy); yenilendi: Drive's record differs from the one shown
export function driveOcrKaynak(yer: () => DriveLocation | null, o: { hesap?: () => string | null; yenilendi?: (id: string) => void } = {}): DriveOcrKaynak {
  const hesapla = <T>(f: (h: string) => Promise<T>, yok: T) => { const h = o.hesap?.(); return h ? f(h) : Promise.resolve(yok); };
  const k = new OkuyucuOcrKaynak({
    izler: async (id, mt) => sayfaParmakIzleri(new Uint8Array(await getPdf(id, mt))),
    async klasor(id) {
      const res = await saltOkunurFetch(`files/${encodeURIComponent(id)}?fields=parents`);
      if (!res.ok) throw new DriveError(res.status, 'Dosya bilgisi okunurken');
      const p = ((await res.json()) as { parents?: string[] }).parents?.[0];
      if (!p) throw new Error('Dosyanın klasörü bulunamadı.');
      return p;
    },
    kayit: async f => {
      const loc = yer();
      return loc ? (await kayitOkuDrive(driveOcrApi(loc), f)).kayit : null;
    },
    onbellek: {
      oku: id => hesapla(h => kayitOnbellektenOku(h, id), null),
      yaz: (id, kayit) => hesapla(h => kayitOnbellegeYaz(h, id, kayit), undefined),
      sil: id => hesapla(h => kayitOnbellektenSil(h, id), undefined),
    },
    yenilendi: o.yenilendi,
  });
  return {
    ara: (pages, metinsiz) => yer() ? k.ara(pages, metinsiz) : Promise.resolve(null),
    eslesmeler: pages => yer() ? k.eslesmeler(pages) : Promise.resolve({ sayfalar: new Map(), izler: new Map() }),
    unut: id => k.unut(id),
    guncelle: (id, kayit) => k.guncelle(id, kayit),
    temizle: () => k.temizle(),
    kayitIzi: () => k.sonKayitIzi,
  };
}
