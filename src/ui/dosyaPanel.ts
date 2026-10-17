import type { DriveFile } from '../drive/drive';
import type { HazirDosya } from '../defter/dosyaHazirla';
import {
  adDurumu, cozumAdaylari, dosyaHedefi, ekleDurumu, hataMetni, hedefSecenekleri, islemAnahtari, kaynakEtiketi, sayfaYazi,
  varsayilanHedef, type KlasorBilgisi, type PanelHedef
} from '../defter/dosyaPanelDurumu';
import { boyutYazi } from '../defter/fotoPanelDurumu';
import type { DosyaEklendi, DosyaHedefi } from '../defter/konuyaDosyaEkle';
import type { MaterialKind, TopicMaterials } from '../okuma/konuKesfi';
import { closePdf, pdfjs } from '../okuma/pdf';

// Task 5.10e: "Dosya ekle" panel over the reader (draft, behind ?dosyaEkle=1). The file is already
// prepared (dosyaHazirla); here only: where it goes and its name. "Ekle" goes straight to Drive
// (konuyaDosyaEkle, nothing kept on the device); an error keeps the panel open, "Tekrar dene" uses the same islemId.
// The look is the photo panel's (.fp classes); the logic is in dosyaPanelDurumu.ts.

export interface DosyaPanelBaglam {
  konuAdi: string;
  materials: TopicMaterials;          // the open topic as the reader knows it
  acikSekme: MaterialKind | null;
  ornek: boolean;
  klasorler(): Promise<KlasorBilgisi | null>;   // Uebungen / Oedevler there? (one Drive listing; null: not known)
  ekle(hedef: DosyaHedefi, ad: string, islemId: string): Promise<DosyaEklendi>;   // rejects on any error
  bitti(r: DosyaEklendi, hedef: DosyaHedefi): void;   // after the panel closed; hedef: what was chosen
}

export const DOSYA_PANEL_ID = 'dosyaPanel';   // Okuyucu.ts checks it by this id (no import: the panel is lazy)

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const dugme = (cls: string, text: string) => {
  const b = el('button', cls, text);
  b.type = 'button';
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

export function acDosyaPanel(b: DosyaPanelBaglam, hazir: HazirDosya): void {
  if (document.getElementById(DOSYA_PANEL_ID)) return;
  let klasor: KlasorBilgisi | null = null;
  let sayfa: number | null | undefined;   // undefined: being counted
  let hedef: PanelHedef | null = varsayilanHedef(hedefSecenekleri(b.materials, null), b.acikSekme);
  let girilen = hazir.ad;
  let cozumOf: DriveFile | null = null;
  let ekleniyor = false;
  let hata: string | null = null;
  let islem: { anahtar: string; id: string } | null = null;
  let kapandi = false;
  const adaylar = cozumAdaylari(b.materials);

  const kok = el('div', 'fp');
  kok.id = DOSYA_PANEL_ID;
  const kart = el('div', 'fp-kart');
  kart.setAttribute('role', 'dialog');
  kart.setAttribute('aria-modal', 'true');
  kart.setAttribute('aria-labelledby', 'dpBaslik');
  const baslik = el('h2', 'fp-baslik', `Dosya ekle – ${b.konuAdi}`);
  baslik.id = 'dpBaslik';
  const bilgi = el('p', 'dp-bilgi');

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
  adKutu.oninput = () => { girilen = adKutu.value; hata = null; ciz(); };
  adSatir.append(adKutu);
  const uyari = el('p', 'dp-uyari');
  uyari.setAttribute('aria-live', 'polite');

  const not = el('p', 'fp-not');
  const vazgec = dugme('fp-vazgec', 'Vazgeç');
  const ekle = dugme('fp-ekle', 'Ekle');
  const alt = el('div', 'fp-alt');
  alt.append(vazgec, ekle);
  kart.append(baslik, bilgi, hedefler, cozumSatir, adSatir, uyari, not, alt);
  kok.append(kart);
  document.body.append(kok);

  function secHedef(h: PanelHedef): void {
    hedef = h;
    hata = null;
    ciz();
  }

  function ciz(): void {
    bilgi.textContent = [hazir.ad, boyutYazi(hazir.bytes.byteLength), kaynakEtiketi(hazir.kaynak),
      sayfa === undefined ? 'sayfa sayılıyor…' : sayfaYazi(sayfa)].join(' · ');
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
    const e = ekleDurumu({ ornek: b.ornek, secenek, ad: ad ?? { duzenlenebilir: false, ad: '', hata: null }, ekleniyor, hataVar: !!hata });
    ekle.disabled = !e.aktif;
    ekle.textContent = e.metin;
    vazgec.disabled = ekleniyor;
    const notMetni = e.aciklama ?? hata ?? (hedef ? null : 'Bu dosya bu konuda hiçbir yere eklenemiyor.');
    not.textContent = notMetni ?? '';
    not.hidden = !notMetni;
    not.classList.toggle('fp-hata', !e.aciklama && !!hata);
  }

  function kapat(): void {
    if (ekleniyor) return;
    kapandi = true;
    removeEventListener('keydown', tus, true);
    kok.remove();
  }

  function tus(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); kapat(); }
  }

  vazgec.onclick = kapat;
  kok.addEventListener('click', e => { if (e.target === kok) kapat(); });
  addEventListener('keydown', tus, true);
  ekle.onclick = async () => {
    if (ekleniyor || ekle.disabled || !hedef) return;
    const h = dosyaHedefi(hedef, cozumOf);
    const ad = adDurumu(b.materials, hedef, girilen, cozumOf);
    if (!h || !ad.ad || ad.hata) return;
    // the same target + name as the failed try: the same islemId (konuyaDosyaEkle finds "its" file)
    const anahtar = islemAnahtari(hedef, ad.ad, cozumOf);
    if (islem?.anahtar !== anahtar) islem = { anahtar, id: crypto.randomUUID() };
    ekleniyor = true;
    ciz();
    let r: DosyaEklendi;
    try {
      r = await b.ekle(h, ad.ad, islem.id);
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
  void sayfaSayisi(hazir).then(n => { sayfa = n; if (!kapandi) ciz(); });
  void b.klasorler().then(k => { klasor = k; if (!kapandi && !ekleniyor) ciz(); }, () => {});
}
