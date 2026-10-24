import { driveMetinAra, type OcrBulgusu } from '../drive/aramaDrive';
import { saltOkunurFetch, type Getirici } from '../drive/saltOkunur';
import { MATERIAL_KINDS, type MaterialKind } from '../okuma/konuKesfi';
import { sorguHazirla } from '../okuma/metinAra';
import { adEsle } from './adEsle';
import { agacAl, agacBellekte, type AgacDosyasi, type AgacKitabi, type AgacKonusu, type AgacOrtami, type KitaplikAgaci } from './kitaplikAgaci';

// Task 6.3d: searching the whole library (no UI yet; 6.3e). Two steps:
// 1. names on the device (book titles, topic titles, file names) as soon as the tree is ready → adGeldi
// 2. the files' text with Drive fullText (whole words), only files the tree knows
// Order: matching books, then topics, then files whose name matches, then files with the text;
// inside a group: book order (shelves), topic order (kitap.json), topic-less files last.

export type EslesmeTuru = 'kitap' | 'konu' | 'ad' | 'metin' | 'ikisi';

export interface KitaplikSonucu {
  dosyaId?: string;         // only for files
  ad: string;               // file name / topic title / book title
  kitapId: string;
  kitapBaslik: string;
  uniteBaslik?: string;
  konuBaslik?: string;
  konuKlasor?: string;      // surum 2
  konuSira?: number;        // the topic's place in the book (surum 1 has no folder)
  materyal: MaterialKind | null;
  cozumMu: boolean;
  eslesme: EslesmeTuru;
  konuDisi: boolean;        // a file in no topic
  elYazisi?: boolean;       // 6.4c-3: found in the file's handwriting record (<pdf>.ocr.json)
}

export interface KitaplikAramaSonucu {
  q: string;
  sonuclar: KitaplikSonucu[];
  sureler: { agac: number; agacBellekten: boolean; ad: number; drive: number };
  driveIstek: number;
  eksik: boolean;           // Drive had more results than were fetched
  driveHata?: string;       // the text search failed; the name results are still there
}

const GRUP_SIRASI: Record<EslesmeTuru, number> = { kitap: 0, konu: 1, ad: 2, ikisi: 2, metin: 3 };
const MATERYAL_SIRASI = (m: MaterialKind | null) => m ? MATERIAL_KINDS.indexOf(m) : MATERIAL_KINDS.length;

interface Sirali { s: KitaplikSonucu; kitapSira: number; konuSira: number }

const kitapSatiri = (k: AgacKitabi): Sirali => ({
  s: { ad: k.baslik, kitapId: k.id, kitapBaslik: k.baslik, materyal: null, cozumMu: false, eslesme: 'kitap', konuDisi: false },
  kitapSira: k.sira, konuSira: -1,
});

const konuSatiri = (t: AgacKonusu): Sirali => ({
  s: {
    ad: t.baslik, kitapId: t.kitap.id, kitapBaslik: t.kitap.baslik, uniteBaslik: t.uniteBaslik, konuBaslik: t.baslik,
    konuKlasor: t.klasor, konuSira: t.sira, materyal: null, cozumMu: false, eslesme: 'konu', konuDisi: false,
  },
  kitapSira: t.kitap.sira, konuSira: t.sira,
});

const dosyaSatiri = (f: AgacDosyasi, eslesme: EslesmeTuru, elYazisi = false): Sirali => ({
  s: {
    dosyaId: f.id, ad: f.ad, kitapId: f.kitap.id, kitapBaslik: f.kitap.baslik,
    uniteBaslik: f.konu?.uniteBaslik, konuBaslik: f.konu?.baslik, konuKlasor: f.konu?.klasor, konuSira: f.konu?.sira,
    materyal: f.materyal, cozumMu: f.cozumMu, eslesme, konuDisi: !f.konu,
    ...(elYazisi ? { elYazisi } : {}),
  },
  kitapSira: f.kitap.sira, konuSira: f.konu ? f.konu.sira : Infinity,
});

