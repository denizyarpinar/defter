import { t } from '../dil';
import type { KayitDurumu } from '../drive/icindekilerYaz';
import type { Book } from '../model/types';
import { topicCount, usesUnits } from '../model/units';

// Task 6.K5a: the contents' edit mode, the parts without the DOM. Pure, tested.

export interface DuzenleGirdisi {
  drive: boolean;      // a Drive library (the sample one has no edit mode at all)
  hasJson: boolean;    // the book has a kitap.json
  surum: number;
  kilitAcik: boolean;  // writable context, independent of URL parameters
}

// goster: the "Düzenle" button is there; acik: it opens the edit mode; yazar: its buttons write; not: why not
// kitapCop (6.K5b): "Kitabı çöpe at" works (also in a surum 1 book and one without kitap.json: only that one)
export interface DuzenleKarari { goster: boolean; acik: boolean; yazar: boolean; kitapCop: boolean; not: string | null }

const kilitNotu = () => t('icindekiler.kilitNotu');

export function duzenleKarari(g: DuzenleGirdisi): DuzenleKarari {
  if (!g.drive) return { goster: false, acik: false, yazar: false, kitapCop: false, not: null };
  const kilit = g.kilitAcik ? '' : ' ' + kilitNotu();
  if (!g.hasJson) return { goster: true, acik: true, yazar: false, kitapCop: g.kilitAcik, not: t('icindekiler.jsonYokCop') + kilit };
  if (g.surum < 2) return { goster: true, acik: true, yazar: false, kitapCop: g.kilitAcik, not: t('icindekiler.surum1Cop') + kilit };
  if (!g.kilitAcik) return { goster: true, acik: true, yazar: false, kitapCop: false, not: kilitNotu() };
  return { goster: true, acik: true, yazar: true, kitapCop: true, not: null };
}

// 6.K5b-3: the reader opened from the desk's "İçindekileri düzenle" with no topic open: the text in its page area
export function bosDurumMetni(b: Book, hasJson: boolean): string {
  if (!hasJson) return t('icindekiler.jsonYok');
  if (topicCount(b)) return t('icindekiler.konuSec');
  if (!usesUnits(b)) return t('masa.konuYok');
  return t(b.uniteler.length ? 'icindekiler.konuIleBasla' : 'icindekiler.uniteIleBasla');
}

export const uniteKlasoruYok = () => t('icindekiler.uniteKlasoruYok');

// The status line at the top of the panel; null: hidden
export function kayitMetni(d: KayitDurumu): string | null {
  switch (d.tur) {
    case 'bos': return null;
    case 'kaydediliyor': return t(d.cop === 'at' ? 'cop.atiliyor' : d.cop === 'geri' ? 'cop.geriAliniyor' : d.ekleme ? 'icindekiler.ekleniyor' : 'kalem.kaydediliyor');
    case 'kaydedildi': return t('kalem.kaydedildi');
    case 'hata': return d.mesaj;
  }
}

// ↑ / ↓ taps close together become one write: `gonder` runs `bekleme` ms after the last tap of that scope
// (a unit's topics, or the units). `hemen` sends what is waiting now (before any other change, to keep the order).
export class SiraBirlestirici {
  private bekleyen = new Map<string, { zaman: ReturnType<typeof setTimeout>; gonder: () => void }>();
  private readonly bekleme: number;

  constructor(bekleme = 800) { this.bekleme = bekleme; }

  get bosMu(): boolean { return this.bekleyen.size === 0; }

  bekle(kapsam: string, gonder: () => void): void {
    const eski = this.bekleyen.get(kapsam);
    if (eski) clearTimeout(eski.zaman);
    const zaman = setTimeout(() => { this.bekleyen.delete(kapsam); gonder(); }, this.bekleme);
    this.bekleyen.set(kapsam, { zaman, gonder });
  }

  hemen(): void {
    const hepsi = [...this.bekleyen.values()];
    this.bekleyen.clear();
    for (const b of hepsi) { clearTimeout(b.zaman); b.gonder(); }
  }
}
