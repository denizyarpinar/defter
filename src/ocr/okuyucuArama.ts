export interface SearchPage { number: number; index: number; text?: string; ocr?: boolean }
export interface OcrImage { blob: Blob; hash: string }
export interface SearchIO {
  valid(): boolean;
  verify(): Promise<void>;
  text(page: SearchPage): Promise<string>;
  image(page: SearchPage): Promise<OcrImage>;
  read(image: Blob): Promise<string>; // OCR engine: image → text
}

// One file/version/session. No persistence.
export class ReaderOcrSearch {
  pages: SearchPage[] = [];
  busy = false;
  cancelled = false;
  private generation = 0;
  constructor(private io: SearchIO) {}
  private check(generation: number): void {
    if (this.cancelled || generation !== this.generation || !this.io.valid()) throw new Error('İşlem iptal edildi veya dosya/oturum değişti. Eski sonuç kullanılmadı.');
  }
  cancel(): void { this.cancelled = true; this.generation++; }
  forget(): void {
    this.cancel();
    for (const p of this.pages) p.text = undefined;
  }
  async prepare(selection: SearchPage[]): Promise<number> {
    if (this.busy) throw new Error('Önce sürmekte olan işlemi tamamla.');
    if (!selection.length || selection.length > 5 || new Set(selection.map(p => p.number)).size !== selection.length) throw new Error('Aynı dosyadan 1–5 farklı sayfa seç.');
    this.cancelled = false; const generation = ++this.generation; this.busy = true;
    this.pages = [];
    try {
      this.check(generation); await this.io.verify(); this.check(generation);
      for (const item of selection) {
        const text = await this.io.text(item); this.check(generation);
        this.pages.push({ ...item, text: text.trim() ? text : undefined });
      }
      return this.pages.filter(p => p.text === undefined).length;
    } catch (e) { this.pages = []; throw e; }
    finally { this.busy = false; }
  }
  async start(): Promise<void> {
    if (this.busy || !this.pages.length) throw new Error('Önce sayfaları kontrol et; aynı anda tek işlem çalışır.');
    this.busy = true; this.cancelled = false; const generation = ++this.generation;
    try {
      this.check(generation);
      for (const p of this.pages) {
        this.check(generation); await this.io.verify(); this.check(generation);
        if (p.text !== undefined) continue;
        const image = await this.io.image(p); this.check(generation);
        const text = await this.io.read(image.blob);
        this.check(generation); p.text = text; p.ocr = true;
      }
    } finally { this.busy = false; }
  }
  async matches(query: string): Promise<{ page: SearchPage; excerpt: string; ocr: boolean }[]> {
    this.check(this.generation); await this.io.verify(); this.check(this.generation);
    const q = query.trim().toLocaleLowerCase('tr');
    if (q.length < 2) return [];
    return this.pages.flatMap(page => {
      const at = page.text?.toLocaleLowerCase('tr').indexOf(q) ?? -1;
      return at < 0 ? [] : [{ page, excerpt: page.text!.slice(Math.max(0, at - 55), at + q.length + 85), ocr: !!page.ocr }];
    });
  }
}
