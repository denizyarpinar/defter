import { t } from '../dil';
import {
  adlarGeldi, bosPanel, durumMetni, gruplar, hataGeldi, kaynakDegisti, metinBasladi, metinGeldi, satirBilgisi, secilebilir,
  secimAdim, tekrarSorgu, vurguAraligi, yeniSorgu, type PanelDurumu,
} from '../arama/aramaPaneliDurumu';
import { birlestir, type KitaplikAramaSonucu, type KitaplikSonucu } from '../arama/kitaplikAra';
import type { KitaplikAgaci } from '../arama/kitaplikAgaci';
import { sorguHazirla } from '../okuma/metinAra';
import { gorunurAlaniDuzelt, yaziAlaniMi } from './gorunurAlan';
import { panelKlavyeTakibi } from './klavyeKaydirma';

// Task 6.3e: the library search panel (the 🔍 in the top bar, Ctrl/Cmd+F, "/"). Names as you type (on the
// device), the text with Drive when typing stops or on Enter. A result opens the reader there (main.ts).
// Reads only. Decisions without DOM: arama/aramaPaneliDurumu.ts.

export interface AramaKaynagi {
  anahtar: object;        // another object: another library (the old results go)
  ornek: boolean;         // the sample library: names only
  agac(): Promise<Pick<KitaplikAgaci, 'kitaplar' | 'konular' | 'dosyalar'>>;
  metin(q: string, signal: AbortSignal): Promise<KitaplikAramaSonucu>;
}

export interface AramaPaneliBaglam {
  kaynak(): AramaKaynagi | null;   // null: no library on screen yet
  acilabilir(): boolean;           // the shortcuts: only over the library (no reader, no card)
  git(s: KitaplikSonucu, q: string): void;
}

const AD_GECIKME_MS = 120;
const METIN_GECIKME_MS = 600;
const BUYUTEC = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M15.2 15.2L20.5 20.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const hataMetni = (e: unknown) => e instanceof TypeError || !(e instanceof Error) ? t('genel.agHatasi') : e.message;

