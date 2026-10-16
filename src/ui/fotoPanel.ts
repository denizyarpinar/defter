import type { DriveFile } from '../drive/drive';
import { hazirlaGorsel, type HazirGorsel } from '../defter/gorsel';
import { GorselHatasi } from '../defter/gorselHesap';
import { boyutYazi, cikar, ekleDurumu, hedefHesapla, tasi } from '../defter/fotoPanelDurumu';
import { toast } from './toast';

// Task 5.8a: "Fotoğraf ekle" panel over the reader. A draft: "Ekle" writes nothing,
// it logs what it would do. Photos are prepared one at a time (iPad memory).

export interface FotoPanelBaglam {
  konuAdi: string;
  ozetDosyalari: DriveFile[];
  acikDosyaId: string | null;
  sayfaSayisi: (fileId: string) => number | undefined;
  ornek: boolean;
  kilitAcik: boolean;
}

interface Oge { gorsel: HazirGorsel; ad: string; url: string }

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
      const img = el('img');
      img.src = o.url;
      img.alt = `${i + 1}. fotoğraf`;
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
      li.append(img, el('span', 'fp-no', String(i + 1)), x, oklar, el('small', 'fp-boyut', boyutYazi(o.gorsel.yeniBoyut)));
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
    const e = ekleDurumu({ ornek: b.ornek, kilitAcik: b.kilitAcik, hazirSayisi: ogeler.length, hazirlaniyor: calisiyor });
    ekle.disabled = !e.aktif;
    not.textContent = e.aciklama ?? '';
    not.hidden = !e.aciklama;
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
        const g = await hazirlaGorsel(f);
        if (kapandi) break;
        ogeler.push({ gorsel: g, ad: f.name, url: URL.createObjectURL(new Blob([g.bytes as BlobPart], { type: 'image/jpeg' })) });
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

  function kapat(): void {
    kapandi = true;
    bekleyen = [];
    for (const o of ogeler) URL.revokeObjectURL(o.url);
    ogeler = [];
    removeEventListener('keydown', tus, true);
    kok.remove();
  }

  function tus(e: KeyboardEvent): void {
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
  ekle.onclick = () => {
    const h = hedef();
    console.log('[5.8a taslak] Drive\'a yazılmadı.', {
      hedef: h.hedef ? { ad: h.hedef.name, id: h.hedef.id } : 'yeni ozet.pdf',
      tur: h.tur,
      eskiSayfa: h.eskiSayfa ?? 'bilinmiyor',
      yeniSayfa: ogeler.length,
      jpegler: ogeler.map((o, i) => ({ sira: i + 1, dosya: o.ad, px: `${o.gorsel.width}×${o.gorsel.height}`, boyut: boyutYazi(o.gorsel.yeniBoyut), bayt: o.gorsel.yeniBoyut }))
    });
    toast('Taslak: eklenmedi');
    kapat();
  };

  ciz();
  vazgec.focus();
  void hazirla(dosyalar);
}
