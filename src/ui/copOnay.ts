import {
  adSorulur, BASLIKLAR, copAcik, hataAdimi, hataDugmeleri, kapatilabilir, ozetMetni, sayildi, uyariMetni,
  type CopAdimi, type CopOzeti, type CopTuru
} from './copOnayDurumu';
import { gorunurAlaniDuzelt } from './gorunurAlan';

// Task 6.K5b: the trash dialog (the logic is in copOnayDurumu.ts). One dialog for a topic, a unit, a book and a
// half-made book; the caller gives what is counted and what runs:
// - onizle: what goes (Drive is only read). Changes on the device not in Drive yet → a warning first
//   ("Vazgeç" / "Yine de çöpe at"; the records stay on the device).
// - A book: its name has to be typed (any case; İ/ı as I/i), else the red button stays grey.
// - calistir: the first try and "Tekrar dene" (the operation keeps what is done, it goes on where it stopped).
//   While it runs nothing closes it (Esc, a tap outside, Vazgeç).
// - Error: the text + Tekrar dene (or Tekrar giriş yap) + Vazgeç (vazgec: what was done goes back; that may fail
//   too: then Tekrar dene / Kapat). Done → the dialog closes and `basarili` (the caller shows "Çöpe atıldı · Geri al").
// - ilkHata: "Geri al" failed after the toast: the dialog opens in its error state (Tekrar dene / Kapat); it finishes
//   "Geri al" even when the toast is gone.
// The look is the file panel's (.fp); it sits above the wizard (#copOnay z-index).

export const COP_ONAY_ID = 'copOnay';

export interface CopOnayGirdisi {
  tur: CopTuru;
  ad: string;
  onizle?: () => Promise<CopOzeti>;
  calistir: () => Promise<void>;
  vazgec?: () => Promise<void>;
  girisYap: () => Promise<void> | void;
  basarili: () => void;
  ilkHata?: unknown;      // opens in the error state of "Geri al"
  kapandi?: (cop: boolean) => void;   // the dialog is gone; cop: the operation finished (not Vazgeç / Kapat)
}

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

export const copOnayAcikMi = (): boolean => !!document.getElementById(COP_ONAY_ID);

