import type { Book } from '../model/types';
import { bookUnits, usesUnits } from '../model/units';
import { MATERIAL_LABEL, type MaterialKind } from '../okuma/konuKesfi';
import { sayfaHazirla, sorguHazirla } from '../okuma/metinAra';
import type { KitaplikSonucu } from './kitaplikAra';

// Task 6.3e: the library search panel's state, without DOM. What the panel shows (groups, badges, the
// status line), the ↑/↓ choice, and where a result goes. Answers of an old query (cancelled, late) are dropped:
// every change of the query has a new number (istek); an answer with another number changes nothing.

export type Asama =
  | 'bos'      // nothing typed
  | 'kisa'     // one letter
  | 'agac'     // the tree is being built (the first search after opening)
  | 'ad'       // the names are on screen; the text search comes when typing stops (or Enter)
  | 'metin'    // Drive is searching the text
  | 'bitti'
  | 'hata';    // the tree could not be built: no results

export interface PanelDurumu {
  q: string;
  istek: number;
  asama: Asama;
  sonuclar: KitaplikSonucu[];   // in the order shown (groups one after the other)
  eksik: boolean;               // Drive had more
  hata: string | null;          // asama 'hata': the tree; 'bitti': the text search (the names are still there)
  secili: number;               // index in sonuclar, -1: none
  ornek: boolean;               // the sample library: no text search
}

export const bosPanel = (ornek: boolean): PanelDurumu =>
  ({ q: '', istek: 0, asama: 'bos', sonuclar: [], eksik: false, hata: null, secili: -1, ornek });

// The query changed. The old results stay on screen until the new names come (no blinking while typing).
export function yeniSorgu(d: PanelDurumu, q: string, agacHazir: boolean): PanelDurumu {
  const hazir = !!sorguHazirla(q);
  return {
    ...d, q, istek: d.istek + 1, eksik: false, hata: null, secili: -1,
    asama: hazir ? (agacHazir ? 'ad' : 'agac') : q.trim() ? 'kisa' : 'bos',
    sonuclar: hazir ? d.sonuclar : [],
  };
}

// The same query again ("Tekrar dene", the library changed): a new number, the results go
export const tekrarSorgu = (d: PanelDurumu, agacHazir: boolean): PanelDurumu => ({ ...yeniSorgu(d, d.q, agacHazir), sonuclar: [] });

// The library changed under a kept query (another sample / Drive library): the same query, nothing of the old one
export const kaynakDegisti = (d: PanelDurumu, ornek: boolean): PanelDurumu => ({ ...bosPanel(ornek), q: d.q, istek: d.istek + 1 });

export function adlarGeldi(d: PanelDurumu, istek: number, l: readonly KitaplikSonucu[]): PanelDurumu {
  // the text search's answer came first (Enter at once): it has the names too
  if (istek !== d.istek || d.asama === 'bitti') return d;
  return secimiKoru(d, { ...d, sonuclar: gosterimSirasi(l), asama: d.asama === 'metin' ? 'metin' : d.ornek ? 'bitti' : 'ad' });
}

export function metinBasladi(d: PanelDurumu, istek: number): PanelDurumu {
  if (istek !== d.istek || d.ornek || !sorguHazirla(d.q)) return d;
  return { ...d, asama: 'metin', hata: null };
}

export function metinGeldi(d: PanelDurumu, istek: number, r: { sonuclar: readonly KitaplikSonucu[]; eksik: boolean; driveHata?: string }): PanelDurumu {
  if (istek !== d.istek) return d;
  return secimiKoru(d, { ...d, sonuclar: gosterimSirasi(r.sonuclar), asama: 'bitti', eksik: r.eksik, hata: r.driveHata ?? null });
}

export function hataGeldi(d: PanelDurumu, istek: number, mesaj: string): PanelDurumu {
  if (istek !== d.istek) return d;
  return { ...d, asama: 'hata', hata: mesaj, sonuclar: [], secili: -1 };
}

// ---- groups ----

export type GrupAdi = 'kitap' | 'konu' | 'ad' | 'metin';
export const GRUP_BASLIGI: Record<GrupAdi, string> = { kitap: 'Kitaplar', konu: 'Konular', ad: 'Dosya adında', metin: 'Dosyanın metninde' };
const GRUP_SIRASI: readonly GrupAdi[] = ['kitap', 'konu', 'ad', 'metin'];

