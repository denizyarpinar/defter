import type { Onizleme } from '../defter/gorsel';
import { t } from '../dil';
import { GorselHatasi } from '../defter/gorselHesap';
import type { Kose4, Nokta } from '../defter/kirp/kirpHesap';
import {
  baslangicDortgeni, buyutecKaynagi, ekrandanGorsele, enYakinKose, gecerliMi, gorseldenEkrana, koselerEsit, sigdir, sinirla,
  type Gecerlilik, type Sigdirma
} from '../defter/kirp/elleKirp';
import { toast } from './toast';

// Task 5.8d: full-screen corner editor over the photo panel. 4 handles (pointer events: finger,
// Pencil, mouse), the outside of the quadrilateral darkened, a magnifier above the finger while
// dragging. Corners are full-image pixels; the ~1600 px preview is only drawn and is released
// when the editor closes. The pure part is src/defter/kirp/elleKirp.ts.

// koseler: sorted (gecerliMi); elle: not the automatic corners (a start rectangle counts as by hand)
export interface KoseSonucu { koseler: Kose4; elle: boolean }

export interface KoseDuzenleyiciGirdi {
  ad: string;
  onizleme: Promise<Onizleme>;
  koseler: Kose4 | null;      // where to start (the current corners)
  otoKoseler: Kose4 | null;   // found automatically: the "Otomatik" button
}

export interface KoseDuzenleyici { sonuc: Promise<KoseSonucu | null>; kapat: () => void }   // null: Vazgeç

const SVG_NS = 'http://www.w3.org/2000/svg';
const BOSLUK = 24;          // px free around the photo, so the corner handles can be grabbed
const BUYUTEC = 120;        // magnifier diameter, px
const BUYUTEC_CARPAN = 2.5;
const BUYUTEC_YUKARI = 100; // magnifier centre this far above the finger

const svg = <K extends keyof SVGElementTagNameMap>(tag: K, cls?: string) => {
  const e = document.createElementNS(SVG_NS, tag);
  if (cls) e.setAttribute('class', cls);
  return e;
};

const dugme = (cls: string, text: string) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  return b;
};

