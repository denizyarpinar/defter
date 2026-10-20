import type { KitapIslemi } from '../drive/kitapOlustur';
import { islemOzeti } from '../drive/kitapOlustur';
import { planMetni } from '../kitap/kitapPlani';
import { esc } from './dom';
import { gorunurAlaniDuzelt } from './gorunurAlan';
import {
  agacIslemi, OlusturAkisi, olusturHatasi, satirAraligi, sihirbazDurumu,
  type AgacIslemi, type OlusturHatasi, type SihirbazDurumu, type SihirbazKilidi
} from './kitapSihirbaziDurumu';
import { panelKlavyeTakibi } from './klavyeKaydirma';
import { COVER_SWATCHES } from './panel';
import { toast } from './toast';

// Task 6.K4a: "Yeni kitap" — name, shelf, colour and the list of units / topics, one line each, with a live tree.
// The logic is in kitapSihirbaziDurumu.ts (pure, tested).
// Task 6.K4b: "Oluştur" (only when kilit = 'acik') hands the operation to main.ts, which writes it (kitapOlustur.ts).
// While it runs nothing can be changed or closed (Oluştur, Vazgeç, Esc, a tap outside); the button shows n/N.
// An error keeps the wizard open with its text and "Tekrar dene" (the same operation) or "Tekrar giriş yap".
// Success closes it (main.ts reloads the library and says so).
// The look is the photo / file panel's (.fp classes); on touch screens it sits at the top and follows the
// keyboard (5.10g rules). A tap outside closes it only while nothing is typed (the list must not get lost).
// ?olcum=1: the plan (count + items) and the last operation in a small box with "Kopyala" (the iPad has no console).

export const KITAP_SIHIRBAZI_ID = 'kitapSihirbazi';

export interface SihirbazBaglam {
  raflar: { id: string; ad: string }[];
  mevcutIdler: string[];   // the loaded library's books (a new book must not take one of their folders)
  olcum: boolean;
  kilit: SihirbazKilidi;
  olustur?: (islem: KitapIslemi, ilerleme: (i: number, n: number) => void) => Promise<void>;
  girisYap?: () => Promise<void>;
}

