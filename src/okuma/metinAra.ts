// Task 6.3b: searching the text of the open PDF (no UI yet). Pure: no pdf.js, no DOM.
// A page's text items (pdf.js getTextContent) → one normalized string; every character of it remembers
// where it came from (item, character). A match → the items it covers and its rectangles in PDF user space.

// One text item as pdf.js gives it (transform: text space → PDF user space; width along the baseline)
export interface MetinParcasi { str: string; transform: number[]; width: number; height: number; hasEOL: boolean }

// The page's viewport at scale 1 (pdf.js PageViewport: rotation and CropBox are in its transform)
export interface SayfaGorunumu { transform: number[]; width: number; height: number }

export interface SayfaMetni { parcalar: MetinParcasi[]; gorunum: SayfaGorunumu }

export interface Konum { parca: number; harf: number }   // item index, UTF-16 index in its str

// A page ready to search: metin[i] came from konum[i]
export interface HazirSayfa { sayfa: SayfaMetni; metin: string; konum: Konum[] }

export interface Dikdortgen { x: number; y: number; w: number; h: number }

export interface Eslesme {
  sayfa: number;              // the caller's page number
  parcaIndeksleri: number[];  // the items the match touches, in order
  baslangic: Konum;           // first character
  bitis: Konum;               // after the last character (harf exclusive)
  dikdortgenler: Dikdortgen[];   // PDF user space, one per item
}

export const EN_AZ_HARF = 2;   // shorter queries find nothing (one letter would mark the whole page)
const ALT_PAY = 0.2;           // part of the item's height below the baseline (descenders)

const OZEL: Record<string, string> = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss', 'ı': 'i', '‐': '-', '‑': '-' };
const BOSLUK = /\s/u;
const ISARET = /\p{M}/u;

// One character → its search form: NFKC (ligatures ﬁ → fi), lower case, ı/I/İ → i, umlauts → ae/oe/ue, ß → ss
function cevir(ch: string): string {
  if (ch === '­') return '';   // soft hyphen
  if (BOSLUK.test(ch)) return ' ';
  let out = '';
  for (const c of ch.normalize('NFKC')) {
    if (c === 'I' || c === 'İ' || c === 'ı') { out += 'i'; continue; }
    for (const l of c.toLowerCase()) if (!ISARET.test(l)) out += OZEL[l] ?? l;
  }
  return out;
}

const kucukHarfMi = (c: string | undefined) => !!c && c !== c.toLocaleUpperCase('tr-TR') && c === c.toLocaleLowerCase('tr-TR');

// The page's items → the normalized text. Items are joined as they are (pdf.js adds the spaces between
// words itself; two items of one word join without one). At a line end (hasEOL): "Fehler-" + "anfällig"
// → "fehleranfaellig" when the next item starts with a small letter ("Hin-" + "Und" stays two words);
// otherwise a space. Runs of spaces become one.
export function sayfaHazirla(sayfa: SayfaMetni): HazirSayfa {
  const out: string[] = [], konum: Konum[] = [];
  const ekle = (s: string, k: Konum) => {
    for (const c of s) {
      if (c === ' ' && (!out.length || out[out.length - 1] === ' ')) continue;
      out.push(c); konum.push(k);
    }
  };
  const { parcalar } = sayfa;
  for (let p = 0; p < parcalar.length; p++) {
    const str = parcalar[p].str;
    // the last base character of this item: where its output starts, the character, its index
    let onceki = -1, oncekiCh = '', oncekiHarf = 0;
    for (let i = 0; i < str.length;) {
      const ch = String.fromCodePoint(str.codePointAt(i)!);
      if (ISARET.test(ch)) {
        // a combining mark (u + ¨): joined with the character before it when Unicode has one for both
        const birlesik = (oncekiCh + ch).normalize('NFC');
        if (onceki >= 0 && [...birlesik].length === 1) {
          out.length = onceki; konum.length = onceki;
          ekle(cevir(birlesik), { parca: p, harf: oncekiHarf });
          oncekiCh = birlesik;
        }
      } else {
        onceki = konum.length; oncekiCh = ch; oncekiHarf = i;
        ekle(cevir(ch), { parca: p, harf: i });
      }
      i += ch.length;
    }
    if (!parcalar[p].hasEOL) continue;
    // a hyphen at the line end (maybe with a space after it), after a letter, before a small letter
    let son = out.length - 1;
    if (out[son] === ' ') son--;
    const sonraki = parcalar.slice(p + 1).find(x => x.str.trim())?.str.trimStart()[0];
    if (out[son] === '-' && /\p{L}/u.test(out[son - 1] ?? '') && kucukHarfMi(sonraki)) {
      out.length = son; konum.length = son;
    } else {
      ekle(' ', { parca: p, harf: str.length });
    }
  }
  return { sayfa, metin: out.join(''), konum };
}

