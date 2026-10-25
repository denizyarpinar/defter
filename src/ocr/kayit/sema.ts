// Task 6.4c-1: the handwriting record next to a material (`<pdf name>.ocr.json`, e.g. ozet.ocr.json).
// One entry per read page. The page's text is never stored whole: hamMetin / duzeltilmisMetin build it
// from the parts. Unknown fields (at every level) are kept: the checked objects are passed on as they are.
// A broken file or a newer surum is an error: nothing is written over it.

export const OCR_RENKLER = ['siyah', 'mavi', 'kirmizi', 'yesil', 'kursun', 'diger'] as const;
export type OcrRenk = typeof OCR_RENKLER[number];
export const OCR_DONDURME = [0, 90, 180, 270] as const;
export type OcrDondurme = typeof OCR_DONDURME[number];

export interface OcrParca {
  metin: string;             // as written (spelling not corrected)
  renk: OcrRenk;
  tur?: 'yazi' | 'formul';   // missing = yazi; formul = LaTeX
  ustuCizili?: boolean;
  duzeltme?: string;         // only when it differs from metin
  elle?: boolean;            // task 6.4e-3: duzeltme was written by hand in the panel (elleDuzelt.ts)
}
export interface OcrYaziSatiri { girinti: number; parcalar: OcrParca[] }
export interface OcrCizimSatiri { girinti: number; cizim: string }   // a short description of a drawing
export type OcrSatir = OcrYaziSatiri | OcrCizimSatiri;

export interface OcrSayfa {
  sayfa: number;             // page in the PDF when it was read (1-based); eslestir trusts parmakIzi first
  parmakIzi: string;         // parmakIzi.ts
  model: string;
  okunma: string;            // ISO time
  dondurme: OcrDondurme;     // how the page image was turned before reading
  satirlar: OcrSatir[];
}

export interface OcrKaynak { id: string; ad: string }   // the PDF (Drive id, file name)
export interface OcrKayit { tur: 'defter-ocr'; surum: 1; kaynak: OcrKaynak; sayfalar: OcrSayfa[] }

export const OCR_SURUM = 1;

export class OcrKayitBozuk extends Error {
  constructor(neden: string) { super(`Okuma kaydı (.ocr.json) bozuk: ${neden}. Dosyaya yazılmadı; Drive'da dosyayı düzelt ya da çöpe at.`); }
}
export class OcrKayitYeniSurum extends Error {
  constructor(surum: number) { super(`Okuma kaydı daha yeni bir sürümle yazılmış (surum ${surum}). Dosyaya yazılmadı; uygulamayı yenile.`); }
}

export const yaziSatiriMi = (s: OcrSatir): s is OcrYaziSatiri => 'parcalar' in s;

export const bosKayit = (kaynak: OcrKaynak): OcrKayit => ({ tur: 'defter-ocr', surum: 1, kaynak: { id: kaynak.id, ad: kaynak.ad }, sayfalar: [] });

const nesne = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const girintiMi = (x: unknown) => Number.isInteger(x) && (x as number) >= 0;

function parcaKontrol(p: unknown, yer: string): void {
  if (!nesne(p)) throw new OcrKayitBozuk(`${yer} nesne değil`);
  if (typeof p.metin !== 'string') throw new OcrKayitBozuk(`${yer}.metin yok`);
  if (!OCR_RENKLER.includes(p.renk as OcrRenk)) throw new OcrKayitBozuk(`${yer}.renk bilinmiyor`);
  if (p.tur !== undefined && p.tur !== 'yazi' && p.tur !== 'formul') throw new OcrKayitBozuk(`${yer}.tur bilinmiyor`);
  if (p.ustuCizili !== undefined && typeof p.ustuCizili !== 'boolean') throw new OcrKayitBozuk(`${yer}.ustuCizili yanlış`);
  if (p.duzeltme !== undefined && typeof p.duzeltme !== 'string') throw new OcrKayitBozuk(`${yer}.duzeltme yanlış`);
  if (p.elle !== undefined && typeof p.elle !== 'boolean') throw new OcrKayitBozuk(`${yer}.elle yanlış`);
}

