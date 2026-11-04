import { t } from '../dil';
import { genelAdi, listeAyristir, listeYaz } from '../kitap/kitapListesi';
import type { Book } from '../model/types';
import { sihirbazDurumu, type SihirbazKilidi } from './kitapSihirbaziDurumu';

export const quickBookEnabled = (search = typeof location === 'undefined' ? '' : location.search): boolean =>
  new URLSearchParams(search).get('hizliKitap') !== '0';

export const newBookShortcut = (drive: boolean, writable: boolean, _count: number, largeVisible: boolean, enabled = true): boolean =>
  enabled && drive && writable && !largeVisible;

// One list is authoritative, including while its editor is collapsed. No second draft.
export class SharedBookForm {
  name = '';
  text = '';
  detailsOpen = false;
  detailsUsed = false;
  constructor(public shelfId: string, public color: string) {}
  get units() { return listeAyristir(this.text).uniteler; }
  get simple(): boolean {
    const units = this.units;
    return !units.length || (units.length === 1 && units[0].ad === genelAdi() && units[0].konular.length <= 1);
  }
  get firstTopic(): string { return this.units[0]?.konular[0] ?? ''; }
  setFirstTopic(value: string): void {
    if (!this.simple) return;
    this.text = value.trim() ? listeYaz([{ ad: genelAdi(), konular: [value.trim()] }]) : '';
  }
  toggleDetails(): void { this.detailsOpen = !this.detailsOpen; this.detailsUsed = true; }
  state(ids: readonly string[], lock: SihirbazKilidi) {
    const state = sihirbazDurumu({ ad: this.name, rafId: this.shelfId, renk: this.color, metin: this.text }, ids, lock);
    if (!this.detailsUsed && !this.firstTopic) {
      state.olusturAcik = false;
      state.neden = state.plan.engel ?? t('sihirbaz.ilkKonuGerekli');
    }
    return state;
  }
}

// A request is consumed only by the matching desk event; replaced data cannot open an old book.
export class PendingBookOpening {
  private request: { book: Book; path: string } | null = null;
  set(book: Book, path: string): void { this.request = { book, path }; }
  clear(): void { this.request = null; }
  take(id: string, book: Book): { unit: number; topic: number } | null {
    const r = this.request;
    if (!r || r.book.id !== id) return null;
    this.clear();
    if (r.book !== book) return null;
    for (const [unit, u] of book.uniteler.entries()) {
      const topic = u.konular.findIndex(k => k.klasor === r.path);
      if (topic >= 0) return { unit, topic };
    }
    return null;
  }
}
