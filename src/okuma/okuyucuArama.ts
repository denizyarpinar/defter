import { gorunurAlaniDuzelt } from '../ui/gorunurAlan';
import { aranamayanNotu, baslangicEslesmesi, bosDurum, listeDegisti, onceki, sayacMetni, sonraki, type AramaDurumu } from './aramaDurumu';
import type { BookPage } from './kitapSayfalari';
import { metinAra, metinsiz, sayfaKutusuna, sorguHazirla, type Dikdortgen } from './metinAra';
import { canvasOlcucu } from './metinOlcu';
import type { MetinOnbellek } from './metinOnbellek';
import { pageKind } from './sayfaIcerik';

// Task 6.3c: the reader's search bar (in the top bar, in place of the title) and the highlights on the pages.
// Searches the open material's list (brifing + sorular, the solution too) with 6.3b's metinAra.
// Reads only; nothing is written anywhere.

export interface AramaHost {
  pages(): BookPage[];
  metin(): MetinOnbellek | null;
  focusPage(): number;
  git(sayfa: number, kutu: Dikdortgen | null): void;   // show this match (PDF: centred; book: its spread)
  katmanlariYenile(): void;                            // the highlight of every mounted page drawn again
}

export interface AramaKatmani { ciz(): void; kaldir(): void }

const GECIKME_MS = 150;     // typing: the search runs this long after the last key
const BEKLE_MS = 120;       // the counter shows "…" only when reading the text takes longer than this
const SVG = 'http://www.w3.org/2000/svg';

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;

// A match on a page: its index in the list and its rectangles (fractions of the page box)
interface SayfaEslesmesi { es: number; kutular: Dikdortgen[] }

export class OkuyucuArama {
  acik = false;
  private d: AramaDurumu = bosDurum();
  private kutular = new Map<number, SayfaEslesmesi[]>();
  private sorguVar = false;
  private gen = 0;
  private timer: number | undefined;
  private bekleyen: { ilk: boolean; bitti: (n: number) => void } | null = null;   // okuyucuAra before the pages came
  private readonly kok = $('#okuyucu');
  private readonly btn = $<HTMLButtonElement>('#oAraBtn');
  private readonly satir = $('#oAra');
  private readonly kutu = $<HTMLInputElement>('#oAraKutu');
  private readonly sayac = $('#oAraSayac');
  private readonly not = $('#oAraNot');
  private readonly oncekiBtn = $<HTMLButtonElement>('#oAraOnceki');
  private readonly sonrakiBtn = $<HTMLButtonElement>('#oAraSonraki');

