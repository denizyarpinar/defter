import { hazirlaGorsel } from './gorsel';

// Task 5.3: trial panel for real devices, only with ?gorselTest=1 (main.ts loads it lazily).
// Pick or take a photo, see the prepared JPEG and its numbers. Writes nothing anywhere
// (no Drive, no PDF, no IndexedDB). The lock goes away in 5.8.

const mb = (n: number) => (n / 1048576).toFixed(2) + ' MB';

function fileButton(label: string, capture: boolean, onFile: (f: File) => void): HTMLLabelElement {
  const el = document.createElement('label');
  el.className = 'gt-btn';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  if (capture) input.setAttribute('capture', 'environment');
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    input.value = '';   // the same photo can be picked again
    if (f) onFile(f);
  });
  el.append(label, input);
  return el;
}

export function acGorselTest(): void {
  const box = document.createElement('div');
  box.id = 'gorselTest';
  const title = document.createElement('strong');
  title.textContent = 'Görsel testi (5.3) · hiçbir şey kaydedilmez';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'gt-kapat';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Görsel testini kapat');
  const info = document.createElement('pre');
  info.textContent = 'Bir fotoğraf seç ya da çek.';
  const preview = document.createElement('img');
  preview.alt = 'Hazırlanan fotoğraf';
  preview.hidden = true;

  let url: string | null = null;
  let busy = false;
  const run = async (f: File) => {
    if (busy) return;
    busy = true;
    info.textContent = `Hazırlanıyor… ${f.name}`;
    const t0 = performance.now();
    try {
      const r = await hazirlaGorsel(f);
      const ms = performance.now() - t0;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: 'image/jpeg' }));
      preview.src = url;
      preview.hidden = false;
      info.textContent = [
        `${f.name} (${f.type || 'tür yok'})`,
        `boyut:  ${mb(r.eskiBoyut)} → ${mb(r.yeniBoyut)}`,
        `piksel: ${r.eskiWidth}×${r.eskiHeight} → ${r.width}×${r.height}`,
        `süre:   ${Math.round(ms)} ms`
      ].join('\n');
    } catch (e) {
      preview.hidden = true;
      info.textContent = `${f.name} (${f.type || 'tür yok'}, ${mb(f.size)})\n${e instanceof Error ? e.message : String(e)}`;
    } finally {
      busy = false;
    }
  };

  close.addEventListener('click', () => { if (url) URL.revokeObjectURL(url); box.remove(); });
  const row = document.createElement('div');
  row.className = 'gt-row';
  row.append(fileButton('Fotoğraf seç', false, run), fileButton('Kamerayla çek', true, run));
  box.append(close, title, row, info, preview);
  document.body.append(box);
}
