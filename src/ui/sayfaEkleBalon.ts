import { DESENLER, type Desen, type Yon } from '../defter/bosSayfa';
import { GERI_GETIR_METNI, SIL_METNI, type SilmeHedefi, type Taraf, type YapistirHedefi } from './sayfaEkleDurumu';

// Task 6.S-4: "Sayfa ekle" (+) in the reader's material bar (index.html #oSayfaEkle) and its popover (6.H1b's o-balon,
// as TemizDugme): Önüne / Arkasına, three patterns with a small preview (a tap starts the adding), "Bu sayfayı
// The progress "%NN" on the button and in the popover. Works with the pen on too.
// Task 6.S-4b: book mode, two PDF pages: "Okuduğun sayfa: Sol / Sağ" (the side last touched first).
// Task 6.S-4c: the page read is landscape → "Deftere yapıştır" (a pattern, then "Bu sayfa" / "Dosyadaki tüm yatay
// sayfalar"); pasted → "Deftere yapıştırmayı geri al".
// Task 6.S-4d: "Bu sayfayı sil" (red text) for the page read; "Son silineni geri getir". Grey: the reason under it.
// Decisions: ui/sayfaEkleDurumu.ts.

const DESEN_ADI: Record<Desen, string> = { duz: 'Düz', kareli: 'Kareli', cizgili: 'Çizgili' };
const YON_ADI: Record<Yon, string> = { once: 'Önüne', sonra: 'Arkasına' };

