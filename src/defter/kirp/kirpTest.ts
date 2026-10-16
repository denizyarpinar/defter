import { hazirlaGorsel } from '../gorsel';
import type { Kose4, KoseSonuc } from './kirpHesap';
import { koseA, yukleOpenCV, type OpenCvBilgi } from './koseA';
import { koseB } from './koseB';
import { duzelt, jpeg } from './perspektif';

// Task 5.8b: development-only trial page (?kirpTest=1, loaded from main.ts under
// import.meta.env.DEV, not in the build). Pick photos; for each: original, method A's corners
// and result, method B's corners and result, with times. Writes nothing anywhere.

const STIL = `
#kirpTest { position: fixed; inset: 0; z-index: 9998; overflow: auto; padding: 12px 16px 40px; box-sizing: border-box;
  background: #1d1a17; color: #f3eee7; font: 14px/1.4 system-ui, sans-serif }
#kirpTest h2 { margin: 0 40px 8px 0; font-size: 16px }
#kirpTest .kt-btn { display: inline-block; padding: 10px 14px; margin: 0 8px 8px 0; border-radius: 6px; background: rgba(255,255,255,.18); cursor: pointer }
#kirpTest .kt-btn input { display: none }
#kirpTest .kt-kapat { position: fixed; top: 8px; right: 12px; width: 36px; height: 36px; border: 0; border-radius: 6px; background: rgba(255,255,255,.2); color: #fff; font: 700 20px/1 system-ui }
#kirpTest .kt-foto { margin: 16px 0; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.2) }
#kirpTest .kt-sira { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start }
#kirpTest figure { margin: 0; flex: 1 1 180px; max-width: 320px; min-width: 0 }
#kirpTest figure img, #kirpTest figure canvas { display: block; width: 100%; height: auto; background: #000; border-radius: 4px }
#kirpTest figcaption { font-size: 12px; opacity: .8; margin-top: 4px }
#kirpTest pre { margin: 8px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace; user-select: text; -webkit-user-select: text }
`;

const kb = (n: number) => (n / 1024).toFixed(0) + ' kB';
const mb = (n: number) => (n / 1048576).toFixed(2) + ' MB';

function fileButton(label: string, onFiles: (f: File[]) => void): HTMLLabelElement {
  const el = document.createElement('label');
  el.className = 'kt-btn';
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

function figur(caption: string, child: HTMLElement): HTMLElement {
  const f = document.createElement('figure');
  const c = document.createElement('figcaption');
  c.textContent = caption;
  f.append(child, c);
  return f;
}

// small copy of the photo with the quadrilateral drawn on it
function koseCizimi(src: HTMLCanvasElement, k: Kose4 | null, renk: string): HTMLCanvasElement {
  const s = Math.min(1, 640 / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * s);
  c.height = Math.round(src.height * s);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  if (k) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = renk;
    ctx.beginPath();
    k.forEach((p, i) => (i ? ctx.lineTo(p.x * s, p.y * s) : ctx.moveTo(p.x * s, p.y * s)));
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = renk;
    ctx.font = 'bold 14px system-ui';
    k.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x * s, p.y * s, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(['SÜ', 'SĞÜ', 'SĞA', 'SA'][i], p.x * s + 8, p.y * s - 8);
    });
  }
  return c;
}

