import { yaziSatiriMi, type OcrSayfa } from './kayit/sema';

// Task 6.4c-2: the read text of one page, plain and only behind ?ocrKayit=1 (the real "Temiz yazı" view is 6.4e).
// Parts in their ink colour, indent per level, struck-through parts, formulas in mono, drawings as a note.
// The model's text goes in through textContent only (never as HTML).

const RENK: Record<string, string> = { siyah: '#1b1b1b', mavi: '#1f4fbf', kirmizi: '#c0392b', yesil: '#1e8449', kursun: '#6b6b6b', diger: '#8e44ad' };

export function okunanMetinCiz(s: OcrSayfa): HTMLElement {
  const kutu = document.createElement('div');
  kutu.className = 'ocr-okunan';
  kutu.style.cssText = 'font:16px/1.5 system-ui;background:#fffdf7;border:1px solid #ccc;border-radius:6px;padding:8px 10px;margin:6px 0';
  for (const satir of s.satirlar) {
    const p = document.createElement('div');
    p.style.paddingLeft = `${satir.girinti * 1.5}em`;
    if (!yaziSatiriMi(satir)) {
      p.style.cssText += ';color:#777;font-style:italic';
      p.textContent = `[çizim: ${satir.cizim}]`;
    } else {
      satir.parcalar.forEach((parca, i) => {
        if (i) p.append(' ');
        const e = document.createElement(parca.ustuCizili ? 's' : 'span');
        e.textContent = parca.metin;
        e.style.color = RENK[parca.renk] ?? RENK.siyah;
        if (parca.tur === 'formul') e.style.cssText += ';font-family:ui-monospace,monospace;font-style:italic';
        if (parca.duzeltme) { e.title = `Düzeltme: ${parca.duzeltme}`; e.style.textDecorationLine = parca.ustuCizili ? 'line-through underline' : 'underline'; e.style.textDecorationStyle = 'dotted'; }
        p.append(e);
      });
    }
    kutu.append(p);
  }
  if (!s.satirlar.length) kutu.textContent = '(Sayfada okunan satır yok.)';
  const alt = document.createElement('small');
  alt.style.cssText = 'display:block;color:#777;margin-top:4px';
  alt.textContent = `${s.model} · ${new Date(s.okunma).toLocaleString('tr-TR')}`;
  kutu.append(alt);
  return kutu;
}