// A small page with the pattern (the PDF's proportions: 5 mm squares, 8 mm lines on A4)
function onizleme(d: Desen): string {
  const w = 30, h = 42, cizgi: string[] = [];
  const adim = d === 'kareli' ? 5 * w / 210 : 8 * w / 210;
  if (d !== 'duz') {
    for (let y = adim; y < h - 0.3; y += adim) cizgi.push(`M0 ${y.toFixed(2)}H${w}`);
    if (d === 'kareli') for (let x = adim; x < w - 0.3; x += adim) cizgi.push(`M${x.toFixed(2)} 0V${h}`);
  }
  return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="1.5" fill="#fbf8f2" stroke="rgba(0,0,0,.25)"/>`
    + (cizgi.length ? `<path d="${cizgi.join('')}" stroke="#bdb6aa" stroke-width=".5" fill="none"/>` : '') + '</svg>';
}

// taraflar (6.S-4b): book mode, the PDF pages on screen (their reader page number); varsayilan: the side shown first
// yapistir (6.S-4c): per side of the spread ('sol' with one page) what "Deftere yapıştır" can do there
// sil (6.S-4d): per side, the page read and why it can't go (null: it can); geriGetir: this session's last deleted page
export interface SilBilgisi { hedef: SilmeHedefi; engel: string | null }
export interface BalonBilgisi {
  engel: string | null; taraflar?: Partial<Record<Taraf, number>>; varsayilan?: Taraf; yapistir?: Partial<Record<Taraf, YapistirHedefi>>;
  sil?: Partial<Record<Taraf, SilBilgisi>>; geriGetir?: { engel: string | null } | null;
}

export interface SayfaEkleOlay {
  bilgi(): Promise<BalonBilgisi>;   // asked when the popover opens (the PDF is checked with pdf-lib)
  ekle(yon: Yon, desen: Desen, taraf: Taraf): void;
  sil(h: SilmeHedefi): void;          // 6.S-4d: asks first (Okuyucu)
  geriGetir(): void;
  yapistir(h: YapistirHedefi & { tur: 'yapistir' }, desen: Desen, hepsi: boolean): void;   // 6.S-4c
  geriAl(h: YapistirHedefi & { tur: 'geriAl' }): void;
}

export class SayfaEkleBalon {
  private btn = document.querySelector<HTMLButtonElement>('#oSayfaEkle')!;
  private pop = document.createElement('div');
  private cover = document.createElement('div');
  private yon: Yon = 'sonra';
  private taraf: Taraf = 'sol';   // 6.S-4b: the page read (book mode)
  private ydesen: Desen = 'kareli';   // 6.S-4c: the bands' pattern
  private bilgi: BalonBilgisi | null = null;
  private yuzde: string | null = null;
  private acilis = 0;

  constructor(private olay: SayfaEkleOlay) {
    this.pop.className = 'o-balon o-sekle-balon';
    this.pop.id = 'oSayfaEkleBalon';
    this.pop.setAttribute('role', 'dialog');
    this.pop.setAttribute('aria-label', 'Boş sayfa ekle');
    this.pop.hidden = true;
    this.cover.className = 'o-perde';
    this.cover.hidden = true;
    this.cover.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.balonKapat(); });
    this.btn.after(this.cover, this.pop);
    this.btn.addEventListener('click', () => { if (!this.balonKapat()) void this.balonAc(); });
    this.pop.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b || b.disabled) return;
      if (b.dataset.yon) { this.yon = b.dataset.yon as Yon; this.ciz(); return; }
      if (b.dataset.taraf) { this.taraf = b.dataset.taraf as Taraf; this.ciz(); return; }
      if (b.dataset.desen) { this.olay.ekle(this.yon, b.dataset.desen as Desen, this.taraf); this.ciz(); return; }
      if (b.dataset.ydesen) { this.ydesen = b.dataset.ydesen as Desen; this.ciz(); return; }
      const y = this.yapistirHedefi();
      if (b.dataset.yapistir && y?.tur === 'yapistir') { this.olay.yapistir(y, this.ydesen, b.dataset.yapistir === 'hepsi'); this.ciz(); return; }
      if (b.dataset.geriAl !== undefined && y?.tur === 'geriAl') { this.balonKapat(); this.olay.geriAl(y); return; }
      if (b.dataset.sil !== undefined) {
        const h = this.silBilgisi();
        if (h && !h.engel) { this.balonKapat(); this.olay.sil(h.hedef); }
        return;
      }
      if (b.dataset.geriGetir !== undefined) { this.balonKapat(); this.olay.geriGetir(); }
    });
    addEventListener('resize', () => this.balonKapat());
  }

  // gorunur: the button at all; yuzde: a job going ("%42", "…"), null: none
  goster(gorunur: boolean, yuzde: string | null): void {
    this.btn.hidden = !gorunur;
    this.yuzde = yuzde;
    if (!gorunur) this.balonKapat();
    const y = this.btn.querySelector<HTMLElement>('.o-sekle-yuzde')!;
    y.textContent = yuzde ?? '';
    y.hidden = yuzde === null;
    this.btn.classList.toggle('calisiyor', yuzde !== null);
    this.btn.setAttribute('aria-label', yuzde !== null ? `Sayfa ekleniyor ${yuzde}` : 'Sayfa ekle');
    this.btn.title = yuzde !== null ? `Sayfa işi sürüyor ${yuzde}` : 'Sayfa ekle';
    if (!this.pop.hidden) this.ciz();
  }

  get acik(): boolean { return !this.pop.hidden; }

  // false: it wasn't open (Okuyucu's Esc: the popover first)
  balonKapat(): boolean {
    if (this.pop.hidden) return false;
    this.pop.hidden = this.cover.hidden = true;
    this.btn.setAttribute('aria-expanded', 'false');
    this.acilis++;
    return true;
  }

  private async balonAc(): Promise<void> {
    const my = ++this.acilis;
    this.bilgi = null;
    this.pop.hidden = this.cover.hidden = false;
    this.btn.setAttribute('aria-expanded', 'true');
    this.ciz();
    this.yerlestir();
    let b: BalonBilgisi;
    try { b = await this.olay.bilgi(); } catch (e) {
      console.warn('Sayfa ekle: PDF okunamadı.', e);
      b = { engel: 'PDF okunamadı; bağlantını kontrol edip tekrar dene.' };
    }
    if (my !== this.acilis) return;
    this.bilgi = b;
    this.taraf = b.varsayilan ?? 'sol';
    this.ciz();
    this.yerlestir();
    this.pop.querySelector<HTMLElement>('[data-desen]:not(:disabled)')?.focus({ preventScroll: true });
  }

  // the page read: the chosen side, else the one there is
  private yapistirHedefi(): YapistirHedefi | null {
    const y = this.bilgi?.yapistir ?? {};
    return y[this.taraf] ?? (this.bilgi?.taraflar?.sol && this.bilgi.taraflar.sag ? null : y.sol ?? y.sag ?? null);
  }

  // 6.S-4d: the page read (as yapistirHedefi)
  private silBilgisi(): SilBilgisi | null {
    const y = this.bilgi?.sil ?? {};
    return y[this.taraf] ?? (this.bilgi?.taraflar?.sol && this.bilgi.taraflar.sag ? null : y.sol ?? y.sag ?? null);
  }

  private silBolumu(): string {
    const h = this.silBilgisi(), g = this.bilgi?.geriGetir;
    const engel = (x: string | null) => this.yuzde !== null ? 'Sayfa işi sürüyor; bitince tekrar dene.' : x;
    let out = '';
    if (h) {
      const e = engel(h.engel);
      out += `<button type="button" class="o-sekle-kaldir o-sekle-sil" data-sil ${e ? 'disabled' : ''}>${SIL_METNI}</button>`
        + (e && e !== this.genelEngel() ? `<div class="o-sekle-not o-sekle-silnot">${e}</div>` : '');
    }
    if (g) out += `<button type="button" class="o-sekle-kaldir" data-geri-getir ${engel(g.engel) ? 'disabled' : ''}>${GERI_GETIR_METNI}</button>`;
    return out ? `<div class="o-sekle-silme" role="group" aria-label="Sayfayı sil">${out}</div>` : '';
  }

  private genelEngel(): string | null {
    return this.yuzde !== null ? 'Sayfa işi sürüyor; bitince tekrar dene.' : this.bilgi?.engel ?? null;
  }

  private yapistirBolumu(kapali: boolean): string {
    const h = this.yapistirHedefi();
    if (!h) return '';
    if (h.tur === 'geriAl') return `<button type="button" class="o-sekle-kaldir" data-geri-al ${this.yuzde !== null ? 'disabled' : ''}>Deftere yapıştırmayı geri al</button>`;
    const desenler = DESENLER.map(d =>
      `<button type="button" class="o-sekle-desen o-sekle-ydesen${d === this.ydesen ? ' on' : ''}" data-ydesen="${d}" aria-pressed="${d === this.ydesen}" ${kapali ? 'disabled' : ''} aria-label="Bantlarda ${DESEN_ADI[d].toLowerCase()}">${onizleme(d)}<span>${DESEN_ADI[d]}</span></button>`).join('');
    const hepsi = h.yataySayisi > 1 ? `<button type="button" data-yapistir="hepsi" ${kapali ? 'disabled' : ''}>Dosyadaki tüm yatay sayfalar (${h.yataySayisi})</button>` : '';
    return `<div class="o-sekle-yapistir" role="group" aria-label="Deftere yapıştır"><div class="o-sekle-baslik">Deftere yapıştır</div>`
      + `<div class="o-sekle-desenler">${desenler}</div>`
      + `<div class="o-sekle-yon o-sekle-ydugmeler"><button type="button" data-yapistir="bu" ${kapali ? 'disabled' : ''}>Bu sayfa</button>${hepsi}</div></div>`;
  }

  private ciz(): void {
    const b = this.bilgi, bekliyor = !b, engel = this.genelEngel();
    const kapali = bekliyor || !!engel;
    const yonlar = (['once', 'sonra'] as const).map(y =>
      `<button type="button" data-yon="${y}" class="${y === this.yon ? 'on' : ''}" aria-pressed="${y === this.yon}">${YON_ADI[y]}</button>`).join('');
    const t = b?.taraflar ?? {};
    const taraflar = t.sol && t.sag ? '<div class="o-sekle-yon o-sekle-taraf" role="group" aria-label="Okuduğun sayfa"><span>Okuduğun sayfa:</span>'
      + (['sol', 'sag'] as const).map(x => `<button type="button" data-taraf="${x}" class="${x === this.taraf ? 'on' : ''}" aria-pressed="${x === this.taraf}">${x === 'sol' ? 'Sol' : 'Sağ'} (s. ${t[x]})</button>`).join('')
      + '</div>' : '';
    const desenler = DESENLER.map(d =>
      `<button type="button" class="o-sekle-desen" data-desen="${d}" ${kapali ? 'disabled' : ''} aria-label="${DESEN_ADI[d]} sayfa ekle (${YON_ADI[this.yon].toLowerCase()})">${onizleme(d)}<span>${DESEN_ADI[d]}</span></button>`).join('');
    const not = this.yuzde !== null ? `Yükleniyor… ${this.yuzde}` : bekliyor ? 'PDF kontrol ediliyor…' : engel ?? 'Desene dokununca boş sayfa eklenir.';
    this.pop.innerHTML = taraflar + `<div class="o-sekle-yon" role="group" aria-label="Nereye">${yonlar}</div>`
      + `<div class="o-sekle-desenler">${desenler}</div>`
      + `<div class="o-sekle-not" aria-live="polite">${not}</div>` + this.yapistirBolumu(kapali) + this.silBolumu();
  }

  // under the bar, centred on the button, kept inside the reader (as temizDugme.ts)
  private yerlestir(): void {
    const host = this.pop.offsetParent?.getBoundingClientRect() ?? new DOMRect(0, 0, innerWidth, innerHeight);
    const bar = this.btn.parentElement!.getBoundingClientRect(), r = this.btn.getBoundingClientRect(), w = this.pop.offsetWidth;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2 - host.left, host.width - w - 8));
    this.pop.style.left = `${Math.round(left)}px`;
    this.pop.style.top = `${Math.round(bar.bottom - host.top + 6)}px`;
  }
}
