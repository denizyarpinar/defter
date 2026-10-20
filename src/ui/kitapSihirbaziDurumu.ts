import {
  konuEkle, konuTasi, listeAyristir, listeYaz, SINIR, uniteEkle, uniteTasi, yazilmisSatir,
  type AgacKonumu, type ListeSonucu, type ListeUnite, type ListeUyari, type UyariTuru
} from '../kitap/kitapListesi';
import { kitapPlani, type KitapPlani } from '../kitap/kitapPlani';
import {
  AyniKitapVar, hicYazilmadi, KitapOlusturIzinYok, KitapOlusturKilitli, KitapOlusturYazmaYok, YarimKitapVar, yeniKitapIslemi,
  type KitapIslemi
} from '../drive/kitapOlustur';

// Task 6.K4a: the book wizard's state, without the DOM. Pure, tested.
// What is typed (name, shelf, colour, list) → the tree for the preview (warnings at their rows), the warnings
// under the text box, the plan, and whether "Oluştur" can be tapped.
// The tree's + / ↑ / ↓ change the tree and write the list again (listeYaz).
// Task 6.K4b: "Oluştur" opens only with ?kurulum=1. OlusturAkisi keeps one operation (islemId + ids) for "Tekrar dene".
// Task 6.K4c: the owner's "Kitaplık" too (no note of its own any more).

export type SihirbazKilidi = 'acik' | 'kilitli';
export const KILIT_METNI = 'Oluşturma şimdilik kilitli (deneme). Adrese ?kurulum=1 eklenmeli.';

export interface SihirbazGirdisi { ad: string; rafId: string; renk: string; metin: string }

export interface SihirbazUyarisi { satir: number; metin: string; engel: boolean }

export interface AgacSatiri {
  tur: 'unite' | 'konu';
  u: number;
  k: number | null;
  ad: string;
  klasor: string;          // the folder name only (the last part)
  satir: number;           // line in the text
  rozetler: SihirbazUyarisi[];
  yukari: boolean;         // ↑ can move it
  asagi: boolean;
}

export interface SihirbazDurumu {
  liste: ListeSonucu;
  plan: KitapPlani;
  agac: AgacSatiri[];
  uyarilar: SihirbazUyarisi[];   // the list's, by line
  olusturAcik: boolean;
  neden: string;                 // why "Oluştur" is closed
  adHatali: boolean;             // the name itself is the problem (too long, a book already there): red frame (6.K4b-3)
}

const METIN: Record<UyariTuru, string> = {
  genel: `İlk “#” satırından önceki konular “Genel” ünitesine konuldu.`,
  cokUnite: `En fazla ${SINIR.unite} ünite olabilir.`,
  cokKonu: `Bir ünitede en fazla ${SINIR.konu} konu olabilir.`,
  uzunAd: `Ad en fazla ${SINIR.ad} karakter olabilir.`,
  ayniKonu: 'Bu ünitede aynı adlı bir konu daha var.',
  konusuzUnite: 'Bu ünitede henüz konu yok.',
  bosListe: 'En az bir ünite gerekli (“# Ünite adı” satırı).'
};

export const uyariMetni = (u: ListeUyari): SihirbazUyarisi => ({ satir: u.satir, metin: METIN[u.tur], engel: u.engel });

const sonParca = (yol: string) => yol.slice(yol.lastIndexOf('/') + 1);

export function sihirbazDurumu(g: SihirbazGirdisi, mevcutIdler: readonly string[], kilit: SihirbazKilidi = 'kilitli'): SihirbazDurumu {
  const liste = listeAyristir(g.metin);
  const plan = kitapPlani({ kitapAdi: g.ad, rafId: g.rafId, renk: g.renk, uniteler: liste.uniteler, mevcutIdler });
  const uyarilar = liste.uyarilar.map(uyariMetni);
  // the "Genel" unit has no line of its own (it is at its first topic's line): there the unit row shows only the
  // "genel" warning, the topic row the others
  const rozetler = (satir: number, tur: 'unite' | 'konu', genelMi: boolean) => liste.uyarilar
    .filter(l => l.satir === satir && (!genelMi || (l.tur === 'genel') === (tur === 'unite')))
    .map(uyariMetni);

  const json = plan.kitapJson as { uniteler: { konular: { klasor: string }[] }[] };
  const n = liste.uniteler.length;
  const agac: AgacSatiri[] = [];
  liste.uniteler.forEach((un, u) => {
    const uSatir = liste.satirlar.unite[u];
    const genelMi = liste.uyarilar.some(l => l.satir === uSatir && l.tur === 'genel');
    const ogeYolu = plan.ogeler[1 + u];
    agac.push({
      tur: 'unite', u, k: null, ad: un.ad, klasor: ogeYolu?.tur === 'klasor' ? sonParca(ogeYolu.yol) : '',
      satir: uSatir, rozetler: rozetler(uSatir, 'unite', genelMi), yukari: u > 0, asagi: u < n - 1
    });
    un.konular.forEach((ad, k) => {
      const satir = liste.satirlar.konu[u][k];
      agac.push({
        tur: 'konu', u, k, ad, klasor: sonParca(json.uniteler[u].konular[k].klasor), satir,
        rozetler: rozetler(satir, 'konu', genelMi && satir === uSatir),
        yukari: k > 0 || u > 0, asagi: k < un.konular.length - 1 || u < n - 1
      });
    });
  });

  const engel = plan.engel ?? uyarilar.find(x => x.engel)?.metin ?? null;
  const kilitNedeni = kilit === 'kilitli' ? KILIT_METNI : '';
  const adHatali = !!g.ad.trim() && plan.engel !== null;
  return { liste, plan, agac, uyarilar, olusturAcik: !kilitNedeni && !engel, neden: engel ?? kilitNedeni, adHatali };
}

