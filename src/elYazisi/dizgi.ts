import { yaziSatiriMi, type OcrParca, type OcrSayfa } from '../ocr/kayit/sema';
import type { ElYazisiAtlas } from './atlasSema';

// Task 6.4e-1: the typesetter (no DOM). One read page (OcrSayfa) + the page size → where every glyph goes.
// - Text: duzeltme if there is one, else metin; struck-through parts are left out; parts joined with one space.
//   Colour by the OcrRenk name; "diger" (and a colour the atlas does not know) → siyah.
// - Gaps from the atlas (aralik, between glyph boxes, in xh). Samples of a character take turns across the page.
// - Baseline jitter of −1/0/+1 atlas px (scaled), from a hash of (line, position, character): the same page always
//   looks the same. `oynama: false` turns it off.
// - Word wrap (a word longer than the line is broken between letters), indent 3·xh per level, margins 7 % of the
//   page width on every side, line pitch 3·xh.
// - Paper: kareli (default, Deniz's decision) = squares of 1.5·xh, a line is two squares, the baseline sits on a
//   grid line; cizgili = a rule every line, the baseline on it; duz = nothing.
// - xh = width / 45; if the page does not fit it shrinks (down to 60 %); still too long → the last line says
//   "… devamı Orijinal'de".
// - A character not in the atlas → `yedek` (same colour, the system font scaled to the x height) and the page's
//   `eksik` list. Formulas: simple LaTeX → plain text (latexDuz) and then the same rules. Drawings: a small grey
//   italic "[çizim: …]".
// - 6.4e-2: a "·" the atlas has no glyph for (also \cdot in a formula) → a filled dot in the ink's colour
//   (radius NOKTA_R·xh, in the middle of the x height), not the fallback font; it is not "eksik".

export const KAGITLAR = ['kareli', 'duz', 'cizgili'] as const;
export type Kagit = typeof KAGITLAR[number];
export const VARSAYILAN_KAGIT: Kagit = 'kareli';

export const XH_BOLEN = 45;          // xh = page width / 45
export const KENAR_ORAN = 0.07;      // margins: 7 % of the page width
export const SATIR_ARALIGI = 3;      // line pitch (xh)
export const TABAN_UST = 2.1;        // first baseline below the top margin (xh), like basici.py TABAN_Y
export const GIRINTI = 3;            // one indent level (xh)
export const KARE = 1.5;             // kareli: square side (xh); a line is two squares
export const MIN_OLCEK = 0.6;        // shrink down to 60 %
export const ALT_PAY = 0.9;          // room below the last baseline (descenders, xh)
export const KUCUK = 0.7;            // superscript / subscript size
export const NOT_BOYUT = 0.8;           // drawing notes and the "devamı" note: smaller
export const DEVAMI = '… devamı Orijinal\'de';
export const NOKTA = '·';
export const NOKTA_R = 0.1;          // the dot's radius (xh)
export const NOKTA_W = 0.4;          // the room it takes (xh)

const RENK_YEDEK = 'siyah';

export type Kayma = 'ust' | 'alt' | null;

// One character of the text, before layout
export interface Harf {
  k: string;
  renk: string;
  boyut: number;          // 1, or KUCUK for ^ and _
  kayma: Kayma;
  ustOk?: boolean;        // \vec: drawn above the previous character, no advance
  cizim?: boolean;        // part of a drawing note: always the fallback font, grey italic
}

export type DizgiOge =
  | { tur: 'glif'; karakter: string; ornek: number; renk: string; x: number; y: number; olcek: number }
  | { tur: 'yedek'; metin: string; renk: string; x: number; taban: number; xh: number; w: number }
  | { tur: 'cizim' | 'not'; metin: string; x: number; taban: number; xh: number; w: number }
  | { tur: 'nokta'; renk: string; x: number; y: number; r: number };   // centre and radius

export interface Dizgi {
  en: number; boy: number;
  xh: number;
  kenar: number;
  kagit: Kagit;
  satirAraligi: number;
  ilkTaban: number;        // the first baseline; the others every satirAraligi
  kare: number;            // kareli: square side (also the grid's x origin is the left margin)
  satirSayisi: number;
  ogeler: DizgiOge[];
  eksik: string[];         // characters drawn with the fallback font
  kesildi: boolean;        // the end did not fit
}

