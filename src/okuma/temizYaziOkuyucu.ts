import type { Stil } from '../elYazisi/basici';
import { dugmeGorunur, etkin, sayac, type Sayac, type TemizTercih } from '../elYazisi/temizGorunum';
import type { Eslesmeler } from '../ocr/okuyucuOcrKaynak';
import type { OcrSayfa } from '../ocr/kayit/sema';
import type { BookPage } from './kitapSayfalari';

// Task 6.4e-2: the clean handwriting in the open reader (the decisions: elYazisi/temizGorunum.ts).
// - degerlendir(pages): the read pages of the list (okuyucuOcrKaynak.eslesmeler, by fingerprint); only when one
//   matched, the atlas (once per session, also "not found": atlasOkuDrive keeps null) and the printer.
//   It never holds up the reader: the pages are drawn as always, the answer comes later (degisti → yenile).
// - Atlas missing or failing → the button hidden (+ console.warn on an error); nothing in the reader breaks.
// - ciz(): for a read page while the view is on and the pen off: a job like PageContent.drawPdf (the same
//   budget, the same zoom path: rect = the visible part); otherwise null (→ the original).
// Nothing is written anywhere.

export interface TemizIs { promise: Promise<void>; cancel(): void; cancelled(): boolean }

export interface TemizBagimlilik<Y> {
  eslesmeler(pages: readonly BookPage[]): Promise<Eslesmeler>;
  yazici(): Promise<Y | null>;            // atlas + printer; null: no atlas (asked once per session)
  boyut(p: BookPage): Promise<{ width: number; height: number }>;   // the page's size at scale 1 (pt)
  ciz(canvas: HTMLCanvasElement, s: OcrSayfa, boyut: { width: number; height: number }, y: Y, stil: Stil,
    rect?: { x: number; y: number; w: number }): void;
  simdi?(): number;
}

export interface TemizBildirim { sure: number; eslesen: number }   // ms from degerlendir to the answer

export class TemizYaziOkuyucu<Y = unknown> {
  private liste: readonly BookPage[] | null = null;
  private eslesme = new Map<number, OcrSayfa>();
  private izler = new Map<number, string>();
  private hazir: Y | null = null;
  private yaziciP: Promise<Y | null> | null = null;
  private gen = 0;
  tercih: TemizTercih;
  kalem = false;

  constructor(private d: TemizBagimlilik<Y>, tercih: TemizTercih, private degisti: (b: TemizBildirim) => void) {
    this.tercih = { ...tercih };
  }

  async degerlendir(pages: readonly BookPage[]): Promise<void> {
    const g = ++this.gen;
    const t0 = this.d.simdi?.() ?? performance.now();
    let e: Eslesmeler;
    try { e = await this.d.eslesmeler(pages); } catch (err) {
      console.warn('El yazısı kayıtları okunamadı; temiz yazı gösterilmiyor.', err);
      e = { sayfalar: new Map(), izler: new Map() };
    }
    if (g !== this.gen) return;
    let y: Y | null = null;
    if (e.sayfalar.size) {
      y = await this.yaziciAl();
      if (g !== this.gen) return;
    }
    this.liste = pages;
    this.hazir = y;
    this.eslesme = y ? e.sayfalar : new Map();
    this.izler = e.izler;
    this.degisti({ sure: Math.round((this.d.simdi?.() ?? performance.now()) - t0), eslesen: this.eslesme.size });
  }

  // The atlas once per session; "not found" (null) is kept too, an error is forgotten (tried again next time)
  private async yaziciAl(): Promise<Y | null> {
    if (!this.yaziciP) {
      const p = this.d.yazici();
      this.yaziciP = p;
      p.catch(() => { if (this.yaziciP === p) this.yaziciP = null; });
    }
    try { return await this.yaziciP; } catch (err) {
      console.warn('El yazısı atlası yüklenemedi; temiz yazı gösterilmiyor.', err);
      return null;
    }
  }

  // The reader closed / another list on the way: no clean page until the next answer (no notice)
  bosalt(): void {
    this.gen++;
    this.liste = null;
    this.eslesme = new Map();
    this.izler = new Map();
  }

  // Signed out / another account: the atlas is asked again
  oturumDegisti(): void {
    this.bosalt();
    this.yaziciP = null;
    this.hazir = null;
  }

  gorunur(drive: boolean): boolean {
    return dugmeGorunur({ drive, eslesen: this.eslesme.size, atlasVar: !!this.hazir });
  }

  sayac(): Sayac {
    return sayac(this.izler, new Set(this.eslesme.keys()));
  }

  get etkin(): boolean { return etkin(this.tercih, this.kalem); }

  // The read page drawn in clean handwriting now (null: the original)
  sayfa(pages: readonly BookPage[], i: number): OcrSayfa | null {
    if (!this.etkin || pages !== this.liste || !this.hazir) return null;
    return this.eslesme.get(i) ?? null;
  }

  ciz(pages: readonly BookPage[], i: number, p: BookPage, canvas: HTMLCanvasElement, rect?: { x: number; y: number; w: number }): TemizIs | null {
    const s = this.sayfa(pages, i), y = this.hazir;
    if (!s || !y) return null;
    const stil = this.tercih.stil;
    let iptal = false;
    const promise = (async () => {
      const b = await this.d.boyut(p);
      if (iptal) return;
      this.d.ciz(canvas, s, b, y, stil, rect);
    })();
    return { promise, cancel: () => { iptal = true; }, cancelled: () => iptal };
  }
}
