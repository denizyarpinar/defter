import type { DriveFile } from '../drive/drive';
import { KIRP_VARSAYILAN, RENK_DUZELT_VARSAYILAN } from '../defter/ayarlar';
import { hazirlaKirpli, onizlemeHazirla, type KirpliGorsel } from '../defter/gorsel';
import { GorselHatasi } from '../defter/gorselHesap';
import type { BekleyenJpeg } from '../defter/bekleyenFotoKayit';
import { boyutYazi, cikar, ekleDurumu, hedefHesapla, renkEtiketi, tasi } from '../defter/fotoPanelDurumu';
import type { Kose4 } from '../defter/kirp/kirpHesap';
import { kipDegistir, kirpYazi, type KirpKarari, type KirpKip } from '../defter/kirp/kirpKarar';
import { gorunurAlaniDuzelt } from './gorunurAlan';
import { acKoseDuzenleyici, type KoseDuzenleyici } from './koseDuzenleyici';
import { toast } from './toast';

// Task 5.8a: "Fotoğraf ekle" panel over the reader. Photos are prepared one at a time (iPad memory).
// Task 5.8c: the page is cropped by default; each thumbnail has a crop / whole-photo toggle.
// The original File and the corners are kept, only the current JPEG is in memory.
// Task 5.8d: tapping a thumbnail opens the corner editor (corners by hand); "elle" badge.
// Task 5.8f: "Ekle" saves the photos on the device (b.ekle) and closes; if saving fails it stays open with the error.
// Task 6.2c: "Renk düzelt" (filter E) per photo, on by default; the thumbnail shows the filtered page.
// The corner editor still works on the unfiltered photo.

export interface FotoPanelBaglam {
  konuAdi: string;
  ozetDosyalari: DriveFile[];
  acikDosyaId: string | null;
  sayfaSayisi: (fileId: string) => number | undefined;
  ornek: boolean;
  // task 5.8f: saves the photos on the device and starts the adding; rejects (Turkish message) when
  // nothing was saved. hedef null: a new ozet.pdf.
  ekle(jpegler: BekleyenJpeg[], hedef: DriveFile | null): Promise<void>;
}

interface Oge {
  hazir: KirpliGorsel; file: File; ad: string; url: string; mesgul: boolean;
  otoKoseler: Kose4 | null;   // found automatically at the first preparation (the editor's "Otomatik")
  elle: boolean;              // corners set in the corner editor
  renk: boolean;              // "Renk düzelt" asked (hazir.renkDuzelt: what was actually done)
}

const jpegUrl = (h: KirpliGorsel) => URL.createObjectURL(new Blob([h.gorsel.bytes as BlobPart], { type: 'image/jpeg' }));

// crop: corner brackets; whole photo: a filled frame
const SIMGE_KIRP = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
// colour fix: a half-filled circle (on) / an empty one (off)
const SIMGE_RENK = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>';
const SIMGE_RENK_YOK = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const SIMGE_TUMU = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="1.5" fill="currentColor" opacity=".35" stroke="currentColor" stroke-width="1.8"/></svg>';

export const FOTO_PANEL_ID = 'fotoPanel';   // Okuyucu.ts checks it by this id (no import: the panel is lazy)

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

