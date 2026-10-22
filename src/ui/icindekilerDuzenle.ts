import type { IcindekilerIstegi, KayitDurumu } from '../drive/icindekilerYaz';
import type { CopHedefi } from '../kitap/copeAt';
import { kitabaUygula, kitapKonuAnahtari, kitapUniteAnahtarlari, uniteKlasoru, type IcindekilerIslemi } from '../kitap/icindekiler';
import { adTemizle } from '../kitap/kitapListesi';
import type { Book, Unit } from '../model/types';
import { esc } from './dom';
import { duzenleKarari, kayitMetni, SiraBirlestirici, UNITE_KLASORU_YOK } from './icindekilerDurumu';

// Task 6.K5a: the edit mode of the reader's contents panel (#oToc). surum 2 only, a Drive library only.
// - "+ Ünite", "+ Konu" (under a unit), rename (✎ or a double tap), ↑ ↓ (topics inside their unit, the units).
// - Names and order: the book in memory changes at once, the write follows (↑ ↓ taps within 800 ms: one write).
//   Adding: the book changes only after Drive took the folder and kitap.json ("Ekleniyor…" until then).
// - Without a writable context: the buttons are grey; nothing is sent.
// - 6.K5a-2: a name / order change goes with its undo (`geri`, for "Vazgeç" when kitap.json can't be read).
//   The panel is redrawn by the reader on every change of the queue (Okuyucu.ts), not by this class.
// - 6.K5b: a trash button on each unit / topic row and a red "Kitabı çöpe at" at the bottom; they open the dialog
//   (copIste, main.ts). A unit without a known folder: grey + note. surum 1 / no kitap.json: only "Kitabı çöpe at".
//   A row going to the trash shows "Çöpe atılıyor…" until Drive took it (then it leaves the list).

export interface IcindekilerBaglami {
  kilitAcik: boolean;
  hasJson(b: Book): boolean;                                   // a kitap.json in Drive
  uniteKlasorleri(b: Book): Promise<(string | null)[]>;        // per unit: its folder (null: "+ Konu" grey)
  gonder(b: Book, istek: IcindekilerIstegi, geri?: IcindekilerIslemi): void;   // geri: undoes a name / order change
  bekleyenEklemeler(b: Book): IcindekilerIstegi[];             // adds not written yet ("Ekleniyor…")
  durum(): KayitDurumu;
  dinle(fn: () => void): () => void;                           // the queue's state changed / an add landed / Vazgeç
  tekrarDene(): void;
  vazgec(): void;
  girisYap(): void;
  copIste(b: Book, hedef: CopHedefi | { tur: 'kitap' }): void;   // 6.K5b: the trash dialog
  copBekleyenler(b: Book): CopHedefi[];                           // 6.K5b: going to the trash ("Çöpe atılıyor…")
  yonlendir(konu: string): string | null | undefined;             // 6.K5b: a topic that went → where to go instead
}

const COP = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11 M6 4V2.5h4V4 M3.8 4l.8 9.5h6.8l.8-9.5 M6.5 6.5v5 M9.5 6.5v5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>';
const KALEM = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13l1-3.5L10.5 3l2.5 2.5L6.5 12z M9.5 4l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';

type Duzenlenen = { tur: 'unite'; u: number } | { tur: 'konu'; u: number; t: number } | { tur: 'yeniUnite' } | { tur: 'yeniKonu'; u: number };

export class IcindekilerDuzenleyici {
  private book: Book | null = null;
  // per unit (the object: 6.K5b, units leave and come back): its folder; null: still asking Drive
  private klasorler: Map<Unit, string | null> | null = null;
  private duzenlenen: Duzenlenen | null = null;
  private hata: string | null = null;                   // the name typed is not valid
  private taslak: string | null = null;                 // what was typed (kept when the panel is drawn again)
  private bilgi: string | null = null;                  // a note in the status line (e.g. why a button is grey)
  private readonly sira = new SiraBirlestirici(800);
  private readonly siraOncesi = new Map<string, string[]>();   // per ↑ ↓ scope: the order before its first tap
  private readonly liste: HTMLElement;
  private readonly durumKutusu: HTMLElement;
  private readonly baglam: () => IcindekilerBaglami | null;
  private readonly yerDegisti: (fn: () => void) => void;   // keeps the reader's open topic right while units move
  private readonly yeniden: () => void;

