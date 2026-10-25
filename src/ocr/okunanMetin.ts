import { duzenlenebilir, kelimeler, yazildigiGibi } from './kayit/elleDuzelt';
import { yaziSatiriMi, type OcrParca, type OcrSayfa } from './kayit/sema';

// Task 6.4c-2: the read text of one page, plain, in the "El yazısını oku" panel (the real "Temiz yazı" view is 6.4e).
// Parts in their ink colour, indent per level, struck-through parts, formulas in mono, drawings as a note.
// The model's text goes in through textContent only (never as HTML).
// Task 6.4e-3: with `duzenle` (the account may read handwriting) the shown text (duzeltme ?? metin) of a written
// part is word by word tappable; a word corrected by hand has a dotted underline, title "yazıldığı gibi: …".

export interface KelimeYeri { satir: number; parca: number; kelime: number }
export interface OkunanMetinSecenek { duzenle?(yer: KelimeYeri, kelime: HTMLElement): void }

const RENK: Record<string, string> = { siyah: '#1b1b1b', mavi: '#1f4fbf', kirmizi: '#c0392b', yesil: '#1e8449', kursun: '#6b6b6b', diger: '#8e44ad' };

export function okunanMetinCiz(s: OcrSayfa, o: OkunanMetinSecenek = {}): HTMLElement {
  const kutu = document.createElement('div');
  kutu.className = 'ocr-okunan';
  kutu.style.cssText = 'font:16px/1.5 system-ui;background:#fffdf7;border:1px solid #ccc;border-radius:6px;padding:8px 10px;margin:6px 0';
  s.satirlar.forEach((satir, si) => {
    const p = document.createElement('div');
    p.style.paddingLeft = `${satir.girinti * 1.5}em`;
    if (!yaziSatiriMi(satir)) {
      p.style.cssText += ';color:#777;font-style:italic';
      p.textContent = `[çizim: ${satir.cizim}]`;
    } else {
      satir.parcalar.forEach((parca, i) => {
        if (i) p.append(' ');
        const e = document.createElement(parca.ustuCizili ? 's' : 'span');
        e.style.color = RENK[parca.renk] ?? RENK.siyah;
        if (parca.tur === 'formul') e.style.cssText += ';font-family:ui-monospace,monospace;font-style:italic';
        if (o.duzenle && duzenlenebilir(parca)) kelimeKoy(e, parca, { satir: si, parca: i }, o.duzenle);
        else {
          e.textContent = parca.metin;
          if (parca.duzeltme) { e.title = `Düzeltme: ${parca.duzeltme}`; noktali(e, parca.ustuCizili); }
        }
        p.append(e);
      });
    }
    kutu.append(p);
  });
  if (!s.satirlar.length) kutu.textContent = '(Sayfada okunan satır yok.)';
  const alt = document.createElement('small');
  alt.style.cssText = 'display:block;color:#777;margin-top:4px';
  alt.textContent = `${s.model} · ${new Date(s.okunma).toLocaleString('tr-TR')}`;
  kutu.append(alt);
  return kutu;
}

const noktali = (e: HTMLElement, cizili?: boolean) => {
  e.style.textDecorationLine = cizili ? 'line-through underline' : 'underline';
  e.style.textDecorationStyle = 'dotted';
};

// The shown text word by word; the core of each word is a tap target (punctuation around it is plain text)
function kelimeKoy(e: HTMLElement, parca: OcrParca, yer: Omit<KelimeYeri, 'kelime'>, duzenle: NonNullable<OkunanMetinSecenek['duzenle']>): void {
  // a correction by the model (not by hand): the whole part as before
  if (parca.duzeltme !== undefined && !parca.elle) { e.title = `yazıldığı gibi: ${parca.metin}`; noktali(e); }
  kelimeler(parca).forEach((k, i) => {
    if (i) e.append(' ');
    if (k.bas) e.append(k.bas);
    if (k.oz) {
      const w = document.createElement('span');
      w.textContent = k.oz;
      w.dataset.kelime = String(i);
      w.tabIndex = 0;
      w.setAttribute('role', 'button');
      w.style.cssText = 'cursor:pointer;border-radius:3px';
      const ham = yazildigiGibi(parca, i);
      if (ham !== null) { w.title = `yazıldığı gibi: ${ham}`; noktali(w); }
      const ac = () => duzenle({ ...yer, kelime: i }, w);
      w.addEventListener('click', ac);
      w.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); ac(); } });
      e.append(w);
    }
    if (k.son) e.append(k.son);
  });
}
