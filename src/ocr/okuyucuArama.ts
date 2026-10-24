import { DriveOcrTrial, type OcrOperation } from './driveDeneme';

export interface SearchPage { number: number; index: number; text?: string; operation?: OcrOperation }
export interface OcrImage { blob: Blob; hash: string }
export interface SearchIO {
  valid(): boolean;
  verify(): Promise<void>;
  text(page: SearchPage): Promise<string>;
  image(page: SearchPage): Promise<OcrImage>;
  trial: DriveOcrTrial;
  parent: string;
}

// One file/version/session. No persistence; cancellation keeps only cleanup metadata.
export class ReaderOcrSearch {
  pages: SearchPage[] = [];
  busy = false;
  cancelled = false;
  private generation = 0;
  constructor(private io: SearchIO) {}
  private check(generation: number): void {
    if (this.cancelled || generation !== this.generation || !this.io.valid()) throw new Error('İşlem iptal edildi veya dosya/oturum değişti. Eski sonuç kullanılmadı.');
  }
  get pending(): boolean { return this.pages.some(p => p.operation?.sent && !p.operation.cleanup.startsWith('Çöpte doğrulandı:')); }
  cancel(): void { this.cancelled = true; this.generation++; }
  forget(): void {
    this.cancel();
    for (const p of this.pages) { p.text = undefined; if (p.operation) p.operation.text = undefined; }
  }
  async prepare(selection: SearchPage[]): Promise<number> {
    if (this.busy || this.pending) throw new Error('Önce sürmekte olan işlemi veya bekleyen temizliği tamamla.');
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
        if (p.text !== undefined) {
          if (p.operation?.sent && !p.operation.cleanup.startsWith('Çöpte doğrulandı:')) await this.io.trial.cleanup(p.operation);
          continue;
        }
        const image = await this.io.image(p); this.check(generation);
        p.operation ??= { operation: crypto.randomUUID(), parent: this.io.parent, fingerprint: image.hash, language: 'tr', sent: false, busy: false, cleanup: '' };
        try {
          const text = await this.io.trial.run(p.operation, image.blob);
          this.check(generation); p.text = text;
        } finally {
          if (this.cancelled || !this.io.valid() || generation !== this.generation) { p.text = undefined; p.operation.text = undefined; }
        }
      }
    } finally { this.busy = false; }
  }
  async cleanup(): Promise<void> {
    if (this.busy) throw new Error('İşlem sürüyor; iptal sonrası temizlik beklenecek.');
    this.busy = true;
    try { for (const p of this.pages) if (p.operation?.sent) await this.io.trial.cleanup(p.operation); }
    finally { this.busy = false; }
  }
  async matches(query: string): Promise<{ page: SearchPage; excerpt: string; ocr: boolean }[]> {
    this.check(this.generation); await this.io.verify(); this.check(this.generation);
    const q = query.trim().toLocaleLowerCase('tr');
    if (q.length < 2) return [];
    return this.pages.flatMap(page => {
      const at = page.text?.toLocaleLowerCase('tr').indexOf(q) ?? -1;
      return at < 0 ? [] : [{ page, excerpt: page.text!.slice(Math.max(0, at - 55), at + q.length + 85), ocr: !!page.operation }];
    });
  }
}
