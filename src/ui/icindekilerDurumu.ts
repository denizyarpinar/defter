import type { KayitDurumu } from '../drive/icindekilerYaz';

// Task 6.K5a: the contents' edit mode, the parts without the DOM. Pure, tested.

export interface DuzenleGirdisi {
  drive: boolean;      // a Drive library (the sample one has no edit mode at all)
  hasJson: boolean;    // the book has a kitap.json
  surum: number;
  kilitAcik: boolean;  // ?kurulum=1
}

// goster: the "Düzenle" button is there; acik: it opens the edit mode; yazar: its buttons write; not: why not
export interface DuzenleKarari { goster: boolean; acik: boolean; yazar: boolean; not: string | null }

export function duzenleKarari(g: DuzenleGirdisi): DuzenleKarari {
  if (!g.drive) return { goster: false, acik: false, yazar: false, not: null };
  if (!g.hasJson) return { goster: true, acik: false, yazar: false, not: 'Bu kitapta kitap.json yok; içindekiler düzenlenemez.' };
  if (g.surum < 2) return { goster: true, acik: false, yazar: false, not: 'Eski biçim kitapta (surum 1) içindekiler düzenlenemez.' };
  if (!g.kilitAcik) return { goster: true, acik: true, yazar: false, not: 'Düzenleme şimdilik kilitli (deneme). Denemek için adrese ?kurulum=1 eklenmeli.' };
  return { goster: true, acik: true, yazar: true, not: null };
}

export const UNITE_KLASORU_YOK = 'Bu ünitenin Drive klasörü bilinmiyor; konu eklenemez.';

// The status line at the top of the panel; null: hidden
export function kayitMetni(d: KayitDurumu): string | null {
  switch (d.tur) {
    case 'bos': return null;
    case 'kaydediliyor': return d.ekleme ? 'Ekleniyor…' : 'Kaydediliyor…';
    case 'kaydedildi': return 'Kaydedildi';
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