export const grupOf = (s: KitaplikSonucu): GrupAdi => s.eslesme === 'ikisi' ? 'ad' : s.eslesme;

// kitaplikAra's order inside a group; the groups in GRUP_SIRASI; the files in no topic last in their group
export function gosterimSirasi(l: readonly KitaplikSonucu[]): KitaplikSonucu[] {
  const yer = new Map(l.map((s, i) => [s, i]));
  return [...l].sort((a, b) =>
    GRUP_SIRASI.indexOf(grupOf(a)) - GRUP_SIRASI.indexOf(grupOf(b))
    || Number(a.konuDisi) - Number(b.konuDisi)
    || yer.get(a)! - yer.get(b)!);
}

export interface Grup { ad: GrupAdi; baslik: string; ogeler: { s: KitaplikSonucu; i: number }[] }

// The results (already in gosterimSirasi) cut into their groups; i = index in sonuclar
export function gruplar(sonuclar: readonly KitaplikSonucu[]): Grup[] {
  const out: Grup[] = [];
  sonuclar.forEach((s, i) => {
    const ad = grupOf(s);
    let g = out[out.length - 1];
    if (!g || g.ad !== ad) out.push(g = { ad, baslik: GRUP_BASLIGI[ad], ogeler: [] });
    g.ogeler.push({ s, i });
  });
  return out;
}

// ---- choosing with ↑ / ↓ ----

export const secilebilir = (s: KitaplikSonucu) => !s.konuDisi;

// One step; files in no topic are skipped; at the ends it stays. Nothing chosen: ↓ the first, ↑ the last.
export function secimAdim(d: PanelDurumu, yon: 1 | -1): PanelDurumu {
  const l = d.sonuclar;
  let i = d.secili < 0 ? (yon > 0 ? -1 : l.length) : d.secili;
  for (i += yon; i >= 0 && i < l.length; i += yon) if (secilebilir(l[i])) return { ...d, secili: i };
  return d;
}

// A result's identity across two lists of the same query (names, then names + text)
export const sonucAnahtari = (s: KitaplikSonucu) => s.dosyaId ?? `${s.eslesme}|${s.kitapId}|${s.konuSira ?? ''}`;

function secimiKoru(eski: PanelDurumu, yeni: PanelDurumu): PanelDurumu {
  const s = eski.sonuclar[eski.secili];
  const k = s ? sonucAnahtari(s) : null;
  return { ...yeni, secili: k ? yeni.sonuclar.findIndex(x => sonucAnahtari(x) === k) : -1 };
}

// ---- the status line ----

export interface DurumSatiri { metin: string; hata: boolean; tekrar: boolean }

export function durumMetni(d: PanelDurumu): DurumSatiri | null {
  const bilgi = (metin: string): DurumSatiri => ({ metin, hata: false, tekrar: false });
  switch (d.asama) {
    case 'bos': return null;
    case 'kisa': return bilgi('En az 2 harf yaz.');
    case 'agac': return bilgi('Kitaplık taranıyor…');
    case 'hata': return { metin: d.hata ?? 'Arama yapılamadı.', hata: true, tekrar: true };
    case 'metin': return bilgi('Metinde aranıyor…');
    case 'ad': return null;
    case 'bitti': {
      const parcalar: string[] = [];
      if (!d.sonuclar.length) parcalar.push('Sonuç yok');
      if (d.ornek) parcalar.push('Örnek kitaplıkta metin araması yok');
      if (d.hata) return { metin: [...parcalar, d.hata].join(' · '), hata: true, tekrar: true };
      if (d.eksik) parcalar.push('Daha çok sonuç var, aramayı daralt');
      return parcalar.length ? bilgi(parcalar.join(' · ')) : null;
    }
  }
}

// ---- one row ----

const ESLESME_ROZETI: Record<KitaplikSonucu['eslesme'], string> = { ad: 'Ad', metin: 'Metin', ikisi: 'Ad + Metin', konu: 'Konu', kitap: 'Kitap' };

