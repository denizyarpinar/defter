import type { BookPage } from './kitapSayfalari';
import { EN_AZ_HARF, metinAra, metinsiz, sayfaKutusuna, sorguHazirla, type Eslesme, type HazirSayfa } from './metinAra';
import { canvasOlcucu } from './metinOlcu';
import type { MetinOnbellek } from './metinOnbellek';

// Task 6.3b, development only (npm run dev): window.defterMetinAra(q) searches the pages of the open reader
// (the material on screen: brifing + sorular and the solution's pages too) and logs what it found.
// Reads only; nothing is written anywhere.

const ne = 'defterMetinAra';
const ms = (n: number) => `${Math.round(n)} ms`;
const CEVRE = 30;   // characters around a match

export function installMetinAra(ortam: () => { pages: BookPage[]; metin: MetinOnbellek } | null): void {
  (window as unknown as { defterMetinAra: (q: string) => Promise<Eslesme[]> }).defterMetinAra = async q => {
    const o = ortam();
    if (!o) { console.warn(`${ne}: okuyucu açık değil. Önce bir PDF konusu aç.`); return []; }
    if (!sorguHazirla(String(q ?? ''))) { console.warn(`${ne}: en az ${EN_AZ_HARF} harf yaz.`); return []; }

    const tum = await o.metin.hepsi(o.pages);
    const pdf = tum.sayfalar.filter(s => s.hazir || s.hata);
    console.log(`${ne}: metin · ${pdf.length} PDF sayfası · ${tum.yeni ? `${tum.yeni} sayfa şimdi çıkarıldı: ${ms(tum.ms)}` : `önbellekten (${ms(tum.ms)})`}`);
    const fotograf = tum.sayfalar.filter(s => s.hazir && metinsiz(s.hazir.sayfa)).length;
    const gorsel = tum.sayfalar.filter(s => !s.hazir && !s.hata).length;
    const hata = tum.sayfalar.filter(s => s.hata).length;
    console.log(`${ne}: metinsiz PDF sayfası (fotoğraf) ${fotograf} · PDF olmayan sayfa ${gorsel}${hata ? ` · okunamayan ${hata}` : ''}`);

    const t0 = performance.now();
    const sonuc = metinAra(tum.sayfalar.filter(s => s.hazir).map(s => ({ sayfa: s.indeks, hazir: s.hazir! })), q, canvasOlcucu);
    const sure = performance.now() - t0;
    const sayfaNo = [...new Set(sonuc.map(m => m.sayfa))];
    console.log(`${ne}: "${q}" · ${sonuc.length} eşleşme · ${sayfaNo.length} sayfa · arama ${sure.toFixed(1)} ms`);
    if (sayfaNo.length) {
      const ad = (i: number) => { const p = o.pages[i]; return `s.${i + 1} (${p.ad ?? p.dosyaId} s.${p.pdfSayfa})`; };
      console.log(`${ne}: sayfalar: ${sayfaNo.slice(0, 30).map(ad).join(', ')}${sayfaNo.length > 30 ? ` … +${sayfaNo.length - 30}` : ''}`);
    }
    const hazir = new Map(tum.sayfalar.map(s => [s.indeks, s.hazir]));
    for (const [i, m] of sonuc.slice(0, 5).entries()) {
      const h = hazir.get(m.sayfa)!;
      const k = m.dikdortgenler[0] ? sayfaKutusuna(m.dikdortgenler[0], h.sayfa.gorunum) : null;
      const yer = k ? ` · kutu x ${k.x.toFixed(3)} y ${k.y.toFixed(3)} g ${k.w.toFixed(3)} y ${k.h.toFixed(3)}` : '';
      console.log(`${ne}: ${i + 1}. s.${m.sayfa + 1}: …${cevre(h, m)}…${yer}`);
    }
    return sonuc;
  };
}

// The original text around a match (line ends as spaces), the match between « »
function cevre(h: HazirSayfa, m: Eslesme): string {
  const p = h.sayfa.parcalar;
  const parca = (i: number, bas = 0, bit?: number) => p[i].str.slice(bas, bit) + (bit === undefined && p[i].hasEOL ? ' ' : '');
  let once = parca(m.baslangic.parca, 0, m.baslangic.harf);
  for (let i = m.baslangic.parca - 1; i >= 0 && once.length < CEVRE; i--) once = parca(i) + once;
  let ici = '';
  for (let i = m.baslangic.parca; i <= m.bitis.parca; i++) {
    ici += parca(i, i === m.baslangic.parca ? m.baslangic.harf : 0, i === m.bitis.parca ? m.bitis.harf : undefined);
  }
  let sonra = parca(m.bitis.parca, m.bitis.harf);
  for (let i = m.bitis.parca + 1; i < p.length && sonra.length < CEVRE; i++) sonra += parca(i);
  const tek = (s: string) => s.replace(/\s+/g, ' ');
  return `${tek(once).slice(-CEVRE)}«${tek(ici)}»${tek(sonra).slice(0, CEVRE)}`;
}