export interface DizgiAyar {
  en: number; boy: number;
  atlas: Pick<ElYazisiAtlas, 'xh' | 'aralik' | 'karakterler' | 'renkler'>;
  kagit?: Kagit;
  oynama?: boolean;
  // width of a fallback run in px for the given x height (canvas measureText in the browser)
  olc?: (metin: string, xh: number, italik: boolean) => number;
}

// without a canvas: an average system-font letter is about 1.06 x heights wide
export const tahminiOlc = (metin: string, xh: number) => [...metin].length * 1.06 * xh;

// ---- LaTeX → plain characters ----

const KOMUT: Record<string, string> = {
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠',
  approx: '≈', equiv: '≡', sim: '∼', infty: '∞', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒',
  Leftarrow: '⇐', Leftrightarrow: '⇔', iff: '⇔', implies: '⇒', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆',
  cup: '∪', cap: '∩', emptyset: '∅', forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨', wedge: '∧', vee: '∨',
  sum: 'Σ', prod: 'Π', int: '∫', partial: '∂', nabla: '∇', circ: '∘', ldots: '…', cdots: '⋯', dots: '…', degree: '°',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ',
  tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  '{': '{', '}': '}', '%': '%', '&': '&', '_': '_', '#': '#', $: '$', '|': '‖', ',': ' ', ';': ' ', ':': ' ', '!': '', ' ': ' ',
  quad: ' ', qquad: ' ', left: '', right: '', big: '', Big: '', bigl: '', bigr: '', displaystyle: '', mathrm: '', text: '',
  mathbf: '', mathit: '', mathbb: '', operatorname: ''
};

type Duz = Omit<Harf, 'renk' | 'cizim'>;

// Simple LaTeX → characters with size and shift. Unknown commands keep their name ("\foo" → "foo").
export function latexDuz(s: string): Duz[] {
  let i = 0;
  const grup = (boyut: number, kayma: Kayma, bitis: string | null): Duz[] => {
    const out: Duz[] = [];
    const ekle = (k: string) => { for (const c of k) out.push({ k: c, boyut, kayma }); };
    const arguman = (b: number, ka: Kayma): Duz[] => {
      while (s[i] === ' ') i++;
      if (s[i] === '{') { i++; return grup(b, ka, '}'); }
      if (s[i] === '\\') { const kk = komutOku(); return [...(KOMUT[kk] ?? kk)].map(k => ({ k, boyut: b, kayma: ka })); }
      const c = [...s.slice(i)][0] ?? '';
      i += c.length;
      return c ? [{ k: c, boyut: b, kayma: ka }] : [];
    };
    const komutOku = (): string => {
      i++;   // backslash
      const m = /^[A-Za-z]+/.exec(s.slice(i));
      if (m) { i += m[0].length; return m[0]; }
      const c = s[i] ?? ''; i += c.length; return c;
    };
    while (i < s.length) {
      const c = s[i];
      if (bitis && c === bitis) { i++; return out; }
      if (c === '{') { i++; out.push(...grup(boyut, kayma, '}')); continue; }
      if (c === '}') { i++; continue; }
      if (c === '^' || c === '_') { i++; out.push(...arguman(boyut * KUCUK, c === '^' ? 'ust' : 'alt')); continue; }
      if (c === '\\') {
        const k = komutOku();
        if (k === 'frac' || k === 'dfrac' || k === 'tfrac') { out.push(...arguman(boyut, kayma), { k: '/', boyut, kayma }, ...arguman(boyut, kayma)); continue; }
        if (k === 'sqrt') { ekle('√'); out.push(...arguman(boyut, kayma)); continue; }
        if (k === 'vec' || k === 'overrightarrow') { out.push(...arguman(boyut, kayma), { k: '→', boyut: boyut * 0.5, kayma, ustOk: true }); continue; }
        ekle(KOMUT[k] ?? k);
        continue;
      }
      const ch = [...s.slice(i)][0];
      i += ch.length;
      ekle(ch);
    }
    return out;
  };
  return grup(1, null, null);
}

// ---- the text of a page → logical lines of characters ----

interface MantikSatir { girinti: number; harfler: Harf[] }

const renkSec = (r: string, atlas: DizgiAyar['atlas']) => (r !== 'diger' && atlas.renkler[r] ? r : RENK_YEDEK);

