import type { DriveFile } from '../drive/drive';
import type { HazirDosya } from '../defter/dosyaHazirla';
import {
  adDurumu, cozumAdaylari, dosyaHedefi, ekleDurumu, hataMetni, hedefSecenekleri, islemAnahtari, kaynakEtiketi, sayfaYazi,
  varsayilanHedef, type KlasorBilgisi, type PanelHedef
} from '../defter/dosyaPanelDurumu';
import { boyutYazi, cikar, tasi } from '../defter/fotoPanelDurumu';
import { hazirlaGorsel } from '../defter/gorsel';
import { GorselHatasi } from '../defter/gorselHesap';
import { listeAdi, listeBilgisi, listeBoyutMetni } from '../defter/gorselListesi';
import type { DosyaEklendi, DosyaHedefi } from '../defter/konuyaDosyaEkle';
import type { MaterialKind, TopicMaterials } from '../okuma/konuKesfi';
import { closePdf, pdfjs } from '../okuma/pdf';
import { panelKlavyeTakibi } from './klavyeKaydirma';
import { toast } from './toast';

// Task 5.10e: "Dosya ekle" panel over the reader (draft, behind ?dosyaEkle=1). The file is already
// prepared (dosyaHazirla); here only: where it goes and its name. "Ekle" goes straight to Drive
// (konuyaDosyaEkle, nothing kept on the device); an error keeps the panel open, "Tekrar dene" uses the same islemId.
// The look is the photo panel's (.fp classes); the logic is in dosyaPanelDurumu.ts.
// Task 5.10g: chosen images are a list (numbered thumbnails, ‹ › ×, "+ Fotoğraf ekle"), no cropping;
// "Ekle" makes one PDF of them (fotograflardanPdf). The page is put back after the iPad keyboard.

export interface DosyaPanelBaglam {
  konuAdi: string;
  materials: TopicMaterials;          // the open topic as the reader knows it
  acikSekme: MaterialKind | null;
  ornek: boolean;
  klasorler(): Promise<KlasorBilgisi | null>;   // Uebungen / Oedevler there? (one Drive listing; null: not known)
  ekle(hedef: DosyaHedefi, ad: string, islemId: string, bytes: Uint8Array): Promise<DosyaEklendi>;   // rejects on any error
  bitti(r: DosyaEklendi, hedef: DosyaHedefi): void;   // after the panel closed; hedef: what was chosen
}

// pdf: one prepared file (dosyaHazirla); gorseller: images, prepared in the panel
export type DosyaPanelKaynak = { tur: 'pdf'; hazir: HazirDosya } | { tur: 'gorseller'; dosyalar: File[] };

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
  const hazir = kaynak.tur === 'pdf' ? kaynak.hazir : null;
  let klasor: KlasorBilgisi | null = null;
  let sayfa: number | null | undefined;   // undefined: being counted
  let hedef: PanelHedef | null = varsayilanHedef(hedefSecenekleri(b.materials, null), b.acikSekme);
  let girilen = hazir?.ad ?? '';
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
  const alt = el('div', 'fp-alt');
  alt.append(vazgec, ekle);
  if (hazir) kart.append(baslik, bilgi, hedefler, cozumSatir, adSatir, uyari, not, alt);
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
    if (hazir) {
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
    const hazirDegil = !hazir && (calisiyor || !gorseller.length);
    const e = ekleDurumu({ ornek: b.ornek, secenek, ad: ad ?? { duzenlenebilir: false, ad: '', hata: null }, ekleniyor, hataVar: !!hata, hazirDegil });
    ekle.disabled = !e.aktif;
    ekle.textContent = e.metin;
    vazgec.disabled = ekleniyor;
    const notMetni = e.aciklama ?? hata ?? (hedef ? null : 'Bu dosya bu konuda hiçbir yere eklenemiyor.');
    not.textContent = notMetni ?? '';
    not.hidden = !notMetni;
    not.classList.toggle('fp-hata', !e.aciklama && !!hata);
  }

  // one image at a time (iPad memory); files chosen meanwhile join the same batch; no cropping
  async function hazirla(yeni: File[]): Promise<void> {
    if (!calisiyor) { toplam = 0; biten = 0; }
    bekleyen.push(...yeni);
    toplam += yeni.length;
    if (calisiyor) { ciz(); return; }
    calisiyor = true;
    ciz();
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
    if (!kapandi) ciz();
  }

  // the PDF of the list as it is now (the same version: the same bytes)
  async function listePdf(): Promise<Uint8Array> {
    if (yapilanPdf?.surum !== surum) {
      const s = surum;
      const { fotograflardanPdf } = await import('../defter/sayfaEkle');
      yapilanPdf = { surum: s, bytes: await fotograflardanPdf(gorseller.map(g => ({ bytes: g.jpeg }))) };
    }
    return yapilanPdf.bytes;
  }

  function kapat(): void {
    if (ekleniyor) return;
    kapandi = true;
    bekleyen = [];
    for (const g of gorseller) URL.revokeObjectURL(g.url);
    gorseller = [];
    removeEventListener('keydown', tus, true);
    adKutu.removeEventListener('blur', klavye.sifirla);
    kok.remove();
    klavye.durdur();
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
  kok.addEventListener('click', e => { if (e.target === kok) kapat(); });
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
  vazgec.focus();
  if (hazir) void sayfaSayisi(hazir).then(n => { sayfa = n; if (!kapandi) ciz(); });
  else if (kaynak.tur === 'gorseller') void hazirla(kaynak.dosyalar);
  void b.klasorler().then(k => { klasor = k; if (!kapandi && !ekleniyor) ciz(); }, () => {});
}
