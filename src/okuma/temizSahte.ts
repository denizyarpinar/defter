import { atlasJsonOku } from '../elYazisi/atlasSema';
import { temizYaziciKur, type TemizYazici } from '../elYazisi/temizSayfa';
import type { Eslesmeler } from '../ocr/okuyucuOcrKaynak';
import type { OcrSayfa } from '../ocr/kayit/sema';
import type { BookPage } from './kitapSayfalari';

// Task 6.4e-2, development only (npm run dev; Okuyucu.ts imports it under import.meta.env.DEV, not in the build):
// window.defterTemizSahte({ sayfalar, fotograf?, atlasJson, atlasPng }) shows the clean view without Drive, also in
// the sample library (scripts/temiz-yazi-okuyucu-kontrol.mjs). sayfalar: index in the open list → a read page;
// fotograf: indexes counted as photo pages (default: the read ones). atlasPng: base64. null turns it off.

export interface TemizSahteGirdi {
  sayfalar: Record<number, Pick<OcrSayfa, 'satirlar'> & Partial<OcrSayfa>>;
  fotograf?: number[];
  atlasJson: string;
  atlasPng: string;
}

export interface TemizSahte {
  eslesmeler(pages: readonly BookPage[]): Promise<Eslesmeler>;
  yazici(): Promise<TemizYazici | null>;
}

export function temizSahteKur(o: TemizSahteGirdi): TemizSahte {
  const atlas = atlasJsonOku(o.atlasJson);
  const png = Uint8Array.from(atob(o.atlasPng), c => c.charCodeAt(0));
  const yazici = temizYaziciKur(atlas, new Blob([png], { type: 'image/png' }));
  const sayfalar = new Map(Object.entries(o.sayfalar).map(([i, s]) => [Number(i), {
    sayfa: Number(i) + 1, parmakIzi: `g:sahte${i}`, model: 'sahte', okunma: '2026-10-25T00:00:00.000Z', dondurme: 0, ...s
  } as OcrSayfa]));
  return {
    async eslesmeler(pages) {
      const izler = new Map<number, string>();
      for (const i of o.fotograf ?? sayfalar.keys()) if (i < pages.length) izler.set(i, `g:sahte${i}`);
      return { sayfalar: new Map([...sayfalar].filter(([i]) => i < pages.length)), izler };
    },
    yazici: () => yazici,
  };
}

export function installTemizSahte(kur: (s: TemizSahte | null) => void): void {
  (window as unknown as { defterTemizSahte: (o: TemizSahteGirdi | null) => Promise<void> }).defterTemizSahte =
    async o => { const s = o ? temizSahteKur(o) : null; await s?.yazici(); kur(s); };
}
