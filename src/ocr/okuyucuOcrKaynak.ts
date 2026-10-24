import type { DriveLocation } from '../drive/driveLibrary';
import { DriveError } from '../drive/drive';
import { saltOkunurFetch } from '../drive/saltOkunur';
import { elYazisiHazirla, type ElYazisiSayfasi, type ElYazisiSonucu } from '../okuma/elYazisiAra';
import type { BookPage } from '../okuma/kitapSayfalari';
import { isSampleId } from '../okuma/ornekKaynak';
import { getPdf } from '../okuma/pdfOnbellek';
import { eslestir } from './kayit/eslestir';
import { driveOcrApi, kayitOkuDrive, type OcrKaynakDosya } from './kayit/kayitDrive';
import { sayfaParmakIzleri } from './kayit/parmakIzi';
import { duzeltilmisMetin, hamMetin, type OcrKayit, type OcrSayfa } from './kayit/sema';

// Task 6.4c-3: the reader's search in the read handwriting (only behind ?ocrKayit=1, loaded lazily).
// For the photo pages of the open list: per file its fingerprints (the PDF's bytes from the cache), its
// folder, its record (<pdf>.ocr.json) → eslestir → the page's texts (as written and corrected). "eski"
// entries (their fingerprint is on no page) are never searched. Reads only.
// Memory: fingerprints per file version; folder per file; the record KAYIT_OMRU_MS long (a page read
// meanwhile, in the panel or after adding photos, is found on a search after that).

export const KAYIT_OMRU_MS = 30_000;

export interface OcrKaynakBagimlilik {
  izler(id: string, modifiedTime: string): Promise<string[]>;
  klasor(id: string): Promise<string>;
  kayit(k: OcrKaynakDosya): Promise<OcrKayit | null>;
  simdi?(): number;
}

// A read page → its texts in search form (as written; corrected only when it differs)
export function sayfaMetinleri(s: Pick<OcrSayfa, 'satirlar'>): string[] {
  return [...new Set([hamMetin(s), duzeltilmisMetin(s)].map(elYazisiHazirla))];
}

export class OkuyucuOcrKaynak {
  private izBellek = new Map<string, Promise<string[]>>();
  private klasorBellek = new Map<string, Promise<string>>();
  private kayitBellek = new Map<string, { p: Promise<OcrKayit | null>; zaman: number }>();

  constructor(private d: OcrKaynakBagimlilik) {}

  // metinsiz: indexes in pages (pages without PDF text). A file that fails is skipped (its pages count as
  // not read); every file failing → the error (the search goes on with the PDF text only).
  async ara(pages: readonly BookPage[], metinsiz: readonly number[]): Promise<ElYazisiSonucu> {
    const dosyalar = new Map<string, { mt: string; ad: string; indeksler: number[] }>();
    for (const i of metinsiz) {
      const p = pages[i];
      if (!p?.dosyaId || !p.modifiedTime || !p.pdfSayfa || isSampleId(p.dosyaId)) continue;
      const f = dosyalar.get(p.dosyaId);
      if (f) f.indeksler.push(i); else dosyalar.set(p.dosyaId, { mt: p.modifiedTime, ad: p.ad ?? '', indeksler: [i] });
    }
    const sayfalar: ElYazisiSayfasi[] = [];
    const hatalar: unknown[] = [];
    await Promise.all([...dosyalar].map(async ([id, f]) => {
      try {
        const [izler, kayit] = await Promise.all([this.izler(id, f.mt), this.kayit(id, f.ad)]);
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

  // The file changed (pages added, a new version): its record is read again on the next search
  unut(id: string): void {
    this.kayitBellek.delete(id);
  }

  // The reader closed
  temizle(): void {
    this.izBellek.clear();
    this.klasorBellek.clear();
    this.kayitBellek.clear();
  }

  private izler(id: string, mt: string): Promise<string[]> {
    return bellekte(this.izBellek, `${id}@${mt}`, () => this.d.izler(id, mt));
  }

  private kayit(id: string, ad: string): Promise<OcrKayit | null> {
    const simdi = this.d.simdi?.() ?? Date.now();
    const b = this.kayitBellek.get(id);
    if (b && simdi - b.zaman < KAYIT_OMRU_MS) return b.p;
    const p = bellekte(this.klasorBellek, id, () => this.d.klasor(id)).then(klasorId => this.d.kayit({ id, ad, klasorId }));
    const yeni = { p, zaman: simdi };
    this.kayitBellek.set(id, yeni);
    p.catch(() => { if (this.kayitBellek.get(id) === yeni) this.kayitBellek.delete(id); });
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
export function driveOcrKaynak(yer: () => DriveLocation | null): { ara(pages: BookPage[], metinsiz: number[]): Promise<ElYazisiSonucu | null>; unut(id: string): void; temizle(): void } {
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
  });
  return {
    ara: (pages, metinsiz) => yer() ? k.ara(pages, metinsiz) : Promise.resolve(null),
    unut: id => k.unut(id),
    temizle: () => k.temizle(),
  };
}