// ---- "Oluştur" (6.K4b) ----

// One operation per wizard: started once, "Tekrar dene" uses it again (the same islemId, the same ids);
// closing the wizard drops it. sifirla: nothing was written and a new name may be chosen.
export class OlusturAkisi {
  private islem_: KitapIslemi | null = null;
  private mesgul_ = false;

  constructor(private readonly yeniId: () => string) {}

  get islem(): KitapIslemi | null { return this.islem_; }
  get mesgul(): boolean { return this.mesgul_; }
  // the fields stay as they were once an operation is there (its plan must not change)
  get alanlarKilitli(): boolean { return this.mesgul_ || this.islem_ !== null; }

  // null: already running
  basla(plan: KitapPlani): KitapIslemi | null {
    if (this.mesgul_) return null;
    this.islem_ ??= yeniKitapIslemi(this.yeniId(), plan);
    this.mesgul_ = true;
    return this.islem_;
  }

  bitti(): void { this.mesgul_ = false; }

  sifirla(): void { if (!this.mesgul_) this.islem_ = null; }
}

export interface OlusturHatasi {
  mesaj: string;
  tekrarDene: boolean;     // "Tekrar dene" (the same operation)
  girisYap: boolean;       // "Tekrar giriş yap" in its place
  duzenlenebilir: boolean; // nothing written: the fields open again, a new operation next time
  adHatasi: boolean;       // a folder with this name is already in Drive: the name box gets a red frame (6.K4b-3)
}

const AG_METNI = "Drive'a bağlanılamadı. İnternet bağlantını kontrol et ve tekrar dene.";

export function olusturHatasi(e: unknown, islem: KitapIslemi | null): OlusturHatasi {
  const mesaj = e instanceof TypeError || !(e instanceof Error) ? AG_METNI : e.message;
  if (e instanceof KitapOlusturIzinYok) return { mesaj, tekrarDene: false, girisYap: true, duzenlenebilir: false, adHatasi: false };
  const bos = !islem || hicYazilmadi(islem);
  if (e instanceof AyniKitapVar || e instanceof YarimKitapVar || e instanceof KitapOlusturKilitli || e instanceof KitapOlusturYazmaYok) {
    const adHatasi = e instanceof AyniKitapVar || e instanceof YarimKitapVar;
    return { mesaj, tekrarDene: false, girisYap: false, duzenlenebilir: bos, adHatasi };
  }
  return { mesaj, tekrarDene: true, girisYap: false, duzenlenebilir: false, adHatasi: false };
}

export type AgacIslemi =
  | { tur: 'konuEkle'; u: number }
  | { tur: 'uniteEkle' }
  | { tur: 'konuTasi'; u: number; k: number; yon: -1 | 1 }
  | { tur: 'uniteTasi'; u: number; yon: -1 | 1 };

// A tap in the tree → the new text and the line of the changed row (to show it)
export function agacIslemi(metin: string, i: AgacIslemi): { metin: string; satir: number; konum: AgacKonumu } {
  const a: ListeUnite[] = listeAyristir(metin).uniteler;
  const r = i.tur === 'konuEkle' ? konuEkle(a, i.u)
    : i.tur === 'uniteEkle' ? uniteEkle(a)
    : i.tur === 'konuTasi' ? konuTasi(a, i.u, i.k, i.yon)
    : uniteTasi(a, i.u, i.yon);
  return { metin: listeYaz(r.agac), satir: yazilmisSatir(r.agac, r.konum.u, r.konum.k), konum: r.konum };
}

// The start and end (character index) of a 1-based line, to select it in the text box
export function satirAraligi(metin: string, satir: number): [number, number] {
  const satirlar = metin.split('\n');
  let bas = 0;
  for (let i = 0; i < satir - 1 && i < satirlar.length; i++) bas += satirlar[i].length + 1;
  return [bas, bas + (satirlar[satir - 1]?.length ?? 0)];
}
