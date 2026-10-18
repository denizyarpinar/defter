import { JPEG_KALITE, KIRP_MIN_GUVEN, MAX_KENAR } from '../ayarlar';
import { hedefBoyut } from '../gorselHesap';
import { ilkKarar, kirpPenceresi, kirpYazi } from '../kirp/kirpKarar';
import { koseB } from '../kirp/koseB';
import { duzelt } from '../kirp/perspektif';
import { E_VARSAYILAN, FILTRELER, renkDuzelt, renkDuzeltHaritasi, type EAyar } from './filtreler';
import type { AydinlatmaHaritasi, Goruntu } from './ortak';

// Task 6.2a: development-only comparison page (?filtreTest=1, loaded from main.ts under
// import.meta.env.DEV, not in the build). Pick photos; each is cropped like the photo panel does
// (koseB → ilkKarar → kirpPenceresi + duzelt, ≤ MAX_KENAR), then shown as Orijinal / A / B / C / D
// with filter time, JPEG time and JPEG size. Tap a picture for the big view. Writes nothing anywhere.
// 6.2b: column E plus sliders for E's settings at the top; moving one redraws E for every photo.

const STIL = `
#filtreTest { position: fixed; inset: 0; z-index: 9998; overflow: auto; padding: 12px 16px 40px; box-sizing: border-box;
  background: #1d1a17; color: #f3eee7; font: 14px/1.4 system-ui, sans-serif }
#filtreTest h2 { margin: 0 40px 8px 0; font-size: 16px }
#filtreTest .ft-btn { display: inline-block; padding: 10px 14px; margin: 0 8px 8px 0; border-radius: 6px; background: rgba(255,255,255,.18); cursor: pointer }
#filtreTest .ft-btn input { display: none }
#filtreTest .ft-kapat { position: fixed; top: 8px; right: 12px; width: 36px; height: 36px; border: 0; border-radius: 6px; background: rgba(255,255,255,.2); color: #fff; font: 700 20px/1 system-ui }
#filtreTest .ft-foto { margin: 16px 0; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.2) }
#filtreTest .ft-sira { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start }
#filtreTest figure { margin: 0; flex: 1 1 150px; max-width: 260px; min-width: 0 }
#filtreTest figure img { display: block; width: 100%; height: auto; background: #000; border-radius: 4px; cursor: zoom-in }
#filtreTest figcaption { font-size: 12px; opacity: .85; margin-top: 4px }
#filtreTest .ft-ayar { display: flex; flex-wrap: wrap; gap: 4px 16px; align-items: center; margin: 4px 0 8px; padding: 8px 10px; border-radius: 6px; background: rgba(255,255,255,.08) }
#filtreTest .ft-ayar label { display: flex; gap: 8px; align-items: center; font-size: 13px }
#filtreTest .ft-ayar input { width: 140px }
#filtreTest .ft-ayar pre { flex-basis: 100%; margin: 0 }
#filtreTest pre { margin: 8px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace; user-select: text; -webkit-user-select: text }
#ftBuyuk { position: fixed; inset: 0; z-index: 9999; background: #111; color: #fff; display: flex; flex-direction: column }
#ftBuyuk .ftb-ust { display: flex; gap: 8px; align-items: center; padding: 8px 12px; font: 13px/1.3 system-ui }
#ftBuyuk .ftb-ust span { flex: 1; min-width: 0 }
#ftBuyuk button { min-width: 44px; height: 40px; border: 0; border-radius: 6px; background: rgba(255,255,255,.2); color: #fff; font: 700 18px/1 system-ui }
#ftBuyuk .ftb-alan { flex: 1; overflow: auto; -webkit-overflow-scrolling: touch; touch-action: pan-x pan-y pinch-zoom }
#ftBuyuk .ftb-alan img { display: block; max-width: 100%; max-height: 100%; margin: auto; background: #fff; cursor: zoom-in }
#ftBuyuk .ftb-alan.bir img { max-width: none; max-height: none; cursor: zoom-out }
`;

const kb = (n: number) => (n / 1024).toFixed(0) + ' kB';
const ms = (n: number) => Math.round(n) + ' ms';