export function copOnayAc(g: CopOnayGirdisi): void {
  if (copOnayAcikMi()) return;
  let adim: CopAdimi = g.ilkHata !== undefined ? hataAdimi(g.ilkHata, 'geri') : { tur: 'sayiliyor' };
  let yazilan = '';
  let geriModu = g.ilkHata !== undefined;   // what runs now is "Geri al" (after Vazgeç, or after the toast)

  const kok = el('div', 'fp');
  kok.id = COP_ONAY_ID;
  const kart = el('div', 'fp-kart co-kart');
  kart.setAttribute('role', 'alertdialog');
  kart.setAttribute('aria-modal', 'true');
  kart.setAttribute('aria-labelledby', 'coBaslik');
  kart.setAttribute('aria-describedby', 'coMetin');
  const baslik = el('h2', 'fp-baslik', geriModu ? `Geri al: ${g.ad}` : BASLIKLAR[g.tur]);
  baslik.id = 'coBaslik';
  const adSatiri = el('p', 'co-ad', g.ad);
  adSatiri.hidden = geriModu;
  const metin = el('p', 'fp-not co-metin');
  metin.id = 'coMetin';
  metin.setAttribute('aria-live', 'polite');
  const adEt = el('label', 'co-adalan', `Onaylamak için kitabın adını yaz: ${g.ad}`);
  const adKutu = el('input');
  adKutu.type = 'text';
  adKutu.autocomplete = 'off';
  adKutu.spellcheck = false;
  adKutu.enterKeyHint = 'done';
  adEt.append(adKutu);
  const alt = el('div', 'fp-alt');
  const yan = dugme('fp-vazgec', 'Vazgeç');
  const ana = dugme('fp-ekle co-cop', 'Çöpe at');
  alt.append(yan, ana);
  kart.append(baslik, adSatiri, metin, adEt, alt);
  kok.append(kart);
  document.body.append(kok);

  function ciz(): void {
    const a = adim;
    let m = '';
    adEt.hidden = !(adSorulur(g.tur) && a.tur === 'onay');
    yan.disabled = !kapatilabilir(a);
    yan.textContent = 'Vazgeç';
    ana.classList.toggle('co-kirmizi', a.tur === 'onay' || a.tur === 'uyari');
    switch (a.tur) {
      case 'sayiliyor':
        m = 'Hesaplanıyor…';
        ana.textContent = 'Çöpe at';
        ana.disabled = true;
        break;
      case 'uyari':
        m = uyariMetni(a.ozet.bekleyen);
        ana.textContent = 'Yine de çöpe at';
        ana.disabled = false;
        break;
      case 'onay':
        m = ozetMetni(g.tur, a.ozet);
        ana.textContent = 'Çöpe at';
        ana.disabled = !copAcik(a, adSorulur(g.tur), yazilan, g.ad);
        break;
      case 'calisiyor':
        m = a.geri ? 'Geri alınıyor…' : 'Çöpe atılıyor…';
        ana.textContent = a.geri ? 'Geri alınıyor…' : 'Çöpe atılıyor…';
        ana.disabled = true;
        break;
      case 'hata': {
        m = a.mesaj;
        const d = hataDugmeleri(a);
        ana.textContent = d.ana === 'giris' ? 'Tekrar giriş yap' : 'Tekrar dene';
        ana.disabled = false;
        yan.textContent = d.yan === 'vazgec' ? 'Vazgeç' : 'Kapat';
        break;
      }
    }
    if (metin.textContent !== m) metin.textContent = m;   // the same text is not read out again
    metin.classList.toggle('fp-hata', a.tur === 'hata' || a.tur === 'uyari');
  }

  async function say(): Promise<void> {
    adim = { tur: 'sayiliyor' };
    ciz();
    try {
      adim = g.onizle ? sayildi(await g.onizle()) : { tur: 'onay', ozet: { konu: 0, dosya: 0, bekleyen: 0 } };
    } catch (e) {
      adim = hataAdimi(e, 'sayim');
    }
    ciz();
    if (adim.tur === 'onay' && adSorulur(g.tur)) adKutu.focus({ preventScroll: true });
  }

  async function calis(): Promise<void> {
    adim = { tur: 'calisiyor', geri: geriModu };
    ciz();
    try {
      await (geriModu && !g.ilkHata ? g.vazgec!() : g.calistir());
    } catch (e) {
      adim = hataAdimi(e, geriModu ? 'geri' : 'cop');
      ciz();
      return;
    }
    const vazgecildi = geriModu && !g.ilkHata;
    kapat(!vazgecildi);
    if (!vazgecildi) g.basarili();
  }

  ana.onclick = () => {
    const a = adim;
    if (ana.disabled) return;
    if (a.tur === 'uyari') { adim = { tur: 'onay', ozet: a.ozet }; ciz(); if (adSorulur(g.tur)) adKutu.focus({ preventScroll: true }); return; }
    if (a.tur === 'onay') { void calis(); return; }
    if (a.tur !== 'hata') return;
    if (a.izin) {
      void Promise.resolve(g.girisYap()).catch(() => undefined).then(() => {
        adim = { ...a, izin: false, mesaj: 'Giriş yapıldıysa Tekrar dene.' };
        ciz();
      });
      return;
    }
    if (a.asama === 'sayim') void say(); else void calis();
  };

  yan.onclick = () => {
    const a = adim;
    if (!kapatilabilir(a)) return;
    // Vazgeç after a failed trash: what was done goes back first (the dialog stays until it is)
    if (a.tur === 'hata' && a.asama === 'cop' && g.vazgec) { geriModu = true; void calis(); return; }
    kapat();
  };

  adKutu.addEventListener('input', () => { yazilan = adKutu.value; ciz(); });
  adKutu.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ana.click(); } });

  function tus(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (kapatilabilir(adim) && !(adim.tur === 'hata' && adim.asama === 'cop')) kapat();
  }

  function kapat(cop = false): void {
    removeEventListener('keydown', tus, true);
    kok.remove();
    gorunurAlaniDuzelt('çöp penceresi kapandı');
    g.kapandi?.(cop);
  }

  kok.addEventListener('click', e => { if (e.target === kok && kapatilabilir(adim) && !(adim.tur === 'hata' && adim.asama === 'cop')) kapat(); });
  addEventListener('keydown', tus, true);

  ciz();
  if (g.ilkHata === undefined) void say();
  yan.focus({ preventScroll: true });
}