// kap: the photo panel's root (Okuyucu leaves the keys alone while it exists).
export function acKoseDuzenleyici(kap: HTMLElement, g: KoseDuzenleyiciGirdi): KoseDuzenleyici {
  let bitir!: (s: KoseSonucu | null) => void;
  const sonuc = new Promise<KoseSonucu | null>(res => { bitir = res; });
  const oncekiOdak = document.activeElement as HTMLElement | null;

  let onizleme: Onizleme | null = null;
  let koseler: Kose4 | null = null;
  let sig: Sigdirma = { olcek: 1, ofsetX: 0, ofsetY: 0 };
  let sahneW = 0, sahneH = 0;
  let surukle: { i: number; id: number; fark: Nokta; parmak: Nokta } | null = null;
  let kare = 0;
  let kapandi = false;

  const kok = document.createElement('div');
  kok.className = 'kd';
  kok.setAttribute('role', 'dialog');
  kok.setAttribute('aria-modal', 'true');
  kok.setAttribute('aria-label', t('kose.baslik', { ad: g.ad }));
  const sahne = document.createElement('div');
  sahne.className = 'kd-sahne';
  const yukleniyor = document.createElement('p');
  yukleniyor.className = 'kd-yukleniyor';
  yukleniyor.textContent = t('kose.hazirlaniyor');
  const katman = svg('svg', 'kd-svg');
  const karart = svg('path', 'kd-karart');
  karart.setAttribute('fill-rule', 'evenodd');
  const cizgi = svg('polygon', 'kd-cizgi');
  const tutamaclar = [0, 1, 2, 3].map(() => svg('circle', 'kd-tutamac'));
  katman.append(karart, cizgi, ...tutamaclar);
  const buyutec = document.createElement('canvas');
  buyutec.className = 'kd-buyutec';
  buyutec.hidden = true;
  sahne.append(yukleniyor, katman, buyutec);

  const ipucu = document.createElement('p');
  ipucu.className = 'kd-ipucu';
  ipucu.setAttribute('aria-live', 'polite');
  const otomatik = dugme('kd-otomatik', t('kose.otomatik'));
  const vazgec = dugme('kd-vazgec', t('genel.vazgec'));
  const uygula = dugme('kd-uygula', t('kose.uygula'));
  const alt = document.createElement('div');
  alt.className = 'kd-alt';
  alt.append(otomatik, vazgec, uygula);
  kok.append(sahne, ipucu, alt);
  kap.append(kok);
  otomatik.disabled = uygula.disabled = true;
  vazgec.focus();

  const gecerlilik = (): Gecerlilik | null => onizleme && koseler ? gecerliMi(koseler, onizleme) : null;

  function yerlesim(): void {
    if (!onizleme) return;
    const r = sahne.getBoundingClientRect();
    sahneW = r.width;
    sahneH = r.height;
    sig = sigdir(onizleme, { width: sahneW, height: sahneH }, BOSLUK);
    const c = onizleme.canvas;
    c.style.left = `${sig.ofsetX}px`;
    c.style.top = `${sig.ofsetY}px`;
    c.style.width = `${onizleme.width * sig.olcek}px`;
    c.style.height = `${onizleme.height * sig.olcek}px`;
    katman.setAttribute('viewBox', `0 0 ${sahneW} ${sahneH}`);
    ciz();
  }

  const ciz = () => { if (!kare) kare = requestAnimationFrame(() => { kare = 0; cizSimdi(); }); };

  function cizSimdi(): void {
    if (!onizleme || !koseler || kapandi) return;
    const gc = gecerlilik()!;
    const ekran = koseler.map(p => gorseldenEkrana(p, sig));
    // edges and darkening along the sorted quadrilateral: what is seen is what gets cropped
    const sirali = gc.koseler.map(p => gorseldenEkrana(p, sig));
    const yol = sirali.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    cizgi.setAttribute('points', yol.join(' '));
    karart.setAttribute('d', `M0 0H${sahneW}V${sahneH}H0Z M${yol.join(' L')}Z`);
    kok.classList.toggle('kd-gecersiz', !gc.gecerli);
    ekran.forEach((p, i) => {
      const t = tutamaclar[i];
      t.setAttribute('cx', String(p.x));
      t.setAttribute('cy', String(p.y));
      t.setAttribute('r', surukle?.i === i ? '13' : '11');
    });
    uygula.disabled = !gc.gecerli;
    otomatik.disabled = !g.otoKoseler;
    ipucu.textContent = t(gc.gecerli ? 'kose.ipucu' : gc.neden === 'kucuk' ? 'kose.kucuk' : 'kose.gocuk');
    buyutecCiz();
  }

  function buyutecCiz(): void {
    if (!surukle || !onizleme || !koseler) { buyutec.hidden = true; return; }
    const dpr = Math.min(2, devicePixelRatio || 1);
    const px = Math.round(BUYUTEC * dpr);
    if (buyutec.width !== px) { buyutec.width = buyutec.height = px; }
    buyutec.style.width = buyutec.style.height = `${BUYUTEC}px`;
    // above the finger; near the top edge below it; always inside the stage
    const f = surukle.parmak;
    let cy = f.y - BUYUTEC_YUKARI;
    if (cy - BUYUTEC / 2 < 0) cy = f.y + BUYUTEC_YUKARI;
    const cx = Math.min(sahneW - BUYUTEC / 2, Math.max(BUYUTEC / 2, f.x));
    buyutec.style.left = `${cx - BUYUTEC / 2}px`;
    buyutec.style.top = `${cy - BUYUTEC / 2}px`;
    buyutec.hidden = false;

    const ctx = buyutec.getContext('2d');
    if (!ctx) return;
    const p = koseler[surukle.i];
    const c = onizleme.canvas;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, BUYUTEC, BUYUTEC);
    const k = buyutecKaynagi(p, onizleme, { width: c.width, height: c.height }, sig.olcek, BUYUTEC, BUYUTEC_CARPAN);
    if (k) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(c, k.sx, k.sy, k.sw, k.sh, k.dx, k.dy, k.dw, k.dh);
    }
    // the edges, magnified around the corner
    const gc = gecerlilik()!;
    const m = sig.olcek * BUYUTEC_CARPAN;
    const b = (q: Nokta) => ({ x: BUYUTEC / 2 + (q.x - p.x) * m, y: BUYUTEC / 2 + (q.y - p.y) * m });
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = gc.gecerli ? '#ffd27a' : '#ff5a4a';
    ctx.beginPath();
    gc.koseler.map(b).forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
    ctx.closePath();
    ctx.stroke();
    // crosshair at the corner
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(BUYUTEC / 2 - 9, BUYUTEC / 2); ctx.lineTo(BUYUTEC / 2 + 9, BUYUTEC / 2);
    ctx.moveTo(BUYUTEC / 2, BUYUTEC / 2 - 9); ctx.lineTo(BUYUTEC / 2, BUYUTEC / 2 + 9);
    ctx.stroke();
  }

  const yerel = (e: PointerEvent): Nokta => {
    const r = sahne.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  sahne.addEventListener('pointerdown', e => {
    if (!onizleme || !koseler || surukle || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const p = yerel(e);
    const i = enYakinKose(p, koseler.map(k => gorseldenEkrana(k, sig)));
    if (i < 0) return;
    e.preventDefault();
    const k = gorseldenEkrana(koseler[i], sig);
    // the grab offset is kept: the corner does not jump to the finger
    surukle = { i, id: e.pointerId, fark: { x: k.x - p.x, y: k.y - p.y }, parmak: p };
    try { sahne.setPointerCapture(e.pointerId); } catch { /* not supported: moves still come while over the stage */ }
    ciz();
  });

  sahne.addEventListener('pointermove', e => {
    if (!surukle || e.pointerId !== surukle.id || !onizleme || !koseler) return;
    e.preventDefault();
    const p = yerel(e);
    surukle.parmak = p;
    const yeni = sinirla(ekrandanGorsele({ x: p.x + surukle.fark.x, y: p.y + surukle.fark.y }, sig), onizleme);
    koseler = koseler.map((k, j) => j === surukle!.i ? yeni : k) as Kose4;
    ciz();
  });

  const birak = (e: PointerEvent) => {
    if (!surukle || e.pointerId !== surukle.id) return;
    surukle = null;
    ciz();
  };
  sahne.addEventListener('pointerup', birak);
  sahne.addEventListener('pointercancel', birak);
  sahne.addEventListener('lostpointercapture', birak);

  const boyutGozcu = new ResizeObserver(() => yerlesim());

  function kapat(s: KoseSonucu | null = null): void {
    if (kapandi) return;
    kapandi = true;
    cancelAnimationFrame(kare);
    boyutGozcu.disconnect();
    removeEventListener('keydown', tus, true);
    if (onizleme) onizleme.canvas.width = onizleme.canvas.height = 0;   // the preview leaves memory
    onizleme = null;
    buyutec.width = buyutec.height = 0;
    kok.remove();
    if (oncekiOdak?.isConnected) oncekiOdak.focus();
    bitir(s);
  }

  function tus(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); kapat(); }
  }

  otomatik.onclick = () => {
    if (!g.otoKoseler || !onizleme) return;
    koseler = baslangicDortgeni(g.otoKoseler, onizleme);
    ciz();
  };
  vazgec.onclick = () => kapat();
  uygula.onclick = () => {
    const gc = gecerlilik();
    if (gc?.gecerli) kapat({ koseler: gc.koseler, elle: !koselerEsit(gc.koseler, g.otoKoseler) });   // sorted before the perspective step
  };
  addEventListener('keydown', tus, true);

  g.onizleme.then(o => {
    if (kapandi) { o.canvas.width = o.canvas.height = 0; return; }
    onizleme = o;
    o.canvas.className = 'kd-gorsel';
    o.canvas.setAttribute('aria-hidden', 'true');
    sahne.prepend(o.canvas);
    yukleniyor.remove();
    koseler = baslangicDortgeni(g.koseler, o);
    boyutGozcu.observe(sahne);
    yerlesim();
  }).catch(e => {
    if (kapandi) return;
    toast(e instanceof GorselHatasi ? `${g.ad}: ${e.message}` : t('kose.acilamadi', { ad: g.ad }));
    if (!(e instanceof GorselHatasi)) console.warn('Önizleme hazırlanamadı.', e);
    kapat();
  });

  return { sonuc, kapat: () => kapat() };
}