interface Sonuc { etiket: string; url: string; yazi: string }

// one photo's E column, kept so the sliders can redraw it
interface EKayit {
  giris: ImageData; harita: AydinlatmaHaritasi; sonuc: Sonuc; img: HTMLImageElement; cap: HTMLElement;
  satirlar: string[]; satir: number; info: HTMLElement;
}

const iki = (n: number) => n.toFixed(2);

function fileButton(label: string, onFiles: (f: File[]) => void): HTMLLabelElement {
  const el = document.createElement('label');
  el.className = 'ft-btn';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length) onFiles(files);
  });
  el.append(label, input);
  return el;
}

function jpeg(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('JPEG oluşturulamadı'))), 'image/jpeg', JPEG_KALITE));
}

const bekle = () => new Promise(r => setTimeout(r, 0));   // let the page draw between steps

// the page as the photo panel prepares it, before the JPEG step
async function hazirla(f: File): Promise<{ canvas: HTMLCanvasElement; bilgi: string }> {
  const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
  try {
    const t0 = performance.now();
    const karar = ilkKarar(koseB(bmp, bmp.width, bmp.height));
    const guven = karar.guven === null ? 'köşe yok' : `güven ${karar.guven.toFixed(2)}${karar.guven < KIRP_MIN_GUVEN ? ` (< ${KIRP_MIN_GUVEN})` : ''}`;
    let canvas: HTMLCanvasElement;
    if (karar.kip === 'kirp' && karar.koseler) {
      const p = kirpPenceresi(karar.koseler, bmp);
      const ara = document.createElement('canvas');
      ara.width = p.width;
      ara.height = p.height;
      const ctx = ara.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, p.width, p.height);
      ctx.drawImage(bmp, p.sx, p.sy, p.sw, p.sh, 0, 0, p.width, p.height);
      canvas = duzelt(ara, p.koseler, MAX_KENAR);
      ara.width = ara.height = 0;
    } else {
      const { width, height } = hedefBoyut(bmp.width, bmp.height);
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bmp, 0, 0, width, height);
    }
    const bilgi = `${f.name} · ${bmp.width}×${bmp.height} · ${kb(f.size)} → ${canvas.width}×${canvas.height} · ${guven} · ${kirpYazi(karar.kip, karar.kirpilamadi)} · köşe + kırpma ${ms(performance.now() - t0)}`;
    return { canvas, bilgi };
  } finally {
    bmp.close();
  }
}

function buyukGorunum(sonuclar: Sonuc[], baslangic: number): void {
  let i = baslangic;
  const kutu = document.createElement('div');
  kutu.id = 'ftBuyuk';
  const ust = document.createElement('div');
  ust.className = 'ftb-ust';
  const yazi = document.createElement('span');
  const dugme = (t: string, etiket: string, f: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t;
    b.setAttribute('aria-label', etiket);
    b.addEventListener('click', f);
    return b;
  };
  const alan = document.createElement('div');
  alan.className = 'ftb-alan';
  const img = document.createElement('img');
  img.alt = '';
  alan.append(img);
  const goster = () => {
    const s = sonuclar[i];
    img.src = s.url;
    yazi.textContent = `${s.etiket} · ${s.yazi} · dokun: 1:1 / sığdır`;
  };
  const git = (d: number) => { i = (i + d + sonuclar.length) % sonuclar.length; goster(); };
  const kapat = () => { document.removeEventListener('keydown', tus); kutu.remove(); };
  const tus = (e: KeyboardEvent) => {
    if (e.key === 'Escape') kapat();
    else if (e.key === 'ArrowLeft') git(-1);
    else if (e.key === 'ArrowRight') git(1);
  };
  img.addEventListener('click', () => alan.classList.toggle('bir'));
  ust.append(dugme('‹', 'Önceki', () => git(-1)), dugme('›', 'Sonraki', () => git(1)), yazi, dugme('×', 'Kapat', kapat));
  kutu.append(ust, alan);
  document.addEventListener('keydown', tus);
  document.body.append(kutu);
  goster();
}