function satirKontrol(s: unknown, yer: string): void {
  if (!nesne(s) || !girintiMi(s.girinti)) throw new OcrKayitBozuk(`${yer}.girinti yanlış`);
  if (Array.isArray(s.parcalar)) { s.parcalar.forEach((p, i) => parcaKontrol(p, `${yer}.parcalar[${i}]`)); return; }
  if (typeof s.cizim !== 'string') throw new OcrKayitBozuk(`${yer} ne parçalı satır ne çizim`);
}

// One page entry (also used before a page is written)
export function sayfaKontrol(s: unknown, yer = 'sayfa'): asserts s is OcrSayfa {
  if (!nesne(s)) throw new OcrKayitBozuk(`${yer} nesne değil`);
  if (!Number.isInteger(s.sayfa) || (s.sayfa as number) < 1) throw new OcrKayitBozuk(`${yer}.sayfa yanlış`);
  for (const k of ['parmakIzi', 'model', 'okunma'] as const) {
    if (typeof s[k] !== 'string' || !s[k]) throw new OcrKayitBozuk(`${yer}.${k} yok`);
  }
  if (!OCR_DONDURME.includes(s.dondurme as OcrDondurme)) throw new OcrKayitBozuk(`${yer}.dondurme yanlış`);
  if (!Array.isArray(s.satirlar)) throw new OcrKayitBozuk(`${yer}.satirlar yok`);
  s.satirlar.forEach((x, i) => satirKontrol(x, `${yer}.satirlar[${i}]`));
}

// Parsed JSON → the record (the same objects, unknown fields included), or an error
export function kayitOku(x: unknown): OcrKayit {
  if (!nesne(x) || x.tur !== 'defter-ocr') throw new OcrKayitBozuk('tur "defter-ocr" değil');
  if (typeof x.surum === 'number' && x.surum > OCR_SURUM) throw new OcrKayitYeniSurum(x.surum);
  if (x.surum !== OCR_SURUM) throw new OcrKayitBozuk('surum yanlış');
  const k = x.kaynak;
  if (!nesne(k) || typeof k.id !== 'string' || !k.id || typeof k.ad !== 'string') throw new OcrKayitBozuk('kaynak yanlış');
  if (!Array.isArray(x.sayfalar)) throw new OcrKayitBozuk('sayfalar yok');
  x.sayfalar.forEach((s, i) => sayfaKontrol(s, `sayfalar[${i}]`));
  return x as unknown as OcrKayit;
}

// Parts of a line: joined with one space, unless one side already has white space
function birlestirParcalar(metinler: string[]): string {
  let out = '';
  for (const m of metinler) {
    if (!m) continue;
    out += out && !/\s$/.test(out) && !/^\s/.test(m) ? ' ' + m : m;
  }
  return out;
}

function satirMetni(s: OcrSatir, duzeltilmis: boolean): string {
  const bas = '  '.repeat(s.girinti);
  if (!yaziSatiriMi(s)) return `${bas}[çizim: ${s.cizim}]`;
  return bas + birlestirParcalar(s.parcalar.map(p => duzeltilmis && p.duzeltme !== undefined ? p.duzeltme : p.metin));
}

// The page as written (what the eye sees), lines separated by \n
export const hamMetin = (s: Pick<OcrSayfa, 'satirlar'>): string => s.satirlar.map(x => satirMetni(x, false)).join('\n');
// The same with the corrections
export const duzeltilmisMetin = (s: Pick<OcrSayfa, 'satirlar'>): string => s.satirlar.map(x => satirMetni(x, true)).join('\n');

// ozet.pdf → ozet.ocr.json (Ozet.PDF → Ozet.ocr.json)
export const ocrDosyaAdi = (pdfAdi: string): string => pdfAdi.replace(/\.pdf$/i, '') + '.ocr.json';
