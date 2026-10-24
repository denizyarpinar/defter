import type { BekleyenFotoDepo } from './bekleyenFoto';
import { yeniKayit, yuklemeBasla, yuklemeHata, type BekleyenFoto, type YeniKayitGirdisi } from './bekleyenFotoKayit';
import { basariMetni, kartMetni, kisaNeden } from './fotoEklemeMetin';
import { yuklemeDurumMetni, yuzdeHesapla, type EklemeAsamasi, type SiradakiEkleme } from './fotoYuklemeDurumu';
import { konuyaFotografEkle, type KonuEklemeOrtami, type KonuyaEklendi } from './konuyaEkle';
import { hazirlikAl, kb, olc, olcumAcik, olcumAl, olcumBaslat, olcumBitir, type Olcum } from './sureOlcum';

// Task 5.8f: "Ekle" for real. The photos go into the device's store first (before any network),
// then to Drive (konuyaFotografEkle, through the pen's queue), and the record is removed only after that.
// A failure keeps the record ('hata'); "Tekrar dene" runs it again with the same islemId, so the pages are
// never added twice. One adding at a time, in the order asked. No automatic retry.
// Task 6.2e-1: ?olcum=1 → a measurement per adding (sureOlcum.ts); the reader ends it at the toast.
// Task 6.2e-2: the status says which adding waits ("sırada"), which is prepared, which uploads (and how far).

export interface FotoEklemeUI {
  durum(metin: string | null): void;                    // "Fotoğraflar yükleniyor… %42" / nothing going on (only on a change)
  basari(k: BekleyenFoto, metin: string, r: KonuyaEklendi): void;   // r: task 5.8g (the reader refreshes)
  hata(k: BekleyenFoto, metin: string): void;           // the record stays on the device
}

export interface FotoEkleyiciBaglam {
  depo: Pick<BekleyenFotoDepo, 'kaydet' | 'durumGuncelle' | 'sil'>;
  ortam: () => KonuEklemeOrtami;
  ui: FotoEklemeUI;
  // task 6.4c-2: after a successful adding (after ui.basari), not awaited; its errors never reach the adding
  bitti?(k: BekleyenFoto, r: KonuyaEklendi): unknown;
  ekle?: typeof konuyaFotografEkle;   // tests
  simdi?: () => string;
}

export class FotoEkleyici {
  private readonly sirada = new Map<string, SiradakiEkleme>();   // islemId → photos (waiting or running), in order
  private sonMetin: string | null | undefined;
  private zincir: Promise<unknown> = Promise.resolve();

  constructor(private readonly b: FotoEkleyiciBaglam) {}

  private simdi(): string { return this.b.simdi?.() ?? new Date().toISOString(); }

  calisanlar(): ReadonlySet<string> { return new Set(this.sirada.keys()); }

  // "Ekle": the record is saved; a failing store (quota, no IndexedDB) rejects and nothing goes to Drive
  // olcumBaslangic: when "Ekle" was pressed (performance.now, only with ?olcum=1)
  async baslat(g: YeniKayitGirdisi, olcumBaslangic?: number): Promise<BekleyenFoto> {
    const k = yeniKayit(g, this.simdi());
    const o = olcumAcik() ? this.olcumKur(k, 'Fotoğraf ekleme', olcumBaslangic) : undefined;
    try {
      await olc(o, 'cihaza kaydet (IndexedDB)', () => this.b.depo.kaydet(k), { grup: 'cihaz' });
    } catch (e) {
      if (o) { o.bilgi.hata = 'cihaza kaydedilemedi'; olcumBitir(k.islemId); }
      throw e;
    }
    this.sirayaKoy(k);
    return k;
  }

  private olcumKur(k: BekleyenFoto, ad: string, baslangic?: number): Olcum {
    const o = olcumBaslat(k.islemId, ad, baslangic);
    o.bilgi.foto = k.jpegler.length;
    o.bilgi.jpeg = kb(k.jpegler.reduce((t, j) => t + j.bytes.byteLength, 0));
    o.bilgi.hedef = k.hedefAd;
    o.adimlar.push(...hazirlikAl());
    return o;
  }

