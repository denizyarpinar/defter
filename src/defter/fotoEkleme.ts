import type { BekleyenFotoDepo } from './bekleyenFoto';
import { yeniKayit, yuklemeBasla, yuklemeHata, type BekleyenFoto, type YeniKayitGirdisi } from './bekleyenFotoKayit';
import { basariMetni, durumMetni, kartMetni, kisaNeden } from './fotoEklemeMetin';
import { konuyaFotografEkle, type KonuEklemeOrtami, type KonuyaEklendi } from './konuyaEkle';

// Task 5.8f: "Ekle" for real. The photos go into the device's store first (before any network),
// then to Drive (konuyaFotografEkle, through the pen's queue), and the record is removed only after that.
// A failure keeps the record ('hata'); "Tekrar dene" runs it again with the same islemId, so the pages are
// never added twice. One adding at a time, in the order asked. No automatic retry.

export interface FotoEklemeUI {
  durum(metin: string | null): void;                    // "2 fotoğraf ekleniyor…" / nothing going on
  basari(k: BekleyenFoto, metin: string, r: KonuyaEklendi): void;   // r: task 5.8g (the reader refreshes)
  hata(k: BekleyenFoto, metin: string): void;           // the record stays on the device
}

export interface FotoEkleyiciBaglam {
  depo: Pick<BekleyenFotoDepo, 'kaydet' | 'durumGuncelle' | 'sil'>;
  ortam: () => KonuEklemeOrtami;
  ui: FotoEklemeUI;
  ekle?: typeof konuyaFotografEkle;   // tests
  simdi?: () => string;
}

export class FotoEkleyici {
  private readonly sirada = new Map<string, number>();   // islemId → photos (waiting or running)
  private zincir: Promise<unknown> = Promise.resolve();

  constructor(private readonly b: FotoEkleyiciBaglam) {}

  private simdi(): string { return this.b.simdi?.() ?? new Date().toISOString(); }

  calisanlar(): ReadonlySet<string> { return new Set(this.sirada.keys()); }

  // "Ekle": the record is saved; a failing store (quota, no IndexedDB) rejects and nothing goes to Drive
  async baslat(g: YeniKayitGirdisi): Promise<BekleyenFoto> {
    const k = yeniKayit(g, this.simdi());
    await this.b.depo.kaydet(k);
    this.sirayaKoy(k);
    return k;
  }

  // "Tekrar dene" / "Şimdi ekle". false: this record is already waiting or running.
  sirayaKoy(k: BekleyenFoto): boolean {
    if (this.sirada.has(k.islemId)) return false;
    this.sirada.set(k.islemId, k.jpegler.length);
    this.bildir();
    const p = this.zincir.then(() => this.calistir(k));
    this.zincir = p.catch(() => undefined);
    return true;
  }

  // Waits for everything asked so far (tests)
  bekle(): Promise<unknown> { return this.zincir; }

  private bildir(): void {
    let n = 0;
    for (const v of this.sirada.values()) n += v;
    this.b.ui.durum(durumMetni(n));
  }

  private async calistir(eski: BekleyenFoto): Promise<void> {
    const { depo, ui } = this.b;
    const id = eski.islemId;
    try {
      let k: BekleyenFoto | null;
      try {
        k = await depo.durumGuncelle(id, x => yuklemeBasla(x, this.simdi()));
      } catch (e) {
        ui.hata(eski, kartMetni(kisaNeden(e)));
        return;
      }
      if (!k) return;   // no record: an earlier run finished it
      let r;
      try {
        r = await (this.b.ekle ?? konuyaFotografEkle)(k.konuKlasorId, k.jpegler, this.b.ortam(), { islemId: k.islemId, hedefFileId: k.hedefFileId });
      } catch (e) {
        const neden = kisaNeden(e);
        console.warn('Fotoğraflar eklenemedi.', e);
        try { await depo.durumGuncelle(id, x => yuklemeHata(x, neden, this.simdi())); }
        catch (e2) { console.warn('Bekleyen kaydın durumu yazılamadı.', e2); }
        ui.hata(k, kartMetni(neden));   // the record is NOT removed
        return;
      }
      // a failing removal only leaves the record: the next try finds the pages there (zatenVardi)
      try { await depo.sil(id); } catch (e) { console.warn('Eklenen fotoğrafların kaydı silinemedi.', e); }
      ui.basari(k, basariMetni(r), r);
    } finally {
      this.sirada.delete(id);
      this.bildir();
    }
  }
}