export interface SatirBilgisi {
  yol: string;           // small grey line above: "Kitap › Konu"
  ad: string;            // file name without .pdf / topic / book title
  rozetler: string[];    // "Ad", "Özet", "Çözüm", "konu dışı", …
}

export const dosyaAdi = (ad: string) => ad.trim().replace(/\.pdf$/i, '');

export function satirBilgisi(s: KitaplikSonucu): SatirBilgisi {
  const rozetler = [ESLESME_ROZETI[s.eslesme]];
  if (s.materyal) rozetler.push(MATERIAL_LABEL[s.materyal as MaterialKind]);
  if (s.cozumMu) rozetler.push('Çözüm');
  if (s.konuDisi) rozetler.push('konu dışı');
  if (s.elYazisi) rozetler.push('el yazısı');   // 6.4c-3
  if (s.eslesme === 'kitap') return { yol: '', ad: s.ad, rozetler };
  if (s.eslesme === 'konu') return { yol: [s.kitapBaslik, s.uniteBaslik].filter(Boolean).join(' › '), ad: s.ad, rozetler };
  return { yol: [s.kitapBaslik, s.konuBaslik].filter(Boolean).join(' › '), ad: dosyaAdi(s.ad), rozetler };
}

// Where q is inside a shown name: [start, end) in the name's characters, null: not in it. The same search form
// as the search itself (ä = ae, ß = ss, ı/İ = i, no case), so "fehleranfaellig" marks "Fehleranfällig".
export function vurguAraligi(ad: string, q: string): [number, number] | null {
  const n = sorguHazirla(q);
  if (!n) return null;
  const birim = [1, 0, 0, 1, 0, 0];
  const h = sayfaHazirla({ parcalar: [{ str: ad, transform: birim, width: 0, height: 0, hasEOL: false }], gorunum: { transform: birim, width: 0, height: 0 } });
  const i = h.metin.indexOf(n);
  if (i < 0) return null;
  const bas = h.konum[i].harf;
  // the end: after the character the match's last letter came from (ä → "ae": both letters from one)
  let bit = h.konum[i + n.length - 1].harf;
  bit += String.fromCodePoint(ad.codePointAt(bit)!).length;
  while (bit < ad.length && /\p{M}/u.test(ad[bit])) bit++;   // a combining mark after it
  return [bas, bit];
}

// ---- where a result goes ----

// The topic's place in the book (units one after the other) → its unit and index in it, as bookUnits
export function konuKonumu(b: Book, sira: number): { unit: number; topic: number } | null {
  if (!(sira >= 0)) return null;
  let kalan = sira;
  const units = bookUnits(b);
  for (let u = 0; u < units.length; u++) {
    if (kalan < units[u].konular.length) return { unit: u, topic: kalan };
    kalan -= units[u].konular.length;
  }
  return null;
}

export const SEKMEDE_YOK = 'Bu dosya konunun sekmelerinde yok; konu açıldı.';

export type GidisPlani =
  | { tur: 'kitap'; kitapId: string }
  | {
      tur: 'okuyucu'; kitapId: string; unit: number; topic: number;
      dosya?: { materyal: MaterialKind; ad: string };   // open this tab at this file's first page
      metinAra: boolean;                               // then the reader searches q (first match)
      uyari?: string;
    };

// null: the result can't be opened (a file in no topic, a topic no longer in the book)
export function gidisPlani(s: KitaplikSonucu, b: Book): GidisPlani | null {
  if (s.eslesme === 'kitap') return { tur: 'kitap', kitapId: b.id };
  if (s.konuDisi || s.konuSira === undefined) return null;
  const k = konuKonumu(b, s.konuSira);
  if (!k) return null;
  const base = { tur: 'okuyucu' as const, kitapId: b.id, ...k };
  if (s.eslesme === 'konu') return { ...base, metinAra: false };
  const metin = s.eslesme === 'metin' || s.eslesme === 'ikisi';
  if (s.materyal) return { ...base, dosya: { materyal: s.materyal, ad: s.ad }, metinAra: metin };
  // surum 1: the chapter (its pages are the file's); surum 2: a file in the topic folder, not one of its tabs
  return usesUnits(b) ? { ...base, metinAra: false, uyari: SEKMEDE_YOK } : { ...base, metinAra: metin };
}
