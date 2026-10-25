import type { Stil } from '../elYazisi/basici';
import { atlasBellekTemizle, atlasOkuBellekli, driveAtlasOkuApiKur, type AtlasOnbellegi } from '../elYazisi/atlasOkuDrive';
import { dizgi, type Dizgi } from '../elYazisi/dizgi';
import { canvasOlc, temizSayfaCiz, temizYaziciKur, type TemizYazici } from '../elYazisi/temizSayfa';
import type { TemizTercih } from '../elYazisi/temizGorunum';
import type { DriveOcrKaynak } from '../ocr/okuyucuOcrKaynak';
import type { OcrSayfa } from '../ocr/kayit/sema';
import type { BookPage } from './kitapSayfalari';
import { depoOku, depoSil, depoYaz } from './temizDepo';
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

// Task 6.4e-2b: the root the reader knows (no root search) and the atlas copy on the device per account
export interface AtlasBaglami { kok: () => string | null; hesap: () => string | null }

export function atlasOnbellegi(hesap: () => string | null): AtlasOnbellegi {
  const ile = <T>(f: (h: string) => Promise<T>, yok: T) => { const h = hesap(); return h ? f(h) : Promise.resolve(yok); };
  return {
    oku: () => ile(h => depoOku('atlas', h), null),
    yaz: k => ile(h => depoYaz('atlas', h, k), undefined),
    sil: () => ile(h => depoSil('atlas', h), undefined),
  };
}

// The atlas of this session: where from and how long until it could print (?olcum=1)
export let atlasIzi: { nereden: 'drive' | 'cihaz'; ms: number } | null = null;

export const driveYazici = (b?: AtlasBaglami) => async (): Promise<TemizYazici | null> => {
  const t0 = performance.now();
  const a = await atlasOkuBellekli(driveAtlasOkuApiKur(b?.kok), b ? atlasOnbellegi(b.hesap) : undefined);
  if (!a) return null;
  for (const u of a.uyarilar) console.warn(u);
  const y = await temizYaziciKur(a.atlas, new Blob([a.png as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
  atlasIzi = { nereden: a.nereden, ms: Math.round(performance.now() - t0) };   // read + PNG decoded
  return y;
};

export function temizYaziKur(o: {
  kaynak: () => Promise<Pick<DriveOcrKaynak, 'eslesmeler'>>;
  boyut: (p: BookPage) => Promise<{ width: number; height: number }>;
  tercih: TemizTercih;
  degisti: (b: TemizBildirim) => void;
  yazici?: () => Promise<TemizYazici | null>;   // dev: a fake atlas (defterTemizSahte)
  atlas?: AtlasBaglami;
  eslesmeler?: TemizBagimlilik<TemizYazici>['eslesmeler'];
}): TemizYaziOkuyucu<TemizYazici> {
  return new TemizYaziOkuyucu<TemizYazici>({
    eslesmeler: o.eslesmeler ?? (async pages => (await o.kaynak()).eslesmeler(pages)),
    yazici: o.yazici ?? driveYazici(o.atlas),
    boyut: o.boyut,
    ciz: sayfaCiz,
  }, o.tercih, o.degisti);
}

export { atlasBellekTemizle };
