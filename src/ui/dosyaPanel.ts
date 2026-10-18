import type { DriveFile } from '../drive/drive';
import { ofisHataMetni, type OfisHataMetni } from '../defter/dosyaEklemeMetin';
import { pdfAdi, type HazirDosya } from '../defter/dosyaHazirla';
import {
  adDurumu, cozumAdaylari, dosyaHedefi, ekleDurumu, hataMetni, hedefSecenekleri, islemAnahtari, kaynakEtiketi, ofisBilgi, sayfaYazi,
  varsayilanHedef, type CeviriDurumu, type KlasorBilgisi, type OfisCeviriAlt, type PanelHedef
} from '../defter/dosyaPanelDurumu';
import { boyutYazi, cikar, tasi } from '../defter/fotoPanelDurumu';
import { hazirlaGorsel } from '../defter/gorsel';
import { GorselHatasi } from '../defter/gorselHesap';
import { listeAdi, listeBilgisi, listeBoyutMetni } from '../defter/gorselListesi';
import type { DosyaEklendi, DosyaHedefi } from '../defter/konuyaDosyaEkle';
import type { MaterialKind, TopicMaterials } from '../okuma/konuKesfi';
import { closePdf, pdfjs } from '../okuma/pdf';
import { hazirlikEkle, mb, olcumAcik } from '../defter/sureOlcum';
import { gorunurAlaniDuzelt } from './gorunurAlan';
import { panelKlavyeTakibi } from './klavyeKaydirma';
import { toast } from './toast';

// Task 5.10e: "Dosya ekle" panel over the reader. The file is already
// prepared (dosyaHazirla); here only: where it goes and its name. "Ekle" goes straight to Drive
// (konuyaDosyaEkle, nothing kept on the device); an error keeps the panel open, "Tekrar dene" uses the same islemId.
// The look is the photo panel's (.fp classes); the logic is in dosyaPanelDurumu.ts.
// Task 5.10g: chosen images are a list (numbered thumbnails, ‹ › ×, "+ Fotoğraf ekle"), no cropping;
// "Ekle" makes one PDF of them (fotograflardanPdf). The page is put back after the iPad keyboard.
// Task 6.1c: one Word / PowerPoint file is converted as soon as the panel opens; target and
// name can be changed meanwhile, "Ekle" waits for the PDF. Vazgeç / Esc / the reader closing cancel it (the core
// trashes its temporary file). A tap outside closes this panel only after a conversion error (6.1e): not while
// converting, not with the PDF ready (iPad). The PDF stays in memory, so "Tekrar dene" after a failed adding sends
// the same bytes; "Tekrar çevir" only after a conversion error a new try can fix (not the Google permission).

export interface DosyaPanelBaglam {
  konuAdi: string;
  materials: TopicMaterials;          // the open topic as the reader knows it
  acikSekme: MaterialKind | null;
  ornek: boolean;
  klasorler(): Promise<KlasorBilgisi | null>;   // Uebungen / Oedevler there? (one Drive listing; null: not known)
  ekle(hedef: DosyaHedefi, ad: string, islemId: string, bytes: Uint8Array): Promise<DosyaEklendi>;   // rejects on any error
  bitti(r: DosyaEklendi, hedef: DosyaHedefi): void;   // after the panel closed; hedef: what was chosen
  cevir(dosya: File, signal: AbortSignal): Promise<Uint8Array>;   // task 6.1c: Word / PowerPoint → PDF bytes
  kapanis?: AbortSignal;   // the reader closed: a conversion is cancelled, the panel closes
}

// pdf: one prepared file (dosyaHazirla); gorseller: images, prepared in the panel
// ofis: a Word / PowerPoint file, converted in the panel (6.1c)
export type DosyaPanelKaynak = { tur: 'pdf'; hazir: HazirDosya } | { tur: 'gorseller'; dosyalar: File[] }
  | { tur: 'ofis'; dosya: File; alt: OfisCeviriAlt };

export const DOSYA_PANEL_ID = 'dosyaPanel';   // Okuyucu.ts checks it by this id (no import: the panel is lazy)

interface Gorsel { ad: string; jpeg: Uint8Array; url: string }

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

