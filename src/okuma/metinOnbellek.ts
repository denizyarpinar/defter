import type { BookPage } from './kitapSayfalari';
import { sayfaHazirla, type HazirSayfa, type SayfaMetni } from './metinAra';
import { pageKind } from './sayfaIcerik';

// Task 6.3b: the text of the open reader's PDF pages, in memory (one per reader; gone when it closes).
// Key: file id + modifiedTime. The text comes from the pdf.js document that is already open (no download).
// When the file changes (pages added, the pen's upload), unut(fileId) forgets it: read again on the next search.

export interface MetinKaynagi { textContent(p: BookPage): Promise<SayfaMetni> }

// A page of the list: hazir = its text (null: not a PDF page, or it couldn't be read)
export interface AranacakSayfa { indeks: number; sayfa: BookPage; hazir: HazirSayfa | null; hata?: boolean }

export interface TumMetin {
  sayfalar: AranacakSayfa[];
  yeni: number;      // pages read now (0: all from memory)
  ms: number;        // how long reading them took
}

export class MetinOnbellek {
  private files = new Map<string, { mt: string; pages: Map<number, Promise<HazirSayfa>> }>();
  private kapali = false;
  private arkaPlan = 0;

  constructor(private kaynak: MetinKaynagi) {}

  // Every PDF page of the list, one after the other (the worker reads one page at a time anyway; the
  // drawing of the pages goes on between them). The first search waits for this.
  async hepsi(pages: BookPage[]): Promise<TumMetin> {
    const t0 = performance.now();
    let yeni = 0;
    const sayfalar: AranacakSayfa[] = [];
    for (const [indeks, sayfa] of pages.entries()) {
      if (this.kapali) break;
      if (pageKind(sayfa) !== 'pdf') { sayfalar.push({ indeks, sayfa, hazir: null }); continue; }
      if (!this.var(sayfa)) yeni++;
      try {
        sayfalar.push({ indeks, sayfa, hazir: await this.sayfa(sayfa) });
      } catch (e) {
        console.warn('Sayfanın metni okunamadı.', sayfa, e);
        sayfalar.push({ indeks, sayfa, hazir: null, hata: true });
      }
    }
    return { sayfalar, yeni, ms: performance.now() - t0 };
  }

  // Reading the text in the background once the list is on screen, a page at a time, giving the main
  // thread its turn after each. Not used yet (task 6.3b: the first search reads it; decided in 6.3f
  // after measuring on the iPad).
  hazirla(pages: BookPage[], gecikme = 1000): void {
    const my = ++this.arkaPlan;
    setTimeout(async () => {
      for (const p of pages) {
        if (my !== this.arkaPlan || this.kapali) return;
        if (pageKind(p) !== 'pdf' || this.var(p)) continue;
        try { await this.sayfa(p); } catch { /* the search tries again */ }
        await new Promise(r => setTimeout(r, 0));
      }
    }, gecikme);
  }

  // The file changed: its text is read again next time. A reading still going on writes into the
  // forgotten entry, never into the new one.
  unut(fileId: string): void {
    this.files.delete(fileId);
  }

  kapat(): void {
    this.kapali = true;
    this.arkaPlan++;
    this.files.clear();
  }

  private var(p: BookPage): boolean {
    const f = this.files.get(p.dosyaId!);
    return !!f && f.mt === (p.modifiedTime ?? '') && f.pages.has(p.pdfSayfa!);
  }

  private sayfa(p: BookPage): Promise<HazirSayfa> {
    const id = p.dosyaId!, mt = p.modifiedTime ?? '', no = p.pdfSayfa!;
    let f = this.files.get(id);
    if (!f || f.mt !== mt) { f = { mt, pages: new Map() }; this.files.set(id, f); }
    let h = f.pages.get(no);
    if (!h) {
      const pages = f.pages;
      const yeni = this.kaynak.textContent(p).then(sayfaHazirla);
      yeni.catch(() => { if (pages.get(no) === yeni) pages.delete(no); });   // tried again next time
      pages.set(no, yeni);
      h = yeni;
    }
    return h;
  }
}