function parcaHarfleri(p: OcrParca, renk: string): Harf[] {
  const metin = p.duzeltme ?? p.metin;
  if (p.tur === 'formul') return latexDuz(metin).map(d => ({ ...d, renk }));
  return [...metin].map(k => ({ k, renk, boyut: 1, kayma: null }));
}

export function mantikSatirlari(sayfa: Pick<OcrSayfa, 'satirlar'>, atlas: DizgiAyar['atlas']): MantikSatir[] {
  return sayfa.satirlar.map(s => {
    if (!yaziSatiriMi(s)) return { girinti: s.girinti, harfler: [...`[çizim: ${s.cizim}]`].map(k => ({ k, renk: RENK_YEDEK, boyut: NOT_BOYUT, kayma: null, cizim: true })) };
    const harfler: Harf[] = [];
    for (const p of s.parcalar) {
      if (p.ustuCizili) continue;
      const h = parcaHarfleri(p, renkSec(p.renk, atlas));
      if (!h.length) continue;
      const bosluk = (x: Harf | undefined) => !!x && /\s/.test(x.k);
      if (harfler.length && !bosluk(harfler[harfler.length - 1]) && !bosluk(h[0])) harfler.push({ k: ' ', renk: h[0].renk, boyut: 1, kayma: null });
      harfler.push(...h);
    }
    return { girinti: s.girinti, harfler };
  });
}

// ---- layout ----

// −1, 0 or +1 from (line, position, character); FNV-1a
export function oynamaDegeri(satir: number, sira: number, k: string): -1 | 0 | 1 {
  let h = 0x811c9dc5;
  for (const v of [satir, sira, k.codePointAt(0) ?? 0]) {
    for (let b = 0; b < 4; b++) { h ^= (v >>> (b * 8)) & 0xff; h = Math.imul(h, 0x01000193); }
  }
  return (((h >>> 0) % 3) - 1) as -1 | 0 | 1;
}

// A piece of a word: one atlas glyph, or a run drawn with the fallback font
type Parca =
  | { tur: 'glif'; h: Harf; ornek: number; w: number }
  | { tur: 'nokta'; h: Harf; w: number }
  | { tur: 'yedek'; h: Harf; metin: string; w: number };

interface Kelime { parcalar: Parca[]; w: number }

interface Kurulum { xh: number; harf: number; kelime: number; olcek: number; ayar: DizgiAyar; sayac: Map<string, number>; eksik: Set<string> }

const ustOkMu = (p: Parca) => !!p.h.ustOk;

function kelimeKur(harfler: Harf[], k: Kurulum): Kelime {
  const { atlas } = k.ayar;
  const olc = k.ayar.olc ?? tahminiOlc;
  const parcalar: Parca[] = [];
  for (const h of harfler) {
    const oo = h.cizim ? undefined : atlas.karakterler[h.k];
    if (oo?.length) {
      const n = k.sayac.get(h.k) ?? 0;
      k.sayac.set(h.k, n + 1);
      const ornek = n % oo.length;
      parcalar.push({ tur: 'glif', h, ornek, w: oo[ornek].w * k.olcek * h.boyut });
      continue;
    }
    if (h.k === NOKTA && !h.cizim && !h.ustOk) { parcalar.push({ tur: 'nokta', h, w: NOKTA_W * k.xh * h.boyut }); continue; }
    if (!h.cizim) k.eksik.add(h.k);
    const son = parcalar[parcalar.length - 1];
    if (son?.tur === 'yedek' && son.h.renk === h.renk && son.h.boyut === h.boyut && son.h.kayma === h.kayma && !!son.h.cizim === !!h.cizim && !h.ustOk && !son.h.ustOk) {
      son.metin += h.k;
      son.w = olc(son.metin, k.xh * h.boyut, !!h.cizim);
    } else {
      parcalar.push({ tur: 'yedek', h, metin: h.k, w: olc(h.k, k.xh * h.boyut, !!h.cizim) });
    }
  }
  return { parcalar, w: kelimeGenisligi(parcalar, k.harf) };
}

function kelimeGenisligi(parcalar: Parca[], harf: number): number {
  let w = 0, n = 0;
  for (const p of parcalar) { if (ustOkMu(p)) continue; w += p.w; n++; }
  return w + Math.max(0, n - 1) * harf;
}

