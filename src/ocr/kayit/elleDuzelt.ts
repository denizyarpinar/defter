import { yaziSatiriMi, type OcrKayit, type OcrParca, type OcrSayfa } from './sema';
import { t } from '../../dil';

// Task 6.4e-3: a word of the read text corrected by hand in the "El yazısını oku" panel. Free, no API call.
// - metin (as written) never changes; duzeltme = (the correction there is, else metin) with that word changed,
//   and elle: true. Back to exactly metin → duzeltme and elle are removed.
// - A word = a run without white space; its leading/trailing punctuation stays, only the core is edited
//   ("anzi," → "anki,"). The new core may be several words ("an ki").
// - Geri al: with as many words in duzeltme as in metin, that word goes back to metin's; otherwise
//   (the word count changed) the part's whole hand correction is removed.
// - Formulas (LaTeX) and struck-through parts are not edited (struck-through is not in the clean view).

export interface Kelime { bas: string; oz: string; son: string }

const KELIME = /^([\p{P}\p{S}]*)(.*?)([\p{P}\p{S}]*)$/su;

export const gosterilen = (p: OcrParca): string => p.duzeltme ?? p.metin;

// text → [word, space, word, …] (leading/trailing space as empty-word neighbours kept by join)
const parcala = (metin: string) => metin.split(/(\s+)/);
const kelimeIndeksleri = (parts: string[]) => parts.flatMap((x, i) => (x && !/^\s+$/.test(x) ? [i] : []));
const tokenlar = (metin: string) => { const p = parcala(metin); return kelimeIndeksleri(p).map(i => p[i]); };

function bol(token: string): Kelime {
  const m = KELIME.exec(token)!;
  return m[2] ? { bas: m[1], oz: m[2], son: m[3] } : { bas: '', oz: '', son: token };   // punctuation only: no core
}

export const duzenlenebilir = (p: OcrParca): boolean => p.tur !== 'formul' && !p.ustuCizili;

// The words of the shown text; a word with an empty core (punctuation only) cannot be tapped
export const kelimeler = (p: OcrParca): Kelime[] => tokenlar(gosterilen(p)).map(bol);

// The result: equal to metin → no correction at all
function sonuc(p: OcrParca, duzeltme: string): OcrParca {
  const { duzeltme: _d, elle: _e, ...geri } = p;
  return duzeltme === p.metin ? geri : { ...geri, duzeltme, elle: true };
}

function kelimeKoy(metin: string, i: number, yeni: string): string {
  const parts = parcala(metin), idx = kelimeIndeksleri(parts);
  if (i < 0 || i >= idx.length) throw new RangeError(`Kelime yok: ${i}`);
  parts[idx[i]] = yeni;
  return parts.join('');
}

export class KelimeBos extends Error {
  constructor() { super(t('ocrPanel.kelimeBos')); }
}

// The i-th word's core becomes `yeni` (white space inside collapsed to one space)
export function kelimeDegistir(p: OcrParca, i: number, yeni: string): OcrParca {
  const oz = yeni.trim().replace(/\s+/gu, ' ');
  if (!oz) throw new KelimeBos();
  const k = bol(tokenlar(gosterilen(p))[i] ?? '');
  if (!k.oz) throw new RangeError(`Kelime yok: ${i}`);
  if (oz === k.oz) return p;
  return sonuc(p, kelimeKoy(gosterilen(p), i, k.bas + oz + k.son));
}

// As written (metin) for a hand-corrected word; null: not corrected by hand
export function yazildigiGibi(p: OcrParca, i: number): string | null {
  if (!p.elle || p.duzeltme === undefined) return null;
  const ham = tokenlar(p.metin), duz = tokenlar(p.duzeltme);
  if (ham.length !== duz.length) return p.metin;
  return ham[i] !== duz[i] ? ham[i] : null;
}

export function kelimeGeriAl(p: OcrParca, i: number): OcrParca {
  if (!p.elle || p.duzeltme === undefined) return p;
  const ham = tokenlar(p.metin), duz = tokenlar(p.duzeltme);
  if (ham.length !== duz.length) return sonuc(p, p.metin);
  return sonuc(p, kelimeKoy(p.duzeltme, i, ham[i]));
}

// Parts corrected by hand on a page ("Tekrar oku" asks first)
export const elleSayisi = (s: Pick<OcrSayfa, 'satirlar'>): number =>
  s.satirlar.reduce((n, x) => n + (yaziSatiriMi(x) ? x.parcalar.filter(p => p.elle).length : 0), 0);

export const tekrarOkuUyarisi = (s: Pick<OcrSayfa, 'satirlar'>): string | null => {
  const n = elleSayisi(s);
  return n ? t('ocrPanel.tekrarOkuUyari', { n }) : null;
};

// Which part of which reading: the page's fingerprint + reading time, the part's place, its metin and the
// text that was shown when tapped
export interface DuzeltmeHedefi { parmakIzi: string; okunma: string; satir: number; parca: number; metin: string; gosterilen: string }

export class OcrSayfaDegisti extends Error {
  constructor() { super(t('ocrKayit.sayfaDegisti')); }
}

// The latest record (just read from Drive) with the part changed; the page read again (another okunma) or
// the part changed meanwhile → OcrSayfaDegisti. Unknown fields are kept.
export function duzeltmeUygula(kayit: OcrKayit, h: DuzeltmeHedefi, degistir: (p: OcrParca) => OcrParca): OcrKayit {
  const si = kayit.sayfalar.findIndex(s => s.parmakIzi === h.parmakIzi && s.okunma === h.okunma);
  const s = kayit.sayfalar[si];
  const satir = s?.satirlar[h.satir];
  const p = satir && yaziSatiriMi(satir) ? satir.parcalar[h.parca] : undefined;
  if (!s || !satir || !yaziSatiriMi(satir) || !p || p.metin !== h.metin || gosterilen(p) !== h.gosterilen) throw new OcrSayfaDegisti();
  const parcalar = satir.parcalar.map((x, i) => (i === h.parca ? degistir(x) : x));
  const satirlar = s.satirlar.map((x, i) => (i === h.satir ? { ...satir, parcalar } : x));
  return { ...kayit, sayfalar: kayit.sayfalar.map((x, i) => (i === si ? { ...s, satirlar } : x)) };
}