const ORNEK_LISTE = '# Logik\nAussagenlogik\nBeweisen\n\n# Mengen\nRelationen\nAbbildungen';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const dugme = (cls: string, text: string, label?: string) => {
  const b = el('button', cls, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  return b;
};

export function kitapSihirbaziAc(b: SihirbazBaglam): void {
  if (document.getElementById(KITAP_SIHIRBAZI_ID)) return;
  let ad = '';
  let rafId = b.raflar[0]?.id ?? '';
  let renk = COVER_SWATCHES[0];
  let d: SihirbazDurumu;
  const akis = new OlusturAkisi(() => crypto.randomUUID());
  let ilerleme: { i: number; n: number } | null = null;
  let hata: OlusturHatasi | null = null;

  const kok = el('div', 'fp');
  kok.id = KITAP_SIHIRBAZI_ID;
  const kart = el('div', 'fp-kart ks-kart');
  kart.setAttribute('role', 'dialog');
  kart.setAttribute('aria-modal', 'true');
  kart.setAttribute('aria-labelledby', 'ksBaslik');
  const baslik = el('h2', 'fp-baslik', 'Yeni kitap');
  baslik.id = 'ksBaslik';

  // name, shelf, colour
  const ust = el('div', 'ks-ust');
  const adEt = el('label', 'dp-ad ks-adalan', 'Kitap adı');
  const adKutu = el('input');
  adKutu.type = 'text';
  adKutu.placeholder = 'ör. Mathe 1';
  adKutu.autocomplete = 'off';
  adKutu.enterKeyHint = 'next';
  adKutu.spellcheck = false;
  const adUyari = el('p', 'dp-uyari');
  adEt.append(adKutu);
  const rafEt = el('label', 'dp-ad ks-rafalan', 'Raf');
  const rafSec = el('select', 'fp-sec');
  for (const r of b.raflar) rafSec.append(new Option(r.ad, r.id, false, r.id === rafId));
  rafEt.append(rafSec);
  const renkAlan = el('div', 'ks-renkalan');
  renkAlan.append(el('span', 'ks-etiket', 'Renk'));
  const renkler = el('div', 'ks-renkler');
  renkler.setAttribute('role', 'radiogroup');
  renkler.setAttribute('aria-label', 'Kapak rengi');
  for (const c of COVER_SWATCHES) {
    const r = dugme('ks-renk', '', `Renk ${c}`);
    r.style.background = c;
    r.dataset.c = c;
    r.setAttribute('role', 'radio');
    renkler.append(r);
  }
  renkAlan.append(renkler);
  ust.append(adEt, adUyari, rafEt, renkAlan);

  // the list and the tree
  const govde = el('div', 'ks-govde');
  const sol = el('div', 'ks-sol');
  const metinEt = el('label', 'dp-ad', 'Üniteler ve konular');
  const metin = el('textarea', 'ks-metin');
  metin.placeholder = ORNEK_LISTE;
  metin.spellcheck = false;
  metin.setAttribute('autocapitalize', 'sentences');
  metinEt.append(metin);
  const yardim = el('p', 'fp-not', '“# Ünite adı” bir ünite başlatır; altındaki her satır bir konudur. Boş satırlar sayılmaz; “- ”, “* ”, “1.” gibi başlar silinir.');
  const uyariListe = el('ul', 'ks-uyarilar');
  sol.append(metinEt, yardim, uyariListe);
  const sag = el('div', 'ks-sag');
  sag.append(el('span', 'ks-etiket', 'Önizleme'));
  const agac = el('ul', 'ks-agac');
  const uniteArti = dugme('ks-uniteekle', '+ Ünite');
  sag.append(agac, uniteArti);
  govde.append(sol, sag);

  // 6.K4b-3: the message sits in the sticky bottom row (left of the buttons; phone: above them), so an error is
  // seen without scrolling the card; at most 3 lines, then it scrolls by itself. Never hidden (a live region).
  const neden = el('p', 'fp-not ks-neden');
  neden.setAttribute('aria-live', 'polite');
  const olcumKutu = el('div', 'ks-olcum');
  const olcumPre = el('pre');
  const kopyala = dugme('ks-kopyala', 'Kopyala');
  olcumKutu.append(olcumPre, kopyala);
  olcumKutu.hidden = !b.olcum;
  const alt = el('div', 'fp-alt');
  const vazgec = dugme('fp-vazgec', 'Vazgeç');
  const olustur = dugme('fp-ekle', 'Oluştur');
  alt.append(neden, vazgec, olustur);

  kart.append(baslik, ust, govde, olcumKutu, alt);
  kok.append(kart);
  document.body.append(kok);
  const klavye = panelKlavyeTakibi(kok);

  function ciz(vurgu?: number): void {
    d = sihirbazDurumu({ ad, rafId, renk, metin: metin.value }, b.mevcutIdler, b.kilit);
    adUyari.textContent = ad.trim() ? d.plan.engel ?? '' : '';
    adUyari.hidden = !adUyari.textContent;
    for (const r of renkler.children as HTMLCollectionOf<HTMLElement>) {
      const on = r.dataset.c === renk;
      r.classList.toggle('on', on);
      r.setAttribute('aria-checked', String(on));
    }
    uyariListe.innerHTML = d.uyarilar.map(u =>
      `<li class="${u.engel ? 'ks-engel' : ''}">${u.satir ? `Satır ${u.satir}: ` : ''}${esc(u.metin)}</li>`).join('');
    uyariListe.hidden = !d.uyarilar.length;
    agac.innerHTML = d.agac.length ? d.agac.map(s => {
      const islem = (tur: string, yon?: number) => `data-islem="${tur}" data-u="${s.u}"${s.k !== null ? ` data-k="${s.k}"` : ''}${yon ? ` data-yon="${yon}"` : ''}`;
      const tasi = s.tur === 'unite' ? 'uniteTasi' : 'konuTasi';
      const ne = s.tur === 'unite' ? 'Üniteyi' : 'Konuyu';
      return `<li class="ks-satir ks-${s.tur}${s.satir === vurgu ? ' ks-yeni' : ''}" data-satir="${s.satir}">
        <button type="button" class="ks-yazi" data-git="${s.satir}"><span class="ks-ad">${esc(s.ad)}</span><span class="ks-klasor">${esc(s.klasor)}</span>
        ${s.rozetler.map(r => `<span class="ks-rozet${r.engel ? ' ks-engel' : ''}">${esc(r.metin)}</span>`).join('')}</button>
        <span class="ks-dugmeler">
          ${s.tur === 'unite' ? `<button type="button" class="ks-yuvarlak" ${islem('konuEkle')} aria-label="Bu üniteye konu ekle">+</button>` : ''}
          <button type="button" class="ks-yuvarlak" ${islem(tasi, -1)} ${s.yukari ? '' : 'disabled'} aria-label="${ne} yukarı taşı">↑</button>
          <button type="button" class="ks-yuvarlak" ${islem(tasi, 1)} ${s.asagi ? '' : 'disabled'} aria-label="${ne} aşağı taşı">↓</button>
        </span></li>`;
    }).join('') : '<li class="ks-bos">Yazdıkça üniteler ve konular burada görünür.</li>';
    // the operation (6.K4b): running, failed, or not started
    const kilitli = akis.alanlarKilitli;
    adKutu.disabled = rafSec.disabled = metin.readOnly = uniteArti.disabled = kilitli;
    for (const x of renkler.children as HTMLCollectionOf<HTMLButtonElement>) x.disabled = kilitli;
    if (kilitli) for (const x of agac.querySelectorAll('button')) x.disabled = true;
    kart.classList.toggle('ks-kilitli', kilitli);
    vazgec.disabled = akis.mesgul;
    if (akis.mesgul) {
      olustur.disabled = true;
      olustur.textContent = ilerleme ? `Oluşturuluyor… ${ilerleme.i}/${ilerleme.n}` : 'Oluşturuluyor…';
    } else if (hata && !hata.duzenlenebilir) {
      olustur.disabled = !hata.tekrarDene && !hata.girisYap;
      olustur.textContent = hata.girisYap ? 'Tekrar giriş yap' : 'Tekrar dene';
    } else {
      olustur.disabled = !d.olusturAcik;
      olustur.textContent = 'Oluştur';
    }
    const not = hata?.mesaj ?? d.neden;
    if (neden.textContent !== not) neden.textContent = not;   // the same text is not read out again on each key
    neden.classList.toggle('fp-hata', !!hata);
    const adHatali = !!hata?.adHatasi || d.adHatali;
    adKutu.classList.toggle('ks-ad-hata', adHatali);
    if (adHatali) adKutu.setAttribute('aria-invalid', 'true'); else adKutu.removeAttribute('aria-invalid');
    if (b.olcum) olcumPre.textContent = planMetni(d.plan) + (akis.islem ? '\n\n' + islemOzeti(akis.islem) : '');
  }

  async function olusturDugmesi(): Promise<void> {
    if (akis.mesgul) return;
    if (hata?.girisYap) {
      try { await b.girisYap?.(); } catch { /* the sign-in card says why */ }
      hata = { ...hata, mesaj: 'Giriş yapıldıysa Tekrar dene.', tekrarDene: true, girisYap: false };
      ciz();
      return;
    }
    if (!b.olustur || (!hata && !d.olusturAcik)) return;
    const islem = akis.basla(d.plan);
    if (!islem) return;
    hata = null;
    ilerleme = null;
    ciz();
    try {
      await b.olustur(islem, (i, n) => { ilerleme = { i, n }; ciz(); });
      akis.bitti();
      kapat();
    } catch (e) {
      akis.bitti();
      hata = olusturHatasi(e, islem);
      if (hata.duzenlenebilir) akis.sifirla();
      ciz();
    }
  }
  olustur.onclick = () => void olusturDugmesi();

  // a tap in the tree: the list is written again; the changed row lights up
  agac.addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!t || t.disabled) return;
    if (t.dataset.git) { satiraGit(+t.dataset.git); return; }
    const u = +t.dataset.u!, k = +(t.dataset.k ?? -1), yon = +(t.dataset.yon ?? 1) as -1 | 1;
    const i: AgacIslemi | null = t.dataset.islem === 'konuEkle' ? { tur: 'konuEkle', u }
      : t.dataset.islem === 'konuTasi' ? { tur: 'konuTasi', u, k, yon }
      : t.dataset.islem === 'uniteTasi' ? { tur: 'uniteTasi', u, yon } : null;
    if (i) uygula(i);
  });
  uniteArti.onclick = () => uygula({ tur: 'uniteEkle' });

  function uygula(i: AgacIslemi): void {
    const r = agacIslemi(metin.value, i);
    metin.value = r.metin;
    ciz(r.satir);
    if (document.activeElement === metin) metin.setSelectionRange(...satirAraligi(r.metin, r.satir));
    agac.querySelector(`[data-satir="${r.satir}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  // a row's name: its line in the text box, selected (to rename it)
  function satiraGit(satir: number): void {
    metin.focus({ preventScroll: true });
    metin.setSelectionRange(...satirAraligi(metin.value, satir));
  }

  adKutu.addEventListener('input', () => { ad = adKutu.value; hata = null; ciz(); });
  adKutu.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); metin.focus({ preventScroll: true }); } });
  rafSec.onchange = () => { rafId = rafSec.value; ciz(); };
  renkler.onclick = e => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c;
    if (c) { renk = c; ciz(); }
  };
  metin.addEventListener('input', () => { hata = null; ciz(); });
  for (const k of [adKutu, metin]) k.addEventListener('blur', klavye.sifirla);
  kopyala.onclick = () => {
    navigator.clipboard?.writeText(olcumPre.textContent ?? '').then(() => toast('Plan kopyalandı.'), () => toast('Kopyalanamadı.'));
  };

  function kapat(): void {
    removeEventListener('keydown', tus, true);
    for (const k of [adKutu, metin]) k.removeEventListener('blur', klavye.sifirla);
    kok.remove();
    klavye.durdur();
    gorunurAlaniDuzelt('kitap sihirbazı kapandı');
  }

  function tus(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); if (!akis.mesgul) kapat(); }
  }

  vazgec.onclick = () => { if (!akis.mesgul) kapat(); };   // an operation not finished is dropped
  kok.addEventListener('click', e => { if (e.target === kok && !akis.alanlarKilitli && !ad.trim() && !metin.value.trim()) kapat(); });
  addEventListener('keydown', tus, true);

  ciz();
  // a mouse: straight into the name; a touch screen: no keyboard before a tap (as the file panel)
  (matchMedia('(pointer: fine)').matches ? adKutu : vazgec).focus({ preventScroll: true });
}