export function acKirpTest(): void {
  const style = document.createElement('style');
  style.textContent = STIL;
  const box = document.createElement('div');
  box.id = 'kirpTest';
  const title = document.createElement('h2');
  title.textContent = 'Kırpma testi (5.8b) · A: OpenCV.js · B: kütüphanesiz · hiçbir şey kaydedilmez';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'kt-kapat';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Kırpma testini kapat');
  const genel = document.createElement('pre');
  genel.textContent = 'Fotoğraf seç (birden fazla seçilebilir). OpenCV.js ilk fotoğrafta yüklenir.';
  const liste = document.createElement('div');

  const urls: string[] = [];
  const imgFrom = (blob: Blob) => {
    const img = document.createElement('img');
    const u = URL.createObjectURL(blob);
    urls.push(u);
    img.src = u;
    return img;
  };

  let cvBilgi: OpenCvBilgi | null = null;
  let cvHata: string | null = null;
  const cvAl = async () => {
    if (cvBilgi || cvHata) return;
    genel.textContent = 'OpenCV.js yükleniyor…';
    try {
      cvBilgi = await yukleOpenCV();
      genel.textContent = [
        `OpenCV.js ilk yükleme: ${Math.round(cvBilgi.ms)} ms (indirme + başlatma)`,
        `indirme (dev sunucusu): ${cvBilgi.bayt ? mb(cvBilgi.bayt) : '?'}` +
          (cvBilgi.sikistirilmis && cvBilgi.sikistirilmis !== cvBilgi.bayt ? ` (sıkıştırılmış ${mb(cvBilgi.sikistirilmis)})` : ''),
        // Vite adds an inline source map in dev, so the measured size is larger than the file
        'gerçek dosya: opencv.js 10.4 MB, gzip ile 3.4 MB (Vite dev sunucusu kaynak haritası ekler, sıkıştırmaz)'
      ].join('\n');
    } catch (e) {
      cvHata = e instanceof Error ? e.message : String(e);
      genel.textContent = `A kullanılamıyor: ${cvHata}`;
    }
  };

  const yontem = async (ad: string, renk: string, src: HTMLCanvasElement, bul: () => { sonuc: KoseSonuc; not?: string }) => {
    const t0 = performance.now();
    const { sonuc, not } = bul();
    const tKose = performance.now() - t0;
    const cells: HTMLElement[] = [figur(`${ad} köşeleri · ${sonuc ? `güven ${sonuc.guven.toFixed(2)}` : 'bulunamadı'}${not ? ' · ' + not : ''}`, koseCizimi(src, sonuc?.koseler ?? null, renk))];
    let satir = `${ad}: köşe ${Math.round(tKose)} ms`;
    if (sonuc) {
      const t1 = performance.now();
      const out = duzelt(src, sonuc.koseler);
      const blob = await jpeg(out);
      const tDuz = performance.now() - t1;
      satir += ` · perspektif + JPEG ${Math.round(tDuz)} ms · ${out.width}×${out.height} · ${kb(blob.size)}`;
      cells.push(figur(`${ad} sonucu · ${out.width}×${out.height}`, imgFrom(blob)));
      out.width = out.height = 0;
    } else {
      satir += ' · bulunamadı';
      const bos = document.createElement('div');
      bos.textContent = 'sonuç yok';
      bos.style.cssText = 'padding:40px 8px;text-align:center;background:#000;border-radius:4px';
      cells.push(figur(`${ad} sonucu`, bos));
    }
    return { cells, satir };
  };

  let busy = false;
  const run = async (files: File[]) => {
    if (busy) return;
    busy = true;
    try {
      await cvAl();
      for (const f of files) {
        const blok = document.createElement('div');
        blok.className = 'kt-foto';
        const info = document.createElement('pre');
        info.textContent = `Hazırlanıyor… ${f.name}`;
        blok.append(info);
        liste.prepend(blok);
        try {
          const g = await hazirlaGorsel(f);
          const blob = new Blob([g.bytes as BlobPart], { type: 'image/jpeg' });
          const bmp = await createImageBitmap(blob);
          const src = document.createElement('canvas');
          src.width = bmp.width;
          src.height = bmp.height;
          src.getContext('2d', { willReadFrequently: true })!.drawImage(bmp, 0, 0);
          bmp.close();

          const sira = document.createElement('div');
          sira.className = 'kt-sira';
          sira.append(figur(`orijinal · ${g.width}×${g.height}`, imgFrom(blob)));
          const satirlar = [`${f.name} · ${g.eskiWidth}×${g.eskiHeight} → ${g.width}×${g.height}`];
          if (cvBilgi) {
            const cv = cvBilgi.cv;
            const a = await yontem('A', '#3fd0ff', src, () => { const r = koseA(cv, src); return { sonuc: r.sonuc, not: r.yol ?? undefined }; });
            sira.append(...a.cells);
            satirlar.push(a.satir);
          } else satirlar.push(`A: kullanılamıyor (${cvHata})`);
          const b = await yontem('B', '#ffb03f', src, () => ({ sonuc: koseB(src) }));
          sira.append(...b.cells);
          satirlar.push(b.satir);
          src.width = src.height = 0;
          info.textContent = satirlar.join('\n');
          blok.prepend(sira);
        } catch (e) {
          info.textContent = `${f.name}: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    } finally {
      busy = false;
    }
  };

  close.addEventListener('click', () => {
    for (const u of urls) URL.revokeObjectURL(u);
    box.remove();
    style.remove();
  });
  box.append(close, title, fileButton('Fotoğraf seç', run), genel, liste);
  document.head.append(style);
  document.body.append(box);
}