// The query's search form, or null when it is too short (empty, one letter)
export function sorguHazirla(q: string): string | null {
  const t = q.trim();
  if ([...t].length < EN_AZ_HARF) return null;
  const n = sayfaHazirla({ parcalar: [{ str: t, transform: [1, 0, 0, 1, 0, 0], width: 0, height: 0, hasEOL: false }], gorunum: { transform: [1, 0, 0, 1, 0, 0], width: 0, height: 0 } }).metin.trim();
  return n.length >= EN_AZ_HARF ? n : null;
}

// Every match of q on the pages (part of a word is found too), not overlapping, in page order
export function metinAra(sayfalar: { sayfa: number; hazir: HazirSayfa }[], q: string): Eslesme[] {
  const n = sorguHazirla(q);
  if (!n) return [];
  const sonuc: Eslesme[] = [];
  for (const { sayfa, hazir } of sayfalar) {
    for (let i = hazir.metin.indexOf(n); i >= 0; i = hazir.metin.indexOf(n, i + n.length)) {
      const ilk = hazir.konum[i], son = hazir.konum[i + n.length - 1];
      const parcalar = [...new Set(hazir.konum.slice(i, i + n.length).map(k => k.parca))];
      const sonStr = hazir.sayfa.parcalar[son.parca].str;
      const bitis = { parca: son.parca, harf: Math.min(sonStr.length, son.harf + (sonStr.codePointAt(son.harf)! > 0xffff ? 2 : 1)) };
      const dikdortgenler: Dikdortgen[] = [];
      for (const p of parcalar) {
        const it = hazir.sayfa.parcalar[p];
        const bas = p === ilk.parca ? ilk.harf : 0, bit = p === bitis.parca ? bitis.harf : it.str.length;
        if (bit > bas) dikdortgenler.push(parcaDikdortgeni(it, bas, bit));
      }
      sonuc.push({ sayfa, parcaIndeksleri: parcalar, baslangic: { parca: ilk.parca, harf: ilk.harf }, bitis, dikdortgenler });
    }
  }
  return sonuc;
}

// Characters [bas, bit) of an item → its rectangle in PDF user space. Every character counts as the same
// width (item width × share of characters). Turned text (b, c ≠ 0): the box around the turned rectangle.
export function parcaDikdortgeni(it: MetinParcasi, bas: number, bit: number): Dikdortgen {
  const [a, b, c, d, e, f] = it.transform;
  const bl = Math.hypot(a, b) || 1, ul = Math.hypot(c, d) || 1;
  const h = it.height || ul, len = it.str.length || 1;
  const x0 = it.width * bas / len, x1 = it.width * bit / len, y0 = -ALT_PAY * h, y1 = (1 - ALT_PAY) * h;
  const kose = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [e + a / bl * x + c / ul * y, f + b / bl * x + d / ul * y]);
  return kutu(kose);
}

// A rectangle in PDF user space → fractions (0–1) of the page box as drawn (the viewport's rotation and
// CropBox are in its transform). For the highlight in 6.3c.
export function sayfaKutusuna(r: Dikdortgen, g: SayfaGorunumu): Dikdortgen {
  const [a, b, c, d, e, f] = g.transform;
  const kose = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
  const k = kutu(kose);
  return { x: k.x / g.width, y: k.y / g.height, w: k.w / g.width, h: k.h / g.height };
}

function kutu(kose: number[][]): Dikdortgen {
  const xs = kose.map(p => p[0]), ys = kose.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// A page without text (a notebook photo, a scan)
export const metinsiz = (s: SayfaMetni) => !s.parcalar.some(p => /\S/u.test(p.str));
