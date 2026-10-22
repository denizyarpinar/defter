import { curveToSvg, hasRealPressure, strokeCurve, type Curve } from './cizgiSekli';
import { kayitlariAyikla, eskiKurallar, olcekBul, ornekKayitlar, yeniKurallar, type Kayit } from './kalemTekrar';
import * as eski from './kalemTestEski';

// Task 6.H2b: development-only comparison page (?kalemTest=1, loaded from main.ts under import.meta.env.DEV,
// not in the build). A ?olcum=1 record (window.defterKalemOlcum() JSON, pasted or picked as a file) or the
// built-in samples, each stroke drawn twice: ESKİ = the kept points of the record with the old shape code,
// YENİ = the record's raw events with the new rules (repeats dropped, 1 px step, the up point) and the new
// shape code. At the zoom it was written at (1×) and 4 times that. Writes nothing anywhere.

const STIL = `
#kalemTest { position: fixed; inset: 0; z-index: 9998; overflow: auto; padding: 12px 16px 40px; box-sizing: border-box;
  background: #f4f1ec; color: #2a231d; font: 14px/1.4 system-ui, sans-serif }
#kalemTest h2 { margin: 0 40px 8px 0; font-size: 16px }
#kalemTest textarea { width: 100%; max-width: 760px; height: 80px; box-sizing: border-box; font: 12px ui-monospace, Menlo, Consolas, monospace }
#kalemTest .kt-arac { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 6px 0 10px }
#kalemTest button, #kalemTest .kt-btn { padding: 8px 12px; border: 0; border-radius: 6px; background: #2a231d; color: #fff; font: inherit; cursor: pointer }
#kalemTest .kt-btn input { display: none }
#kalemTest .kt-kapat { position: fixed; top: 8px; right: 12px; width: 36px; height: 36px; padding: 0; font: 700 20px/1 system-ui }
#kalemTest .kt-cizgi { margin: 14px 0; padding-top: 10px; border-top: 1px solid rgba(0,0,0,.15) }
#kalemTest .kt-bilgi { font-size: 12px; opacity: .8; margin: 2px 0 6px }
#kalemTest .kt-sira { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start }
#kalemTest .kt-yan { min-width: 0 }
#kalemTest .kt-yan > b { display: block; font-size: 13px; margin-bottom: 4px }
#kalemTest .kt-iki { display: flex; gap: 8px; align-items: flex-start; flex-wrap: wrap }
#kalemTest svg { display: block; background: #fff; border: 1px solid rgba(0,0,0,.12); max-width: 100% }
#kalemTest figure { margin: 0 }
#kalemTest figcaption { font-size: 11px; opacity: .7 }
#kalemTest .kt-hata { color: #b3261e }
`;

const PEN = '#1d3a6b', HL = '#f2c500', HL_OPACITY = 0.4;
const num = (v: number) => String(Math.round(v * 100) / 100);

interface Cizim { curve: Curve; arac: 'kalem' | 'fosforlu'; kalinlik: number; noktalar: readonly number[] }

function sinirlar(listeler: readonly (readonly number[])[], pad: number): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of listeler) for (let i = 0; i + 1 < l.length; i += 2) {
    x0 = Math.min(x0, l[i]); x1 = Math.max(x1, l[i]); y0 = Math.min(y0, l[i + 1]); y1 = Math.max(y1, l[i + 1]);
  }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

// One drawing at pxPerPt; the page is upright (pt y up). noktalar: the kept points as small red dots.
function svg(c: Cizim, box: [number, number, number, number], pxPerPt: number, noktalar: boolean): SVGSVGElement {
  const [x0, y0, x1, y1] = box;
  const map = (x: number, y: number) => [x - x0, y1 - y];
  const w = x1 - x0, h = y1 - y0;
  const d = curveToSvg(c.curve, map);
  const yol = c.arac === 'kalem'
    ? `<path d="${d}" fill="${PEN}"/>`
    : `<g style="mix-blend-mode:multiply"><path d="${d}" fill="none" stroke="${HL}" stroke-width="${num(c.kalinlik)}" stroke-linecap="round" stroke-linejoin="round" opacity="${HL_OPACITY}"/></g>`;
  let dots = '';
  if (noktalar) {
    const r = 1.6 / pxPerPt;
    for (let i = 0; i + 1 < c.noktalar.length; i += 2) {
      const [x, y] = map(c.noktalar[i], c.noktalar[i + 1]);
      dots += `<circle cx="${num(x)}" cy="${num(y)}" r="${r.toFixed(3)}" fill="#e53935"/>`;
    }
  }
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', `0 0 ${num(w)} ${num(h)}`);
  el.setAttribute('width', num(w * pxPerPt));
  el.setAttribute('height', num(h * pxPerPt));
  el.innerHTML = yol + dots;
  return el;
}

function figur(caption: string, child: Element): HTMLElement {
  const f = document.createElement('figure');
  const c = document.createElement('figcaption');
  c.textContent = caption;
  f.append(child, c);
  return f;
}