// A word wider than the line → pieces that fit (between letters)
function bol(kelime: Kelime, genislik: number, harf: number): Kelime[] {
  if (kelime.w <= genislik) return [kelime];
  const out: Kelime[] = [];
  let cur: Parca[] = [];
  for (const p of kelime.parcalar) {
    if (cur.length && !ustOkMu(p) && kelimeGenisligi([...cur, p], harf) > genislik) { out.push({ parcalar: cur, w: kelimeGenisligi(cur, harf) }); cur = []; }
    cur.push(p);
  }
  if (cur.length) out.push({ parcalar: cur, w: kelimeGenisligi(cur, harf) });
  return out;
}

interface FizikSatir { girinti: number; kelimeler: Kelime[] }

// Between two words: the atlas's word gap, but between two fallback runs of the same kind (a drawing note,
// missing characters next to each other) the font's own space, and the two runs become one fillText (birlesir).
function kelimeArasi(a: Kelime, b: Kelime, k: Kurulum): { w: number; birlesir: boolean } {
  const s = a.parcalar[a.parcalar.length - 1], f = b.parcalar[0];
  if (s?.tur === 'yedek' && f?.tur === 'yedek' && !s.h.ustOk && !f.h.ustOk && s.h.renk === f.h.renk && s.h.boyut === f.h.boyut
    && s.h.kayma === f.h.kayma && !!s.h.cizim === !!f.h.cizim) {
    return { w: (k.ayar.olc ?? tahminiOlc)(' ', k.xh * s.h.boyut, !!s.h.cizim), birlesir: true };
  }
  return { w: k.kelime, birlesir: false };
}

function satirlaraBol(mantik: MantikSatir[], k: Kurulum, kenar: number): FizikSatir[] {
  const out: FizikSatir[] = [];
  for (const m of mantik) {
    const girintiPx = m.girinti * GIRINTI * k.xh;
    const genislik = Math.max(k.ayar.en - 2 * kenar - girintiPx, k.xh * 4);
    // words: runs between white space
    const kelimeler: Harf[][] = [[]];
    for (const h of m.harfler) {
      if (/\s/.test(h.k)) { if (kelimeler[kelimeler.length - 1].length) kelimeler.push([]); }
      else kelimeler[kelimeler.length - 1].push(h);
    }
    let satir: FizikSatir = { girinti: m.girinti, kelimeler: [] };
    let x = 0;
    for (const hh of kelimeler.filter(w => w.length)) {
      for (const kel of bol(kelimeKur(hh, k), genislik, k.harf)) {
        const onceki = satir.kelimeler[satir.kelimeler.length - 1];
        const gerek = onceki ? x + kelimeArasi(onceki, kel, k).w + kel.w : kel.w;
        if (onceki && gerek > genislik) { out.push(satir); satir = { girinti: m.girinti, kelimeler: [] }; x = 0; }
        x = satir.kelimeler.length ? gerek : kel.w;
        satir.kelimeler.push(kel);
      }
    }
    out.push(satir);   // an empty line stays an empty line
  }
  return out;
}

function kaymaPx(kayma: Kayma, xh: number): number { return kayma === 'ust' ? 0.8 * xh : kayma === 'alt' ? -0.4 * xh : 0; }