  constructor(o: { liste: HTMLElement; durum: HTMLElement; baglam: () => IcindekilerBaglami | null; yerDegisti: (fn: () => void) => void; yeniden: () => void }) {
    this.liste = o.liste;
    this.durumKutusu = o.durum;
    this.baglam = o.baglam;
    this.yerDegisti = o.yerDegisti;
    this.yeniden = o.yeniden;
    this.liste.addEventListener('click', e => this.tikla(e));
    this.liste.addEventListener('dblclick', e => {
      const ad = (e.target as HTMLElement).closest<HTMLElement>('[data-ad]');
      if (ad && this.acik) this.adDuzenle(ad.dataset.ad!);
    });
    this.liste.addEventListener('keydown', e => this.tus(e));
    this.durumKutusu.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-durum]');
      const g = this.baglam();
      if (!b || !g) return;
      if (b.dataset.durum === 'tekrar') g.tekrarDene();
      else if (b.dataset.durum === 'giris') g.girisYap();
      else if (b.dataset.durum === 'vazgec') { this.sira.hemen(); g.vazgec(); }   // a waiting reorder goes first
    });
  }

  get acik(): boolean { return this.book !== null; }

  // The "Düzenle" button for this book (null: no button)
  dugme(b: Book, drive: boolean): ReturnType<typeof duzenleKarari> {
    const g = this.baglam();
    return duzenleKarari({ drive: drive && !!g, hasJson: !!g?.hasJson(b), surum: b.surum, kilitAcik: !!g?.kilitAcik });
  }

  ac(b: Book): void {
    const g = this.baglam();
    if (!g || !this.dugme(b, true).acik) return;
    this.book = b;
    this.duzenlenen = null;
    this.hata = this.bilgi = null;
    this.klasorler = null;
    if (b.surum < 2 || !g.hasJson(b)) { this.klasorler = new Map(); this.ciz(); return; }   // only "Kitabı çöpe at"
    const uniteler = [...b.uniteler];
    g.uniteKlasorleri(b)
      .then(k => { if (this.book === b) { this.klasorler = new Map(uniteler.map((u, i) => [u, k[i] ?? null])); this.ciz(); } })
      .catch(() => { if (this.book === b) { this.klasorler = new Map(); this.bilgi = 'Ünite klasörlerine bakılamadı; şimdilik konu eklenemez.'; this.ciz(); } });
    this.ciz();
  }

  // Edit mode off (the panel closed, "Bitti"); a waiting reorder is sent now
  kapat(): void {
    this.bilgi = null;
    if (!this.book) { this.durumCiz(); return; }
    this.sira.hemen();
    this.book = null;
    this.duzenlenen = null;
    this.durumCiz();
  }

  // The status line also outside the edit mode (a write still going on / failed)
  durumCiz(): void {
    const g = this.baglam();
    const d = g?.durum() ?? { tur: 'bos' };
    const metin = this.bilgi ?? kayitMetni(d);
    const k = this.durumKutusu;
    k.hidden = !metin;
    if (!metin) { k.replaceChildren(); return; }
    k.classList.toggle('hata', d.tur === 'hata' && !this.bilgi);
    const dugmeler = d.tur === 'hata' && !this.bilgi
      ? (d.izin ? '<button type="button" data-durum="giris">Tekrar giriş yap</button>' : '<button type="button" data-durum="tekrar">Tekrar dene</button>')
        + '<button type="button" data-durum="vazgec">Vazgeç</button>'
      : '';
    k.innerHTML = `<span class="ie-metin">${esc(metin)}</span>${dugmeler ? `<span class="ie-dugmeler">${dugmeler}</span>` : ''}`;
  }

  // Shows a note in the status line (e.g. the grey "Düzenle" was tapped)
  not(metin: string): void {
    this.bilgi = metin;
    this.durumCiz();
  }

  ciz(): void {
    const b = this.book;
    if (!b) return;
    const g = this.baglam();
    const karar = this.dugme(b, true);
    const yazar = !!g && karar.yazar;
    if (!yazar && !this.bilgi) this.bilgi = karar.not;
    const kapali = yazar ? '' : ' disabled';
    const kitapCop = `<button type="button" class="ie-kitapcop" data-kitapcop${g && karar.kitapCop ? '' : ' disabled'}>${COP}Kitabı çöpe at</button>`;
    if (b.surum < 2 || !g?.hasJson(b)) {
      // 6.K5b: only the book to the trash (surum 1 / no kitap.json); the why is in the status line
      this.liste.innerHTML = kitapCop;
      this.durumCiz();
      return;
    }
    const bekleyen = g?.bekleyenEklemeler(b) ?? [];
    const copta = new Set((g?.copBekleyenler(b) ?? []).map(h => h.tur === 'konu' ? 'k:' + h.konu : 'u:' + h.klasor));
    const anahtarlar = kitapUniteAnahtarlari(b);
    const d = this.duzenlenen;
    const girdi = (deger: string, yer: string) => `<span class="ie-girdi"><input type="text" value="${esc(this.taslak ?? deger)}" maxlength="120" data-girdi="${yer}" aria-label="Ad" enterkeyhint="done">`
      + `<button type="button" class="ie-ok" data-ie-kaydet>${yer.startsWith('yeni') ? 'Ekle' : 'Kaydet'}</button><button type="button" class="ie-vaz" data-ie-iptal>Vazgeç</button></span>`
      + (this.hata ? `<span class="ie-hata" role="alert">${esc(this.hata)}</span>` : '');

    let html = '';
    const copDugmesi = (yer: string, ne: string, acik: boolean) =>
      `<button type="button" class="ie-ik ie-cop" data-cop="${yer}" aria-label="${ne} çöpe at"${kapali || (acik ? '' : ' disabled')}>${COP}</button>`;
    const copluyor = '<span class="ie-ekleniyor">Çöpe atılıyor…</span>';
    b.uniteler.forEach((u, ui) => {
      const uKlasor = this.uniteKlasoru(u);
      if (uKlasor && copta.has('u:' + uKlasor)) {
        html += `<section class="ie-unite ie-bekliyor"><div class="ie-satir ie-ubas"><span class="ie-ad">${esc(u.baslik)}</span>${copluyor}</div></section>`;
        return;
      }
      const ad = d?.tur === 'unite' && d.u === ui ? girdi(u.baslik, `u${ui}`)
        : `<span class="ie-ad" data-ad="u${ui}">${esc(u.baslik)}</span><button type="button" class="ie-ik" data-yeniad="u${ui}" aria-label="Ünitenin adını değiştir"${kapali}>${KALEM}</button>`;
      const uOklar = d?.tur === 'unite' && d.u === ui ? ''
        : `<button type="button" class="ie-ik" data-yukari="u${ui}" aria-label="Üniteyi yukarı taşı"${kapali || (ui === 0 ? ' disabled' : '')}>↑</button>`
        + `<button type="button" class="ie-ik" data-asagi="u${ui}" aria-label="Üniteyi aşağı taşı"${kapali || (ui === b.uniteler.length - 1 ? ' disabled' : '')}>↓</button>`;
      const uCop = d?.tur === 'unite' && d.u === ui ? '' : copDugmesi(`u${ui}`, 'Üniteyi', !!uKlasor);
      html += `<section class="ie-unite"><div class="ie-satir ie-ubas">${ad}${uOklar}${uCop}</div><ol>`;
      u.konular.forEach((t, ti) => {
        if (t.klasor && copta.has('k:' + kitapKonuAnahtari(t))) {
          html += `<li class="ie-satir ie-bekliyor"><span class="ie-ad">${esc(t.baslik)}</span>${copluyor}</li>`;
          return;
        }
        const tad = d?.tur === 'konu' && d.u === ui && d.t === ti ? girdi(t.baslik, `k${ui}.${ti}`)
          : `<span class="ie-ad" data-ad="k${ui}.${ti}">${esc(t.baslik)}</span><button type="button" class="ie-ik" data-yeniad="k${ui}.${ti}" aria-label="Konunun adını değiştir"${kapali}>${KALEM}</button>`;
        const kOklar = d?.tur === 'konu' && d.u === ui && d.t === ti ? ''
          : `<button type="button" class="ie-ik" data-yukari="k${ui}.${ti}" aria-label="Konuyu yukarı taşı"${kapali || (ti === 0 ? ' disabled' : '')}>↑</button>`
          + `<button type="button" class="ie-ik" data-asagi="k${ui}.${ti}" aria-label="Konuyu aşağı taşı"${kapali || (ti === u.konular.length - 1 ? ' disabled' : '')}>↓</button>`;
        const kCop = d?.tur === 'konu' && d.u === ui && d.t === ti ? '' : copDugmesi(`k${ui}.${ti}`, 'Konuyu', !!t.klasor.trim());
        html += `<li class="ie-satir">${tad}${kOklar}${kCop}</li>`;
      });
      for (const e of bekleyen) if (e.tur === 'konuEkle' && e.unite === anahtarlar[ui]) html += `<li class="ie-satir ie-bekliyor"><span class="ie-ad">${esc(e.baslik)}</span><span class="ie-ekleniyor">Ekleniyor…</span></li>`;
      html += '</ol>';
      if (d?.tur === 'yeniKonu' && d.u === ui) html += `<div class="ie-satir ie-yeni">${girdi('', `yeniKonu${ui}`)}</div>`;
      else {
        const yok = this.klasorler !== null && !uKlasor;
        html += `<button type="button" class="ie-ekle" data-konuekle="${ui}"${kapali || (this.klasorler === null || yok ? ' disabled' : '')}>＋ Konu</button>`;
        if (yok && yazar) html += `<p class="ie-not">${esc(UNITE_KLASORU_YOK)}</p>`;
      }
      html += '</section>';
    });
    for (const e of bekleyen) if (e.tur === 'uniteEkle') html += `<section class="ie-unite ie-bekliyor"><div class="ie-satir ie-ubas"><span class="ie-ad">${esc(e.baslik)}</span><span class="ie-ekleniyor">Ekleniyor…</span></div></section>`;
    html += d?.tur === 'yeniUnite' ? `<div class="ie-satir ie-yeni">${girdi('', 'yeniUnite')}</div>`
      : `<button type="button" class="ie-ekle ie-uekle" data-uniteekle${kapali}>＋ Ünite</button>`;
    html += kitapCop;
    this.liste.innerHTML = html;
    const input = this.liste.querySelector<HTMLInputElement>('[data-girdi]');
    if (input) { input.focus({ preventScroll: true }); input.select(); }
    this.durumCiz();
  }

  // ---- taps ----

  private tikla(e: Event): void {
    const b = this.book;
    if (!b) return;
    const t = e.target as HTMLElement;
    const el = t.closest<HTMLButtonElement>('button');
    if (!el || el.disabled) return;
    e.stopPropagation();
    if (el.matches('[data-ie-kaydet]')) { this.kaydet(); return; }
    if (el.dataset.cop) { this.copeAt(el.dataset.cop); return; }
    if (el.matches('[data-kitapcop]')) { this.sira.hemen(); this.baglam()?.copIste(b, { tur: 'kitap' }); return; }
    if (el.matches('[data-ie-iptal]')) { this.duzenlenen = null; this.hata = this.taslak = null; this.ciz(); return; }
    if (el.dataset.yeniad) { this.adDuzenle(el.dataset.yeniad); return; }
    if (el.dataset.yukari) { this.tasi(el.dataset.yukari, -1); return; }
    if (el.dataset.asagi) { this.tasi(el.dataset.asagi, 1); return; }
    if (el.dataset.konuekle !== undefined) { this.duzenlenen = { tur: 'yeniKonu', u: Number(el.dataset.konuekle) }; this.hata = this.taslak = null; this.ciz(); return; }
    if (el.matches('[data-uniteekle]')) { this.duzenlenen = { tur: 'yeniUnite' }; this.hata = this.taslak = null; this.ciz(); }
  }

  private tus(e: KeyboardEvent): void {
    if (!(e.target as HTMLElement).matches('[data-girdi]')) return;
    if (e.key === 'Enter') { e.preventDefault(); this.kaydet(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.duzenlenen = null; this.hata = this.taslak = null; this.ciz(); }
  }

  private yaziyor(): boolean {
    const b = this.book;
    return !!b && !!this.baglam() && this.dugme(b, true).yazar;
  }

  private adDuzenle(yer: string): void {
    if (!this.yaziyor()) return;
    const [u, t] = yer.slice(1).split('.').map(Number);
    this.duzenlenen = yer[0] === 'u' ? { tur: 'unite', u } : { tur: 'konu', u, t };
    this.hata = this.taslak = null;
    this.ciz();
  }

  private kaydet(): void {
    const b = this.book, d = this.duzenlenen, g = this.baglam();
    const input = this.liste.querySelector<HTMLInputElement>('[data-girdi]');
    if (!b || !d || !g || !input || !this.yaziyor()) return;
    const tur = d.tur === 'unite' || d.tur === 'yeniUnite' ? 'unite' : 'konu';
    const { ad, hata } = adTemizle(input.value, tur);
    if (hata) { this.hata = hata; this.taslak = input.value; this.ciz(); return; }
    this.taslak = null;
    this.sira.hemen();   // a waiting reorder goes first: the changes reach Drive in the order they were made
    this.duzenlenen = null;
    this.hata = null;
    this.bilgi = null;
    if (d.tur === 'unite') {
      const u = b.uniteler[d.u];
      if (u && u.baslik !== ad) {
        const eski = u.baslik;
        const istek: IcindekilerIstegi = { tur: 'uniteAdi', unite: kitapUniteAnahtarlari(b)[d.u], baslik: ad };
        kitabaUygula(b, istek);
        // the undo with the unit's key after the change (a unit without a folder is keyed by its title)
        g.gonder(b, istek, { tur: 'uniteAdi', unite: kitapUniteAnahtarlari(b)[d.u], baslik: eski });
        this.yeniden();
      }
    } else if (d.tur === 'konu') {
      const t = b.uniteler[d.u]?.konular[d.t];
      if (t && t.baslik !== ad) {
        const eski = t.baslik;
        const istek: IcindekilerIstegi = { tur: 'konuAdi', konu: kitapKonuAnahtari(t), baslik: ad };
        kitabaUygula(b, istek);
        g.gonder(b, istek, { tur: 'konuAdi', konu: kitapKonuAnahtari(t), baslik: eski });
        this.yeniden();
      }
    } else if (d.tur === 'yeniUnite') {
      g.gonder(b, { tur: 'uniteEkle', baslik: ad });
    } else {
      g.gonder(b, { tur: 'konuEkle', unite: kitapUniteAnahtarlari(b)[d.u], uniteSira: d.u, baslik: ad });
    }
    this.ciz();
  }

  // A unit's folder: its own (or its topics'), else the one Drive gave when the edit mode opened; null: not known
  private uniteKlasoru(u: Unit): string | null {
    return uniteKlasoru(u.klasor, u.konular.map(t => t.klasor)) || this.klasorler?.get(u) || null;
  }

  // 6.K5b: a unit / topic row's trash button → the dialog (a waiting reorder goes first)
  private copeAt(yer: string): void {
    const b = this.book, g = this.baglam();
    if (!b || !g || !this.yaziyor()) return;
    const [u, t] = yer.slice(1).split('.').map(Number);
    let hedef: CopHedefi | null = null;
    if (yer[0] === 'u') {
      const unite = b.uniteler[u];
      const k = unite && this.uniteKlasoru(unite);
      if (k) hedef = { tur: 'unite', klasor: k };
    } else {
      const konu = b.uniteler[u]?.konular[t];
      if (konu?.klasor.trim()) hedef = { tur: 'konu', konu: kitapKonuAnahtari(konu) };
    }
    if (!hedef) return;
    this.sira.hemen();
    this.duzenlenen = null;
    this.bilgi = null;
    g.copIste(b, hedef);
  }

  private tasi(yer: string, yon: -1 | 1): void {
    const b = this.book, g = this.baglam();
    if (!b || !g || !this.yaziyor()) return;
    this.duzenlenen = null;
    this.bilgi = null;
    if (yer[0] === 'u') {
      const u = Number(yer.slice(1)), h = u + yon;
      if (!b.uniteler[h]) return;
      const sira = kitapUniteAnahtarlari(b);
      if (!this.siraOncesi.has('u')) this.siraOncesi.set('u', [...sira]);
      [sira[u], sira[h]] = [sira[h], sira[u]];
      this.yerDegisti(() => kitabaUygula(b, { tur: 'uniteSirasi', sira }));
      this.sira.bekle('u', () => {
        const once = this.siraOncesi.get('u');
        this.siraOncesi.delete('u');
        g.gonder(b, { tur: 'uniteSirasi', sira: kitapUniteAnahtarlari(b) }, once && { tur: 'uniteSirasi', sira: once });
      });
    } else {
      const [u, t] = yer.slice(1).split('.').map(Number), h = t + yon;
      const konular = b.uniteler[u]?.konular;
      if (!konular?.[h]) return;
      const sira = konular.map(kitapKonuAnahtari);
      const unite = kitapUniteAnahtarlari(b)[u];
      if (!this.siraOncesi.has('k' + unite)) this.siraOncesi.set('k' + unite, [...sira]);
      [sira[t], sira[h]] = [sira[h], sira[t]];
      this.yerDegisti(() => kitabaUygula(b, { tur: 'konuSirasi', unite, sira }));
      // the unit's key at sending time (a rename sent before this one is in the file by then)
      const uniteNesnesi = b.uniteler[u];
      this.sira.bekle('k' + unite, () => {
        const once = this.siraOncesi.get('k' + unite);
        this.siraOncesi.delete('k' + unite);
        const i = b.uniteler.indexOf(uniteNesnesi);
        if (i < 0) return;
        const anahtar = kitapUniteAnahtarlari(b)[i];
        g.gonder(b, { tur: 'konuSirasi', unite: anahtar, sira: uniteNesnesi.konular.map(kitapKonuAnahtari) }, once && { tur: 'konuSirasi', unite: anahtar, sira: once });
      });
    }
    this.yeniden();
    this.ciz();
  }
}