function ayarKutusu(ayar: EAyar, degisti: () => void): HTMLDivElement {
  const kutu = document.createElement('div');
  kutu.className = 'ft-ayar';
  const yazi = document.createElement('pre');
  const yaz = () => {
    yazi.textContent = `E_GOLGE_GUC = ${iki(ayar.golgeGuc)}; E_KAZANC_MAX = ${iki(ayar.kazancMax)}; E_KONTRAST = ${iki(ayar.kontrast)};`;
  };
  const kaydirici = (ad: string, anahtar: keyof EAyar, min: number, max: number, adim: number) => {
    const l = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(adim);
    input.value = String(ayar[anahtar]);
    input.dataset.ayar = anahtar;
    const deger = document.createElement('span');
    deger.textContent = iki(ayar[anahtar]);
    input.addEventListener('input', () => {
      ayar[anahtar] = Number(input.value);
      deger.textContent = iki(ayar[anahtar]);
      yaz();
      degisti();
    });
    l.append(ad, input, deger);
    return l;
  };
  kutu.append(
    'E ayarları:',
    kaydirici('Gölge gücü', 'golgeGuc', 0, 1, 0.05),
    kaydirici('Kazanç sınırı', 'kazancMax', 1, 3, 0.05),
    kaydirici('Kontrast', 'kontrast', 0, 0.5, 0.01),
    yazi
  );
  yaz();
  return kutu;
}