function satirYerlestir(s: FizikSatir, no: number, taban: number, kenar: number, k: Kurulum, oynama: boolean, ogeler: DizgiOge[]): void {
  const { atlas } = k.ayar;
  let x = kenar + s.girinti * GIRINTI * k.xh;
  let sira = 0;
  const olc = k.ayar.olc ?? tahminiOlc;
  s.kelimeler.forEach((kel, ki) => {
    const ara = ki ? kelimeArasi(s.kelimeler[ki - 1], kel, k) : null;
    let onceki: { x: number; w: number } | null = null;
    kel.parcalar.forEach((p, pi) => {
      // the first run of this word joins the previous word's run: one text, the font's own space
      const son = ogeler[ogeler.length - 1];
      if (pi === 0 && ara?.birlesir && son && son.tur !== 'glif' && son.tur !== 'nokta') {
        son.metin += ' ' + (p as Extract<Parca, { tur: 'yedek' }>).metin;
        son.w = olc(son.metin, son.xh, son.tur !== 'yedek');
        onceki = { x: son.x, w: son.w }; x = son.x + son.w; sira++;
        return;
      }
      if (pi === 0 && ara) x += ara.w;
      const tb = taban - kaymaPx(p.h.kayma, k.xh);
      let px = x;
      if (p.h.ustOk && onceki) px = onceki.x + (onceki.w - p.w) / 2;
      else if (onceki) px += k.harf;
      if (p.tur === 'glif') {
        const o = atlas.karakterler[p.h.k][p.ornek];
        const olcek = k.olcek * p.h.boyut;
        const oyna = oynama ? oynamaDegeri(no, sira, p.h.k) * k.olcek : 0;
        const ustOkY = p.h.ustOk ? tb - 1.15 * k.xh : tb - o.taban * olcek;
        ogeler.push({ tur: 'glif', karakter: p.h.k, ornek: p.ornek, renk: p.h.renk, x: px, y: ustOkY + oyna, olcek });
      } else if (p.tur === 'nokta') {
        const xh = k.xh * p.h.boyut;
        ogeler.push({ tur: 'nokta', renk: p.h.renk, x: px + p.w / 2, y: tb - xh / 2, r: NOKTA_R * xh });
      } else {
        const tabanY = p.h.ustOk ? tb - 1.4 * k.xh : tb;
        ogeler.push(p.h.cizim
          ? { tur: 'cizim', metin: p.metin, x: px, taban: tabanY, xh: k.xh * p.h.boyut, w: p.w }
          : { tur: 'yedek', metin: p.metin, renk: p.h.renk, x: px, taban: tabanY, xh: k.xh * p.h.boyut, w: p.w });
      }
      sira++;
      if (!p.h.ustOk) { onceki = { x: px, w: p.w }; x = px + p.w; }
    });
  });
}

function kur(sayfa: Pick<OcrSayfa, 'satirlar'>, ayar: DizgiAyar, xh: number) {
  const { atlas, en } = ayar;
  const k: Kurulum = {
    xh, olcek: xh / atlas.xh, ayar, sayac: new Map(), eksik: new Set(),
    harf: atlas.aralik.harf * xh, kelime: atlas.aralik.kelime * xh
  };
  const kenar = KENAR_ORAN * en;
  const satirlar = satirlaraBol(mantikSatirlari(sayfa, atlas), k, kenar);
  const satirAraligi = SATIR_ARALIGI * xh;
  const ilkTaban = kenar + TABAN_UST * xh;
  const sigan = Math.max(1, Math.floor((ayar.boy - kenar - ALT_PAY * xh - ilkTaban) / satirAraligi) + 1);
  return { k, kenar, satirlar, satirAraligi, ilkTaban, sigan };
}

export function dizgi(sayfa: Pick<OcrSayfa, 'satirlar'>, ayar: DizgiAyar): Dizgi {
  const xh0 = ayar.en / XH_BOLEN;
  let r = kur(sayfa, ayar, xh0);
  for (let f = 0.95; r.satirlar.length > r.sigan && f >= MIN_OLCEK - 1e-9; f -= 0.05) r = kur(sayfa, ayar, xh0 * f);
  if (r.satirlar.length > r.sigan && r.k.xh > xh0 * MIN_OLCEK + 1e-9) r = kur(sayfa, ayar, xh0 * MIN_OLCEK);
  const { k, kenar, satirAraligi, ilkTaban, sigan } = r;
  const kesildi = r.satirlar.length > sigan;
  const satirlar = kesildi ? r.satirlar.slice(0, sigan - 1) : r.satirlar;
  const ogeler: DizgiOge[] = [];
  const oynama = ayar.oynama ?? true;
  satirlar.forEach((s, i) => satirYerlestir(s, i, ilkTaban + i * satirAraligi, kenar, k, oynama, ogeler));
  if (kesildi) {
    const olc = ayar.olc ?? tahminiOlc;
    ogeler.push({ tur: 'not', metin: DEVAMI, x: kenar, taban: ilkTaban + (sigan - 1) * satirAraligi, xh: k.xh * NOT_BOYUT, w: olc(DEVAMI, k.xh * NOT_BOYUT, true) });
  }
  // only characters that were actually placed count as missing
  const eksik = [...k.eksik].filter(c => ogeler.some(o => o.tur === 'yedek' && o.metin.includes(c)));
  return {
    en: ayar.en, boy: ayar.boy, xh: k.xh, kenar, kagit: ayar.kagit ?? VARSAYILAN_KAGIT, satirAraligi, ilkTaban,
    kare: KARE * k.xh, satirSayisi: satirlar.length + (kesildi ? 1 : 0), ogeler, eksik, kesildi
  };
}