export function initAramaPaneli(b: AramaPaneliBaglam): { ac(): void; acikMi(): boolean } {
  const kok = el('div', 'ap');
  kok.id = 'aramaPaneli';
  kok.hidden = true;
  const kart = el('div', 'ap-kart');
  kart.setAttribute('role', 'dialog');
  kart.setAttribute('aria-label', t('ustCubuk.araEtiket'));
  const ust = el('div', 'ap-ust');
  const ikon = el('span', 'ap-ikon');
  ikon.innerHTML = BUYUTEC;
  const kutu = el('input', 'ap-kutu');
  kutu.type = 'search';
  kutu.placeholder = t('arama.yerTutucu');
  kutu.autocomplete = 'off';
  kutu.spellcheck = false;
  kutu.enterKeyHint = 'search';
  kutu.setAttribute('aria-label', t('ustCubuk.araEtiket'));
  kutu.setAttribute('aria-controls', 'apListe');
  const kapatBtn = el('button', 'ap-kapat', '×');
  kapatBtn.type = 'button';
  kapatBtn.setAttribute('aria-label', t('okuyucu.aramaKapat'));
  ust.append(ikon, kutu, kapatBtn);
  const durum = el('div', 'ap-durum');
  durum.setAttribute('aria-live', 'polite');
  const durumYazi = el('span');
  const tekrarBtn = el('button', 'ap-tekrar', t('genel.tekrarDene'));
  tekrarBtn.type = 'button';
  durum.append(durumYazi, tekrarBtn);
  const liste = el('ul', 'ap-liste');
  liste.id = 'apListe';
  liste.setAttribute('role', 'listbox');
  liste.setAttribute('aria-label', t('arama.sonuclar'));
  kart.append(ust, durum, liste);
  kok.append(kart);
  document.body.append(kok);

  let d: PanelDurumu = bosPanel(false);
  let kaynak: AramaKaynagi | null = null;
  let agacHazir = false;        // the tree of this kaynak came once (the next searches don't wait)
  let adTimer: number | undefined, metinTimer: number | undefined;
  let ctl: AbortController | null = null;
  let klavye: ReturnType<typeof panelKlavyeTakibi> | null = null;

  const zamanlayicilariDurdur = () => {
    clearTimeout(adTimer); clearTimeout(metinTimer);
    adTimer = metinTimer = undefined;
    ctl?.abort(); ctl = null;
  };

  async function adAra(istek: number): Promise<void> {
    const k = kaynak, q = d.q;
    if (!k) return;
    try {
      const agac = await k.agac();
      if (k !== kaynak) return;
      agacHazir = true;
      d = adlarGeldi(d, istek, birlestir(agac, q, null));
    } catch (e) {
      if (k !== kaynak) return;
      d = hataGeldi(d, istek, hataMetni(e));
      clearTimeout(metinTimer); metinTimer = undefined;
    }
    ciz();
  }

  async function metinAra(istek: number): Promise<void> {
    clearTimeout(metinTimer); metinTimer = undefined;
    const k = kaynak, q = d.q;
    if (!k || k.ornek || istek !== d.istek || d.asama === 'hata' || !sorguHazirla(q)) return;
    ctl?.abort();
    const my = ctl = new AbortController();
    d = metinBasladi(d, istek);
    ciz();
    try {
      const r = await k.metin(q, my.signal);
      if (my.signal.aborted) return;
      agacHazir = true;
      d = metinGeldi(d, istek, r);
    } catch (e) {
      if (my.signal.aborted) return;
      d = hataGeldi(d, istek, hataMetni(e));
    }
    if (ctl === my) ctl = null;
    ciz();
  }

  // a new query (typed, or the same again): names soon, the text when typing stops
  function baslat(simdiMetin = false): void {
    if (!sorguHazirla(d.q)) { ciz(); return; }
    const istek = d.istek;
    adTimer = window.setTimeout(() => { adTimer = undefined; void adAra(istek); }, simdiMetin ? 0 : AD_GECIKME_MS);
    if (kaynak && !kaynak.ornek) metinTimer = window.setTimeout(() => void metinAra(istek), simdiMetin ? 0 : METIN_GECIKME_MS);
    ciz();
  }

  kutu.addEventListener('input', () => {
    zamanlayicilariDurdur();
    d = yeniSorgu(d, kutu.value, agacHazir);
    baslat();
  });

  tekrarBtn.addEventListener('click', () => {
    zamanlayicilariDurdur();
    d = tekrarSorgu(d, agacHazir);
    baslat(true);
    kutu.focus({ preventScroll: true });
  });

  function sec(i: number): void {
    const s = d.sonuclar[i];
    if (!s || !secilebilir(s)) return;
    const q = d.q;
    kapat();
    b.git(s, q);
  }

  kok.addEventListener('keydown', e => {
    e.stopPropagation();   // the desk reader / the room don't get the panel's keys
    if (e.isComposing) return;
    if (e.key === 'Escape') { e.preventDefault(); kapat(); return; }
    // Ctrl/Cmd+F again: our box, not the browser's
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); kutu.focus({ preventScroll: true }); kutu.select(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      d = secimAdim(d, e.key === 'ArrowDown' ? 1 : -1);
      ciz();
      liste.querySelector(`[data-i="${d.secili}"]`)?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Enter' && e.target === kutu) {
      e.preventDefault();
      // a row chosen with ↑/↓: open it; else the text search now
      if (d.secili >= 0) { sec(d.secili); return; }
      if (adTimer !== undefined) { clearTimeout(adTimer); adTimer = undefined; void adAra(d.istek); }
      void metinAra(d.istek);
    }
  });
  // a tap outside the card (on the dimmed room) closes; the tap never reaches the 3D scene
  kok.addEventListener('click', e => { if (e.target === kok) kapat(); });
  kapatBtn.addEventListener('click', kapat);
  liste.addEventListener('click', e => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
    if (li) sec(Number(li.dataset.i));
  });
  kutu.addEventListener('blur', () => klavye?.sifirla());

  function adHtml(li: HTMLElement, ad: string): void {
    const a = vurguAraligi(ad, d.q);
    const span = el('span', 'ap-ad');
    if (!a) span.textContent = ad;
    else span.append(ad.slice(0, a[0]), el('b', undefined, ad.slice(a[0], a[1])), ad.slice(a[1]));
    li.append(span);
  }

  function ciz(): void {
    const s = durumMetni(d);
    durum.hidden = !s;
    durumYazi.textContent = s?.metin ?? '';
    durum.classList.toggle('hata', !!s?.hata);
    tekrarBtn.hidden = !s?.tekrar;
    kart.classList.toggle('sonuclu', d.sonuclar.length > 0);

    const ogeler: HTMLElement[] = [];
    for (const g of gruplar(d.sonuclar)) {
      const h = el('li', 'ap-grup', g.baslik);
      h.setAttribute('role', 'presentation');
      ogeler.push(h);
      for (const { s: r, i } of g.ogeler) {
        const bilgi = satirBilgisi(r);
        const li = el('li', 'ap-satir');
        li.id = `apSonuc${i}`;
        li.dataset.i = String(i);
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === d.secili));
        if (!secilebilir(r)) { li.classList.add('disi'); li.setAttribute('aria-disabled', 'true'); delete li.dataset.i; }
        if (bilgi.yol) li.append(el('span', 'ap-yol', bilgi.yol));
        const alt = el('span', 'ap-alt');
        adHtml(alt, bilgi.ad);
        bilgi.rozetler.forEach((z, k) => {
          const rz = el('span', 'ap-rozet', z);
          if (bilgi.siniflar[k]) rz.classList.add(bilgi.siniflar[k]);   // 6.5-2a: by kind, not by the text
          alt.append(rz);
        });
        li.append(alt);
        ogeler.push(li);
      }
    }
    liste.replaceChildren(...ogeler);
    if (d.secili >= 0) kutu.setAttribute('aria-activedescendant', `apSonuc${d.secili}`);
    else kutu.removeAttribute('aria-activedescendant');
  }

  // Open (the query of last time stays in the box). Another library than last time: the same query again.
  function ac(): void {
    const k = b.kaynak();
    if (!k) return;
    if (kok.hidden) {
      if (!kaynak || k.anahtar !== kaynak.anahtar) {
        zamanlayicilariDurdur();
        kaynak = k;
        agacHazir = false;
        d = kaynakDegisti(d, k.ornek);
        d = yeniSorgu(d, d.q, false);
        kutu.value = d.q;
        baslat(true);
      } else kaynak = k;
      void k.agac().then(() => { if (kaynak === k) agacHazir = true; }, () => { /* the search says it */ });
      kok.hidden = false;
      klavye = panelKlavyeTakibi(kok);
      ciz();
    }
    // inside the tap: the iPad keyboard opens; focusing never moves the page
    kutu.focus({ preventScroll: true });
    kutu.select();
  }

  function kapat(): void {
    if (kok.hidden) return;
    const odakta = document.activeElement === kutu;
    kutu.blur();
    kok.hidden = true;
    klavye?.durdur();
    klavye = null;
    if (odakta) gorunurAlaniDuzelt('aramaPaneli');   // the iPad keyboard was open
  }

  // Ctrl/Cmd+F and "/" over the library (not while typing somewhere, not under the reader or a card)
  addEventListener('keydown', e => {
    if (!kok.hidden || e.defaultPrevented || e.isComposing || !b.acilabilir()) return;
    const ctrlF = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f';
    const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!ctrlF && !slash) return;
    if (slash && yaziAlaniMi(document.activeElement as HTMLElement | null)) return;
    if (!b.kaynak()) return;
    e.preventDefault();
    ac();
  });

  return { ac, acikMi: () => !kok.hidden };
}
