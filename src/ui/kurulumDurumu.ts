import type { AktifKapsam } from '../drive/kapsam';
import type { KokSonucu } from '../drive/kok';

// Task 6.K2b: when the "Kitaplığını kur" card is shown, and its button's click lock. Pure (no DOM, no Drive), tested.
// - No root → "Kitaplığı kur"; the app's own root half set up (defterKok) → "Kurulumu tamamla".
// - The owner's old "Kitaplık" (found by name) is loaded as before, even without kitaplik.json / kitaplar.
// - The owner signed in with drive.file only → the "Tam erişim gerekiyor" card first (task 6.K1).
// - Without an authenticated context the button is grey; a tap sends no request.

export type KurulumDugmesi = 'kur' | 'tamamla';

export function kurulumGerekli(kok: KokSonucu): KurulumDugmesi | null {
  if (kok.tur === 'yok') return 'kur';
  if (kok.tur === 'yarim' && kok.kaynak === 'defterKok') return 'tamamla';
  if (kok.tur === 'cokKok' && kok.eksik.length) return 'tamamla';
  return null;
}

export type KartSecimi =
  | { kart: 'tamErisim' }
  | { kart: 'kurulum'; dugme: KurulumDugmesi; kilitli: boolean }
  | { kart: null };   // load the library

export function kartSec(o: { sahip: boolean; aktif: AktifKapsam | null; kok: KokSonucu; kilitAcik: boolean }): KartSecimi {
  if (o.sahip && o.aktif !== 'tam') return { kart: 'tamErisim' };
  const dugme = kurulumGerekli(o.kok);
  return dugme ? { kart: 'kurulum', dugme, kilitli: !o.kilitAcik } : { kart: null };
}

// One card opening = one islemId (so "Tekrar dene" never makes a second root); one set-up at a time.
export class KurulumAkisi {
  private id = '';
  private mesgul = false;

  constructor(private readonly yeniId: () => string) {}

  get islemId(): string { return this.id; }

  // the card was opened (again, after a new load)
  yeniKart(): void {
    if (!this.mesgul) this.id = this.yeniId();
  }

  // false: unavailable context or already running → no request
  basla(kilitAcik: boolean): boolean {
    if (!kilitAcik || this.mesgul) return false;
    if (!this.id) this.id = this.yeniId();
    this.mesgul = true;
    return true;
  }

  bitti(): void { this.mesgul = false; }
}
