import { KIRP_MIN_GUVEN } from '../ayarlar';
import { hazirlaGorsel, hazirlaKirpli } from '../gorsel';
import type { Kose4 } from './kirpHesap';
import { kirpYazi, koseleriBuyut } from './kirpKarar';

// Task 5.8b/5.8c: development-only trial page (?kirpTest=1, loaded from main.ts under
// import.meta.env.DEV, not in the build). Pick photos; for each: original, method B's corners
// and the result, made the same way as in the photo panel (hazirlaKirpli). Writes nothing anywhere.

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

// small copy of the photo with the quadrilateral drawn on it (k in the source's pixels)
function koseCizimi(src: CanvasImageSource & { width: number; height: number }, k: Kose4 | null, renk: string): HTMLCanvasElement {
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
  title.textContent = 'Kırpma testi (5.8c) · yöntem B, panelle aynı yol · hiçbir şey kaydedilmez';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'kt-kapat';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Kırpma testini kapat');
  const genel = document.createElement('pre');
  genel.textContent = `Fotoğraf seç (birden fazla seçilebilir). Güven eşiği: ${KIRP_MIN_GUVEN} (altında tüm fotoğraf).`;
  const liste = document.createElement('div');

  const urls: string[] = [];
  const imgFrom = (blob: Blob) => {
    const img = document.createElement('img');
    const u = URL.createObjectURL(blob);
    urls.push(u);
    img.src = u;
    return img;
  };

  let busy = false;
  const run = async (files: File[]) => {
    if (busy) return;
    busy = true;
    try {
      for (const f of files) {
        const blok = document.createElement('div');
        blok.className = 'kt-foto';
        const info = document.createElement('pre');
        info.textContent = `Hazırlanıyor… ${f.name}`;
        blok.append(info);
        liste.prepend(blok);
        try {
          // the original column: the whole photo as the panel's "Tümü" makes it
          const g = await hazirlaGorsel(f);
          const blob = new Blob([g.bytes as BlobPart], { type: 'image/jpeg' });
          const t0 = performance.now();
          const h = await hazirlaKirpli(f, 'kirp');
          const ms = performance.now() - t0;

          const bmp = await createImageBitmap(blob);
          const k = h.koseler && koseleriBuyut(h.koseler, { width: g.eskiWidth, height: g.eskiHeight }, { width: bmp.width, height: bmp.height });
          const cizim = koseCizimi(bmp, k, '#ffb03f');
          bmp.close();

          const guven = h.guven === null ? 'bulunamadı' : `güven ${h.guven.toFixed(2)}${h.guven < KIRP_MIN_GUVEN ? ` (eşik ${KIRP_MIN_GUVEN} altında)` : ''}`;
          const sira = document.createElement('div');
          sira.className = 'kt-sira';
          sira.append(
            figur(`orijinal · ${g.width}×${g.height}`, imgFrom(blob)),
            figur(`B köşeleri · ${guven}`, cizim),
            figur(`sonuç · ${kirpYazi(h.kip, h.kirpilamadi)} · ${h.gorsel.width}×${h.gorsel.height}`, imgFrom(new Blob([h.gorsel.bytes as BlobPart], { type: 'image/jpeg' })))
          );
          info.textContent = [
            `${f.name} · ${g.eskiWidth}×${g.eskiHeight}`,
            `B: ${guven} · ${kirpYazi(h.kip, h.kirpilamadi)} · köşe + kırpma + JPEG ${Math.round(ms)} ms · ${h.gorsel.width}×${h.gorsel.height} · ${kb(h.gorsel.yeniBoyut)}`
          ].join('\n');
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
