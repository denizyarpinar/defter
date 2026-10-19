import { planMetni } from '../kitap/kitapPlani';
import { esc } from './dom';
import { gorunurAlaniDuzelt } from './gorunurAlan';
import { agacIslemi, satirAraligi, sihirbazDurumu, type AgacIslemi, type SihirbazDurumu } from './kitapSihirbaziDurumu';
import { panelKlavyeTakibi } from './klavyeKaydirma';
import { COVER_SWATCHES } from './panel';
import { toast } from './toast';

// Task 6.K4a: "Yeni kitap" — name, shelf, colour and the list of units / topics, one line each, with a live tree.
// Nothing is written: "Oluştur" stays grey until K4b. The logic is in kitapSihirbaziDurumu.ts (pure, tested).
// The look is the photo / file panel's (.fp classes); on touch screens it sits at the top and follows the
// keyboard (5.10g rules). A tap outside closes it only while nothing is typed (the list must not get lost).
// ?olcum=1: the plan (count + items) in a small box with "Kopyala" (the iPad has no console).

export const KITAP_SIHIRBAZI_ID = 'kitapSihirbazi';

export interface SihirbazBaglam {
  raflar: { id: string; ad: string }[];
  mevcutIdler: string[];   // the loaded library's books (a new book must not take one of their folders)
  olcum: boolean;
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

  const neden = el('p', 'fp-not ks-neden');
  const olcumKutu = el('div', 'ks-olcum');
  const olcumPre = el('pre');
  const kopyala = dugme('ks-kopyala', 'Kopyala');
  olcumKutu.append(olcumPre, kopyala);
  olcumKutu.hidden = !b.olcum;
  const alt = el('div', 'fp-alt');
  const vazgec = dugme('fp-vazgec', 'Vazgeç');
  const olustur = dugme('fp-ekle', 'Oluştur');
  alt.append(vazgec, olustur);

  kart.append(baslik, ust, govde, neden, olcumKutu, alt);
  kok.append(kart);
  document.body.append(kok);
  const klavye = panelKlavyeTakibi(kok);

  function ciz(vurgu?: number): void {
    d = sihirbazDurumu({ ad, rafId, renk, metin: metin.value }, b.mevcutIdler);
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
    olustur.disabled = !d.olusturAcik;
    neden.textContent = d.neden;
    neden.hidden = !d.neden;
    if (b.olcum) olcumPre.textContent = planMetni(d.plan);
  }

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

  adKutu.addEventListener('input', () => { ad = adKutu.value; ciz(); });
  adKutu.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); metin.focus({ preventScroll: true }); } });
  rafSec.onchange = () => { rafId = rafSec.value; ciz(); };
  renkler.onclick = e => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c;
    if (c) { renk = c; ciz(); }
  };
  metin.addEventListener('input', () => ciz());
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
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); kapat(); }
  }

  vazgec.onclick = kapat;
  kok.addEventListener('click', e => { if (e.target === kok && !ad.trim() && !metin.value.trim()) kapat(); });
  addEventListener('keydown', tus, true);

  ciz();
  // a mouse: straight into the name; a touch screen: no keyboard before a tap (as the file panel)
  (matchMedia('(pointer: fine)').matches ? adKutu : vazgec).focus({ preventScroll: true });
}