export function acFiltreTest(): void {
  const style = document.createElement('style');
  style.textContent = STIL;
  const box = document.createElement('div');
  box.id = 'filtreTest';
  const title = document.createElement('h2');
  title.textContent = 'Filtre testi (6.2b) · panelle aynı kırpma · hiçbir şey kaydedilmez';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'ft-kapat';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Filtre testini kapat');
  const genel = document.createElement('pre');
  genel.textContent = [
    'Fotoğraf seç (birden fazla seçilebilir). Resme dokun → büyük görünüm, ‹ › ile filtreler arasında geç.',
    'E ayarlarını kaydırınca tüm fotoğrafların E resmi yeniden hesaplanır; alttaki satırı sabitlere kopyalayabilirsin.',
    ...FILTRELER.map(f => `${f.id}: ${f.ad}`),
    `JPEG kalite ${JPEG_KALITE}, uzun kenar ≤ ${MAX_KENAR} px. Süre: filtre + JPEG ayrı.`
  ].join('\n');
  const liste = document.createElement('div');

  const urls: string[] = [];
  const ayar: EAyar = { ...E_VARSAYILAN };
  let eKayitlar: EKayit[] = [];
  let busy = false;
  let eSure: ReturnType<typeof setTimeout> | undefined;
  let eCalisiyor = false, eTekrar = false;
  const eYazi = (filtreMs: number, jpegMs: number, boyut: number) =>
    `${ms(filtreMs)} (+JPEG ${ms(jpegMs)}) · ${kb(boyut)} · güç ${iki(ayar.golgeGuc)} · sınır ${iki(ayar.kazancMax)} · kontrast ${iki(ayar.kontrast)}`;
  const ciz = (r: Goruntu) => {
    const c = document.createElement('canvas');
    c.width = r.width;
    c.height = r.height;
    c.getContext('2d')!.putImageData(new ImageData(r.data, r.width, r.height), 0, 0);
    return c;
  };
  // redraw every photo's E with the current slider values (one run at a time, the last change wins)
  const eYenile = async () => {
    if (eCalisiyor) { eTekrar = true; return; }
    eCalisiyor = true;
    try {
      do {
        eTekrar = false;
        for (const k of eKayitlar) {
          await bekle();
          let t = performance.now();
          const r = renkDuzelt(k.giris, ayar, k.harita);
          const filtreMs = performance.now() - t;
          const c = ciz(r);
          t = performance.now();
          const blob = await jpeg(c);
          c.width = c.height = 0;
          if (!eKayitlar.includes(k)) continue;   // page closed meanwhile
          URL.revokeObjectURL(k.sonuc.url);
          k.sonuc.url = URL.createObjectURL(blob);
          urls.push(k.sonuc.url);
          k.sonuc.yazi = eYazi(filtreMs, performance.now() - t, blob.size);
          k.img.src = k.sonuc.url;
          k.cap.textContent = `${k.sonuc.etiket} · ${k.sonuc.yazi}`;
          k.satirlar[k.satir] = `${k.sonuc.etiket.padEnd(22)} ${k.sonuc.yazi}`;
          k.info.textContent = k.satirlar.join('\n');
        }
      } while (eTekrar);
    } finally {
      eCalisiyor = false;
    }
  };
  const ayarlar = ayarKutusu(ayar, () => {
    clearTimeout(eSure);
    eSure = setTimeout(() => void eYenile(), 150);
  });
  const run = async (files: File[]) => {
    if (busy) return;
    busy = true;
    try {
      for (const f of files) {
        const blok = document.createElement('div');
        blok.className = 'ft-foto';
        const info = document.createElement('pre');
        info.textContent = `Hazırlanıyor… ${f.name}`;
        const sira = document.createElement('div');
        sira.className = 'ft-sira';
        blok.append(info, sira);
        liste.prepend(blok);
        let canvas: HTMLCanvasElement | null = null;
        let cikis: HTMLCanvasElement | null = null;
        try {
          await bekle();
          const h = await hazirla(f);
          canvas = h.canvas;
          const satirlar = [h.bilgi];
          info.textContent = satirlar.join('\n');
          const sonuclar: Sonuc[] = [];
          const ekle = (etiket: string, blob: Blob, yazi: string, id: string) => {
            const url = URL.createObjectURL(blob);
            urls.push(url);
            const s: Sonuc = { etiket, url, yazi };
            const n = sonuclar.push(s) - 1;
            const fig = document.createElement('figure');
            fig.dataset.filtre = id;
            const img = document.createElement('img');
            img.src = url;
            img.alt = etiket;
            img.addEventListener('click', () => buyukGorunum(sonuclar, n));
            const cap = document.createElement('figcaption');
            cap.textContent = `${etiket} · ${yazi}`;
            fig.append(img, cap);
            sira.append(fig);
            satirlar.push(`${etiket.padEnd(22)} ${yazi}`);
            info.textContent = satirlar.join('\n');
            return { s, img, cap, satir: satirlar.length - 1 };
          };

          let t = performance.now();
          const orijinal = await jpeg(canvas);
          ekle('Orijinal', orijinal, `JPEG ${ms(performance.now() - t)} · ${kb(orijinal.size)}`, 'orijinal');

          const giris = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
          cikis = document.createElement('canvas');
          cikis.width = canvas.width;
          cikis.height = canvas.height;
          const cctx = cikis.getContext('2d')!;
          for (const fl of FILTRELER) {
            await bekle();
            t = performance.now();
            const harita = fl.id === 'E' ? renkDuzeltHaritasi(giris) : null;
            const r = harita ? renkDuzelt(giris, ayar, harita) : fl.uygula(giris);
            const filtreMs = performance.now() - t;
            cctx.putImageData(new ImageData(r.data, r.width, r.height), 0, 0);
            t = performance.now();
            const blob = await jpeg(cikis);
            const jpegMs = performance.now() - t;
            const yazi = harita ? eYazi(filtreMs, jpegMs, blob.size) : `${ms(filtreMs)} (+JPEG ${ms(jpegMs)}) · ${kb(blob.size)}`;
            const e = ekle(`${fl.id} · ${fl.ad}`, blob, yazi, fl.id);
            if (harita) eKayitlar.push({ giris, harita, sonuc: e.s, img: e.img, cap: e.cap, satirlar, satir: e.satir, info });
          }
        } catch (e) {
          info.textContent = `${f.name}: ${e instanceof Error ? e.message : String(e)}`;
        } finally {
          if (canvas) canvas.width = canvas.height = 0;
          if (cikis) cikis.width = cikis.height = 0;
        }
      }
    } finally {
      busy = false;
    }
  };

  close.addEventListener('click', () => {
    clearTimeout(eSure);
    eKayitlar = [];
    for (const u of urls) URL.revokeObjectURL(u);
    box.remove();
    style.remove();
  });
  box.append(close, title, fileButton('Fotoğraf seç', run), ayarlar, genel, liste);
  document.head.append(style);
  document.body.append(box);
}
