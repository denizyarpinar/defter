import type { Stil } from '../elYazisi/basici';
import { dugmeMetni, kisaMetin, type Sayac } from '../elYazisi/temizGorunum';

// Task 6.4e-2: "Temiz yazı (3/8)" in the reader's tab bar, next to "El yazısını oku" (index.html #oTemizGrup).
// One tap: clean handwriting ↔ the original (aria-pressed, like "Çözümü göster"). ≤ 1024 px only the icon and
// "3/8" (styles.css, the 5.10g one-row rule). The ▾ next to it opens a small popover (6.H1b's o-balon) with the
// style: Tükenmez / Yumuşak. With the pen on both are grey.

const STIL_ADI: Record<Stil, string> = { tukenmez: 'Tükenmez', yumusak: 'Yumuşak' };

export interface TemizDugmeDurumu { gorunur: boolean; basili: boolean; gri: boolean; sayac: Sayac; stil: Stil }

export class TemizDugme {
  private grup = document.querySelector<HTMLElement>('#oTemizGrup')!;
  private btn = document.querySelector<HTMLButtonElement>('#oTemiz')!;
  private stilBtn = document.querySelector<HTMLButtonElement>('#oTemizStil')!;
  private pop = document.createElement('div');
  private cover = document.createElement('div');
  private stil: Stil = 'tukenmez';

  constructor(after: HTMLElement, private olay: { degistir(): void; stil(s: Stil): void }) {
    this.pop.className = 'o-balon o-temiz-balon';
    this.pop.id = 'oTemizBalon';
    this.pop.setAttribute('role', 'dialog');
    this.pop.setAttribute('aria-label', 'Temiz yazı stili');
    this.pop.hidden = true;
    this.cover.className = 'o-perde';
    this.cover.hidden = true;
    this.cover.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.balonKapat(); });
    after.after(this.cover, this.pop);
    this.btn.addEventListener('click', () => { this.balonKapat(); this.olay.degistir(); });
    this.stilBtn.addEventListener('click', () => { if (!this.balonKapat()) this.balonAc(); });
    this.pop.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-stil]');
      if (!b) return;
      this.balonKapat();
      this.olay.stil(b.dataset.stil as Stil);
    });
    addEventListener('resize', () => this.balonKapat());
  }

  goster(d: TemizDugmeDurumu): void {
    this.grup.hidden = !d.gorunur;
    this.stil = d.stil;
    if (!d.gorunur || d.gri) this.balonKapat();
    const metin = dugmeMetni(d.sayac);
    const eylem = d.basili ? 'Orijinali göster' : 'Temiz yazıyı göster';
    this.btn.querySelector('.o-uzun')!.textContent = metin;
    this.btn.querySelector('.o-kisa')!.textContent = kisaMetin(d.sayac);
    this.btn.setAttribute('aria-pressed', String(d.basili));
    this.btn.setAttribute('aria-label', `${metin} · ${eylem}`);
    this.btn.title = d.gri ? 'Kalem açıkken sayfalar orijinal' : `${eylem} (${d.sayac.okunmus} okunmuş sayfa)`;
    this.btn.disabled = this.stilBtn.disabled = d.gri;
    this.stilBtn.title = `Stil: ${STIL_ADI[d.stil]}`;
  }

  // false: it wasn't open (Okuyucu's Esc: the popover first)
  balonKapat(): boolean {
    if (this.pop.hidden) return false;
    this.pop.hidden = this.cover.hidden = true;
    this.stilBtn.setAttribute('aria-expanded', 'false');
    return true;
  }

  private balonAc(): void {
    this.pop.innerHTML = (Object.keys(STIL_ADI) as Stil[]).map(s =>
      `<button type="button" data-stil="${s}" class="${s === this.stil ? 'on' : ''}" aria-pressed="${s === this.stil}">${STIL_ADI[s]}</button>`).join('');
    this.pop.hidden = this.cover.hidden = false;
    this.stilBtn.setAttribute('aria-expanded', 'true');
    // under the bar, centred on the ▾, kept inside the reader (as kalemCubugu.ts)
    const host = this.pop.offsetParent?.getBoundingClientRect() ?? new DOMRect(0, 0, innerWidth, innerHeight);
    const bar = this.grup.parentElement!.getBoundingClientRect(), r = this.stilBtn.getBoundingClientRect(), w = this.pop.offsetWidth;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2 - host.left, host.width - w - 8));
    this.pop.style.left = `${Math.round(left)}px`;
    this.pop.style.top = `${Math.round(bar.bottom - host.top + 6)}px`;
    this.pop.querySelector<HTMLElement>('.on')?.focus({ preventScroll: true });
  }
}
