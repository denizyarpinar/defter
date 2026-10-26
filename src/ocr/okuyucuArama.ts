import { katlaUzunlukKoru } from '../dil/katla';
import { duzeltilmisMetin, hamMetin, type OcrSayfa } from './kayit/sema';

// Task 6.4c-2: a page is 'metin' (it has PDF text: never sent), 'okundu' (the record has it) or 'okunacak'.
// start() reads the 'okunacak' ones (or the pages asked again with "Tekrar oku") and saves each one the
// moment it is read, not all at the end.
// Task 6.4e-3: a read page's text in this panel: as written, and corrected when it differs (both are found)
export function aramaMetni(s: Pick<OcrSayfa, 'satirlar'>): string {
  const ham = hamMetin(s), duz = duzeltilmisMetin(s);
  return duz === ham ? ham : `${ham}
${duz}`;
}

export type PageState = 'metin' | 'okundu' | 'okunacak';
export interface SearchPage { number: number; index: number; text?: string; ocr?: boolean; state?: PageState; record?: OcrSayfa }
export interface SearchIO {
  valid(): boolean;
  verify(): Promise<void>;
  text(page: SearchPage): Promise<string>;
  recorded(page: SearchPage): Promise<OcrSayfa | null>;      // the record's entry for this page as it is now
  read(page: SearchPage, signal: AbortSignal): Promise<OcrSayfa>;   // page image → engine (fingerprint inside)
  save(page: SearchPage, reading: OcrSayfa): Promise<void>;
  progress?(done: number, total: number, page: SearchPage): void;   // before each page: "Okunuyor done/total"
}

// One file/version/session. The readings live in the record (Drive); here only for this panel.
export class ReaderOcrSearch {
  pages: SearchPage[] = [];
  busy = false;
  cancelled = false;
  private generation = 0;
  private abort: AbortController | null = null;
  constructor(private io: SearchIO) {}
  private check(generation: number): void {
    if (this.cancelled || generation !== this.generation || !this.io.valid()) throw new Error('İşlem iptal edildi veya dosya/oturum değişti. Eski sonuç kullanılmadı.');
  }
  cancel(): void { this.cancelled = true; this.generation++; this.abort?.abort(); }
  forget(): void {
    this.cancel();
    for (const p of this.pages) { p.text = undefined; p.record = undefined; }
  }
  // the number of pages that would be sent
  async prepare(selection: SearchPage[]): Promise<number> {
    if (this.busy) throw new Error('Önce sürmekte olan işlemi tamamla.');
    if (!selection.length || selection.length > 5 || new Set(selection.map(p => p.number)).size !== selection.length) throw new Error('Aynı dosyadan 1–5 farklı sayfa seç.');
    this.cancelled = false; const generation = ++this.generation; this.busy = true;
    this.pages = [];
    try {
      this.check(generation); await this.io.verify(); this.check(generation);
      for (const item of selection) {
        const text = await this.io.text(item); this.check(generation);
        if (text.trim()) { this.pages.push({ ...item, text, state: 'metin' }); continue; }
        const record = await this.io.recorded(item); this.check(generation);
        this.pages.push(record ? { ...item, text: aramaMetni(record), ocr: true, state: 'okundu', record } : { ...item, state: 'okunacak' });
      }
      return this.pages.filter(p => p.state === 'okunacak').length;
    } catch (e) { this.pages = []; throw e; }
    finally { this.busy = false; }
  }
  // again: page numbers to read even though the record has them ("Tekrar oku"); pages with text never
  async start(again: number[] = []): Promise<void> {
    if (this.busy || !this.pages.length) throw new Error('Önce sayfaları kontrol et; aynı anda tek işlem çalışır.');
    this.busy = true; this.cancelled = false; const generation = ++this.generation;
    const abort = this.abort = new AbortController();
    try {
      this.check(generation);
      const todo = this.pages.filter(p => p.state === 'okunacak' || (p.state === 'okundu' && again.includes(p.number)));
      for (const [i, p] of todo.entries()) {
        this.check(generation); await this.io.verify(); this.check(generation);
        this.io.progress?.(i + 1, todo.length, p);
        const reading = await this.io.read(p, abort.signal);
        this.check(generation);
        await this.io.save(p, reading);
        // saved: the page is read even if cancel came meanwhile (the next page is not started)
        if (this.io.valid()) { p.record = reading; p.text = aramaMetni(reading); p.ocr = true; p.state = 'okundu'; }
      }
      this.check(generation);
    } finally { this.busy = false; if (this.abort === abort) this.abort = null; }
  }
  async matches(query: string): Promise<{ page: SearchPage; excerpt: string; ocr: boolean }[]> {
    this.check(this.generation); await this.io.verify(); this.check(this.generation);
    const q = katlaUzunlukKoru(query.trim());   // 6.5-2a: same length, so `at` points into the original text
    if (q.length < 2) return [];
    return this.pages.flatMap(page => {
      const at = page.text === undefined ? -1 : katlaUzunlukKoru(page.text).indexOf(q);
      return at < 0 ? [] : [{ page, excerpt: page.text!.slice(Math.max(0, at - 55), at + q.length + 85), ocr: !!page.ocr }];
    });
  }
}