function sirala(l: Sirali[]): KitaplikSonucu[] {
  return l.sort((a, b) =>
    GRUP_SIRASI[a.s.eslesme] - GRUP_SIRASI[b.s.eslesme]
    || a.kitapSira - b.kitapSira
    || a.konuSira - b.konuSira
    || MATERYAL_SIRASI(a.s.materyal) - MATERYAL_SIRASI(b.s.materyal)
    || Number(a.s.cozumMu) - Number(b.s.cozumMu)
    || a.s.ad.localeCompare(b.s.ad, 'de', { numeric: true, sensitivity: 'base' })
  ).map(x => x.s);
}

// The results from the tree and the ids Drive found by text (null: not there yet). Ids the tree doesn't
// know (outside Kitaplık, in the trash, temporary files, the .ocr.json records themselves) are dropped.
// A matching book: only its row, not its topics' rows.
// 6.4c-3: ocr = the handwriting records Drive found; each counts for its PDF (a text result marked
// elYazisi), only when the PDF is in the tree and the record lies in the PDF's own folder.
export function birlestir(agac: Pick<KitaplikAgaci, 'kitaplar' | 'konular' | 'dosyalar'>, q: string, metinIdleri: ReadonlySet<string> | null, ocr: readonly OcrBulgusu[] = []): KitaplikSonucu[] {
  if (!sorguHazirla(q)) return [];
  const kitaplar = adEsle(agac.kitaplar, q);
  const kitapIdleri = new Set(kitaplar.map(k => k.id));
  const konular = adEsle(agac.konular, q).filter(t => !kitapIdleri.has(t.kitap.id));
  const adla = new Set(adEsle(agac.dosyalar, q).map(f => f.id));
  const elYazili = ocrPdfleri(agac.dosyalar, ocr);
  const dosyalar: Sirali[] = [];
  for (const f of agac.dosyalar) {
    const el = elYazili.has(f.id);
    const ad = adla.has(f.id), metin = !!metinIdleri?.has(f.id) || el;
    if (ad || metin) dosyalar.push(dosyaSatiri(f, ad && metin ? 'ikisi' : ad ? 'ad' : 'metin', el));
  }
  return sirala([...kitaplar.map(kitapSatiri), ...konular.map(konuSatiri), ...dosyalar]);
}

// The PDFs the found records belong to (the record in the PDF's folder; a PDF the tree doesn't know: none)
export function ocrPdfleri(dosyalar: readonly AgacDosyasi[], ocr: readonly OcrBulgusu[]): Set<string> {
  if (!ocr.length) return new Set();
  const byId = new Map(dosyalar.map(f => [f.id, f]));
  return new Set(ocr.filter(o => { const f = byId.get(o.kaynak); return !!f?.klasorId && f.klasorId === o.klasor; }).map(o => o.kaynak));
}

export interface AramaSecenek {
  adGeldi?: (sonuclar: KitaplikSonucu[]) => void;   // the name results, before Drive answers
  signal?: AbortSignal;
  getir?: Getirici;
}

export async function kitaplikAra(q: string, o: AgacOrtami, sec: AramaSecenek = {}): Promise<KitaplikAramaSonucu> {
  const getir = sec.getir ?? saltOkunurFetch;
  const sureler = { agac: 0, agacBellekten: agacBellekte(o), ad: 0, drive: 0 };
  if (!sorguHazirla(q)) return { q, sonuclar: [], sureler, driveIstek: 0, eksik: false };
  let t = performance.now();
  const agac = await agacAl(o, getir);
  sureler.agac = performance.now() - t;
  sec.signal?.throwIfAborted();

  t = performance.now();
  const adlar = birlestir(agac, q, null);
  sureler.ad = performance.now() - t;
  sec.adGeldi?.(adlar);

  try {
    // 6.4c-3/4: always the handwriting records too, and both spellings (ä/ae)
    const m = await driveMetinAra(q, agac.klasorIdleri, getir, sec.signal, { elYazisi: true });
    sureler.drive = m.ms;
    return { q, sonuclar: birlestir(agac, q, m.idler, m.ocr), sureler, driveIstek: m.istek, eksik: m.eksik };
  } catch (e) {
    if (sec.signal?.aborted) throw e;
    return { q, sonuclar: adlar, sureler, driveIstek: 0, eksik: false, driveHata: e instanceof Error ? e.message : String(e) };
  }
}