  constructor(private host: AramaHost) {
    // focus inside the tap: the iPad keyboard opens
    this.btn.addEventListener('click', () => { if (this.acik) this.kapat(); else this.ac(); });
    $('#oAraKapat').addEventListener('click', () => this.kapat());
    this.oncekiBtn.addEventListener('click', () => this.adim(-1));
    this.sonrakiBtn.addEventListener('click', () => this.adim(1));
    this.kutu.addEventListener('input', () => {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => { this.timer = undefined; void this.calistir('yeni'); }, GECIKME_MS);
    });
    this.kutu.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      // typed just now and not searched yet: search first (that goes to the first match)
      if (this.timer !== undefined) { clearTimeout(this.timer); this.timer = undefined; void this.calistir('yeni'); return; }
      this.adim(e.shiftKey ? -1 : 1);
    });
  }

  // Open the bar (the 🔍 button, Ctrl/Cmd+F); open already: its text is selected
  ac(): void {
    if (!this.acik) {
      this.acik = true;
      this.kok.classList.add('arama');
      this.satir.hidden = false;
      this.btn.setAttribute('aria-expanded', 'true');
      this.goster();
    }
    this.kutu.focus({ preventScroll: true });
    this.kutu.select();
  }

  // Close: the query and the highlights are gone, the title comes back
  kapat(): void {
    if (!this.acik) return;
    this.acik = false;
    this.gen++;
    clearTimeout(this.timer); this.timer = undefined;
    this.bekleyen?.bitti(0); this.bekleyen = null;
    const odakta = document.activeElement === this.kutu;
    this.kutu.value = '';
    this.kutu.blur();
    this.kok.classList.remove('arama');
    this.satir.hidden = true;
    this.btn.setAttribute('aria-expanded', 'false');
    this.sifirla();
    if (odakta) gorunurAlaniDuzelt('arama');   // the iPad keyboard was open
  }

  // From outside (6.3e: the library search): open, search q at once; ilkEslesmeyeGit → the first match.
  // The reader still loading its pages: the search runs when they come. Resolves with the number of matches.
  ara(q: string, o: { ilkEslesmeyeGit?: boolean } = {}): Promise<number> {
    this.ac();
    this.kutu.value = q;
    clearTimeout(this.timer); this.timer = undefined;
    this.bekleyen?.bitti(0); this.bekleyen = null;
    if (this.host.pages().length) return this.calistir(o.ilkEslesmeyeGit ? 'ilk' : 'yeni');
    this.gen++;
    this.sifirla();
    this.sorguVar = !!sorguHazirla(q);
    this.d.hazirlaniyor = this.sorguVar;
    this.goster();
    return new Promise(bitti => { this.bekleyen = { ilk: !!o.ilkEslesmeyeGit, bitti }; });
  }

  // The list is empty for now (another material / topic is loading): no results, the query stays
  bosalt(): void {
    if (!this.acik) return;
    this.gen++;
    const q = this.kutu.value;
    this.sifirla();
    this.sorguVar = !!sorguHazirla(q);
    this.d.hazirlaniyor = this.sorguVar;
    this.goster();
  }

  // A new list is on screen (material / tab / solution, pages added): searched again with the same query.
  // esle: where the old current match's page is in the new list (pages added); none: from the page on screen.
  listeDegisti(esle?: (eskiSayfa: number) => number): void {
    if (!this.acik) return;
    if (this.bekleyen) {
      const b = this.bekleyen;
      this.bekleyen = null;
      void this.calistir(b.ilk ? 'ilk' : 'yeni').then(b.bitti);
      return;
    }
    const eski = this.d.gecerli >= 0 && esle ? esle(this.d.eslesmeler[this.d.gecerli].sayfa) : null;
    void this.calistir('liste', eski);
  }

  // The highlight layer of a mounted PDF page (drawn again when the matches or the current one change)
  katman(i: number, box: HTMLElement): AramaKatmani {
    let svg: SVGSVGElement | null = null;
    const kaldir = () => { svg?.remove(); svg = null; };
    return {
      kaldir,
      ciz: () => {
        const list = this.kutular.get(i);
        if (!list?.length) { kaldir(); return; }
        if (!svg) {
          svg = document.createElementNS(SVG, 'svg');
          svg.setAttribute('class', 'o-ara');
          svg.setAttribute('viewBox', '0 0 1 1');
          svg.setAttribute('preserveAspectRatio', 'none');
          svg.setAttribute('aria-hidden', 'true');
        }
        // at the start of the box: over the canvases (no z-index), under the pen layer (same z-index, comes later)
        if (box.firstChild !== svg) box.prepend(svg);
        const r = (k: Dikdortgen, cls: string) => `<rect class="${cls}" x="${k.x}" y="${k.y}" width="${k.w}" height="${k.h}"/>`;
        let html = '', gecerli = '';
        for (const m of list) {
          if (m.es === this.d.gecerli) gecerli += m.kutular.map(k => r(k, 'gecerli')).join('');
          else html += m.kutular.map(k => r(k, '')).join('');
        }
        svg.innerHTML = html + gecerli;   // the current one last: on top
      },
    };
  }

  // ---- inside ----

  private sifirla(): void {
    this.d = bosDurum();
    this.kutular.clear();
    this.sorguVar = false;
    this.goster();
    this.host.katmanlariYenile();
  }

  // 'yeni': a new query (from the page on screen, goes there); 'ilk': the first match of the list (goes there);
  // 'liste': the list changed (keeps the current match near eski, doesn't move the reader)
  private async calistir(tur: 'yeni' | 'ilk' | 'liste', eski: number | null = null): Promise<number> {
    const my = ++this.gen;
    const q = this.kutu.value, m = this.host.metin(), pages = this.host.pages();
    if (!sorguHazirla(q) || !m || !pages.length) { this.sifirla(); return 0; }
    this.sorguVar = true;
    // the text is in memory after the first search: no "…" blinking on every key
    const bekle = window.setTimeout(() => { if (my === this.gen) { this.d.hazirlaniyor = true; this.goster(); } }, BEKLE_MS);
    const tum = await m.hepsi(pages);
    clearTimeout(bekle);
    if (my !== this.gen || this.host.pages() !== pages) return 0;

    const sonuc = metinAra(tum.sayfalar.filter(s => s.hazir).map(s => ({ sayfa: s.indeks, hazir: s.hazir! })), q, canvasOlcucu);
    const gorunum = new Map(tum.sayfalar.map(s => [s.indeks, s.hazir?.sayfa.gorunum]));
    this.kutular.clear();
    sonuc.forEach((e, es) => {
      const g = gorunum.get(e.sayfa)!;
      let list = this.kutular.get(e.sayfa);
      if (!list) this.kutular.set(e.sayfa, list = []);
      list.push({ es, kutular: e.dikdortgenler.map(r => sayfaKutusuna(r, g)) });
    });
    const aranamayan = tum.sayfalar.filter(s => s.hazir ? metinsiz(s.hazir.sayfa) : pageKind(s.sayfa) === 'image').length;
    // PDF pages there, but not one of them could be read (6.3c: iPad Safari's stream): say so, not "bulunamadı"
    const okunamadi = tum.sayfalar.some(s => s.hata) && !tum.sayfalar.some(s => s.hazir);
    const odak = this.host.focusPage();
    const gecerli = tur === 'ilk' ? (sonuc.length ? 0 : -1)
      : tur === 'liste' ? listeDegisti(eski ?? odak, sonuc, odak)
      : baslangicEslesmesi(sonuc, odak);
    this.d = { eslesmeler: sonuc, gecerli, hazirlaniyor: false, aranamayan, okunamadi };
    this.goster();
    this.host.katmanlariYenile();
    if (tur !== 'liste') this.gitGecerli();
    return sonuc.length;
  }

  private adim(yon: 1 | -1): void {
    if (!this.d.eslesmeler.length) return;
    this.d.gecerli = yon > 0 ? sonraki(this.d) : onceki(this.d);
    this.goster();
    this.host.katmanlariYenile();
    this.gitGecerli();
  }

  private gitGecerli(): void {
    const m = this.d.eslesmeler[this.d.gecerli];
    if (!m) return;
    const k = this.kutular.get(m.sayfa)?.find(x => x.es === this.d.gecerli)?.kutular;
    this.host.git(m.sayfa, k?.length ? birlesik(k) : null);
  }

  private goster(): void {
    this.sayac.textContent = sayacMetni(this.d, this.sorguVar);
    this.sayac.classList.toggle('yok', this.sorguVar && !this.d.hazirlaniyor && !this.d.eslesmeler.length);
    const not = aranamayanNotu(this.d, this.sorguVar);
    this.not.hidden = !not;
    this.not.title = not?.uzun ?? '';
    this.not.innerHTML = not ? `<span class="o-ara-uzun">${not.uzun}</span><span class="o-ara-kisa">${not.kisa}</span>` : '';
    const yok = !this.d.eslesmeler.length;
    this.oncekiBtn.disabled = this.sonrakiBtn.disabled = yok;
  }
}

// The box around a match's rectangles (a match over a line end has two)
function birlesik(k: Dikdortgen[]): Dikdortgen {
  const x = Math.min(...k.map(r => r.x)), y = Math.min(...k.map(r => r.y));
  return { x, y, w: Math.max(...k.map(r => r.x + r.w)) - x, h: Math.max(...k.map(r => r.y + r.h)) - y };
}
