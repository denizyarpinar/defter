import { t } from '../dil';
import { SINIR, type ListeUnite } from './kitapListesi';
import { kitapKlasorAdi, klasorAdi } from './klasorAdi';

// Task 6.K4a: what the wizard's "Oluştur" will make (K4b), in order. Pure, tested; nothing is written here.
// - kitaplar/<kitapId>/ → every unit's folder → every topic's folder (in its unit) → kitap.json (last: the book is
//   whole once it is there) → the shelf entry (kitaplik.json: the id at the end of the chosen shelf).
// - No Uebungen/ or Oedevler/ folders (they come with a topic's first file, K6).
// - The cover colour is in kitap.json (kapak.renk), the shelf in kitaplik.json (raflar[].kitaplar).
// - Task 6.K5a: every unit has its folder in kitap.json (uniteler[].klasor).
// - kitap.json: surum 2, the same fields in the same order as the sample book; the names as typed, the folders ASCII.

export interface KitapGirdisi {
  kitapAdi: string;
  rafId: string;
  renk: string;
  uniteler: readonly ListeUnite[];
  mevcutIdler: Iterable<string>;   // the books of the loaded library
}

export type PlanOgesi =
  | { tur: 'klasor'; yol: string }               // relative to kitaplar/; the first one is the book's own folder
  | { tur: 'json'; yol: string }                 // <kitapId>/kitap.json
  | { tur: 'rafKaydi'; rafId: string; kitapId: string };

export interface KitapPlani {
  kitapId: string;
  ogeler: PlanOgesi[];
  kitapJson: Record<string, unknown>;
  engel: string | null;   // about the book's name; the list's own warnings are in listeAyristir
}

export function kitapPlani(g: KitapGirdisi): KitapPlani {
  const baslik = g.kitapAdi.trim();
  const kitapId = kitapKlasorAdi(baslik);
  const ogeler: PlanOgesi[] = [{ tur: 'klasor', yol: kitapId }];
  const uniteYollari = g.uniteler.map((u, i) => klasorAdi('unite', i + 1, u.ad));
  for (const y of uniteYollari) ogeler.push({ tur: 'klasor', yol: `${kitapId}/${y}` });

  let konuNo = 0;   // the topics count on through the whole book (Unite-02 starts with Konu-03)
  const uniteler = g.uniteler.map((u, i) => ({
    baslik: u.ad,
    klasor: uniteYollari[i],   // task 6.K5a: the unit's folder, so a topic can be added to it later
    konular: u.konular.map(k => {
      const klasor = `${uniteYollari[i]}/${klasorAdi('konu', ++konuNo, k)}`;
      ogeler.push({ tur: 'klasor', yol: `${kitapId}/${klasor}` });
      return { baslik: k, klasor, durum: 'okunmadi' };
    })
  }));
  ogeler.push({ tur: 'json', yol: `${kitapId}/kitap.json` });
  ogeler.push({ tur: 'rafKaydi', rafId: g.rafId, kitapId });

  const kitapJson = {
    surum: 2,
    baslik,
    sirt: baslik,
    kod: '',
    ders: '',
    kapak: { renk: g.renk, stil: 'kumas' },
    sonAcilis: null,
    kurdele: null,
    uniteler
  };

  const mevcut = new Set([...g.mevcutIdler].map(id => id.toLowerCase()));
  const engel = !baslik ? t('sihirbaz.adGerekli')
    : [...baslik].length > SINIR.ad ? t('sihirbaz.kitapAdiUzun', { n: SINIR.ad })
    : mevcut.has(kitapId) ? t('sihirbaz.kitapVar', { klasor: kitapId })
    : null;
  return { kitapId, ogeler, kitapJson, engel };
}

// One line each, for the ?olcum=1 box
export function planMetni(p: KitapPlani): string {
  const satir = (o: PlanOgesi) => o.tur === 'rafKaydi' ? `raf: ${o.kitapId} → ${o.rafId} (kitaplik.json)` : `${o.tur === 'klasor' ? 'klasör' : 'dosya'}: kitaplar/${o.yol}`;
  return [`plan: ${p.ogeler.length} öğe${p.engel ? ` · engel: ${p.engel}` : ''}`, ...p.ogeler.map((o, i) => `${i + 1}. ${satir(o)}`)].join('\n');
}