  // "Tekrar dene" / "Şimdi ekle". false: this record is already waiting or running.
  sirayaKoy(k: BekleyenFoto): boolean {
    if (this.sirada.has(k.islemId)) return false;
    this.sirada.set(k.islemId, { foto: k.jpegler.length, asama: { tur: 'sirada' } });
    olcumAl(k.islemId)?.isaret('sıraya girdi');
    this.bildir();
    const p = this.zincir.then(() => this.calistir(k));
    this.zincir = p.catch(() => undefined);
    return true;
  }

  // Waits for everything asked so far (tests)
  bekle(): Promise<unknown> { return this.zincir; }

  // the strip changes only when its text does (the percent: whole numbers)
  private bildir(): void {
    const m = yuklemeDurumMetni([...this.sirada.values()]);
    if (m === this.sonMetin) return;
    this.sonMetin = m;
    this.b.ui.durum(m);
  }

  private asama(id: string, a: EklemeAsamasi): void {
    const e = this.sirada.get(id);
    if (!e) return;
    e.asama = a;
    this.bildir();
  }

  private sonra(k: BekleyenFoto, r: KonuyaEklendi): void {
    if (!this.b.bitti) return;
    try { void Promise.resolve(this.b.bitti(k, r)).catch(e => console.warn('Ekleme sonrası iş tamamlanmadı.', e)); }
    catch (e) { console.warn('Ekleme sonrası iş tamamlanmadı.', e); }
  }

  private async calistir(eski: BekleyenFoto): Promise<void> {
    const { depo, ui } = this.b;
    const id = eski.islemId;
    // "Tekrar dene" / "Şimdi ekle": a measurement from here
    const o = olcumAl(id) ?? (olcumAcik() ? this.olcumKur(eski, 'Fotoğraf ekleme (tekrar)') : undefined);
    const sira = o?.isaretler.get('sıraya girdi');
    if (o && sira !== undefined) o.adim('foto sırası (önceki eklemeler)', o.gecen() - sira, 'sira');
    const bitir = (hata: string) => { if (o) { o.bilgi.hata = hata; olcumBitir(id); } };
    this.asama(id, { tur: 'hazirlaniyor' });
    try {
      let k: BekleyenFoto | null;
      try {
        k = await olc(o, 'cihaz: durum güncelle', () => depo.durumGuncelle(id, x => yuklemeBasla(x, this.simdi())), { grup: 'cihaz' });
      } catch (e) {
        bitir('durum yazılamadı');
        ui.hata(eski, kartMetni(kisaNeden(e)));
        return;
      }
      if (!k) { bitir('kayıt yok'); return; }   // no record: an earlier run finished it
      let r;
      try {
        const yukleme = {
          basladi: () => this.asama(id, { tur: 'yukleniyor', yuzde: null }),
          ilerleme: (g: number, t: number) => this.asama(id, { tur: 'yukleniyor', yuzde: yuzdeHesapla(g, t) }),
        };
        const secenek = { islemId: k.islemId, hedefFileId: k.hedefFileId, yukleme };
        r = await olc(o, '= Drive\'a ekleme (toplam)', () => (this.b.ekle ?? konuyaFotografEkle)(k.konuKlasorId, k.jpegler, this.b.ortam(), o ? { ...secenek, olcum: o } : secenek), { grup: 'toplam' });
      } catch (e) {
        const neden = kisaNeden(e);
        console.warn('Fotoğraflar eklenemedi.', e);
        try { await depo.durumGuncelle(id, x => yuklemeHata(x, neden, this.simdi())); }
        catch (e2) { console.warn('Bekleyen kaydın durumu yazılamadı.', e2); }
        bitir(neden);
        ui.hata(k, kartMetni(neden));   // the record is NOT removed
        return;
      }
      // a failing removal only leaves the record: the next try finds the pages there (zatenVardi)
      try { await olc(o, 'cihaz: kaydı sil', () => depo.sil(id), { grup: 'cihaz' }); } catch (e) { console.warn('Eklenen fotoğrafların kaydı silinemedi.', e); }
      if (o) { o.bilgi.sayfa = `${r.eskiSayfa}→${r.yeniSayfa}`; if (r.zatenVardi) o.bilgi.zatenVardi = true; }
      ui.basari(k, basariMetni(r), r);
      this.sonra(k, r);
    } finally {
      this.sirada.delete(id);
      this.bildir();
    }
  }
}