// Pages of the prepared PDF (pdf.js gets a copy: it moves the data to its worker); null: not readable
async function sayfaSayisi(h: HazirDosya): Promise<number | null> {
  if (h.kaynak === 'gorsel') return 1;
  try {
    const { getDocument } = await pdfjs();
    const doc = await getDocument({ data: h.bytes.slice() }).promise;
    const n = doc.numPages;
    void closePdf(doc);
    return n;
  } catch {
    return null;
  }
}

export function acDosyaPanel(b: DosyaPanelBaglam, kaynak: DosyaPanelKaynak): void {
  if (document.getElementById(DOSYA_PANEL_ID)) return;
  let hazir = kaynak.tur === 'pdf' ? kaynak.hazir : null;   // ofis: set when the conversion is done
  const ofis = kaynak.tur === 'ofis' ? kaynak : null;
  let klasor: KlasorBilgisi | null = null;
  let sayfa: number | null | undefined;   // undefined: being counted
  let hedef: PanelHedef | null = varsayilanHedef(hedefSecenekleri(b.materials, null), b.acikSekme);
  let girilen = hazir?.ad ?? (ofis ? pdfAdi(ofis.dosya.name) : '');
  let cozumOf: DriveFile | null = null;
  let ekleniyor = false;
  let hata: string | null = null;
  let islem: { anahtar: string; id: string } | null = null;
  let kapandi = false;
  const adaylar = cozumAdaylari(b.materials);
  // the image list (5.10g): prepared one at a time; every change of the list is a new version,
  // the PDF made for a version is kept, so "Tekrar dene" sends the same bytes with the same islemId
  let gorseller: Gorsel[] = [];
  let bekleyen: File[] = [];
  let toplam = 0, biten = 0;
  let calisiyor = false;
  let adElle = false;
  let surum = 0;
  let yapilanPdf: { surum: number; bytes: Uint8Array } | null = null;
  // the conversion (6.1c): every try has its own number, a late answer of an older try is ignored
  let ceviri: CeviriDurumu | null = null;
  let ceviriSn = 0;
  let ceviriHata: OfisHataMetni | null = null;
  let ceviriAc: AbortController | null = null;
  let sayac: ReturnType<typeof setInterval> | undefined;
  let deneme = 0;

  const kok = el('div', 'fp');
  kok.id = DOSYA_PANEL_ID;
  const kart = el('div', 'fp-kart');
  kart.setAttribute('role', 'dialog');
  kart.setAttribute('aria-modal', 'true');
  kart.setAttribute('aria-labelledby', 'dpBaslik');
  const baslik = el('h2', 'fp-baslik', `Dosya ekle – ${b.konuAdi}`);
  baslik.id = 'dpBaslik';
  const bilgi = el('p', 'dp-bilgi');
  const liste = el('ol', 'fp-liste');
  const input = el('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.hidden = true;
  const arti = dugme('fp-arti', '+ Fotoğraf ekle');

  const hedefler = el('fieldset', 'dp-hedefler');
  hedefler.append(el('legend', 'dp-baslik2', 'Nereye?'));
  const radyolar = new Map<PanelHedef, { input: HTMLInputElement; satir: HTMLLabelElement; neden: HTMLElement }>();
  for (const s of hedefSecenekleri(b.materials, null)) {
    const satir = el('label', 'dp-hedef');
    const input = el('input');
    input.type = 'radio';
    input.name = 'dpHedef';
    input.value = s.hedef;
    input.onchange = () => { if (input.checked) secHedef(s.hedef); };
    const neden = el('small', 'dp-neden');
    satir.append(input, el('span', '', s.etiket), neden);
    hedefler.append(satir);
    radyolar.set(s.hedef, { input, satir, neden });
  }

  const cozumSatir = el('label', 'fp-seclbl dp-cozum', 'Hangi dosyanın çözümü?');
  const cozumSec = el('select', 'fp-sec');
  cozumSec.append(new Option('Dosya seç…', ''), ...adaylar.map(a => new Option(a.etiket, a.file.id)));
  cozumSec.onchange = () => { cozumOf = adaylar.find(a => a.file.id === cozumSec.value)?.file ?? null; ciz(); };
  cozumSatir.append(cozumSec);

  const adSatir = el('label', 'dp-ad', 'Ad');
  const adKutu = el('input');
  adKutu.type = 'text';
  adKutu.autocomplete = 'off';
  adKutu.spellcheck = false;
  adKutu.oninput = () => { girilen = adKutu.value; adElle = true; hata = null; ciz(); };
  adSatir.append(adKutu);
  const uyari = el('p', 'dp-uyari');
  uyari.setAttribute('aria-live', 'polite');

  const not = el('p', 'fp-not');
  const vazgec = dugme('fp-vazgec', 'Vazgeç');
  const ekle = dugme('fp-ekle', 'Ekle');
  const tekrarCevir = dugme('fp-vazgec', 'Tekrar çevir');
  tekrarCevir.hidden = true;
  const alt = el('div', 'fp-alt');
  alt.append(vazgec, tekrarCevir, ekle);
  if (hazir || ofis) kart.append(baslik, bilgi, hedefler, cozumSatir, adSatir, uyari, not, alt);
  else kart.append(baslik, bilgi, liste, arti, input, hedefler, cozumSatir, adSatir, uyari, not, alt);
  kok.append(kart);
  document.body.append(kok);
  // iPad: the panel stays in the visible part while the keyboard is open; the page is put back after it
  const klavye = panelKlavyeTakibi(kok);
  adKutu.addEventListener('blur', klavye.sifirla);

  function secHedef(h: PanelHedef): void {
    hedef = h;
    hata = null;
    ciz();
  }

  // a change of the image list: a new version (another PDF, another islemId)
  function listeDegisti(yeni: Gorsel[]): void {
    gorseller = yeni;
    surum++;
    hata = null;
    ciz();
  }

  function cizListe(): void {
    const n = gorseller.length;
    liste.replaceChildren(...gorseller.map((o, i) => {
      const li = el('li', 'fp-oge');
      const img = el('img');
      img.src = o.url;
      img.alt = '';
      const resim = el('div', 'fp-resim');
      resim.append(img);
      const sol = dugme('fp-ok', '‹', `${i + 1}. görseli sola taşı`);
      sol.disabled = i === 0 || ekleniyor;
      sol.onclick = () => listeDegisti(tasi(gorseller, i, -1));
      const sag = dugme('fp-ok', '›', `${i + 1}. görseli sağa taşı`);
      sag.disabled = i === n - 1 || ekleniyor;
      sag.onclick = () => listeDegisti(tasi(gorseller, i, 1));
      const x = dugme('fp-cikar', '×', `${i + 1}. görseli çıkar`);
      x.disabled = ekleniyor;
      x.onclick = () => { URL.revokeObjectURL(o.url); listeDegisti(cikar(gorseller, i)); };
      const oklar = el('div', 'fp-oklar');
      oklar.append(sol, sag);
      li.append(resim, el('span', 'fp-no', String(i + 1)), x, oklar, el('small', 'fp-boyut', boyutYazi(o.jpeg.byteLength)));
      return li;
    }));
    arti.disabled = ekleniyor;
  }

  function ciz(): void {
    if (ofis) {
      bilgi.textContent = ofisBilgi({ ad: ofis.dosya.name, bayt: ofis.dosya.size, alt: ofis.alt, durum: ceviri ?? 'cevriliyor', sn: ceviriSn, sayfa });
    } else if (hazir) {
      bilgi.textContent = [hazir.ad, boyutYazi(hazir.bytes.byteLength), kaynakEtiketi(hazir.kaynak),
        sayfa === undefined ? 'sayfa sayılıyor…' : sayfaYazi(sayfa)].join(' · ');
    } else {
      const parca = [listeBilgisi(gorseller.length)];
      if (calisiyor) parca.push(`Hazırlanıyor ${Math.min(biten + 1, toplam)}/${toplam}`);
      else if (!gorseller.length) parca.push('Henüz görsel yok');
      bilgi.textContent = parca.join(' · ');
      girilen = listeAdi(gorseller[0]?.ad, girilen, adElle);
      cizListe();
    }
    const secenekler = hedefSecenekleri(b.materials, klasor);
    // the chosen one went grey (the folder listing came): the default again
    if (!secenekler.find(s => s.hedef === hedef)?.secilebilir) hedef = varsayilanHedef(secenekler, b.acikSekme);
    for (const s of secenekler) {
      const r = radyolar.get(s.hedef)!;
      r.input.checked = s.hedef === hedef;
      r.input.disabled = !s.secilebilir || ekleniyor;
      r.satir.classList.toggle('dp-pasif', !s.secilebilir);
      r.neden.textContent = s.neden ?? '';
      r.neden.hidden = !s.neden;
    }
    cozumSatir.hidden = hedef !== 'cozum';
    cozumSec.disabled = ekleniyor;
    const ad = hedef ? adDurumu(b.materials, hedef, girilen, cozumOf) : null;
    adSatir.hidden = !ad;
    if (ad) {
      adKutu.readOnly = !ad.duzenlenebilir;
      adKutu.disabled = ekleniyor;
      // the editable box keeps what is typed (the cursor stays); a fixed name is shown as it is
      if (!ad.duzenlenebilir) adKutu.value = ad.ad || '—';
      else if (adKutu.value !== girilen) adKutu.value = girilen;
    }
    uyari.textContent = ad?.hata ?? '';
    uyari.hidden = !ad?.hata;
    const secenek = secenekler.find(s => s.hedef === hedef) ?? null;
    const hazirDegil = ofis ? !hazir : !hazir && (calisiyor || !gorseller.length);
    const e = ekleDurumu({ ornek: b.ornek, secenek, ad: ad ?? { duzenlenebilir: false, ad: '', hata: null }, ekleniyor, hataVar: !!hata, hazirDegil });
    ekle.disabled = !e.aktif;
    ekle.textContent = e.metin;
    vazgec.disabled = ekleniyor;
    const notMetni = e.aciklama ?? hata ?? ceviriHata?.metin ?? (hedef ? null : 'Bu dosya bu konuda hiçbir yere eklenemiyor.');
    not.textContent = notMetni ?? '';
    not.hidden = !notMetni;
    not.classList.toggle('fp-hata', !e.aciklama && !!(hata ?? ceviriHata));
    tekrarCevir.hidden = !(ceviri === 'hata' && ceviriHata?.tekrarCevir);
    tekrarCevir.disabled = ekleniyor;
  }

  // one image at a time (iPad memory); files chosen meanwhile join the same batch; no cropping
  async function hazirla(yeni: File[]): Promise<void> {
    if (!calisiyor) { toplam = 0; biten = 0; }
    bekleyen.push(...yeni);
    toplam += yeni.length;
    if (calisiyor) { ciz(); return; }
    calisiyor = true;
    ciz();
    const t0 = olcumAcik() ? performance.now() : null;   // task 6.2e-1: the panel's whole preparing
    while (bekleyen.length && !kapandi) {
      const f = bekleyen.shift()!;
      try {
        const g = await hazirlaGorsel(f);
        if (kapandi) break;
        const url = URL.createObjectURL(new Blob([g.bytes as BlobPart], { type: 'image/jpeg' }));
        gorseller = [...gorseller, { ad: f.name, jpeg: g.bytes, url }];
        surum++;
      } catch (e) {
        if (kapandi) break;
        toast(e instanceof GorselHatasi ? `${f.name}: ${e.message}` : `${f.name} hazırlanamadı. Başka bir görsel seç.`);
        if (!(e instanceof GorselHatasi)) console.warn('Görsel hazırlanamadı.', e);
      }
      biten++;
      ciz();
    }
    calisiyor = false;
    if (t0 !== null) hazirlikEkle({ ad: 'panel: görseller hazır', ms: performance.now() - t0, grup: 'panel', ek: { gorsel: toplam } });
    if (!kapandi) ciz();
  }

  // Word / PowerPoint → PDF (a new try: a new AbortController, the counter from 0)
  async function cevirBaslat(): Promise<void> {
    if (!ofis) return;
    const n = ++deneme;
    ceviriAc?.abort();
    const ac = new AbortController();
    ceviriAc = ac;
    ceviri = 'cevriliyor';
    ceviriSn = 0;
    ceviriHata = null;
    clearInterval(sayac);
    sayac = setInterval(() => { ceviriSn++; if (!kapandi) ciz(); }, 1000);
    ciz();
    let bytes: Uint8Array;
    try {
      bytes = await b.cevir(ofis.dosya, ac.signal);
    } catch (e) {
      if (n !== deneme || kapandi) return;
      clearInterval(sayac);
      const m = ofisHataMetni(e);
      ceviri = 'hata';
      ceviriHata = m;
      if (m) console.warn('Dosya çevrilemedi.', e);
      ciz();
      return;
    }
    if (n !== deneme || kapandi) return;
    clearInterval(sayac);
    hazir = { ad: pdfAdi(ofis.dosya.name), bytes, kaynak: 'pdf' };
    ceviri = 'hazir';
    sayfa = undefined;
    ciz();
    const h = hazir;
    void sayfaSayisi(h).then(x => { if (hazir === h) { sayfa = x; if (!kapandi) ciz(); } });
  }

  // the PDF of the list as it is now (the same version: the same bytes)
  async function listePdf(): Promise<Uint8Array> {
    if (yapilanPdf?.surum !== surum) {
      const s = surum;
      const t0 = olcumAcik() ? performance.now() : null;
      const { fotograflardanPdf } = await import('../defter/sayfaEkle');
      yapilanPdf = { surum: s, bytes: await fotograflardanPdf(gorseller.map(g => ({ bytes: g.jpeg }))) };
      if (t0 !== null) hazirlikEkle({ ad: 'görsellerden PDF (pdf-lib)', ms: performance.now() - t0, grup: 'pdf', ek: { gorsel: gorseller.length, boyut: mb(yapilanPdf.bytes.byteLength) } });
    }
    return yapilanPdf.bytes;
  }

  function kapat(): void {
    if (ekleniyor) return;
    kapandi = true;
    ceviriAc?.abort();   // a conversion going on: cancelled (the core trashes its temporary file)
    clearInterval(sayac);
    b.kapanis?.removeEventListener('abort', kapat);
    bekleyen = [];
    for (const g of gorseller) URL.revokeObjectURL(g.url);
    gorseller = [];
    removeEventListener('keydown', tus, true);
    adKutu.removeEventListener('blur', klavye.sifirla);
    kok.remove();
    klavye.durdur();
    gorunurAlaniDuzelt('dosya paneli kapandı');   // task 5.10g-ek2: the page back to the top (as the photo panel)
  }

  function tus(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); kapat(); }
  }

  arti.onclick = () => input.click();
  input.onchange = () => {
    const f = [...(input.files ?? [])];
    input.value = '';   // the same image can be chosen again
    if (f.length) void hazirla(f);
  };
  vazgec.onclick = kapat;
  // Word / PowerPoint: a tap outside does nothing while converting or with the PDF ready (an iPad touch must not
  // throw away the converted PDF); only after a conversion error it closes, as the other panels always do
  kok.addEventListener('click', e => { if (e.target === kok && (!ofis || ceviri === 'hata')) kapat(); });
  tekrarCevir.onclick = () => { if (!ekleniyor) void cevirBaslat(); };
  if (ofis) b.kapanis?.addEventListener('abort', kapat);
  addEventListener('keydown', tus, true);
  ekle.onclick = async () => {
    if (ekleniyor || ekle.disabled || !hedef) return;
    adKutu.blur();   // the iPad keyboard goes away now, not after the panel
    const h = dosyaHedefi(hedef, cozumOf);
    const ad = adDurumu(b.materials, hedef, girilen, cozumOf);
    if (!h || !ad.ad || ad.hata) return;
    // the same target + name (+ the same image list) as the failed try: the same islemId (konuyaDosyaEkle finds "its" file)
    const anahtar = islemAnahtari(hedef, ad.ad, cozumOf) + (hazir ? '' : `|${surum}`);
    if (islem?.anahtar !== anahtar) islem = { anahtar, id: crypto.randomUUID() };
    ekleniyor = true;
    ciz();
    let r: DosyaEklendi;
    try {
      const bytes = hazir ? hazir.bytes : await listePdf();
      const buyuk = hazir ? null : listeBoyutMetni(bytes.byteLength);
      if (buyuk) {
        ekleniyor = false;
        hata = buyuk;
        if (!kapandi) ciz();
        return;
      }
      r = await b.ekle(h, ad.ad, islem.id, bytes);
    } catch (e) {
      ekleniyor = false;
      hata = hataMetni(e);
      console.warn('Dosya eklenemedi.', e);
      if (!kapandi) ciz();
      return;
    }
    ekleniyor = false;
    kapat();
    b.bitti(r, h);
  };

  ciz();
  vazgec.focus({ preventScroll: true });   // task 5.10g-ek2: focusing never moves the page (iPad)
  if (hazir) void sayfaSayisi(hazir).then(n => { sayfa = n; if (!kapandi) ciz(); });
  else if (ofis) void cevirBaslat();
  else if (kaynak.tur === 'gorseller') void hazirla(kaynak.dosyalar);
  void b.klasorler().then(k => { klasor = k; if (!kapandi && !ekleniyor) ciz(); }, () => {});
}
