import type { Stil } from '../elYazisi/basici';
import { atlasBellekTemizle, atlasOkuBellekli } from '../elYazisi/atlasOkuDrive';
import { dizgi, type Dizgi } from '../elYazisi/dizgi';
import { canvasOlc, temizSayfaCiz, temizYaziciKur, type TemizYazici } from '../elYazisi/temizSayfa';
import type { TemizTercih } from '../elYazisi/temizGorunum';
import type { DriveOcrKaynak } from '../ocr/okuyucuOcrKaynak';
import type { OcrSayfa } from '../ocr/kayit/sema';
import type { BookPage } from './kitapSayfalari';
import { TemizYaziOkuyucu, type TemizBagimlilik, type TemizBildirim } from './temizYaziOkuyucu';

// Task 6.4e-2: the real dependencies of the reader's clean view (loaded lazily, only in a Drive library):
// the matches from okuyucuOcrKaynak, the atlas from Drive (GET only, atlasOkuDrive.ts), the page from
// dizgi + temizSayfaCiz (kareli paper, jitter on). The typeset page stays in memory per read entry and page size.

let olc: ReturnType<typeof canvasOlc> | null = null;
const dizgiler = new WeakMap<OcrSayfa, Map<string, Dizgi>>();

export function sayfaCiz(canvas: HTMLCanvasElement, s: OcrSayfa, b: { width: number; height: number }, y: TemizYazici, stil: Stil,
  rect?: { x: number; y: number; w: number }): void {
  let m = dizgiler.get(s);
  if (!m) { m = new Map(); dizgiler.set(s, m); }
  const k = `${b.width}x${b.height}`;
  let d = m.get(k);
  if (!d) {
    d = dizgi(s, { en: b.width, boy: b.height, atlas: y.atlas, olc: olc ??= canvasOlc() });
    m.set(k, d);
  }
  temizSayfaCiz(canvas, d, { genislik: canvas.width, yukseklik: canvas.height, atlas: y.atlas, stil, bellek: y.bellek, bolge: rect });
}

export const driveYazici = async (): Promise<TemizYazici | null> => {
  const a = await atlasOkuBellekli();
  if (!a) return null;
  for (const u of a.uyarilar) console.warn(u);
  return temizYaziciKur(a.atlas, new Blob([a.png as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
};

export function temizYaziKur(o: {
  kaynak: () => Promise<Pick<DriveOcrKaynak, 'eslesmeler'>>;
  boyut: (p: BookPage) => Promise<{ width: number; height: number }>;
  tercih: TemizTercih;
  degisti: (b: TemizBildirim) => void;
  yazici?: () => Promise<TemizYazici | null>;   // dev: a fake atlas (defterTemizSahte)
  eslesmeler?: TemizBagimlilik<TemizYazici>['eslesmeler'];
}): TemizYaziOkuyucu<TemizYazici> {
  return new TemizYaziOkuyucu<TemizYazici>({
    eslesmeler: o.eslesmeler ?? (async pages => (await o.kaynak()).eslesmeler(pages)),
    yazici: o.yazici ?? driveYazici,
    boyut: o.boyut,
    ciz: sayfaCiz,
  }, o.tercih, o.degisti);
}

export { atlasBellekTemizle };