// files: what was chosen with the reader's button (the picker opens there, inside the tap).
export function acFotoPanel(b: FotoPanelBaglam, dosyalar: File[]): void {
  if (document.getElementById(FOTO_PANEL_ID)) return;
  let ogeler: Oge[] = [];
  let bekleyen: File[] = [];
  let toplam = 0, biten = 0;   // "Hazırlanıyor biten/toplam" of the current batch
  let calisiyor = false;
  let kapandi = false;
  let seciliId: string | null = null;
  let duzenleyici: KoseDuzenleyici | null = null;
  let kaydediliyor = false;
  let hataMetni: string | null = null;   // saving on the device failed
  // every preparation (new photos and toggles) runs on this chain: one big image at a time
  let zincir: Promise<unknown> = Promise.resolve();
  const sirada = <T>(is: () => Promise<T>): Promise<T> => {
    const p = zincir.then(is);
    zincir = p.catch(() => undefined);
    return p;
  };

  const kok = el('div', 'fp');
  kok.id = FOTO_PANEL_ID;
  const kart = el('div', 'fp-kart');
  kart.setAttribute('role', 'dialog');
  kart.setAttribute('aria-modal', 'true');
  kart.setAttribute('aria-labelledby', 'fpBaslik');
  const baslik = el('h2', 'fp-baslik', `Fotoğraf ekle – ${b.konuAdi}`);
  baslik.id = 'fpBaslik';
  const durum = el('p', 'fp-durum');
  durum.setAttribute('aria-live', 'polite');
  const liste = el('ol', 'fp-liste');
  const input = el('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.hidden = true;
  const arti = dugme('fp-arti', '+ Fotoğraf');
  const hedefSatir = el('div', 'fp-hedef');
  const not = el('p', 'fp-not');
  const vazgec = dugme('fp-vazgec', 'Vazgeç');
  const ekle = dugme('fp-ekle', 'Ekle');
  const alt = el('div', 'fp-alt');
  alt.append(vazgec, ekle);
  kart.append(baslik, durum, liste, arti, input, hedefSatir, not, alt);
  kok.append(kart);
  document.body.append(kok);

  const hedef = () => hedefHesapla({ ozetDosyalari: b.ozetDosyalari, acikDosyaId: b.acikDosyaId, seciliId, sayfaSayisi: b.sayfaSayisi, yeniSayfa: ogeler.length });

  function ciz(): void {
    durum.textContent = calisiyor ? `Hazırlanıyor ${Math.min(biten + 1, toplam)}/${toplam}` : ogeler.length ? '' : 'Henüz fotoğraf yok.';
    durum.hidden = !durum.textContent;
    liste.replaceChildren(...ogeler.map((o, i) => {
      const li = el('li', 'fp-oge');
      li.classList.toggle('fp-mesgul', o.mesgul);
      const img = el('img');
      img.src = o.url;
      img.alt = '';
      const duzelt = dugme('fp-duzelt', '', `${i + 1}. fotoğraf: köşeleri düzelt`);
      duzelt.append(img);
      duzelt.disabled = o.mesgul;
      duzelt.onclick = () => void koseDuzelt(o);
      const sol = dugme('fp-ok', '‹', `${i + 1}. fotoğrafı sola taşı`);
      sol.disabled = i === 0;
      sol.onclick = () => { ogeler = tasi(ogeler, i, -1); ciz(); };
      const sag = dugme('fp-ok', '›', `${i + 1}. fotoğrafı sağa taşı`);
      sag.disabled = i === ogeler.length - 1;
      sag.onclick = () => { ogeler = tasi(ogeler, i, 1); ciz(); };
      const x = dugme('fp-cikar', '×', `${i + 1}. fotoğrafı çıkar`);
      x.onclick = () => { URL.revokeObjectURL(o.url); ogeler = cikar(ogeler, i); ciz(); };
      const oklar = el('div', 'fp-oklar');
      oklar.append(sol, sag);
      const kirp = o.hazir.kip === 'kirp';
      const gecis = dugme('fp-kirp', '', kirp ? `${i + 1}. fotoğraf: sayfa kırpılıyor – tüm fotoğrafa geç` : `${i + 1}. fotoğraf: tüm fotoğraf – sayfayı kırp`);
      gecis.innerHTML = kirp ? SIMGE_KIRP : SIMGE_TUMU;
      gecis.setAttribute('aria-pressed', String(kirp));
      gecis.disabled = o.mesgul;
      gecis.onclick = () => void degistir(o);
      const renk = dugme('fp-renk', '', renkEtiketi(o.renk, i + 1));
      renk.innerHTML = o.renk ? SIMGE_RENK : SIMGE_RENK_YOK;
      renk.setAttribute('aria-pressed', String(o.renk));
      renk.title = 'Renk düzelt';
      renk.disabled = o.mesgul;
      renk.onclick = () => void renkDegistir(o);
      const resim = el('div', 'fp-resim');
      resim.append(duzelt, gecis, renk);
      if (o.hazir.kirpilamadi && !kirp) resim.append(el('span', 'fp-rozet', 'Kırpılamadı'));
      else if (o.elle && kirp) resim.append(el('span', 'fp-rozet fp-rozet-elle', 'elle'));
      li.append(resim, el('span', 'fp-no', String(i + 1)), x, oklar, el('small', 'fp-boyut', boyutYazi(o.hazir.gorsel.yeniBoyut)));
      return li;
    }));
    const h = hedef();
    if (h.tur === 'secim') {
      const sec = el('select', 'fp-sec');
      sec.setAttribute('aria-label', 'Hangi özet dosyasına eklensin');
      sec.append(...h.dosyalar.map(f => new Option(f.name, f.id)));
      sec.value = h.hedef!.id;
      sec.onchange = () => { seciliId = sec.value; ciz(); };
      const lbl = el('label', 'fp-seclbl', 'Hedef dosya');
      lbl.append(sec);
      hedefSatir.replaceChildren(lbl, el('span', '', h.metin));
    } else hedefSatir.replaceChildren(el('span', '', h.metin));
    const e = ekleDurumu({ ornek: b.ornek, hazirSayisi: ogeler.length, hazirlaniyor: calisiyor || ogeler.some(o => o.mesgul) });
    ekle.disabled = !e.aktif || kaydediliyor;
    ekle.textContent = kaydediliyor ? 'Kaydediliyor…' : 'Ekle';
    const notMetni = e.aciklama ?? hataMetni;
    not.textContent = notMetni ?? '';
    not.hidden = !notMetni;
    not.classList.toggle('fp-hata', !e.aciklama && !!hataMetni);
  }

  // one at a time; new files chosen meanwhile join the same batch
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
        const h = await sirada(() => hazirlaKirpli(f, KIRP_VARSAYILAN ? 'kirp' : 'tumu', undefined, { renkDuzelt: RENK_DUZELT_VARSAYILAN }));
        if (kapandi) break;
        ogeler.push({ hazir: h, file: f, ad: f.name, url: jpegUrl(h), mesgul: false, otoKoseler: h.koseler, elle: false, renk: RENK_DUZELT_VARSAYILAN });
      } catch (e) {
        if (kapandi) break;
        toast(e instanceof GorselHatasi ? `${f.name}: ${e.message}` : `${f.name} hazırlanamadı. Başka bir fotoğraf seç.`);
        if (!(e instanceof GorselHatasi)) console.warn('Fotoğraf hazırlanamadı.', e);
      }
      biten++;
      ciz();
    }
    calisiyor = false;
    if (!kapandi) ciz();
  }

  // the thumbnail's toggle: the same File again, with the kept corners, in the other mode.
  // No corners yet (none found): the corner editor opens instead, so the toggle is never dead.
  async function degistir(o: Oge): Promise<void> {
    if (o.mesgul) return;
    if (!o.hazir.koseler) return koseDuzelt(o);
    const kip = kipDegistir(o.hazir.kip, o.hazir.koseler);
    if (kip === o.hazir.kip) return;
    await yenidenHazirla(o, kip, o.hazir);
  }

  // "Renk düzelt": the same File again, same mode and corners, with the filter on or off
  async function renkDegistir(o: Oge): Promise<void> {
    if (o.mesgul) return;
    await yenidenHazirla(o, o.hazir.kip, o.hazir, o.elle, !o.renk);
  }

  // the corner editor; Uygula → crop with the chosen (sorted) corners
  async function koseDuzelt(o: Oge): Promise<void> {
    if (o.mesgul || duzenleyici || kapandi) return;
    const d = acKoseDuzenleyici(kok, {
      ad: o.ad,
      onizleme: sirada(() => onizlemeHazirla(o.file)),
      koseler: o.hazir.koseler,
      otoKoseler: o.otoKoseler
    });
    duzenleyici = d;
    const s = await d.sonuc;
    duzenleyici = null;
    if (!s || kapandi || !ogeler.includes(o)) return;
    await yenidenHazirla(o, 'kirp', { ...o.hazir, kip: 'kirp', koseler: s.koseler, kirpilamadi: false }, s.elle);
  }

  async function yenidenHazirla(o: Oge, kip: KirpKip, onceki: KirpKarari, elle = o.elle, renk = o.renk): Promise<void> {
    o.mesgul = true;
    ciz();
    try {
      const h = await sirada(() => hazirlaKirpli(o.file, kip, onceki, { renkDuzelt: renk }));
      if (kapandi || !ogeler.includes(o)) return;
      URL.revokeObjectURL(o.url);   // the old JPEG goes before the new one is kept
      o.hazir = h;
      o.url = jpegUrl(h);
      o.elle = elle;
      o.renk = renk;
    } catch (e) {
      if (kapandi) return;
      toast(e instanceof GorselHatasi ? `${o.ad}: ${e.message}` : `${o.ad} hazırlanamadı. Tekrar dene.`);
      if (!(e instanceof GorselHatasi)) console.warn('Fotoğraf hazırlanamadı.', e);
    } finally {
      o.mesgul = false;
    }
    if (!kapandi) ciz();
  }

  function kapat(): void {
    kapandi = true;
    duzenleyici?.kapat();
    bekleyen = [];
    for (const o of ogeler) URL.revokeObjectURL(o.url);
    ogeler = [];
    removeEventListener('keydown', tus, true);
    kok.remove();
    gorunurAlaniDuzelt('fotoğraf paneli kapandı');   // task 5.10g-ek2: as the file panel (iPad)
  }

  function tus(e: KeyboardEvent): void {
    if (duzenleyici) return;   // the corner editor has the keys (its Esc = Vazgeç)
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); kapat(); }
  }

  arti.onclick = () => input.click();
  input.onchange = () => {
    const f = [...(input.files ?? [])];
    input.value = '';   // the same photo can be chosen again
    if (f.length) void hazirla(f);
  };
  vazgec.onclick = kapat;
  kok.addEventListener('click', e => { if (e.target === kok) kapat(); });
  addEventListener('keydown', tus, true);
  ekle.onclick = async () => {
    if (kaydediliyor || ekle.disabled) return;
    const h = hedef();
    kaydediliyor = true;
    hataMetni = null;
    ciz();
    console.info('Fotoğraf ekle:', ogeler.map((o, i) =>
      `${i + 1}. ${o.ad} ${o.hazir.gorsel.width}×${o.hazir.gorsel.height} ${boyutYazi(o.hazir.gorsel.yeniBoyut)} ${kirpYazi(o.hazir.kip, o.hazir.kirpilamadi, o.elle)}${o.hazir.renkDuzelt ? ' renk düzeltildi' : ''}`).join(' · '));
    try {
      await b.ekle(ogeler.map(o => ({ ...o.hazir.gorsel, renkDuzelt: o.hazir.renkDuzelt })), h.hedef);
    } catch (e) {
      kaydediliyor = false;
      hataMetni = e instanceof Error ? e.message : 'Fotoğraflar kaydedilemedi. Tekrar dene.';
      if (!kapandi) ciz();
      return;
    }
    kaydediliyor = false;
    kapat();
  };

  ciz();
  vazgec.focus();
  void hazirla(dosyalar);
}