function cizgiBolumu(ad: string, k: Kayit, noktalar: boolean): HTMLElement {
  const bolum = document.createElement('section');
  bolum.className = 'kt-cizgi';
  const arac = k.arac === 'fosforlu' ? 'fosforlu' : 'kalem';
  const kalinlik = k.kalinlik ?? 2;
  const o = olcekBul(k);
  const eskiNokta = k.saklanan;
  // the old code drew the kept pressure as real; the record only has it per event: the pen's points all had it
  const eskiBasinc = arac === 'kalem' && k.pointerType === 'pen'
    ? Array(eskiNokta.length / 2).fill(gruplarBasinc(k)) : undefined;
  const eskiCurve = arac === 'kalem'
    ? eski.penOutline({ noktalar: eskiNokta, basinc: eskiBasinc, kalinlik }, true)
    : eski.smoothCenterline(eskiNokta);
  const y = yeniKurallar(k, o.s);
  const yeniCurve = strokeCurve({ arac, noktalar: y.noktalar, basinc: y.basinc, kalinlik });
  const eskiler: Cizim = { curve: eskiCurve, arac, kalinlik, noktalar: eskiNokta };
  const yeniler: Cizim = { curve: yeniCurve, arac, kalinlik, noktalar: y.noktalar };
  const box = sinirlar([eskiNokta, y.noktalar], kalinlik * (arac === 'kalem' ? 1 : 0.6) + 1);

  const h = document.createElement('b');
  h.textContent = ad;
  const bilgi = document.createElement('div');
  bilgi.className = 'kt-bilgi';
  const kontrol = eskiKurallar(k, o.s).noktalar.length === eskiNokta.length && o.tutuyor;
  bilgi.textContent = [
    `${arac} ${kalinlik} pt`,
    `ölçek ${o.s.toFixed(2)} px/pt (eski kural kaydı ${kontrol ? 'birebir verdi' : `vermedi, en çok ${o.enCok.toFixed(2)} pt fark`})`,
    `nokta: eski ${eskiNokta.length / 2} → yeni ${y.noktalar.length / 2}`,
    `çift atılan ${y.cift}`,
    `basınç: eski ${eskiBasinc ? `sabit ${eskiBasinc[0]} (gerçek sayıldı)` : 'yok'} → yeni ${!y.basinc ? 'yok (hızdan tahmin)' : hasRealPressure(y.basinc, y.noktalar.length / 2) ? 'gerçek' : 'sabit (basınçsız kalem: sabit kalınlık)'}`,
  ].join(' · ');

  const sira = document.createElement('div');
  sira.className = 'kt-sira';
  for (const [baslik, c] of [['ESKİ (kayıttaki noktalar, eski çizim)', eskiler], ['YENİ (çiftsiz ham olaylar, yeni kurallar)', yeniler]] as const) {
    const yan = document.createElement('div');
    yan.className = 'kt-yan';
    const b = document.createElement('b');
    b.textContent = baslik;
    const iki = document.createElement('div');
    iki.className = 'kt-iki';
    iki.append(figur('1× (yazıldığı büyütme)', svg(c, box, o.s, false)), figur('4×', svg(c, box, 4 * o.s, noktalar)));
    yan.append(b, iki);
    sira.append(yan);
  }
  bolum.append(h, bilgi, sira);
  return bolum;
}

// the pressure the record's pen events had (all the same on the ESR pen); 0.5 if none
function gruplarBasinc(k: Kayit): number {
  const p = k.olaylar.find(o => o[0] !== 'u' && o[0] !== 'x');
  return p ? Math.round(p[4] * 100) / 100 : 0.5;
}

export function acKalemTest(): void {
  const stil = document.createElement('style');
  stil.textContent = STIL;
  document.head.append(stil);
  const kok = document.createElement('div');
  kok.id = 'kalemTest';
  const kapat = document.createElement('button');
  kapat.className = 'kt-kapat';
  kapat.textContent = '×';
  kapat.title = 'Kapat';
  kapat.addEventListener('click', () => { kok.remove(); stil.remove(); });
  const baslik = document.createElement('h2');
  baslik.textContent = 'Kalem karşılaştırması (6.H2b) – ESKİ / YENİ';
  const metin = document.createElement('textarea');
  metin.placeholder = 'defterKalemOlcum() JSON\'unu buraya yapıştır (ya da dosya seç). Boşsa örnekler gösterilir.';
  const araclar = document.createElement('div');
  araclar.className = 'kt-arac';
  const goster = document.createElement('button');
  goster.textContent = 'Göster';
  const dosya = document.createElement('label');
  dosya.className = 'kt-btn';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,.json,text/plain,application/json';
  dosya.append('Dosya seç', input);
  const noktaKutu = document.createElement('label');
  const nokta = document.createElement('input');
  nokta.type = 'checkbox';
  nokta.checked = true;
  noktaKutu.append(nokta, ' 4×\'te noktaları göster');
  araclar.append(goster, dosya, noktaKutu);
  const liste = document.createElement('div');
  liste.id = 'ktListe';

  const ciz = () => {
    liste.replaceChildren();
    let kayitlar: { ad: string; kayit: Kayit }[];
    try {
      kayitlar = metin.value.trim()
        ? kayitlariAyikla(metin.value).map((kayit, i) => ({ ad: `Çizgi ${i + 1}`, kayit }))
        : ornekKayitlar();
    } catch (e) {
      const p = document.createElement('p');
      p.className = 'kt-hata';
      p.textContent = e instanceof Error ? e.message : String(e);
      liste.append(p);
      return;
    }
    for (const { ad, kayit } of kayitlar) {
      try {
        liste.append(cizgiBolumu(ad, kayit, nokta.checked));
      } catch (e) {
        const p = document.createElement('p');
        p.className = 'kt-hata';
        p.textContent = `${ad}: çizilemedi (${e instanceof Error ? e.message : e})`;
        liste.append(p);
      }
    }
  };
  goster.addEventListener('click', ciz);
  nokta.addEventListener('change', ciz);
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    metin.value = await f.text();
    ciz();
  });
  kok.append(kapat, baslik, metin, araclar, liste);
  document.body.append(kok);
  ciz();
}
